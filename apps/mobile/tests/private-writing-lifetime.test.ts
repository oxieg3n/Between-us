import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateWritingLifetime, PRIVATE_WRITING_IDLE_MS } from '../src/production/private-writing-lifetime';

function fixture() {
  let time = 0, active = true, words = 'unsent Root composer', attempted = false, visible = true;
  let review: Readonly<{id:string;body:string}> | null = Object.freeze({id:'same-operation',body:'exact reviewed words'});
  const events: string[] = [];
  const lifetime = createPrivateWritingLifetime({
    current: () => active, monotonicNow: () => time, attempted: () => attempted,
    clearUnsent() { events.push('clear'); words = ''; },
    invalidateDraftHandlers() { events.push('invalidate'); },
    discardUnattemptedReview() { events.push('discard'); review = null; visible = false; },
    hideAttemptedReview() { events.push('hide'); visible = false; },
  });
  return { lifetime, events, setTime(value:number) { time = value; }, setCurrent(value:boolean) { active = value; },
    setAttempted(value:boolean) { attempted = value; }, state: () => ({words,review,visible}) };
}

test('Home or Review navigation does not protect retained Root writing from the author-wide idle lock', () => {
  for (const screen of ['Home','Review']) {
    const f = fixture();
    f.lifetime.touch(); // The coordinator remains mounted when the Conversation has left either screen.
    f.setTime(PRIVATE_WRITING_IDLE_MS - 1); assert.equal(f.lifetime.tick(),false,screen);
    f.setTime(PRIVATE_WRITING_IDLE_MS); assert.equal(f.lifetime.tick(),true,screen);
    assert.deepEqual(f.events,['clear','invalidate','discard']);
    assert.deepEqual(f.state(),{words:'',review:null,visible:false});
    f.setTime(PRIVATE_WRITING_IDLE_MS * 4); assert.equal(f.lifetime.tick(),false);
    assert.equal(f.lifetime.lock(),false); assert.equal(f.events.length,3,'already locked until new actual input');
  }
});

test('immediate background/manual lock hides an attempted review without changing immutable retry identity or body', () => {
  const f = fixture(); f.setAttempted(true);
  const exact = f.state().review;
  assert.equal(f.lifetime.lock(),true,'background at timestamp zero must still lock');
  assert.deepEqual(f.events,['clear','invalidate','hide']);
  assert.equal(f.state().words,''); assert.equal(f.state().visible,false);
  assert.equal(f.state().review,exact); assert.deepEqual(exact,{id:'same-operation',body:'exact reviewed words'});
  assert.equal(f.lifetime.touch(),true); assert.equal(f.state().visible,false,'typing never unhides the attempted command');
  assert.equal(f.state().review,exact);
  f.setTime(PRIVATE_WRITING_IDLE_MS); assert.equal(f.lifetime.tick(),true);
  assert.deepEqual(f.events,['clear','invalidate','hide','clear','invalidate','hide']); assert.equal(f.state().review,exact);
});

test('stale author A and cancelled lifetimes cannot mutate the current author B or revive a callback', () => {
  for (const end of ['stale','cancel'] as const) {
    const f = fixture(),before = f.state();
    if (end === 'stale') f.setCurrent(false); else f.lifetime.cancel();
    f.setTime(PRIVATE_WRITING_IDLE_MS * 2);
    assert.equal(f.lifetime.touch(),false); assert.equal(f.lifetime.tick(),false); assert.equal(f.lifetime.lock(),false);
    assert.deepEqual(f.events,[]); assert.deepEqual(f.state(),before);
    if (end === 'cancel') { f.setCurrent(true); assert.equal(f.lifetime.touch(),false); }
  }
});

test('only actual input resets the monotonic idle deadline; ticks and a backwards sample cannot extend it', () => {
  const f = fixture(); f.setTime(100_000); assert.equal(f.lifetime.touch(),true);
  f.setTime(119_999); assert.equal(f.lifetime.tick(),false);
  f.setTime(120_000); assert.equal(f.lifetime.tick(),false,'a timer tick is not author activity');
  f.setTime(110_000); assert.equal(f.lifetime.tick(),false,'backwards clock cannot change the deadline');
  f.setTime(219_999); assert.equal(f.lifetime.tick(),false);
  f.setTime(220_000); assert.equal(f.lifetime.tick(),true);
  f.setTime(230_000); assert.equal(f.lifetime.touch(),true);
  f.setTime(349_999); assert.equal(f.lifetime.tick(),false);
  f.setTime(350_000); assert.equal(f.lifetime.tick(),true); assert.equal(f.events.length,6);
});

test('an overdue input locks expired writing before a delayed timer; only subsequent input starts a fresh draft', () => {
  const f = fixture();
  f.setTime(PRIVATE_WRITING_IDLE_MS + 1);
  assert.equal(f.lifetime.touch(),false,'the overdue edit must be discarded by its caller');
  assert.deepEqual(f.events,['clear','invalidate','discard']);
  assert.deepEqual(f.state(),{words:'',review:null,visible:false});
  assert.equal(f.lifetime.touch(),true,'a new edit can start a fresh memory draft after locking');
  assert.equal(f.events.length,3); assert.equal(f.lifetime.tick(),false);
  f.setTime(PRIVATE_WRITING_IDLE_MS * 2); assert.equal(f.lifetime.tick(),false);
  f.setTime(PRIVATE_WRITING_IDLE_MS * 2 + 1); assert.equal(f.lifetime.tick(),true);
  const stale = fixture(); stale.setCurrent(false); stale.setTime(PRIVATE_WRITING_IDLE_MS + 1);
  assert.equal(stale.lifetime.touch(),false); assert.deepEqual(stale.events,[]);
});

test('a scope change during clearing prevents the later old-author callback mutations', () => {
  const events:string[] = []; let active = true;
  const lifetime = createPrivateWritingLifetime({current:()=>active,monotonicNow:()=>0,attempted:()=>false,
    clearUnsent() { events.push('clear-A'); active = false; },
    invalidateDraftHandlers() { events.push('invalidate-B'); },
    discardUnattemptedReview() { events.push('discard-B'); },hideAttemptedReview() { events.push('hide-B'); }});
  assert.equal(lifetime.lock(),true); assert.deepEqual(events,['clear-A']);
});
