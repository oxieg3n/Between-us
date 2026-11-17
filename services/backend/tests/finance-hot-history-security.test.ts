import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFinanceCommand, checkpointState, createFinanceState, financeView } from '../../../apps/mobile/src/finance/engine.ts';
import type { FinanceActor, FinanceCommand, FinanceState } from '../../../apps/mobile/src/finance/types.ts';
import { financeDigest } from '../src/finance-checkpoints.ts';
import { createFinanceService, FinanceServiceError, type FinanceAction } from '../src/finance.ts';

const family = '83000000-0000-0000-0000-000000000001', child = '83000000-0000-0000-0000-000000000002';
const parent = '83000000-0000-0000-0000-000000000003', otherFamily = '83000000-0000-0000-0000-000000000004';
const at = '2026-11-16T12:00:00.000Z', operation = '84000000-0000-0000-0000-000000000001';
const plan = { budgetCents: 1000, period: 'monthly' as const, anchorDate: '2026-11-01', payoutCadence: 'per_task' as const, minimumPayoutCents: 0, allowGoalRelease: true };
function activeMatches() {
  let state = createFinanceState('UTC', [{ id: child, name: 'Fictional child' }]), n = 0;
  function send(action: FinanceAction, actor: FinanceActor = { role: 'parent' }) {
    state = applyFinanceCommand(state, actor, { ...action, id: `fictional-${String(n++).padStart(4, '0')}`, childId: child, at } as FinanceCommand);
  }
  send({ kind: 'configure_plan', plan });
  send({ kind: 'create_goal', goalId: 'goal', title: 'Fictional goal', targetCents: 1000 }, { role: 'child', childId: child });
  send({ kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 1000, parentBudgetCents: 1000, surprise: true } });
  send({ kind: 'assign_chore', choreId: 'task', title: 'Fictional task', rewardCents: 500, dates: ['2026-11-16'] });
  send({ kind: 'submit_chore', occurrenceId: 'task:2026-11-16' }, { role: 'child', childId: child });
  send({ kind: 'review_chore', occurrenceId: 'task:2026-11-16', decision: 'approved' });
  for (let i = 0; i < 121; i++) send({ kind: 'allocate', goalId: 'goal', amountCents: 1 }, { role: 'child', childId: child });
  return checkpointState(state);
}
function fixture(state: FinanceState, role: 'parent' | 'child' = 'parent', response?: (args: Record<string, unknown>) => unknown, badHash = false) {
  const calls: string[] = [];
  // These pure RPC fakes exercise adapter boundaries, not actual database authorization.
  const userClient = { async rpc(name: string, args: Record<string, unknown> = {}) {
    assert.equal(name, 'finance_scope');
    if (args.p_family_id !== family || args.p_child_id !== child) return { data: null, error: { code: '42501', message: 'private fixture detail' } };
    return { data: { actorId: parent, sessionId: operation, expiresAt: 2_000_000_000, familyId: family, childId: child, role }, error: null };
  } };
  const serviceClient = { async rpc(name: string, args: Record<string, unknown> = {}) {
    calls.push(name);
    if (name === 'finance_load') return { data: { state, revision: 0, serverAt: at, replay: false, stateHash: badHash ? 'bad' : await financeDigest(state) }, error: null };
    assert.equal(name, 'finance_commit'); assert.ok(response);
    assert.equal(args.p_expected_revision, 0);
    assert.equal((args.p_state as { previousStateHash: string }).previousStateHash, await financeDigest(state));
    return { data: response(args), error: null };
  } };
  return { service: createFinanceService({ userClient, serviceClient }), calls };
}
const code = (wanted: FinanceServiceError['code']) => (error: unknown) => error instanceof FinanceServiceError && error.code === wanted;

test('parent can discover every still-hot match beyond the100-record summary without exposing source maps', async () => {
  const state = activeMatches(), f = fixture(state);
  const first = financeView(state, { role: 'parent' }, child, at).matching!.commitments[0].id;
  const summary = await f.service.read(family, child);
  assert.equal(summary.matching!.commitments.length, 100);
  assert.equal(summary.matching!.commitments.some(match => match.id === first), false);
  const ids: string[] = []; let after: string | null = null;
  do {
    const page = await f.service.parentHotHistory(family, child, after);
    assert.ok(page.items.length <= 20);
    for (const forbidden of ['sourceCents', 'invalidatedCents', 'eligibleBaseCents', 'stateHash', 'revision', 'checkpoint']) assert.equal(JSON.stringify(page).includes(`"${forbidden}"`), false);
    ids.push(...page.items.map(match => match.id)); after = page.nextAfterId;
  } while (after);
  assert.equal(ids.length, 121); assert.equal(new Set(ids).size, 121); assert.ok(ids.includes(first));
});

test('child and unrelated family are denied before private hot state is loaded', async () => {
  const state = activeMatches(), kid = fixture(state, 'child'), stranger = fixture(state);
  await assert.rejects(kid.service.parentHotHistory(family, child), code('not_authorized'));
  await assert.rejects(stranger.service.parentHotHistory(otherFamily, child), code('not_authorized'));
  assert.deepEqual(kid.calls, []); assert.deepEqual(stranger.calls, []);
});

test('unknown, cross-scope and oversized cursors fail without returning matching records', async () => {
  const f = fixture(activeMatches());
  await assert.rejects(f.service.parentHotHistory(family, child, 'another-child-match'), code('invalid_action'));
  await assert.rejects(f.service.parentHotHistory(family, child, ''), code('invalid_action'));
  const before = f.calls.length;
  await assert.rejects(f.service.parentHotHistory(family, child, 'x'.repeat(513)), code('invalid_action'));
  assert.equal(f.calls.length, before);
});

test('hot parent page rejects a corrupted current-state hash with generic unavailability', async () => {
  const f = fixture(activeMatches(), 'parent', undefined, true);
  await assert.rejects(f.service.parentHotHistory(family, child), error => code('temporarily_unavailable')(error) && (error as Error).message === 'Financial service is temporarily unavailable.');
});

test('only exact newly committed status and server time can reuse the validated immutable candidate', async () => {
  const state = createFinanceState('UTC', [{ id: child, name: 'Fictional child' }]);
  const f = fixture(state, 'parent', () => ({ status: 'committed', serverAt: at, get state(): never { throw Error('Raw response state must not be reprojected.'); } }));
  const result = await f.service.command(family, child, { id: operation, action: { kind: 'configure_plan', plan } });
  assert.equal(result.plan!.budgetCents, 1000);
  const wrongTime = fixture(state, 'parent', () => ({ status: 'committed', serverAt: '2026-11-16T12:00:00.001Z', state }));
  await assert.rejects(wrongTime.service.command(family, child, { id: operation, action: { kind: 'configure_plan', plan } }), code('temporarily_unavailable'));
});

test('a racing replay still projects current database state rather than our discarded candidate', async () => {
  const state = createFinanceState('UTC', [{ id: child, name: 'Fictional child' }]);
  const current = applyFinanceCommand(state, { role: 'parent' }, { kind: 'configure_plan', plan: { ...plan, budgetCents: 777 }, id: 'accepted-racing-command', childId: child, at });
  const f = fixture(state, 'parent', () => ({ status: 'replayed', serverAt: at, state: current }));
  const result = await f.service.command(family, child, { id: operation, action: { kind: 'configure_plan', plan } });
  assert.equal(result.plan!.budgetCents, 777);
});
