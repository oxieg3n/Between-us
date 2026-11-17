import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFinanceCommand, checkpointState, createFinanceState, exportBooks, financeView } from '../../../apps/mobile/src/finance/engine.ts';
import { compactBook, compactPrivateMatches } from '../../../apps/mobile/src/finance/checkpoint.ts';
import type { FinanceActor, FinanceCommand } from '../../../apps/mobile/src/finance/types.ts';
import { financeHistoryProjection, parentMatchHistoryProjection } from '../src/finance-history.ts';
import { mergeFinancePrivacy } from '../src/finance-privacy.ts';

const at = '2026-11-16T12:00:00.000Z', childId = 'child';
const parent: FinanceActor = { role: 'parent' }, child: FinanceActor = { role: 'child', childId };
function fixture(settled = true) {
  let state = createFinanceState('UTC', [{ id: childId, name: 'Fictional child' }]), n = 0;
  const send = (action: Record<string, unknown>, actor = parent) => {
    const id = `privacy-${n++}`; state = applyFinanceCommand(state, actor, { ...action, id, at, childId } as FinanceCommand); return id;
  };
  send({ kind: 'configure_plan', plan: { budgetCents: 1000, period: 'monthly', anchorDate: '2026-11-01', payoutCadence: 'daily', minimumPayoutCents: 0, allowGoalRelease: true } });
  send({ kind: 'assign_chore', choreId: 'chore', title: 'Fictional task', rewardCents: 101, dates: ['2026-11-16'] });
  send({ kind: 'submit_chore', occurrenceId: 'chore:2026-11-16' }, child);
  send({ kind: 'review_chore', occurrenceId: 'chore:2026-11-16', decision: 'approved' });
  if (!settled) return { state, original: state, capsules: [], privateCapsules: [] };
  send({ kind: 'create_goal', goalId: 'goal', title: 'Fictional goal', targetCents: 1000 }, child);
  send({ kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
  const allocation = send({ kind: 'allocate', goalId: 'goal', amountCents: 51 }, child);
  send({ kind: 'fund_match', matchId: `${allocation}:match`, amountCents: 21, method: 'cash', paidAt: at });
  send({ kind: 'release_goal', goalId: 'goal', amountCents: 51, note: 'Fictional release' }, child);
  const payout = send({ kind: 'request_payout', amountCents: 101 }, child);
  send({ kind: 'report_payment', payoutId: payout, amountCents: 101, method: 'cash', paidAt: at });
  const original = state, books = exportBooks(state), visible = compactBook(books[childId], childId);
  const privateResult = compactPrivateMatches(visible.book, childId, at, 'UTC'); books[childId] = privateResult.book;
  return { state: checkpointState(state, books), original, capsules: visible.capsules, privateCapsules: privateResult.capsules };
}
function source(f: ReturnType<typeof fixture>, actor: FinanceActor) {
  const archived = financeHistoryProjection({ items: f.capsules.map((capsule, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, capsule })), nextAfterId: null }, childId);
  const privatePage = parentMatchHistoryProjection({ items: f.privateCapsules.map((capsule, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, capsule })), nextAfterId: null }, childId);
  return { projection: financeView(f.state, actor, childId, at), archivedOccurrences: archived.items.flatMap(i => i.occurrences),
    archivedPayouts: archived.items.flatMap(i => i.payouts), activity: financeView(f.original, actor, childId, at).activity,
    ...(actor.role === 'parent' ? { archivedMatching: privatePage.items.map(i => i.match) } : {}) };
}
test('complete archive export preserves all visible records and exact balances without raw private provenance', () => {
  const f = fixture();
  for (const actor of [child, parent]) {
    const merged = mergeFinancePrivacy(source(f, actor), f.state, actor, childId, at);
    const golden = financeView(f.original, actor, childId, at);
    assert.deepEqual(JSON.parse(JSON.stringify(merged)), JSON.parse(JSON.stringify(golden)));
    assert.equal(JSON.stringify(merged).includes('"lots"'), false);
    assert.equal(JSON.stringify(merged).includes('"sourceCents"'), false);
  }
});
test('incomplete, duplicate, wrong-child, stale-position and raw-source exports cannot become ready', () => {
  const f = fixture(), s = source(f, child);
  assert.throws(() => mergeFinancePrivacy({ ...s, archivedOccurrences: [] }, f.state, child, childId, at));
  assert.throws(() => mergeFinancePrivacy({ ...s, archivedPayouts: [] }, f.state, child, childId, at));
  assert.throws(() => mergeFinancePrivacy({ ...s, archivedOccurrences: [...s.archivedOccurrences, ...s.archivedOccurrences] }, f.state, child, childId, at));
  assert.throws(() => mergeFinancePrivacy({ ...s, projection: { ...s.projection, childId: 'other' } }, f.state, child, childId, at));
  assert.throws(() => mergeFinancePrivacy({ ...s, projection: { ...s.projection, balances: { ...s.projection.balances, earnedCents: 102 } } }, f.state, child, childId, at));
  assert.throws(() => mergeFinancePrivacy({ ...s, archivedPayouts: [{ ...s.archivedPayouts[0], lots: [] }] }, f.state, child, childId, at));
});
test('a fixed source instant refreshes day-dependent payout eligibility without replaying archived history', () => {
  const f = fixture(false), s = source(f, child);
  assert.equal(s.projection.payout.due, false);
  const merged = mergeFinancePrivacy(s, f.state, child, childId, '2026-11-17T12:00:00.000Z');
  assert.equal(merged.payout.due, true); assert.equal(merged.payout.eligibleCents, 101);
});
