import assert from "node:assert/strict";
import test from "node:test";
import { AuthMutationBusyError, runAuthMutation, getAuthMutationPending, subscribeAuthMutation } from "../src/production/auth-mutation";
import { createAuthCallbackExchange } from "../src/production/auth-callback-policy";

const code = "12345678-1234-1234-1234-123456789abc";
const response = { error: null, data: { session: { user: { id: "fictional-author-A" } }, user: { id: "fictional-author-A" }, redirectType: null } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("callback preflight and exchange hold the same gate; another author's signin never starts", async () => {
  const preflight = deferred<{ session: null; error: null }>(), transport = deferred<typeof response>();
  let signins = 0, exchanges = 0;
  const callback = createAuthCallbackExchange(async () => { exchanges++; return transport.promise; }, () => preflight.promise);
  const pending = callback(code);
  await assert.rejects(runAuthMutation(async () => { signins++; }), AuthMutationBusyError);
  assert.equal(exchanges, 0);
  preflight.resolve({ session: null, error: null }); await Promise.resolve();
  assert.equal(exchanges, 1);
  await assert.rejects(runAuthMutation(async () => { signins++; }), AuthMutationBusyError);
  transport.resolve(response); assert.equal(await pending, "/accounts"); assert.equal(signins, 0);
  assert.equal(await runAuthMutation(async () => "next-explicit-action"), "next-explicit-action");
});

test("signin already pending rejects callback without preflight/exchange; exceptions release admission", async () => {
  const pending = deferred<void>(); let reads = 0, exchanges = 0;
  const signin = runAuthMutation(() => pending.promise);
  const callback = createAuthCallbackExchange(async () => { exchanges++; return response; }, async () => { reads++; return { session: null, error: null }; });
  await assert.rejects(callback(code), AuthMutationBusyError); assert.equal(reads, 0); assert.equal(exchanges, 0);
  pending.resolve(); await signin;
  await assert.rejects(runAuthMutation(async () => { throw new Error("Fictional test failure"); }));
  assert.equal(await callback(code), "/accounts");
});

test('pending snapshot and subscription track actual enter/finally leave, not rejected overlap', async () => {
  assert.equal(getAuthMutationPending(),false);
  const states:boolean[]=[],unsubscribe=subscribeAuthMutation(()=>states.push(getAuthMutationPending()));
  const held=deferred<string>();let overlappingStarts=0;
  try {
    assert.deepEqual(states,[],'subscribe reads through snapshot without inventing a change');
    const current=runAuthMutation(()=>held.promise);
    assert.equal(getAuthMutationPending(),true);assert.deepEqual(states,[true]);
    await assert.rejects(runAuthMutation(async()=>{overlappingStarts++;}),AuthMutationBusyError);
    assert.equal(getAuthMutationPending(),true);assert.deepEqual(states,[true]);assert.equal(overlappingStarts,0);
    held.resolve('finished');assert.equal(await current,'finished');
    assert.equal(getAuthMutationPending(),false);assert.deepEqual(states,[true,false]);
    unsubscribe();unsubscribe();
    await runAuthMutation(async()=>undefined);assert.deepEqual(states,[true,false],'unsubscribed observer stays silent');
  } finally {unsubscribe();held.resolve('cleanup');}
});

test('async rejection and synchronous work throw both release and notify finally', async () => {
  const states:boolean[]=[],unsubscribe=subscribeAuthMutation(()=>states.push(getAuthMutationPending()));
  try {
    const failure=new Error('Fictional mutation failure');
    await assert.rejects(runAuthMutation(async()=>{throw failure;}),error=>error===failure);
    assert.equal(getAuthMutationPending(),false);
    await assert.rejects(runAuthMutation(()=>{throw failure;}),error=>error===failure);
    assert.equal(getAuthMutationPending(),false);assert.deepEqual(states,[true,false,true,false]);
  } finally {unsubscribe();}
});

test('throwing observers cannot break admission, clear a pending gate, or suppress other observers', async () => {
  const states:boolean[]=[],held=deferred<void>();let starts=0;
  const stopThrow=subscribeAuthMutation(()=>{throw new Error('Fictional observer failure');});
  const stopRead=subscribeAuthMutation(()=>states.push(getAuthMutationPending()));
  try {
    const current=runAuthMutation(()=>{starts++;return held.promise;});
    assert.equal(starts,1);assert.equal(getAuthMutationPending(),true);assert.deepEqual(states,[true]);
    await assert.rejects(runAuthMutation(async()=>{starts++;}),AuthMutationBusyError);
    held.resolve();await current;assert.equal(getAuthMutationPending(),false);assert.deepEqual(states,[true,false]);
    await runAuthMutation(async()=>{starts++;});assert.equal(starts,2);assert.deepEqual(states,[true,false,true,false]);
  } finally {stopThrow();stopRead();held.resolve();}
});
