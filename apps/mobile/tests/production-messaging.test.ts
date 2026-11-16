import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReviewedSender,type ReviewedMessage} from '../src/production/reviewed-send';
const draft={authorId:'author-A',conversationId:'Alice thread',peerId:'Alice',body:'Can we talk?',response:'listen'};
test('a review for Alice cannot dispatch from Bob conversation',async()=>{
  let sent=false;const sender=createReviewedSender(async()=>{sent=true;},()=> 'fictional-op');sender.stage(draft);
  await assert.rejects(sender.submit({conversationId:'Bob thread',peerId:'Bob'}),/Review/);assert.equal(sent,false);
});
test('unknown outcome freezes reviewed recipient, text and operation identity until exact retry confirms',async()=>{
  const sent:ReviewedMessage[]=[];let counter=0;
  const sender=createReviewedSender(async value=>{sent.push(value);if(sent.length===1)throw Error('fictional network timeout');},()=>`op-${++counter}`);
  sender.stage(draft);await assert.rejects(sender.submit(draft),/timeout/);assert.equal(sender.uncertain(),true);
  assert.throws(()=>sender.stage({...draft,body:'different'}),/Retry/);await sender.submit(draft);
  assert.deepEqual(sent[0],sent[1]);assert.equal(counter,1);assert.equal(sender.uncertain(),false);
});
test('confirmed server rejection permits editing and double taps cannot dispatch twice',async()=>{
  let release!:()=>void,count=0;const wait=new Promise<void>(resolve=>{release=resolve;});
  const sender=createReviewedSender(async()=>{count++;await wait;throw Object.assign(Error('denied'),{confirmedRejected:true});},()=> 'fictional-op');
  sender.stage(draft);const first=sender.submit(draft);await assert.rejects(sender.submit(draft),/Review/);release();await assert.rejects(first,/denied/);
  assert.equal(count,1);assert.equal(sender.uncertain(),false);assert.doesNotThrow(()=>sender.stage({...draft,body:'new words'}));
});
test('retiring an account prevents its late send result from clearing the next author pending message',async()=>{
  const release:(()=>void)[]=[];
  const sender=createReviewedSender(async()=>new Promise<void>(resolve=>release.push(resolve)),()=>`op-${release.length}`);
  sender.stage(draft);const first=sender.submit(draft);sender.reset();
  sender.stage({...draft,authorId:'author-B',body:'B separate words'});const second=sender.submit(draft);
  release[0]();await assert.rejects(first,/Account changed/);assert.equal(sender.uncertain(),true);
  await assert.rejects(sender.submit(draft),/Review/);release[1]();await second;assert.equal(sender.uncertain(),false);
});
