import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFinanceCommand, checkpointState, createFinanceState, exportBooks } from '../../../apps/mobile/src/finance/engine.ts';
import type { FinanceState } from '../../../apps/mobile/src/finance/types.ts';
import { createFinanceService } from '../src/finance.ts';
import { financeDigest } from '../src/finance-checkpoints.ts';
// @ts-expect-error The executable local-only probe exposes its pure guards and in-memory protocol model.
import { INPUT_LIMIT, familyState, nearCapSeed, options, probeRpc, referenceComparison, validateWorkerInput } from '../scripts/finance-checkpoint-family-probe.mjs';

function seed(): FinanceState {
  const childId = 'fictional-child', at = '2026-01-01T00:00:00.000Z';
  let state = createFinanceState('UTC', [{ id: childId, name: 'Fictional child' }]);
  state = applyFinanceCommand(state, { role: 'parent' }, { id: 'seed-plan', childId, at, kind: 'configure_plan', plan: {
    budgetCents: 5000, period: 'monthly', anchorDate: '2026-01-01', payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
  state = applyFinanceCommand(state, { role: 'child', childId }, { id: 'seed-goal', childId, at, kind: 'create_goal', goalId: 'goal', title: 'Fictional goal', targetCents: 1000 });
  const books = exportBooks(state);books[childId].archivedBudget = { period: 'monthly', anchorDate: '2026-01-01', maximumCents: 0, byPeriod: {}, excludedOccurrenceIds: [] };
  return checkpointState(state, books);
}

test('Node reference comparison preserves exact CPU/RSS ceilings and fails missing or nonfinite measurements', () => {
  const measured = { command: { cpuMs: { maximum: 2000 } }, memory: { processLifetimeMaxRssKiB: 262144 } };
  const result = referenceComparison(measured);
  assert.equal(result.referenceLimitsPassed, true);assert.equal(result.lifetimeRss.measuredBytes, 268435456);
  assert.equal(referenceComparison({ ...measured, command: { cpuMs: { maximum: 2000.001 } } }).commandCpu.passed, false);
  assert.equal(referenceComparison({ ...measured, memory: { processLifetimeMaxRssKiB: 262145 } }).lifetimeRss.passed, false);
  for (const maximum of [undefined, null, NaN, Infinity, -1]) assert.equal(referenceComparison({ ...measured, command: { cpuMs: { maximum } } }).referenceLimitsPassed, false);
  for (const processLifetimeMaxRssKiB of [undefined, null, NaN, Infinity, 0, -1, 2.5]) assert.equal(referenceComparison({ ...measured, memory: { processLifetimeMaxRssKiB } }).referenceLimitsPassed, false);
  assert.equal(measured.command.cpuMs.maximum, 2000);assert.equal(measured.memory.processLifetimeMaxRssKiB, 262144);
});

test('probe remaps entity source keys and references consistently across siblings without changing calendar keys', () => {
  const original = structuredClone(seed()), book = original.checkpoint!.books['fictional-child'];
  book.allocations.push({ id: 'allocation', goalId: 'goal', originalCents: 100, releasedCents: 100, lots: [], sourceCents: { 'chore:2026-01-01': 100 } });
  book.occurrences.push({ id: 'chore:2026-01-01', choreId: 'chore', title: 'Fictional chore', instructions: '', dueDate: '2026-01-01', rewardCents: 100, status: 'approved', note: '' });
  book.archivedBudget!.byPeriod['2026-01'] = 100;
  const before = JSON.stringify(original), remapped = familyState(original, 12) as FinanceState;
  assert.equal(JSON.stringify(original), before);assert.equal(remapped.children.length, 12);
  const ids = new Set<string>();
  for (const child of remapped.children) {
    const sibling = remapped.checkpoint!.books[child.id], occurrence = sibling.occurrences[0], allocation = sibling.allocations[0];
    assert.equal(occurrence.id, `${occurrence.choreId}:${occurrence.dueDate}`);
    assert.equal(allocation.goalId, sibling.goals[0].id);assert.equal(allocation.sourceCents[occurrence.id], 100);
    assert.deepEqual(sibling.archivedBudget!.byPeriod, { '2026-01': 100 });
    for (const id of [child.id, allocation.id, occurrence.id, sibling.goals[0].id]) { assert.ok(!ids.has(id));ids.add(id); }
  }
});

test('worker accepts only bounded state payloads with exact near-cap tails and approved modes', () => {
  const state = familyState(nearCapSeed(seed(), '2026-01-02T00:00:00.000Z'), 2) as FinanceState;
  const input = { format: 1, weeks: 15, children: 2, role: 'child', repeats: 10, sourceSequence: 1000, state };
  assert.doesNotThrow(() => validateWorkerInput(input));assert.equal(state.events.length, 314);
  assert.throws(() => validateWorkerInput({ ...input, history: [] }));
  assert.throws(() => validateWorkerInput({ ...input, repeats: 9 }));
  assert.throws(() => validateWorkerInput({ ...input, sourceSequence: 1 }));
  assert.throws(() => validateWorkerInput({ ...input, state: { ...state, events: state.events.slice(1) } }));
  assert.throws(() => validateWorkerInput({ ...input, state: { ...state, oversized: 'x'.repeat(INPUT_LIMIT) } }));
  assert.deepEqual(options([]), { weeks: 15, repeats: 10 });
  for (const args of [['--weeks=14'], ['--repeats=9'], ['--weeks=15', '--weeks=52'], ['--output=other'], ['--worker', '--weeks=15']]) assert.throws(() => options(args));
});

test('real service mock enforces serialized hash/CAS/idempotency and keeps no envelope history', async () => {
  const state = familyState(seed(), 1) as FinanceState, mock = probeRpc(state, 'child');
  const service = createFinanceService(mock), child = state.children[0].id, family = 'a1000000-0000-0000-0000-000000000001';
  const request = { id: 'a3000000-0000-0000-0000-000000000001', action: { kind: 'edit_goal' as const, goalId: state.checkpoint!.books[child].goals[0].id, title: 'Fictional updated goal', targetCents: 1000 } };
  const view = await service.command(family, child, request);assert.equal(view.goals[0].title, 'Fictional updated goal');
  assert.equal(mock.metrics.committed, 1);assert.ok(mock.metrics.maximumEnvelopeBytes > 0);
  assert.ok(mock.metrics.wireRequestBytes > 0 && mock.metrics.wireResponseBytes > 0);
  await service.command(family, child, request);assert.equal(mock.metrics.committed, 1);
  await assert.rejects(service.command(family, child, { ...request, action: { ...request.action, title: 'Changed body for same UUID' } }));
  const scope = (await mock.userClient.rpc('finance_scope', { p_family_id: family, p_child_id: child })).data;
  const before = await financeDigest(mock.db.state), revision = mock.db.revision;
  const stale = await mock.serviceClient.rpc('finance_commit', { p_scope: scope, p_operation_id: 'a3000000-0000-0000-0000-000000000002',
    p_fingerprint: '0'.repeat(64), p_expected_revision: revision - 1, p_state: { previousStateHash: before } });
  assert.equal(stale.data.status, 'conflict');assert.equal(mock.db.revision, revision);assert.equal(await financeDigest(mock.db.state), before);
  assert.equal('envelopes' in mock.db, false);assert.equal('snapshots' in mock.db, false);
  await assert.rejects(mock.serviceClient.rpc('unexpected_rpc', { p_scope: scope }));
});
