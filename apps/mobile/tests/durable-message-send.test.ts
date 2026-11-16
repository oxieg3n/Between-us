import assert from 'node:assert/strict';
import test from 'node:test';
import {makeReviewedMessageTransport,ReviewedMessageTransportError,type SenderMessageReceipt} from '../src/production/durable-message-send';
import type {MessageOutbox,MessageRecoveryRecord} from '../src/production/message-outbox-policy';
import {createReviewedSendCoordinator} from '../src/production/reviewed-send-coordinator';
import type {ReviewedMessage} from '../src/production/reviewed-send';
const id=(n:number)=>`23000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const message:ReviewedMessage={id:id(1),authorId:id(2),conversationId:id(3),peerId:id(4),body:'Reviewed fictional words',response:'later'};
const saved:SenderMessageReceipt={status:'saved',clientId:message.id,messageId:id(5),conversationId:message.conversationId,peerId:message.peerId};
function fixture(){
  const calls:string[]=[],records=new Map<string,MessageRecoveryRecord>();
  const state={receipt:{status:'unknown',clientId:message.id} as SenderMessageReceipt,persistFail:false,sendFail:false,removeFail:false,resolveFail:false,sends:0};
  const outbox:MessageOutbox={
    async persistApproved(value,intent){calls.push('persist');assert.equal(intent.explicitSend,true);if(state.persistFail)throw Error('storage unavailable');const old=records.get(value.id);if(old&&JSON.stringify(old.message)!==JSON.stringify(value))throw Error('conflict');if(!old)records.set(value.id,{message:value,status:'approved'});},
    async loadPending(){return [...records.values()].filter(row=>row.status==='approved').map(row=>row.message);},
    async loadRecovery(){calls.push('recovery');return [...records.values()];},
    async resolve(value,outcome){calls.push('resolve:'+outcome);if(state.resolveFail)throw Error('storage unavailable');const old=records.get(value.id);if(!old)throw Error('missing');records.set(value.id,{message:value,status:outcome});},
    async removeResolved(value,outcome){calls.push('remove:'+outcome);if(state.removeFail)throw Error('storage unavailable');assert.equal(records.get(value.id)?.status,outcome);records.delete(value.id);},
  };
  const ports={outbox,async receipt(value:ReviewedMessage){calls.push('receipt');assert.deepEqual(value,message);return state.receipt;},async sendCurrent(value:ReviewedMessage){calls.push('send');assert.deepEqual(value,message);state.sends++;if(state.sendFail)throw Object.assign(Error('denied'),{confirmedRejected:true});}};
  return {state,calls,records,outbox,ports,send:makeReviewedMessageTransport(ports)};
}
test('approval persists before any receipt/network; persist failure prevents both',async()=>{
  const f=fixture();f.state.persistFail=true;await assert.rejects(f.send(message),error=>error instanceof ReviewedMessageTransportError&&!error.confirmedRejected);
  assert.deepEqual(f.calls,['persist']);assert.equal(f.state.sends,0);
});
test('unknown receipt sends original approved UUID and only then resolves/removes',async()=>{
  const f=fixture();await f.send(message);assert.deepEqual(f.calls,['persist','recovery','receipt','send','resolve:saved','remove:saved']);assert.equal(f.records.size,0);
});
test('crash-adopted explicit coordinator retry retains same UUID; no stage/adopt autosend',async()=>{
  const f=fixture();await f.outbox.persistApproved(message,{explicitSend:true});
  const coordinator=createReviewedSendCoordinator({authorId:message.authorId,sessionKey:id(6)},makeReviewedMessageTransport(f.ports),()=>{throw Error('must not mint a replacement ID');});
  const thread=coordinator.forThread(message);thread.adopt((await f.outbox.loadPending())[0],{attempted:true});assert.equal(f.state.sends,0);
  await thread.submit(message);assert.equal(f.state.sends,1);assert.equal(thread.snapshot(),null);
});
test('saved matching receipt cleans record without retransmitting even after contact becomes blocked',async()=>{
  const f=fixture();f.state.receipt=saved;f.state.sendFail=true;await f.send(message);assert.equal(f.state.sends,0);assert.equal(f.records.size,0);
});
test('unknown plus later 42501/confirmedRejected remains approved and unresolved',async()=>{
  const f=fixture();f.state.sendFail=true;
  await assert.rejects(f.send(message),error=>error instanceof ReviewedMessageTransportError&&error.code==='unresolved'&&!('confirmedRejected' in error));
  assert.equal(f.records.get(message.id)?.status,'approved');assert.equal(f.calls.includes('resolve:rejected'),false);
});
test('wrong client/thread/peer or invalid saved message identity never resolves or sends',async()=>{
  for(const receipt of [{...saved,clientId:id(8)},{...saved,conversationId:id(8)},{...saved,peerId:id(8)},{...saved,messageId:''},{status:'unknown',clientId:id(8)}]){
    const f=fixture();f.state.receipt=receipt as SenderMessageReceipt;await assert.rejects(f.send(message),error=>error instanceof ReviewedMessageTransportError&&error.code==='receipt-scope');
    assert.equal(f.state.sends,0);assert.equal(f.records.get(message.id)?.status,'approved');
  }
});
test('saved-terminal cleanup failure survives helper restart; pruned remote receipt cannot trigger send',async()=>{
  const f=fixture();f.state.removeFail=true;
  await assert.rejects(f.send(message),error=>error instanceof ReviewedMessageTransportError&&error.knownSaved&&error.code==='saved-cleanup');
  assert.equal(f.state.sends,1);assert.equal(f.records.get(message.id)?.status,'saved');
  f.state.removeFail=false;f.state.receipt={status:'unknown',clientId:message.id};await makeReviewedMessageTransport(f.ports)(message);
  assert.equal(f.state.sends,1);assert.equal(f.records.size,0);
});
test('failure recording known saved state retains cache and never resends on explicit retry',async()=>{
  const f=fixture();f.state.resolveFail=true;await assert.rejects(f.send(message));assert.equal(f.records.get(message.id)?.status,'approved');
  f.state.resolveFail=false;await f.send(message);assert.equal(f.state.sends,1);assert.equal(f.records.size,0);
});
test('durable rejected record is cleaned as definitive original outcome without receipt or send',async()=>{
  const f=fixture();await f.outbox.persistApproved(message,{explicitSend:true});await f.outbox.resolve(message,'rejected');
  await assert.rejects(f.send(message),error=>error instanceof ReviewedMessageTransportError&&error.confirmedRejected);
  assert.equal(f.state.sends,0);assert.equal(f.calls.includes('receipt'),false);assert.equal(f.records.size,0);
});
test('web memory-only transport uses same receipt protocol but no durable-restart promise',async()=>{
  const f=fixture();await makeReviewedMessageTransport({receipt:f.ports.receipt,sendCurrent:f.ports.sendCurrent})(message);
  assert.deepEqual(f.calls,['receipt','send']);assert.equal(f.records.size,0);
});
