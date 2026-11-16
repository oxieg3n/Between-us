import assert from "node:assert/strict";
import test from "node:test";
import { createJournalRefreshCoordinator, verifyJournalAccess, JournalAccessError, type JournalAccessPorts, type VerifiedJournalAccess } from "../src/production/journal-access";

const expected = { issuer: "https://fictional.test/auth/v1", subject: "own-managed-author" };
function access() {
  let session = { accessToken: "fictional-verified-token", userId: expected.subject };
  const ports: JournalAccessPorts = {
    getSession: async () => session,
    getUser: async () => ({ id: expected.subject }),
    getClaims: async () => ({ iss: expected.issuer, sub: expected.subject, session_id: "12345678-1234-1234-1234-123456789abc" }),
    getContext: async () => ({ user: { id: expected.subject, kind: "child", state: "active" } }),
  };
  return { ports, swap() { session = { accessToken: "different-session", userId: "different-author" }; } };
}

test("journal actor comes from verified managed claims and active server context", async () => {
  const f = access();
  const result = await verifyJournalAccess(f.ports, expected);
  assert.deepEqual(result.actor, { issuer: expected.issuer, subject: expected.subject, sessionId: "12345678-1234-1234-1234-123456789abc" });
  assert.equal(result.role, "child");
});

test("forged cache/context/issuer/session claims and failed online validation cannot unlock", async () => {
  for (const override of [
    { getUser: async () => ({ id: "another-author" }) },
    { getClaims: async () => ({ iss: "https://wrong.test", sub: expected.subject, session_id: "12345678-1234-1234-1234-123456789abc" }) },
    { getClaims: async () => ({ iss: expected.issuer, sub: expected.subject }) },
    { getContext: async () => ({ user: { id: expected.subject, kind: "child", state: "suspended" } }) },
    { getContext: async () => ({ user: { id: "guardian", kind: "parent", state: "active" } }) },
    { getUser: async () => { throw new Error("Offline or revoked"); } },
  ]) {
    const f = access(); Object.assign(f.ports, override);
    await assert.rejects(verifyJournalAccess(f.ports, expected), JournalAccessError);
  }
});

test("signout/account replacement while verification awaits denies the old author", async () => {
  const f = access();
  f.ports.getContext = async () => { f.swap(); return { user: { id: expected.subject, kind: "child", state: "active" } }; };
  await assert.rejects(verifyJournalAccess(f.ports, expected), JournalAccessError);
  const controller = new AbortController();
  const other = access(); other.ports.getUser = async () => { controller.abort(); return { id: expected.subject }; };
  await assert.rejects(verifyJournalAccess(other.ports, expected, controller.signal), JournalAccessError);
});

test("unavailable transport and verified denial remain distinct without exposing provider errors", async () => {
  const offline = access(); offline.ports.getUser = async () => { throw new Error("Fictional private provider detail"); };
  await assert.rejects(verifyJournalAccess(offline.ports, expected), (error: unknown) => error instanceof JournalAccessError && error.code === "unavailable" && !error.message.includes("provider detail"));
  const revoked = access(); revoked.ports.getContext = async () => { throw new JournalAccessError("denied"); };
  await assert.rejects(verifyJournalAccess(revoked.ports, expected), (error: unknown) => error instanceof JournalAccessError && error.code === "denied");
});

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const verifiedAccess = (): VerifiedJournalAccess => ({ actor: { issuer: expected.issuer, subject: expected.subject, sessionId: "12345678-1234-1234-1234-123456789abc" }, token: "old-fictional-token", role: "child" });
function refreshing(verify: (previous: VerifiedJournalAccess, signal: AbortSignal) => Promise<VerifiedJournalAccess>) {
  let current: VerifiedJournalAccess | undefined = verifiedAccess(), writing = "Fictional unprotected writing", invalidations = 0;
  const covers: boolean[] = [];
  const coordinator = createJournalRefreshCoordinator({ current: () => current, verify, commit: value => { current = value; }, conceal: value => covers.push(value), beforeVerification: () => undefined, invalidate: () => { invalidations++; current = undefined; writing = ""; } });
  return { coordinator, covers, current: () => current, writing: () => writing, invalidations: () => invalidations, clear() { current = undefined; writing = ""; coordinator.cancel(); } };
}

test("verified same issuer/subject/session refresh preserves unprotected writing and updates token under cover", async () => {
  const f = refreshing(async previous => ({ ...previous, token: "fresh-fictional-token" }));
  await f.coordinator.refresh();
  assert.equal(f.current()?.token, "fresh-fictional-token"); assert.equal(f.writing(), "Fictional unprotected writing");
  assert.equal(f.invalidations(), 0); assert.deepEqual(f.covers, [true, false]);
});

test("session/author/issuer/role changes or failed verification clear rather than trust refreshed cache", async () => {
  for (const change of [
    (value: VerifiedJournalAccess) => ({ ...value, actor: { ...value.actor, subject: "another-author" } }),
    (value: VerifiedJournalAccess) => ({ ...value, actor: { ...value.actor, issuer: "https://another.test/auth/v1" } }),
    (value: VerifiedJournalAccess) => ({ ...value, actor: { ...value.actor, sessionId: "different-session" } }),
    (value: VerifiedJournalAccess) => ({ ...value, role: "parent" as const }),
  ]) {
    const f = refreshing(async previous => change(previous)); await f.coordinator.refresh();
    assert.equal(f.invalidations(), 1); assert.equal(f.writing(), "");
  }
  const failed = refreshing(async () => { throw new Error("private provider failure"); }); await failed.coordinator.refresh(); assert.equal(failed.invalidations(), 1);
});

test("latest refresh wins and wait does not block on a superseded slow request", async () => {
  const first = deferred<VerifiedJournalAccess>(), second = deferred<VerifiedJournalAccess>(); let calls = 0;
  const f = refreshing(() => ++calls === 1 ? first.promise : second.promise);
  const old = f.coordinator.refresh(); const waiting = f.coordinator.wait(); const fresh = f.coordinator.refresh();
  second.resolve({ ...verifiedAccess(), token: "newest-fictional-token" }); await fresh; await waiting;
  first.reject(new Error("stale private failure")); await old;
  assert.equal(f.current()?.token, "newest-fictional-token"); assert.equal(f.invalidations(), 0); assert.equal(f.writing(), "Fictional unprotected writing");
});

test("background/signout cancellation prevents a late verified refresh from restoring the author", async () => {
  const pending = deferred<VerifiedJournalAccess>(); const f = refreshing(() => pending.promise);
  const checking = f.coordinator.refresh(); f.clear(); pending.resolve({ ...verifiedAccess(), token: "late-token" }); await checking;
  assert.equal(f.current(), undefined); assert.equal(f.writing(), "");
});

test("transient verification failure preserves writing under cover until a verified retry", async () => {
  let offline = true;
  const f = refreshing(async previous => { if (offline) throw new JournalAccessError("unavailable"); return { ...previous, token: "verified-retry-token" }; });
  await f.coordinator.refresh(); assert.equal(f.invalidations(), 0); assert.equal(f.writing(), "Fictional unprotected writing"); assert.equal(f.covers.at(-1), true);
  offline = false; await f.coordinator.refresh(); assert.equal(f.current()?.token, "verified-retry-token"); assert.equal(f.covers.at(-1), false);
});

function leasedProof() {
  const f=access();let clock=100,epoch=3;
  f.ports.getClaims=async()=>({iss:expected.issuer,sub:expected.subject,session_id:'12345678-1234-1234-1234-123456789abc',exp:2000000000,role:'authenticated'});
  f.ports.readAccountBoundary=()=>({epoch,userId:expected.subject});f.ports.monotonicNow=()=>clock;
  f.ports.getLease=async token=>{assert.equal(token,'fictional-verified-token');clock+=50;return {issuer:expected.issuer,subject:expected.subject,sessionId:'12345678-1234-1234-1234-123456789abc',remainingMs:1000};};
  return {...f,clock(value:number){clock=value;},epoch(value:number){epoch=value;}};
}

test('lease proof starts before first candidate read and binds claims, lease and context to the exact candidate',async()=>{
  const f=leasedProof(),session=f.ports.getSession;let reads=0;
  f.ports.getSession=async()=>{if(reads++===0)f.clock(300);return session();};
  f.ports.getContext=async token=>{assert.equal(token,'fictional-verified-token');f.clock(700);return {user:{id:expected.subject,kind:'child',state:'active'}};};
  const verified=await verifyJournalAccess(f.ports,expected);
  assert.deepEqual(verified.lease,{epoch:3,startedAt:100,deadline:1100});
});

test('malformed/expired/mismatched lease and changed account epoch never mint local authority',async()=>{
  for(const change of [
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getLease=async()=>({issuer:'wrong',subject:expected.subject,sessionId:'12345678-1234-1234-1234-123456789abc',remainingMs:1000});},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getLease=async()=>({issuer:expected.issuer,subject:expected.subject,sessionId:'wrong-session',remainingMs:1000});},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getLease=async()=>({issuer:expected.issuer,subject:expected.subject,sessionId:'12345678-1234-1234-1234-123456789abc',remainingMs:900001});},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getLease=async()=>({issuer:expected.issuer,subject:expected.subject,sessionId:'12345678-1234-1234-1234-123456789abc',remainingMs:0});},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getLease=async()=>({issuer:expected.issuer,subject:expected.subject,sessionId:'12345678-1234-1234-1234-123456789abc',remainingMs:NaN});},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getClaims=async()=>({iss:expected.issuer,sub:expected.subject,session_id:'12345678-1234-1234-1234-123456789abc',exp:2000000000,role:'service_role'});},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getClaims=async()=>({iss:expected.issuer,sub:expected.subject,session_id:'12345678-1234-1234-1234-123456789abc',role:'authenticated'});},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getContext=async()=>{f.clock(1100);return {user:{id:expected.subject,kind:'child',state:'active'}};};},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getContext=async()=>{f.epoch(4);return {user:{id:expected.subject,kind:'child',state:'active'}};};},
    (f:ReturnType<typeof leasedProof>)=>{f.ports.getLease=async()=>{throw new Error('unknown protocol detail');};},
  ]) {const f=leasedProof();change(f);await assert.rejects(verifyJournalAccess(f.ports,expected),(error:unknown)=>error instanceof JournalAccessError&&error.code==='denied');}
});

test('valid original continuation stays usable during a typed outage but denial still retires writing',async()=>{
  let current:VerifiedJournalAccess|undefined=verifiedAccess(),allowed=true,invalidations=0,commits=0;
  const covers:boolean[]=[];
  let verify:(value:VerifiedJournalAccess)=>Promise<VerifiedJournalAccess>=async()=>{throw new JournalAccessError('unavailable');};
  const coordinator=createJournalRefreshCoordinator({current:()=>current,verify:value=>verify(value),commit:value=>{current=value;commits++;},conceal:value=>covers.push(value),beforeVerification:()=>{},continuation:()=>allowed,invalidate:()=>{current=undefined;invalidations++;},unavailable:()=>{}});
  await coordinator.refresh();assert.equal(invalidations,0);assert.equal(commits,0);assert.equal(covers.at(-1),false);
  allowed=false;await coordinator.refresh();assert.equal(invalidations,1);
  current=verifiedAccess();allowed=true;verify=async()=>{throw new JournalAccessError('denied');};await coordinator.refresh();assert.equal(invalidations,2);assert.equal(current,undefined);
});

test('late successful online verification cannot revive an expired unlocked continuation',async()=>{
  const pending=deferred<VerifiedJournalAccess>();let allowed=true,current:VerifiedJournalAccess|undefined=verifiedAccess(),commits=0,locks=0;
  const coordinator=createJournalRefreshCoordinator({current:()=>current,verify:()=>pending.promise,commit:()=>{commits++;},conceal:()=>{},beforeVerification:()=>{},continuation:()=>allowed,invalidate:()=>{locks++;current=undefined;}});
  const work=coordinator.refresh();allowed=false;pending.resolve({...verifiedAccess(),token:'late-verified-token'});await work;
  assert.equal(commits,0);assert.equal(locks,1);assert.equal(current,undefined);
});
