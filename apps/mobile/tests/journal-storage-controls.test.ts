import assert from 'node:assert/strict';
import test from 'node:test';
import {createJournalExportReview,eraseOwnJournalStorage,type JournalStorageScope} from '../src/production/journal-storage-controls';

const scope:JournalStorageScope={stamp:'author-session-lifetime-one',actor:{issuer:'https://fictional.example/auth/v1',subject:'author-one',sessionId:'session-one'}};
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function reviewFixture() {
  let current:JournalStorageScope|undefined=structuredClone(scope),prepare:(ids:readonly string[])=>Promise<string>=async()=>'{"fictional":"readable private review"}';
  const requests:string[][]=[],views:(string|undefined)[]=[];
  const review=createJournalExportReview({current:()=>current,prepare:ids=>{requests.push([...ids]);return prepare(ids);},changed:text=>views.push(text)});
  return {review,requests,views,current(value:JournalStorageScope|undefined){current=value;},prepare(value:typeof prepare){prepare=value;}};
}

test('export review requires deliberate bounded selection and passes only copied IDs to the memory preparer',async()=>{
  const f=reviewFixture();assert.equal(await f.review.review(),false);assert.equal(f.requests.length,0);
  const ids=['saved-own-page'];f.review.select(ids);ids[0]='changed-outside-caller';
  assert.equal(f.requests.length,0);assert.equal(await f.review.review(),true);assert.deepEqual(f.requests,[['saved-own-page']]);
  assert.equal(f.views.at(-1),'{"fictional":"readable private review"}');
  assert.throws(()=>f.review.select(Array.from({length:6},(_,i)=>`page-${i}`)),/up to five/);
  assert.throws(()=>f.review.select(['same','same']),/different/);
});

test('selection changes and real lock clear review and withhold awaited plaintext; locked review never dispatches',async()=>{
  const f=reviewFixture(),pending=deferred<string>();f.prepare(()=>pending.promise);f.review.select(['page-one']);
  const work=f.review.review();f.review.select(['page-two']);pending.resolve('OLD PRIVATE WORDS');assert.equal(await work,false);assert.equal(f.views.at(-1),undefined);
  const other=deferred<string>();f.prepare(()=>other.promise);const second=f.review.review();f.current(undefined);f.review.clear();
  other.resolve('LOCKED PRIVATE WORDS');assert.equal(await second,false);assert.equal(f.views.at(-1),undefined);
  assert.equal(await f.review.review(),false);assert.equal(f.requests.length,2);
});

test('same page selection cannot publish across author/session/lifetime changes or duplicate a pending authentication',async()=>{
  for(const changed of [
    {...scope,stamp:'new-editor-lifetime'},
    {...scope,actor:{...scope.actor,subject:'author-two'}},
    {...scope,actor:{...scope.actor,sessionId:'new-session'}},
  ]) {
    const f=reviewFixture(),pending=deferred<string>();f.prepare(()=>pending.promise);f.review.select(['page']);
    const work=f.review.review();assert.equal(await f.review.review(),false);f.current(changed);pending.resolve('STALE WORDS');
    assert.equal(await work,false);assert.equal(f.requests.length,1);assert.equal(f.views.at(-1),undefined);
  }
  const beforeDispatch=reviewFixture();beforeDispatch.review.select(['page-from-first-author']);
  beforeDispatch.current({...scope,actor:{...scope.actor,subject:'author-two'}});
  assert.equal(await beforeDispatch.review.review(),false);assert.equal(beforeDispatch.requests.length,0);
});

test('failed review leaves no plaintext and permits explicit retry without a storage reset',async()=>{
  const f=reviewFixture();f.review.select(['page']);await f.review.review();
  f.prepare(async()=>{throw new Error('fake private native failure');});await assert.rejects(f.review.review());assert.equal(f.views.at(-1),undefined);
  f.prepare(async()=> 'new review');assert.equal(await f.review.review(),true);assert.equal(f.views.at(-1),'new review');f.review.hide();assert.equal(f.views.at(-1),undefined);
});

test('own-vault erase drains writing and model, rechecks the fresh actor, and tolerates its one intentional core lock',async()=>{
  const events:string[]=[];let current:JournalStorageScope|undefined=structuredClone(scope);
  const result=await eraseOwnJournalStorage(scope,{
    current:()=>current,
    drainDrafts:async()=>{events.push('drain');},retireModel:async()=>{events.push('retire');},
    verifyActor:async()=>{events.push('verify');return {...scope.actor};},
    erase:async actor=>{assert.deepEqual(actor,scope.actor);events.push('erase-without-old-unlock-signal');current=undefined;},
  });
  assert.equal(result,true);assert.deepEqual(events,['drain','retire','verify','erase-without-old-unlock-signal']);
});

test('background/account changes at every awaited erase boundary and a changed verified actor prevent deletion',async()=>{
  for(const boundary of ['drain','retire','verify','actor']){
    let current:JournalStorageScope|undefined=structuredClone(scope),erases=0;
    const result=await eraseOwnJournalStorage(scope,{
      current:()=>current,
      drainDrafts:async()=>{if(boundary==='drain')current=undefined;},
      retireModel:async()=>{if(boundary==='retire')current={...scope,stamp:'another-lifetime'};},
      verifyActor:async()=>{if(boundary==='verify')current={...scope,actor:{...scope.actor,subject:'another-author'}};return {...scope.actor,sessionId:boundary==='actor'?'new-session':scope.actor.sessionId};},
      erase:async()=>{erases++;},
    });
    assert.equal(result,false);assert.equal(erases,0);
  }
});

test('failed retirement prevents erase and a failed erase is never retried or reported as success by policy',async()=>{
  for(const failure of ['retire','erase']) {
    let erases=0;
    await assert.rejects(eraseOwnJournalStorage(scope,{
      current:()=>scope,drainDrafts:async()=>{},
      retireModel:async()=>{if(failure==='retire')throw new Error('fake retirement failure');},
      verifyActor:async()=>scope.actor,
      erase:async()=>{erases++;throw new Error('fake interrupted key removal');},
    }));
    assert.equal(erases,failure==='retire'?0:1);
  }
});
