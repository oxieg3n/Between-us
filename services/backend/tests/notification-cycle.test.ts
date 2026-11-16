import assert from 'node:assert/strict';
import test from 'node:test';
import {createNotificationCycle} from '../src/notification-cycle.ts';
import {NEUTRAL_NOTIFICATION} from '../src/notifications.ts';
import {createFinanceState} from '../../../apps/mobile/src/finance/engine.ts';
// @ts-expect-error Operational entry is deliberately .mjs; all execution ports below are synthetic.
import {runNotificationCycleCli} from '../scripts/notification-cycle.mjs';
const id=(n:number)=>`c0000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const approved={enabled:true,credentialsReady:true,ownerApprovalId:'fictional-test-review',projectId:id(99),accessToken:'fictional-test-server-token'};
const dispatch={id:id(1),leaseToken:id(2),deviceId:id(3),platform:'android',token:'ExponentPushToken[fictional_cycle_token_1234]',
  payload:{...NEUTRAL_NOTIFICATION,data:{invalidationId:id(1)}}};
const receipt={id:id(4),leaseToken:id(5),ticketId:'fictional-prior-ticket'};
const json=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
function fixture(){
  const events:string[]=[],requests:{name:string;args:Record<string,unknown>}[]=[];
  const state={due:{status:'checked',created:1,sent:false} as unknown,jobs:[dispatch] as unknown[],receipts:[receipt] as unknown[],
    financeScopes:{status:'disabled'} as unknown,financeSnapshot:{status:'ready',familyId:id(51),childId:id(52),revision:0,
      serverAt:'2026-11-16T12:00:00.000Z',state:createFinanceState('UTC',[{id:id(52),name:'Fictional child'}])},
    failRpc:'',privateFailure:false,hold:undefined as (()=>Promise<void>)|undefined};
  const serviceClient={async rpc(name:string,args:Record<string,unknown>={}){
    events.push(name);requests.push({name,args});
    if(name===state.failRpc){if(state.privateFailure)throw Error('Private token SQL or provider detail must not escape');return{data:null,error:{code:'42501'}};}
    return{data:name==='produce_due_checkins'?state.due:name==='finance_notification_scopes'?state.financeScopes
      :name==='finance_notification_snapshot'?state.financeSnapshot:name==='queue_finance_notifications'?{status:'committed',created:0}
      :name==='finance_notification_delivery_snapshot'?{status:'legacy'}:name==='lease_notifications'?state.jobs:name==='lease_notification_receipts'?state.receipts:name.startsWith('authorize_')?true:{status:'recorded'},error:null};
  }};
  const request:typeof fetch=async(url,init)=>{
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer fictional-test-server-token');
    if(String(url).endsWith('/send')){events.push('provider-send');await state.hold?.();return json({data:{status:'ok',id:'fictional-new-ticket'}});}
    assert.equal(String(url),'https://exp.host/--/api/v2/push/getReceipts');events.push('provider-receipt');return json({data:{'fictional-prior-ticket':{status:'ok'}}});
  };
  return{state,events,requests,serviceClient,request,cycle:createNotificationCycle({serviceClient,configuration:approved,request})};
}

test('default disabled and incomplete provider settings do zero RPC/HTTP work',async()=>{
  let rpc=0,http=0,cursorReads=0,cursorWrites=0;
  const serviceClient={async rpc(){rpc++;throw Error('must not lease');}},request:typeof fetch=async()=>{http++;throw Error('must not send');};
  const financeCursor={async read(){cursorReads++;return null;},async write(){cursorWrites++;}};
  const disabled=await createNotificationCycle({serviceClient,request,financeCursor}).run();
  assert.deepEqual(disabled,{status:'disabled',checkins:null,finance:null,dispatch:null,receipts:null,deviceDelivered:false,read:false});
  for(const configuration of [{enabled:true},{...approved,credentialsReady:false},{...approved,ownerApprovalId:''},{...approved,projectId:'bad'},
    {...approved,accessToken:'private\nheader'}])assert.equal((await createNotificationCycle({serviceClient,configuration,request,financeCursor}).run()).status,'not_configured');
  assert.equal(rpc,0);assert.equal(http,0);assert.equal(cursorReads,0);assert.equal(cursorWrites,0);assert.equal((await createNotificationCycle({configuration:approved,request}).run()).status,'not_configured');
});

test('one cycle produces then dispatches then polls serially at limit20 and reports only exact neutral counts',async()=>{
  const f=fixture(),result=await f.cycle.run();
  assert.deepEqual(f.events,['produce_due_checkins','finance_notification_scopes','lease_notifications','finance_notification_delivery_snapshot','authorize_notification','provider-send','record_notification_ticket',
    'lease_notification_receipts','finance_notification_delivery_snapshot','authorize_notification_receipt','provider-receipt','complete_notification_receipt']);
  for(const value of f.requests.filter(value=>['produce_due_checkins','lease_notifications','lease_notification_receipts'].includes(value.name)))assert.deepEqual(value.args,{p_limit:20});
  assert.equal(result.status,'completed');assert.deepEqual(result.checkins,{status:'checked',created:1,sent:false});
  assert.deepEqual(result.finance,{status:'disabled',checked:0,created:0,sent:false});
  assert.equal(result.dispatch?.providerAccepted,1);assert.equal(result.receipts?.providerReceived,1);
  assert.equal(result.deviceDelivered,false);assert.equal(result.read,false);assert.equal(result.dispatch?.deviceDelivered,false);assert.equal(result.receipts?.read,false);
  const encoded=JSON.stringify(result);for(const privateValue of [dispatch.token,approved.accessToken,dispatch.id,receipt.ticketId,'invalidationId','payload'])assert.equal(encoded.includes(privateValue),false);
  assert.deepEqual(Object.keys(result).sort(),['checkins','deviceDelivered','dispatch','finance','read','receipts','status']);
});

test('due producer schema rejects private/extra fields, invalid status/count/sent and bounds before any dispatch lease',async()=>{
  for(const due of [null,[],{status:'checked',created:21,sent:false},{status:'checked',created:-1,sent:false},{status:'checked',created:1.5,sent:false},
    {status:'checked',created:'1',sent:false},{status:'checked',created:1,sent:true},{status:'sent',created:1,sent:false},
    {status:'disabled',created:1,sent:false},{status:'checked',created:1,sent:false,question:'private marker'}]){
    const f=fixture();f.state.due=due;const result=await f.cycle.run();
    assert.deepEqual(f.events,['produce_due_checkins']);assert.equal(result.status,'failed');assert.deepEqual(result.error,{stage:'produce',code:'invalid_batch'});
    assert.equal(result.checkins,null);assert.equal(result.dispatch,null);assert.equal(JSON.stringify(result).includes('private marker'),false);
  }
  for(const limit of [0,21,1.5,Number.NaN]){const f=fixture();const result=await f.cycle.run(limit);assert.equal(result.error?.stage,'validation');assert.equal(f.events.length,0);}
});

test('disabled due feature does not suppress separately permitted existing message dispatch',async()=>{
  const f=fixture();f.state.due={status:'disabled',created:0,sent:false};
  const result=await f.cycle.run();assert.equal(result.status,'completed');assert.equal(result.checkins?.status,'disabled');assert.equal(result.dispatch?.providerAccepted,1);
});

test('overlapping call is busy without RPC and receipts never start before dispatch finishes',async()=>{
  const f=fixture();let release!:()=>void,started=false;
  f.state.hold=()=>{started=true;return new Promise(resolve=>{release=resolve;});};
  const running=f.cycle.run();while(!started)await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await f.cycle.run()).status,'busy');assert.equal(f.events.includes('lease_notification_receipts'),false);
  release();assert.equal((await running).status,'completed');assert.ok(f.events.indexOf('record_notification_ticket')<f.events.indexOf('lease_notification_receipts'));
});

test('serial failures stop later phases and retain only known counts; partial failed batch counts are unknown, not false zero',async()=>{
  for(const failRpc of ['produce_due_checkins','finance_notification_scopes','record_notification_ticket','lease_notification_receipts']){
    const f=fixture();f.state.failRpc=failRpc;f.state.privateFailure=true;const result=await f.cycle.run();
    assert.equal(result.status,'failed');assert.equal(result.error?.code,'storage');assert.equal(JSON.stringify(result).includes('Private token'),false);
    if(failRpc==='produce_due_checkins'){assert.deepEqual(f.events,['produce_due_checkins']);assert.equal(result.checkins,null);}
    if(failRpc==='finance_notification_scopes'){assert.equal(result.error?.stage,'finance');assert.equal(result.finance,null);assert.equal(f.events.includes('lease_notifications'),false);}
    if(failRpc==='record_notification_ticket'){assert.equal(result.dispatch,null);assert.equal(f.events.includes('provider-send'),true);assert.equal(f.events.includes('lease_notification_receipts'),false);}
    if(failRpc==='lease_notification_receipts'){assert.equal(result.dispatch?.providerAccepted,1);assert.equal(result.receipts,null);}
    assert.equal(result.deviceDelivered,false);assert.equal(result.read,false);
  }
  const denied=fixture();denied.state.failRpc='produce_due_checkins';assert.equal((await denied.cycle.run()).error?.code,'authorization');
});

test('approved cycle persists a private scan cursor across runs while public results remain count-only',async()=>{
  const f=fixture(),writes:(string|null)[]=[];let position:string|null=null;
  f.state.financeScopes={status:'ready',scopes:[{familyId:id(51),childId:id(52)}],nextAfterChildId:id(52)};
  const cycle=createNotificationCycle({serviceClient:f.serviceClient,configuration:approved,request:f.request,
    financeCursor:{async read(){return position;},async write(value){position=value;writes.push(value);}}});
  const first=await cycle.run();assert.deepEqual(first.finance,{status:'checked',checked:1,created:0,sent:false});assert.deepEqual(writes,[id(52)]);
  f.state.financeScopes={status:'ready',scopes:[],nextAfterChildId:null};
  const second=await cycle.run();assert.deepEqual(writes,[id(52),null]);
  const reads=f.requests.filter(value=>value.name==='finance_notification_scopes');assert.equal(reads[1].args.p_after_child_id,id(52));
  for(const result of [first,second]){assert.equal(JSON.stringify(result).includes(id(52)),false);assert.equal(JSON.stringify(result).includes('nextAfterChildId'),false);}
});

test('cursor corruption/write failure fails the approved finance phase before dispatch without exposing cursor or private error',async()=>{
  for(const corrupt of [true,false]){
    const f=fixture();f.state.financeScopes={status:'ready',scopes:[],nextAfterChildId:null};
    const result=await createNotificationCycle({serviceClient:f.serviceClient,configuration:approved,request:f.request,
      financeCursor:{async read(){return corrupt?'private malformed cursor':null;},async write(){throw Error('private path detail');}}}).run();
    assert.equal(result.status,'failed');assert.equal(result.error?.stage,'finance');assert.equal(f.events.includes('lease_notifications'),false);
    assert.equal(JSON.stringify(result).includes('private'),false);
    assert.equal(result.finance===null,corrupt,'a failed cursor write preserves already known SQL counts');
  }
});

test('CLI default/dry-run/invalid flags never inspect configuration or status/execute ports; explicit mode still needs all approvals',async()=>{
  let credentials=0,execute=0;
  const closed={configuration:()=>{credentials++;throw Error('must not inspect private environment');},execute:async()=>{execute++;throw Error('must not read status/request');}};
  for(const args of [[],['--dry-run']])assert.equal((await runNotificationCycleCli(args,closed)).status,'disabled');
  for(const args of [['--run-approved-local','--dry-run'],['--access-token','private marker']])assert.equal((await runNotificationCycleCli(args,closed)).status,'failed');
  assert.equal(credentials,0);assert.equal(execute,0);
  const incomplete={configuration:()=>({enabled:true}),execute:async()=>{execute++;throw Error('must not read status');}};
  assert.equal((await runNotificationCycleCli(['--run-approved-local'],incomplete)).status,'not_configured');assert.equal(execute,0);
  const approvedPorts={configuration:()=>approved,execute:async(configuration:unknown)=>{assert.deepEqual(configuration,approved);execute++;return{status:'completed'};}};
  assert.equal((await runNotificationCycleCli(['--run-approved-local'],approvedPorts)).status,'completed');assert.equal(execute,1);
});
