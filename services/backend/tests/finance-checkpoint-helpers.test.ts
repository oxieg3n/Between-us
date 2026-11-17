import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceState } from '../../../apps/mobile/src/finance/engine.ts';
import { canonicalFinance, financeDigest, needsTailCheckpoint, privateFinanceKinds } from '../src/finance-checkpoints.ts';

test('checkpoint digest uses the same sorted JSON representation as the database, excluding absent object fields', async () => {
  assert.equal(canonicalFinance({ z: [2, { b: 1, a: 'fictional' }], a: 0, absent: undefined }), '{"a":0,"z":[2,{"a":"fictional","b":1}]}');
  assert.equal(await financeDigest({ b: 2, a: 1 }), await financeDigest({ a: 1, b: 2 }));
  assert.notEqual(await financeDigest({ a: 1 }), await financeDigest({ a: 2 }));
  assert.equal(canonicalFinance({ '\u{1f600}': 1, '\ue000': 2 }), '{"\ue000":2,"\u{1f600}":1}');
});
test('tail rollover keeps the existing128 visible/32 private windows and counts only the requested child', () => {
  const state = createFinanceState('UTC', [{ id: 'a', name: 'Fictional A' }, { id: 'b', name: 'Fictional B' }]);
  const visible = { id: 'fixture', at: '2026-11-16T00:00:00.000Z', childId: 'a', kind: 'configure_plan' as const,
    plan: { budgetCents: 100, period: 'monthly' as const, anchorDate: '2026-11-01', payoutCadence: 'per_task' as const, minimumPayoutCents: 0, allowGoalRelease: true }, actor: { role: 'parent' as const }, effects: [] };
  const loaded = { ...state, events: Array.from({ length: 128 }, (_, i) => ({ ...visible, id: String(i) })) };
  assert.equal(needsTailCheckpoint(loaded, 'a', 'configure_plan'), true);
  assert.equal(needsTailCheckpoint(loaded, 'a', 'configure_matching'), false);
  assert.equal(needsTailCheckpoint(loaded, 'b', 'configure_plan'), false);
  assert.equal(needsTailCheckpoint({ ...loaded, events: loaded.events.slice(1) }, 'a', 'configure_plan'), false);
  assert.equal(privateFinanceKinds.has('allocate'), false);
});
