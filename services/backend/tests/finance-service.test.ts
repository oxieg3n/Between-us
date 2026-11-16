import test from "node:test";
import assert from "node:assert/strict";
import { applyFinanceCommand, createFinanceState } from "../../../apps/mobile/src/finance/engine.ts";
import type { FinanceState } from "../../../apps/mobile/src/finance/types.ts";
import { createFinanceService, FinanceServiceError, type FinanceAction } from "../src/finance.ts";

const family = "20000000-0000-0000-0000-000000000001";
const child = "20000000-0000-0000-0000-000000000002";
const parentUid = "20000000-0000-0000-0000-000000000003";
const childUid = "20000000-0000-0000-0000-000000000004";
const op = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const clone = <T>(value: T): T => structuredClone(value);
function fixture() {
  let gate: {remaining:number;promise:Promise<void>;release:()=>void}|undefined;
  const race=()=> { let release!:()=>void; const promise=new Promise<void>(resolve=>{release=resolve;}); gate={remaining:2,promise,release}; };
  const db = { state: createFinanceState("America/New_York",[{id:child,name:"Fictional child"}]), revision:0,
    tick:0, revoked:false, conflicts:0, forceConflicts:false, commits:0, loads:0,
    commands:new Map<string,{fingerprint:unknown; childId:unknown}>() };
  const now = () => new Date(Date.UTC(2026,10,16,12,0,0,db.tick++)).toISOString();
  const serviceClient = { async rpc(name: string,args: Record<string,unknown>={}) {
    const scope=args.p_scope as {actorId:string;childId:string};
    if(db.revoked) return {data:null,error:{code:"42501",message:"private auth detail"}};
    const key=`${scope.actorId}:${args.p_operation_id}`;
    const previous=db.commands.get(key);
    if(previous && (previous.fingerprint!==args.p_fingerprint || previous.childId!==scope.childId)) return {data:null,error:{code:"22023",message:"private operation detail"}};
    if(name==="finance_load") {
      db.loads++; const result={data:{state:clone(db.state),revision:db.revision,serverAt:now(),replay:!!previous},error:null};
      if(gate) { const current=gate; if(--current.remaining===0) {gate=undefined;current.release();} await current.promise; }
      return result;
    }
    if(name!=="finance_commit") throw new Error("unexpected RPC");
    if(previous) return {data:{status:"replayed",state:clone(db.state),serverAt:now()},error:null};
    if(db.forceConflicts || db.revision!==args.p_expected_revision) { db.conflicts++; return {data:{status:"conflict"},error:null}; }
    db.state=clone(args.p_state as FinanceState); db.revision++; db.commits++;
    db.commands.set(key,{fingerprint:args.p_fingerprint,childId:scope.childId});
    return {data:{status:"committed",state:clone(db.state),serverAt:args.p_server_at},error:null};
  } };
  const user = (role:"parent"|"child") => ({ async rpc(name:string,args:Record<string,unknown>={}) {
    assert.equal(name,"finance_scope");
    if(db.revoked || args.p_family_id!==family || args.p_child_id!==child) return {data:null,error:{code:"42501",message:"private membership detail"}};
    const actorId=role==="parent"?parentUid:childUid;
    return {data:{actorId,sessionId:actorId,expiresAt:2000000000,familyId:family,childId:child,role},error:null};
  } });
  const parent=createFinanceService({userClient:user("parent"),serviceClient});
  const kid=createFinanceService({userClient:user("child"),serviceClient});
  const send=(who:typeof parent,n:number,action:FinanceAction)=>who.command(family,child,{id:op(n),action});
  return {db,parent,kid,send,race};
}
const plan = {budgetCents:5000,period:"monthly" as const,anchorDate:"2026-11-01",payoutCadence:"per_task" as const,minimumPayoutCents:0,allowGoalRelease:true};
async function earning(f:ReturnType<typeof fixture>) {
  await f.send(f.parent,1,{kind:"configure_plan",plan});
  await f.send(f.parent,2,{kind:"assign_chore",choreId:"chore",title:"Fictional task",rewardCents:3000,dates:["2026-11-16"]});
  await f.send(f.kid,3,{kind:"submit_chore",occurrenceId:"chore:2026-11-16"});
}

test("r12 domain, authoritative scope, default matching and clean child DTO",async()=>{
  const f=fixture();
  const parent=await f.parent.read(family,child);
  assert.deepEqual(parent.matching?.rule,{enabled:false,percent:100,monthlyCapCents:2000,parentBudgetCents:2000,surprise:true,eligibleGoalIds:undefined});
  const childView=await f.kid.read(family,child);
  const json=JSON.stringify(childView);
  for(const field of ["revision","events","actorId","sessionId","matching","fingerprint"]) assert.equal(json.includes(`\"${field}\"`),false);
  await assert.rejects(f.parent.read("90000000-0000-0000-0000-000000000001",child),e=>e instanceof FinanceServiceError && e.code==="not_authorized");
  await assert.rejects(f.kid.read(family,"90000000-0000-0000-0000-000000000001"),e=>e instanceof FinanceServiceError && e.code==="not_authorized");
});

test("rejects forged server fields, noninteger cents, oversized actions and future payment reports",async()=>{
  const f=fixture();
  for(const action of [{kind:"create_goal",goalId:"g",title:"Goal",targetCents:100,role:"parent"},
    {kind:"create_goal",goalId:"g",title:"Goal",targetCents:100,at:"1900-01-01T00:00:00Z"},
    {kind:"create_goal",goalId:"g",title:"Goal",targetCents:100,childId:"other"},
    {kind:"create_goal",goalId:"g",title:"Goal",targetCents:1.5},
    {kind:"create_goal",goalId:"g",title:"x".repeat(501),targetCents:100}]) {
    await assert.rejects(f.send(f.kid,4,action as FinanceAction),e=>e instanceof FinanceServiceError && e.code==="invalid_action");
  }
  await assert.rejects(f.send(f.parent,5,{kind:"report_payment",payoutId:"unknown",amountCents:1,method:"manual",paidAt:"2099-01-01T00:00:00Z"}),/cannot be in the future/);
  assert.equal(f.db.commits,0);
});

test("same operation is not reapplied; changed-body replay fails; replay returns current balance",async()=>{
  const f=fixture(); await earning(f);
  const approval:FinanceAction={kind:"review_chore",occurrenceId:"chore:2026-11-16",decision:"approved"};
  await f.send(f.parent,4,approval);
  await f.send(f.kid,5,{kind:"create_goal",goalId:"g",title:"Goal",targetCents:5000});
  await f.send(f.kid,6,{kind:"allocate",goalId:"g",amountCents:1000});
  const before=f.db.commits;
  const replay=await f.send(f.parent,4,approval);
  assert.equal(replay.balances.availableCents,2000);
  assert.equal(f.db.commits,before);
  assert.equal(f.db.state.events.filter(e=>e.id===`${parentUid}:${op(4)}`).length,1);
  await assert.rejects(f.send(f.parent,4,{...approval,decision:"declined"}),e=>e instanceof FinanceServiceError && e.code==="invalid_action");
});

test("concurrent approval retries against fresh state and never credits twice",async()=>{
  const f=fixture(); await earning(f);
  const action:FinanceAction={kind:"review_chore",occurrenceId:"chore:2026-11-16",decision:"approved"};
  f.race();
  const results=await Promise.allSettled([f.send(f.parent,4,action),f.send(f.parent,5,action)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.filter(r=>r.status==="rejected").length,1);
  assert.ok(f.db.conflicts>=1);
  assert.equal((await f.kid.read(family,child)).balances.earnedCents,3000);
});

test("concurrent allocations share the per-child monthly cap across goals",async()=>{
  const f=fixture(); await earning(f);
  await f.send(f.parent,4,{kind:"review_chore",occurrenceId:"chore:2026-11-16",decision:"approved"});
  await f.send(f.parent,5,{kind:"configure_matching",rule:{enabled:true,percent:100,monthlyCapCents:2000,parentBudgetCents:3000,surprise:true}});
  await f.send(f.kid,6,{kind:"create_goal",goalId:"g1",title:"Goal one",targetCents:5000});
  await f.send(f.kid,7,{kind:"create_goal",goalId:"g2",title:"Goal two",targetCents:5000});
  f.race();
  await Promise.all([f.send(f.kid,8,{kind:"allocate",goalId:"g1",amountCents:1500}),f.send(f.kid,9,{kind:"allocate",goalId:"g2",amountCents:1500})]);
  const parent=await f.parent.read(family,child);
  assert.equal(parent.matching?.usedCents,2000);
  assert.equal(parent.matching?.parentBudgetRemainingCents,1000);
  const kid=await f.kid.read(family,child);
  assert.equal(kid.matching,undefined);
  assert.equal(kid.goals.reduce((n,g)=>n+g.parentPlannedCents,0),0);
  assert.equal(kid.balances.availableCents,0);
});

test("hidden matching does not alter child payloads, public IDs or rejection text",async()=>{
  const a=fixture(),b=fixture();
  for(const f of [a,b]) { await earning(f); await f.send(f.parent,4,{kind:"review_chore",occurrenceId:"chore:2026-11-16",decision:"approved"}); await f.send(f.kid,5,{kind:"create_goal",goalId:"g",title:"Goal",targetCents:5000}); }
  const privateEvent={id:`${parentUid}:${op(90)}`,at:b.db.state.events.at(-1)!.at,childId:child,kind:"configure_matching" as const,rule:{enabled:true,percent:100,monthlyCapCents:2000,parentBudgetCents:2000,surprise:true}};
  b.db.state=applyFinanceCommand(b.db.state,{role:"parent"},privateEvent);
  const views=await Promise.all([a.send(a.kid,6,{kind:"allocate",goalId:"g",amountCents:1000}),b.send(b.kid,6,{kind:"allocate",goalId:"g",amountCents:1000})]);
  assert.deepEqual(views[0],views[1]);
  const errors=await Promise.all([a.send(a.kid,7,{kind:"allocate",goalId:"g",amountCents:9999}).catch(e=>e.message),b.send(b.kid,7,{kind:"allocate",goalId:"g",amountCents:9999}).catch(e=>e.message)]);
  assert.equal(errors[0],errors[1]);
});

test("revocation and exhausted CAS retries fail closed without private database errors",async()=>{
  const f=fixture(); f.db.revoked=true;
  await assert.rejects(f.kid.read(family,child),e=>e instanceof FinanceServiceError && e.code==="not_authorized" && !e.message.includes("private"));
  f.db.revoked=false; f.db.forceConflicts=true;
  await assert.rejects(f.send(f.kid,1,{kind:"create_goal",goalId:"g",title:"Goal",targetCents:10}),e=>e instanceof FinanceServiceError && e.code==="temporarily_unavailable");
  assert.equal(f.db.conflicts,4);
  assert.equal(f.db.commits,0);
});
