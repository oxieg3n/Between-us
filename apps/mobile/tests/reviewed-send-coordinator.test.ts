import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewedSendCoordinator, type ReviewedThread } from '../src/production/reviewed-send-coordinator';
import type { ReviewedMessage } from '../src/production/reviewed-send';

const scope = {authorId:'author-A',sessionKey:'verified-session-A'};
const alice:ReviewedThread = {authorId:scope.authorId,conversationId:'thread-Alice',peerId:'Alice'};
const bob:ReviewedThread = {authorId:scope.authorId,conversationId:'thread-Bob',peerId:'Bob'};
const draft = {...alice,body:'Can we talk?',response:'later'};

test('unknown Alice send allows independent Bob; reopening Alice returns the same immutable snapshot and exact retry',async()=>{
  let ids = 0; const sent:ReviewedMessage[] = [];
  const coordinator = createReviewedSendCoordinator(scope,async message=>{
    sent.push(message); if (sent.length === 1) throw Error('unknown timeout');
  },()=>`op-${++ids}`);
  const first = coordinator.forThread(alice),policy = {excludedContactIds:['unsafe'],excludedCategories:[]};
  const reviewed = first.stage({...draft,recipientPolicy:policy}); policy.excludedContactIds.push('later mutation');
  assert.ok(Object.isFrozen(reviewed)); assert.ok(Object.isFrozen(reviewed.recipientPolicy?.excludedContactIds));
  await assert.rejects(first.submit(alice),/timeout/); assert.equal(first.uncertain(),true);
  assert.throws(()=>first.stage({...draft,body:'changed'}),/Retry/);
  const independent = coordinator.forThread(bob); independent.stage({...bob,body:'Different words for Bob',response:'reply'});
  await independent.submit(bob); assert.equal(independent.snapshot(),null); assert.equal(first.snapshot(),reviewed);
  const reopened = coordinator.forThread({...alice}); assert.equal(reopened,first); assert.equal(reopened.snapshot(),reviewed);
  assert.deepEqual(reviewed.recipientPolicy?.excludedContactIds,['unsafe']); assert.equal(sent.length,2,'navigation and snapshot lookup never send');
  await reopened.submit(alice); assert.equal(sent[0],sent[2]); assert.equal(ids,2); assert.equal(first.snapshot(),null);
});

test('thread scope rejects another author or changed peer without losing the original review',async()=>{
  let sends = 0; const coordinator = createReviewedSendCoordinator(scope,async()=>{sends++;},()=> 'op-A');
  const thread = coordinator.forThread(alice),reviewed = thread.stage(draft);
  assert.throws(()=>coordinator.forThread({...alice,peerId:'Bob'}),/another recipient/);
  assert.throws(()=>coordinator.forThread({...bob,authorId:'author-B'}),/this author/);
  assert.throws(()=>thread.stage({...draft,authorId:'author-B'}),/this author/);
  assert.throws(()=>thread.stage({...draft,peerId:'Bob'}),/recipient/);
  await assert.rejects(thread.submit({...alice,peerId:'Bob'}),/recipient/);
  assert.equal(thread.snapshot(),reviewed); assert.equal(sends,0);
  await thread.submit(alice); assert.equal(sends,1);
  assert.throws(()=>coordinator.forThread({...alice,peerId:'Bob'}),/another recipient/,'completed commands cannot rebind the thread');
});

test('pending metadata is frozen, scoped and contains no message body, response, policy or session key',()=>{
  const coordinator = createReviewedSendCoordinator(scope,async()=>{},()=> 'op-A');
  coordinator.forThread({...alice,body:'must not enter metadata'} as ReviewedThread).stage(draft);
  const pending = coordinator.pendingThreads();
  assert.deepEqual(pending,[{...alice,uncertain:false}]); assert.ok(Object.isFrozen(pending)); assert.ok(Object.isFrozen(pending[0]));
  assert.equal(JSON.stringify(pending).includes('Can we talk?'),false);
  coordinator.resetAll(); assert.deepEqual(coordinator.pendingThreads(),[]);
});

test('reset retires old async results and handles without clearing a new author/session controller',async()=>{
  let finishA!:()=>void,finishB!:()=>void;
  const old = createReviewedSendCoordinator(scope,()=>new Promise<void>(resolve=>{finishA=resolve;}),()=> 'op-A');
  const oldThread = old.forThread(alice); oldThread.stage(draft); const sendingA = oldThread.submit(alice);
  old.resetAll();
  const nextScope = {authorId:'author-B',sessionKey:'verified-session-B'},nextThread = {...alice,authorId:nextScope.authorId};
  const next = createReviewedSendCoordinator(nextScope,()=>new Promise<void>(resolve=>{finishB=resolve;}),()=> 'op-B');
  const nextSender = next.forThread(nextThread),nextSnapshot = nextSender.stage({...draft,authorId:nextScope.authorId,body:'B own words'});
  const sendingB = nextSender.submit(nextThread); old.resetAll(); finishA();
  await assert.rejects(sendingA,/Account changed/); assert.equal(nextSender.snapshot(),nextSnapshot); assert.equal(nextSender.uncertain(),true);
  assert.equal(oldThread.snapshot(),null); assert.equal(oldThread.uncertain(),false);
  assert.throws(()=>oldThread.stage(draft),/Account changed/); await assert.rejects(oldThread.submit(alice),/Account changed/);
  assert.throws(()=>old.forThread(alice),/Account changed/); finishB(); await sendingB; assert.equal(nextSender.snapshot(),null);
});

test('double tap cannot overlap one thread and confirmed rejection releases only that thread',async()=>{
  let reject!:()=>void,sends = 0;
  const coordinator = createReviewedSendCoordinator(scope,async message=>{
    sends++; if(message.peerId === alice.peerId) await new Promise<void>((_,fail)=>{reject=()=>fail(Object.assign(Error('denied'),{confirmedRejected:true}));});
  },()=> 'op-A');
  const first = coordinator.forThread(alice),second = coordinator.forThread(bob);
  first.stage(draft); const sending = first.submit(alice); await assert.rejects(first.submit(alice),/Review/);
  const secondSnapshot = second.stage({...bob,body:'Bob retained words',response:'listen'});
  reject(); await assert.rejects(sending,/denied/); assert.equal(sends,1); assert.equal(first.snapshot(),null); assert.equal(first.uncertain(),false);
  assert.equal(second.snapshot(),secondSnapshot); assert.doesNotThrow(()=>first.stage({...draft,body:'Corrected words'}));
});

test('restored approved envelope adopts its original UUID as read-only pending without generating IDs or sending',async()=>{
  const sent:ReviewedMessage[] = [],saved = {...draft,id:'durable-original-id',recipientPolicy:{excludedContactIds:['unsafe'],excludedCategories:[]}};
  const coordinator = createReviewedSendCoordinator(scope,async message=>{sent.push(message);},()=>{throw Error('must not mint a replacement UUID');});
  const thread = coordinator.forThread(alice),restored = thread.adopt(saved,{attempted:true});
  saved.body = 'changed after adoption'; saved.recipientPolicy.excludedContactIds.push('new');
  assert.equal(thread.uncertain(),true); assert.equal(sent.length,0); assert.equal(restored.id,'durable-original-id');
  assert.equal(restored.body,draft.body); assert.deepEqual(restored.recipientPolicy?.excludedContactIds,['unsafe']);
  assert.ok(Object.isFrozen(restored)); assert.equal(coordinator.forThread(alice).snapshot(),restored);
  assert.equal(thread.adopt({...restored},{attempted:true}),restored,'same saved command is safe to discover again');
  assert.throws(()=>thread.stage(draft),/Retry/);
  for (const change of [{id:'replacement-id'},{body:'different words'},{response:'reply'},{peerId:'Bob'},{conversationId:'other-thread'},{authorId:'author-B'},
    {recipientPolicy:{excludedContactIds:['different'],excludedCategories:[]}}])
    assert.throws(()=>thread.adopt({...restored,...change},{attempted:true}));
  assert.equal(thread.snapshot(),restored); await thread.submit(alice); assert.equal(sent[0],restored); assert.equal(thread.snapshot(),null);
});

test('writing lock clears only staged unattempted threads while unknown and adopted commands retain exact retries',async()=>{
  let ids = 0,sends = 0;
  const coordinator = createReviewedSendCoordinator(scope,async()=>{sends++;throw Error('unknown timeout');},()=>`op-${++ids}`);
  const first = coordinator.forThread(alice),unknown = first.stage(draft);
  await assert.rejects(first.submit(alice),/timeout/);
  const second = coordinator.forThread(bob); second.stage({...bob,body:'Unattempted private Bob review',response:'listen'});
  const carol = {...alice,conversationId:'thread-Carol',peerId:'Carol'},third = coordinator.forThread(carol);
  const adopted = third.adopt({...carol,id:'saved-Carol-id',body:'Approved Carol retry',response:'later'},{attempted:true});
  coordinator.clearUnattempted(); coordinator.clearUnattempted();
  assert.equal(first.snapshot(),unknown); assert.equal(first.uncertain(),true);
  assert.equal(third.snapshot(),adopted); assert.equal(third.uncertain(),true);
  assert.equal(second.snapshot(),null); assert.equal(second.uncertain(),false); assert.equal(sends,1);
  assert.equal(coordinator.forThread(bob),second);
  assert.equal(second.stage({...bob,body:'Fresh Bob words after locking',response:'reply'}).id,'op-3');
  assert.deepEqual(coordinator.pendingThreads().map(thread=>thread.peerId),['Alice','Bob','Carol']);
});
