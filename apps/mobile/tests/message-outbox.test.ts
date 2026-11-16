import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedMessage,createMessageOutboxPolicy,loadOrCreateOutboxKey,MessageOutboxError,type OutboxDatabase,type MessageOutboxScope} from '../src/production/message-outbox-policy';
import {createMessageOutbox as unsupported} from '../src/production/message-outbox';
import type {ReviewedMessage} from '../src/production/reviewed-send';
const id=(n:number)=>`22000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope:MessageOutboxScope={issuer:'https://fixture.example/auth/v1',authorId:id(1)};
const message:ReviewedMessage={id:id(2),authorId:id(1),conversationId:id(3),peerId:id(4),body:' Exact approved words ',response:'later',recipientPolicy:{excludedContactIds:[id(9)],excludedCategories:['teacher']}};
function fixture(){
  let rows=new Map<string,{payload:string;status:string}>(),snapshot=rows;
  const state={session:id(5),author:scope.authorId,verify:0,opens:0,closes:0,failInsert:false,afterWrite:undefined as undefined|(()=>void)};
  const db:OutboxDatabase={
    async exec(sql){if(sql==='BEGIN IMMEDIATE')snapshot=new Map([...rows].map(([k,v])=>[k,{...v}]));if(sql==='ROLLBACK')rows=snapshot;},
    async first<T>(sql:string,args:readonly(string|number|null)[]=[]){if(sql.includes('count(*)'))return {total:rows.size} as T;return rows.get(String(args[0])) as T|undefined;},
    async all<T>(sql:string){return [...rows.values()].filter(row=>!sql.includes('WHERE status=')||row.status==='approved').map(row=>({...row})) as T[];},
    async run(sql,args){const text=args.map(String);
      if(sql.startsWith('INSERT')){if(state.failInsert)throw Error('simulated unavailable storage');rows.set(text[0],{payload:text[1],status:text[2]});}
      if(sql.startsWith('UPDATE')){const row=rows.get(text[1]);if(!row||row.payload!==text[2]||row.status!==text[3])return {changes:0};rows.set(text[1],{...row,status:text[0]});}
      if(sql.startsWith('DELETE')){const row=rows.get(text[0]);if(!row||row.payload!==text[1]||row.status!==text[2])return {changes:0};rows.delete(text[0]);}
      state.afterWrite?.();return {changes:1};
    },async close(){state.closes++;},
  };
  const ports={async verify(){state.verify++;return {issuer:scope.issuer,authorId:state.author,sessionId:state.session};},async open(){state.opens++;return db;}};
  return {state,ports,store:createMessageOutboxPolicy(scope,ports),rows:()=>rows};
}
test('approved command is exact, immutable and permits all four response choices',()=>{
  for(const response of ['listen','reply','later','talk'])assert.equal(approvedMessage({...message,response},scope).response,response);
  const copy=approvedMessage(message,scope);assert.equal(copy.body,' Exact approved words ');assert.ok(Object.isFrozen(copy));assert.ok(Object.isFrozen(copy.recipientPolicy?.excludedContactIds));
  for(const change of [{body:'x'.repeat(5001)},{body:'  '},{response:'diagnose'},{authorId:id(8)},{peerId:id(1)},{id:'nonce'},{actor:'parent'},{recipientPolicy:{excludedContactIds:[id(4)],excludedCategories:[]}}])
    assert.throws(()=>approvedMessage({...message,...change} as ReviewedMessage,scope),MessageOutboxError);
});
test('restart loads original UUID/command only; durable approval never invokes network',async()=>{
  const f=fixture();await f.store.persistApproved(message,{explicitSend:true});
  const restarted=createMessageOutboxPolicy(scope,f.ports),pending=await restarted.loadPending();assert.deepEqual(pending,[message]);
  assert.ok(Object.isFrozen(pending[0]));assert.equal(f.state.opens,f.state.closes);assert.equal(f.state.verify,4);
  await restarted.persistApproved(message,{explicitSend:true});assert.equal(f.rows().size,1);
});
test('requires explicit Send approval and same exact author/command; uncertain nonce cannot change',async()=>{
  const f=fixture();await assert.rejects(f.store.persistApproved(message,{explicitSend:false} as never));assert.equal(f.state.opens,0);
  await f.store.persistApproved(message,{explicitSend:true});
  for(const change of [{body:'changed'},{conversationId:id(7)},{peerId:id(8)},{response:'talk'},{recipientPolicy:undefined}])await assert.rejects(f.store.persistApproved({...message,...change},{explicitSend:true}));
  await assert.rejects(f.store.removeResolved(message,'saved'));assert.equal(f.rows().size,1);
});
test('known outcomes use full-command compare-and-set; unknown/error retains approval',async()=>{
  const f=fixture();await f.store.persistApproved(message,{explicitSend:true});
  await assert.rejects(f.store.resolve({...message,body:'different'},'saved'));assert.equal((await f.store.loadPending()).length,1);
  await f.store.resolve(message,'saved');assert.deepEqual(await f.store.loadPending(),[]);
  await f.store.persistApproved(message,{explicitSend:true});
  assert.deepEqual(await f.store.loadRecovery(),[{message,status:'saved'}]);
  await assert.rejects(f.store.resolve(message,'rejected'));await assert.rejects(f.store.removeResolved(message,'rejected'));assert.equal(f.rows().size,1);
  await f.store.removeResolved(message,'saved');assert.equal(f.rows().size,0);
  f.state.failInsert=true;await assert.rejects(f.store.persistApproved(message,{explicitSend:true}));assert.equal(f.rows().size,0);
});
test('rejected terminal recovery stays rejected without silently becoming approved',async()=>{
  const f=fixture();await f.store.persistApproved(message,{explicitSend:true});await f.store.resolve(message,'rejected');
  await createMessageOutboxPolicy(scope,f.ports).persistApproved(message,{explicitSend:true});
  assert.deepEqual(await f.store.loadPending(),[]);assert.deepEqual(await f.store.loadRecovery(),[{message,status:'rejected'}]);
  await assert.rejects(f.store.resolve(message,'saved'));await f.store.removeResolved(message,'rejected');assert.equal(f.rows().size,0);
});
test('account/session change denies read result and keeps committed recovery record',async()=>{
  const f=fixture();f.state.afterWrite=()=>{f.state.session=id(10);};await assert.rejects(f.store.persistApproved(message,{explicitSend:true}));
  assert.equal(f.rows().size,1);f.state.afterWrite=undefined;
  assert.equal((await f.store.loadPending())[0].id,message.id);
  f.state.author=id(7);const opens=f.state.opens;await assert.rejects(f.store.loadPending());assert.equal(f.state.opens,opens);
});
test('factory instances serialize writes; conflicting command cannot replace winner',async()=>{
  const f=fixture(),second=createMessageOutboxPolicy(scope,f.ports);
  const result=await Promise.allSettled([f.store.persistApproved(message,{explicitSend:true}),second.persistApproved({...message,body:'different'},{explicitSend:true})]);
  assert.deepEqual(result.map(v=>v.status),['fulfilled','rejected']);assert.equal((await f.store.loadPending())[0].body,message.body);
});
test('capacity and corrupt stored commands fail closed without truncating old records',async()=>{
  const f=fixture();for(let n=20;n<120;n++)await f.store.persistApproved({...message,id:id(n)},{explicitSend:true});
  await assert.rejects(f.store.persistApproved({...message,id:id(120)},{explicitSend:true}));assert.equal(f.rows().size,100);
  f.rows().set(id(20),{payload:JSON.stringify({...message,authorId:id(8)}),status:'approved'});await assert.rejects(f.store.loadPending());assert.equal(f.rows().size,100);
});
test('key lifecycle never regenerates missing or malformed key for existing ciphertext',async()=>{
  let random=0,writes=0;const ports={existing:true,read:async()=>null as string|null,write:async()=>{writes++;},random:async()=>{random++;return new Uint8Array(32).fill(17);}};
  await assert.rejects(loadOrCreateOutboxKey(ports));assert.equal(random,0);assert.equal(writes,0);
  await assert.rejects(loadOrCreateOutboxKey({...ports,read:async()=>''}));assert.equal(random,0);
  assert.equal(await loadOrCreateOutboxKey({...ports,existing:false}),'11'.repeat(32));assert.equal(random,1);assert.equal(writes,1);
  assert.equal(await loadOrCreateOutboxKey({...ports,existing:false,read:async()=>'22'.repeat(32)}),'22'.repeat(32));assert.equal(random,1);
});
test('unsupported platform refuses persistence and pending reads; no memory/plaintext fallback',async()=>{
  const store=unsupported(scope);await assert.rejects(store.persistApproved(message,{explicitSend:true}));await assert.rejects(store.loadPending());
});
