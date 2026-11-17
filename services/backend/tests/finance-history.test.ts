import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFinanceCommand, createFinanceState, exportBooks } from '../../../apps/mobile/src/finance/engine.ts';
import { compactBook } from '../../../apps/mobile/src/finance/checkpoint.ts';
import type { FinanceCommand } from '../../../apps/mobile/src/finance/types.ts';
import { financeHistoryProjection } from '../src/finance-history.ts';

function fixture() {
  let state = createFinanceState('UTC', [{ id: 'child', name: 'Fictional child' }]), n = 0;
  const send = (action: Record<string, unknown>, role: 'parent' | 'child' = 'parent') => {
    const id = `fixture-${n++}`;
    state = applyFinanceCommand(state, { role, ...(role === 'child' ? { childId: 'child' } : {}) },
      { ...action, id, childId: 'child', at: '2026-11-16T12:00:00.000Z' } as FinanceCommand); return id;
  };
  send({ kind: 'configure_plan', plan: { budgetCents: 1000, period: 'monthly', anchorDate: '2026-11-01', payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
  send({ kind: 'assign_chore', choreId: 'chore', title: 'Fictional chore', rewardCents: 101, dates: ['2026-11-16'] });
  send({ kind: 'submit_chore', occurrenceId: 'chore:2026-11-16' }, 'child');
  send({ kind: 'review_chore', occurrenceId: 'chore:2026-11-16', decision: 'approved' });
  const payout = send({ kind: 'request_payout', amountCents: 101 }, 'child');
  send({ kind: 'report_payment', payoutId: payout, amountCents: 101, method: 'cash', paidAt: '2026-11-16T12:00:00.000Z' });
  return compactBook(exportBooks(state).child, 'child').capsules[0];
}
test('history allowlist preserves actionable visible corrections while removing internal source provenance', () => {
  const capsule = fixture();
  const page = financeHistoryProjection({ items: [{ id: '00000000-0000-0000-0000-000000000001', capsule, hash: 'private' }], nextAfterId: null, revision: 100 }, 'child');
  assert.equal(page.items[0].occurrences[0].rewardCents, 101);
  assert.equal(page.items[0].payouts[0].paidCents, 101);
  assert.equal(page.items[0].payouts[0].payments[0].childAcknowledged, false);
  for (const key of ['lots', 'earningId', 'effects', 'stateHash', 'hash', 'revision', 'sequence', 'checkpoint', 'matching']) assert.equal(JSON.stringify(page).includes(`"${key}"`), false, key);
});
test('history rejects wrong author, oversized pages, duplicate identities and invalid cursors', () => {
  const item = { id: '00000000-0000-0000-0000-000000000001', capsule: fixture() };
  assert.throws(() => financeHistoryProjection({ items: [item], nextAfterId: null }, 'other-child'));
  assert.throws(() => financeHistoryProjection({ items: [item, item], nextAfterId: null }, 'child'));
  assert.throws(() => financeHistoryProjection({ items: Array(21).fill(item), nextAfterId: null }, 'child'));
  assert.throws(() => financeHistoryProjection({ items: [item], nextAfterId: 'private-sequence-42' }, 'child'));
});
