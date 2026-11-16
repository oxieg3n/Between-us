import assert from 'node:assert/strict';
import test from 'node:test';
import {applyFinanceCommand,createFinanceState,financeView} from '../../../apps/mobile/src/finance/engine.ts';
import type {FinanceActor,FinanceCommand} from '../../../apps/mobile/src/finance/types.ts';
import {createFinanceNotifications,financeNotificationProjection,FinanceNotificationError} from '../src/finance-notifications.ts';
const familyId='e2000000-0000-0000-0000-000000000001',childId='e3000000-0000-0000-0000-000000000001';
const at='2026-11-16T04:30:00.000Z',parent:FinanceActor={role:'parent'},child:FinanceActor={role:'child',childId};
function book() {
  let state=createFinanceState('America/New_York',[{id:childId,name:'Fictional private child'}]),id=0;
  type Action<T> = T extends unknown ? Omit<T,'id'|'at'|'childId'> : never;
  const run=(action:Action<FinanceCommand>,actor=parent,clock=at)=>{
    state=applyFinanceCommand(state,actor,{...action,id:`operation-${++id}`,childId,at:clock} as FinanceCommand);return state;
  };
  run({kind:'configure_plan',plan:{budgetCents:3000,period:'monthly',anchorDate:'2026-11-01',payoutCadence:'daily',minimumPayoutCents:100,allowGoalRelease:true}});
  run({kind:'assign_chore',choreId:'chore',title:'Private fictional chore',rewardCents:1000,dates:['2026-11-15']});
  run({kind:'submit_chore',occurrenceId:'chore:2026-11-15'},child);run({kind:'review_chore',occurrenceId:'chore:2026-11-15',decision:'approved'});
  return {run,state:()=>state};
}
const ready=(state=book().state())=>({status:'ready',familyId,childId,state,revision:7,serverAt:at});
test('default disabled producer performs zero RPC and the wrapper preserves legacy calls',async()=>{
  const calls:string[]=[];const client={async rpc(name:string){calls.push(name);return {data:true,error:null};}};
  const service=createFinanceNotifications({serviceClient:client});
  assert.deepEqual(await service.produce(),{status:'disabled',checked:0,created:0,nextAfterChildId:null,sent:false});assert.deepEqual(calls,[]);
  assert.deepEqual(await service.serviceClient.rpc('authorize_notification',{}),{data:true,error:null});assert.deepEqual(calls,['authorize_notification']);
});
test('canonical child completion is identical under hidden matching/funding; a reveal matters only when visible progress crosses100%',()=>{
  const a=book(),b=book();
  for(const f of [a,b])f.run({kind:'create_goal',goalId:'goal',title:'Private fictional goal',targetCents:1000},child);
  a.run({kind:'configure_matching',rule:{enabled:true,percent:100,monthlyCapCents:2000,parentBudgetCents:2000,surprise:true}});
  for(const f of [a,b])f.run({kind:'allocate',goalId:'goal',amountCents:500},child);
  assert.deepEqual(financeNotificationProjection(a.state(),childId,at),financeNotificationProjection(b.state(),childId,at));
  const matchId=financeView(a.state(),parent,childId,at).matching!.commitments[0].id;
  a.run({kind:'fund_match',matchId,amountCents:500,method:'cash',paidAt:at});
  assert.deepEqual(financeNotificationProjection(a.state(),childId,at),financeNotificationProjection(b.state(),childId,at));
  const before=financeNotificationProjection(a.state(),childId,at);assert.deepEqual(before.goals,[{id:'goal',complete:false}]);
  a.run({kind:'reveal_match',matchId});assert.deepEqual(financeNotificationProjection(a.state(),childId,at).goals,[{id:'goal',complete:true}]);
  for(const privateField of ['matching','cents','name','title','events','effects','operation-'])assert.equal(JSON.stringify(before).toLowerCase().includes(privateField),false);
});
test('scheduled due uses DB-supplied timezone time and excludes earmarked/held money or per-task scheduling',()=>{
  const f=book();assert.equal(financeNotificationProjection(f.state(),childId,'2026-11-16T04:59:59.000Z').payout.due,false);
  const next='2026-11-16T05:00:00.000Z',due=financeNotificationProjection(f.state(),childId,next);
  assert.equal(due.localDate,'2026-11-16');assert.deepEqual(due.payout,{scheduled:true,due:true,periodKey:'2026-11-16'});
  f.run({kind:'prepare_payout'},parent,next);assert.equal(financeNotificationProjection(f.state(),childId,next).payout.due,false);
  const earmarked=book();earmarked.run({kind:'create_goal',goalId:'all',title:'Own savings',targetCents:1000},child);
  earmarked.run({kind:'allocate',goalId:'all',amountCents:1000},child);
  assert.equal(financeNotificationProjection(earmarked.state(),childId,next).payout.due,false);
  const g=book(),plan=financeView(g.state(),parent,childId,at).plan!;
  g.run({kind:'configure_plan',plan:{...plan,payoutCadence:'per_task'}});
  assert.deepEqual(financeNotificationProjection(g.state(),childId,at).payout,{scheduled:false,due:true,periodKey:'per_task'});
});
test('producer retries private CAS using fresh snapshots and queues bounded child projections only',async()=>{
  const calls:{name:string;args:Record<string,unknown>}[]=[];let conflicts=1,created=1;
  const service=createFinanceNotifications({enabled:true,serviceClient:{async rpc(name,args={}){
    calls.push({name,args});
    if(name==='finance_notification_scopes')return {data:{status:'ready',scopes:[{familyId,childId}],nextAfterChildId:null},error:null};
    if(name==='finance_notification_snapshot')return {data:{...ready(),revision:conflicts?7:8},error:null};
    assert.equal(name,'queue_finance_notifications');return {data:conflicts--?{status:'conflict',created:0}:{status:'committed',created},error:null};
  }}});
  assert.deepEqual(await service.produce({limit:2}),{status:'checked',checked:1,created:1,nextAfterChildId:null,sent:false});
  const queued=calls.filter(call=>call.name==='queue_finance_notifications');assert.equal(queued.length,2);
  assert.equal(queued[0].args.p_expected_revision,7);assert.equal(queued[1].args.p_expected_revision,8);
  assert.deepEqual(queued[0].args.p_projection,queued[1].args.p_projection);assert.equal(queued[1].args.p_limit,8,'reserve the full maximum guardian fanout');
  conflicts=4;await assert.rejects(service.produce(),FinanceNotificationError,'exhausted private conflicts must not advance the scan cursor');
  conflicts=0;created=8;
  assert.equal((await service.produce({limit:1})).created,8,'one-scope/dispatch limit still allows an atomic eight-guardian source');
  assert.equal(calls.filter(call=>call.name==='queue_finance_notifications').at(-1)?.args.p_limit,8);
});
test('worker wrapper reprojects delivery/receipts, preserves legacy authorization, and fails busy CAS without false suppression',async()=>{
  let mode:'legacy'|'finance'|'busy'='legacy',checks=0;const calls:string[]=[];
  const service=createFinanceNotifications({enabled:true,serviceClient:{async rpc(name,args={}){
    calls.push(name);
    if(name==='finance_notification_delivery_snapshot')return {data:mode==='legacy'?{status:'legacy'}:ready(),error:null};
    if(name==='authorize_notification')return {data:true,error:null};
    assert.equal(name,'authorize_finance_notification');assert.equal(args.p_receipt,true);
    return {data:mode==='busy'||++checks===1?{status:'conflict'}:{status:'checked',allowed:false},error:null};
  }}});
  assert.equal((await service.serviceClient.rpc('authorize_notification')).data,true);
  mode='finance';assert.deepEqual(await service.serviceClient.rpc('authorize_notification_receipt'),{data:false,error:null});assert.equal(checks,2);
  mode='busy';const result=await service.serviceClient.rpc('authorize_notification_receipt');assert.equal(result.data,null);assert.equal(result.error?.code,'40001');
  assert.equal(calls.filter(name=>name==='authorize_notification').length,1);
});
test('malformed scope batches fail before queueing and never include raw errors in a thrown message',async()=>{
  const calls:string[]=[];const service=createFinanceNotifications({enabled:true,serviceClient:{async rpc(name){calls.push(name);
    return {data:{status:'ready',scopes:[{familyId,childId:'private-raw-invalid'}],nextAfterChildId:null},error:null};}}});
  await assert.rejects(service.produce(),error=>error instanceof FinanceNotificationError&&!error.message.includes('private-raw'));
  assert.deepEqual(calls,['finance_notification_scopes']);await assert.rejects(service.produce({limit:21}),FinanceNotificationError);
});
