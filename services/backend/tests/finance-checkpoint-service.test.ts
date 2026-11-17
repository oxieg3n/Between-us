import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFinanceCommand, checkpointState, createFinanceState, exportBooks, financeEventActivity, financeView } from '../../../apps/mobile/src/finance/engine.ts';
import type { FinanceActor, FinanceCommand, FinancePrivateMatchCapsule, FinanceSettledCapsule, FinanceState, FinanceView } from '../../../apps/mobile/src/finance/types.ts';
import { financeDigest } from '../src/finance-checkpoints.ts';
import { createFinanceService, FinanceServiceError, type FinanceAction } from '../src/finance.ts';

const family = '21000000-0000-0000-0000-000000000001', child = '21000000-0000-0000-0000-000000000002';
const parentId = '21000000-0000-0000-0000-000000000003', childId = '21000000-0000-0000-0000-000000000004';
const at = '2026-11-16T12:00:00.000Z', day = '2026-11-16';
const op = (n: number) => `31000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const plan = { budgetCents: 1_000_000, period: 'monthly' as const, anchorDate: '2026-11-01', payoutCadence: 'per_task' as const, minimumPayoutCents: 0, allowGoalRelease: true };
const parentActor = { role: 'parent' } as const, childActor = { role: 'child', childId: child } as const;
const clone = <T>(value: T): T => structuredClone(value);
type Envelope = { state: FinanceState; event: FinanceState['events'][number]; previousStateHash: string;
  capsules: FinanceSettledCapsule[]; hydratedCapsules: { id: string; hash: string }[];
  privateCapsules: FinancePrivateMatchCapsule[]; hydratedPrivateCapsules: { id: string; hash: string }[];
  eventActivity: FinanceView['activity'][number]; coveredActivity: FinanceView['activity']; childProjection: FinanceView; parentProjection: FinanceView };
type Stored<T> = { id: string; hash: string; capsule: T; active: boolean };

/** Local CAS/archive model: no Supabase client, credentials, IO, or claim of SQL enforcement. */
function fixture() {
  const db = { state: createFinanceState('UTC', [{ id: child, name: 'Fictional child' }]), revision: 0, loads: 0,
    commitAttempts: 0, failCommit: false, commitConflicts: 0, budgetConflicts: 0, badHash: false, badArchive: false,
    envelopes: [] as Envelope[], calls: [] as string[], commands: new Map<string, unknown>(),
    visible: [] as Stored<FinanceSettledCapsule>[], hidden: [] as Stored<FinancePrivateMatchCapsule>[],
    indexed: new Map<string, { date: string; cents: number }>() };
  const ok = (data: unknown) => ({ data: clone(data), error: null });
  const denied = (code = 'PT503') => ({ data: null, error: { code, message: 'private fixture detail' } });
  const serviceClient = { async rpc(name: string, args: Record<string, unknown> = {}) {
    db.calls.push(name); const scope = args.p_scope as { actorId: string; role: string };
    const key = `${scope.actorId}:${args.p_operation_id}`;
    if (db.commands.has(key) && db.commands.get(key) !== args.p_fingerprint) return denied('22023');
    if (name === 'finance_load') {
      db.loads++; return ok({ state: db.state, revision: db.revision, serverAt: at, replay: db.commands.has(key),
        stateHash: db.badHash ? 'bad-private-source-hash' : await financeDigest(db.state), throughSequence: db.revision });
    }
    if (name === 'finance_archive_budget') {
      if (db.budgetConflicts-- > 0) { db.revision++; }
      const totals: Record<string, number> = {};
      for (const row of db.indexed.values()) { const key = row.date.slice(0, 7); totals[key] = (totals[key] ?? 0) + row.cents; }
      return ok({ period: args.p_period, anchorDate: args.p_anchor_date, maximumCents: Math.max(0, ...Object.values(totals)),
        byPeriod: Object.fromEntries((args.p_period_keys as string[]).map(key => [key, totals[key] ?? 0])),
        excludedOccurrenceIds: (args.p_hot_occurrence_ids as string[]).filter(id => db.indexed.has(id)),
        revision: db.revision, stateHash: await financeDigest(db.state) });
    }
    if (name === 'finance_archive_lookup' || name === 'finance_private_match_lookup') {
      if (name === 'finance_archive_lookup' && !['occurrence', 'payout', 'payment', 'allocation'].includes(String(args.p_entity_kind))) return denied('22023');
      const row = name === 'finance_private_match_lookup' ? db.hidden.find(row => row.active && row.capsule.match.id === args.p_match_id)
        : db.visible.find(row => row.active && (args.p_entity_kind === 'occurrence' ? row.capsule.occurrences.some(o => o.id === args.p_entity_id)
          : args.p_entity_kind === 'allocation' ? row.capsule.allocations.some(a => a.id === args.p_entity_id)
            : args.p_entity_kind === 'payment' ? row.capsule.payouts.some(p => p.payments.some(pay => pay.id === args.p_entity_id))
              : row.capsule.payouts.some(p => p.id === args.p_entity_id)));
      return row ? ok({ ...row, hash: db.badArchive ? 'bad-private-archive-hash' : row.hash, revision: db.revision, stateHash: await financeDigest(db.state) }) : ok(null);
    }
    if (name === 'finance_archive_page' || name === 'finance_private_match_page') {
      const rows = name === 'finance_archive_page' ? db.visible : db.hidden;
      return ok({ items: rows.slice(0, 20), nextAfterId: null });
    }
    assert.equal(name, 'finance_commit'); db.commitAttempts++;
    if (db.failCommit) return denied();
    if (db.commitConflicts-- > 0) { db.revision++; return ok({ status: 'conflict' }); }
    const envelope = args.p_state as Envelope;
    if (args.p_expected_revision !== db.revision || envelope.previousStateHash !== await financeDigest(db.state)) return ok({ status: 'conflict' });
    // All validations precede mutation. Immutable payload publication and residency share this CAS.
    for (const item of envelope.hydratedCapsules) assert.ok(db.visible.some(row => row.active && row.id === item.id && row.hash === item.hash));
    for (const item of envelope.hydratedPrivateCapsules) assert.ok(db.hidden.some(row => row.active && row.id === item.id && row.hash === item.hash));
    const visible = await Promise.all(envelope.capsules.map(async capsule => ({ id: op(800000 + db.visible.length + envelope.capsules.indexOf(capsule)), hash: await financeDigest(capsule), capsule: clone(capsule), active: true })));
    const hidden = await Promise.all(envelope.privateCapsules.map(async capsule => ({ id: op(900000 + db.hidden.length + envelope.privateCapsules.indexOf(capsule)), hash: await financeDigest(capsule), capsule: clone(capsule), active: true })));
    for (const item of envelope.hydratedCapsules) db.visible.find(row => row.id === item.id)!.active = false;
    for (const item of envelope.hydratedPrivateCapsules) db.hidden.find(row => row.id === item.id)!.active = false;
    for (const row of visible) for (const o of row.capsule.occurrences) db.indexed.set(o.id, { date: o.dueDate, cents: ['cancelled', 'expired', 'declined'].includes(o.status) ? 0 : o.rewardCents });
    db.visible.push(...visible); db.hidden.push(...hidden); db.state = clone(envelope.state); db.revision++;
    db.envelopes.push(clone(envelope)); db.commands.set(key, args.p_fingerprint);
    return ok({ status: 'committed', state: db.state, serverAt: at });
  } };
  const user = (role: 'parent' | 'child') => ({ async rpc(name: string) {
    assert.equal(name, 'finance_scope'); return ok({ actorId: role === 'parent' ? parentId : childId,
      sessionId: op(500), expiresAt: 2_000_000_000, familyId: family, childId: child, role });
  } });
  const parent = createFinanceService({ userClient: user('parent'), serviceClient });
  const kid = createFinanceService({ userClient: user('child'), serviceClient });
  const send = (who: typeof parent, n: number, action: FinanceAction) => who.command(family, child, { id: op(n), action });
  let seedId = 0;
  const seed = (action: FinanceAction, actor: FinanceActor = parentActor) => { const id = `fictional-seed-${++seedId}`;
    db.state = applyFinanceCommand(db.state, actor, { ...action, id, childId: child, at } as FinanceCommand); return id; };
  return { db, parent, kid, send, seed };
}
async function paid(f: ReturnType<typeof fixture>, matching = false, funded = false) {
  await f.send(f.parent, 1, { kind: 'configure_plan', plan });
  await f.send(f.kid, 2, { kind: 'create_goal', goalId: 'goal', title: 'Fictional goal', targetCents: 100000 });
  if (matching) await f.send(f.parent, 3, { kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 10000, parentBudgetCents: 10000, surprise: true } });
  await f.send(f.parent, 4, { kind: 'assign_chore', choreId: 'chore', title: 'Fictional chore', rewardCents: 100, dates: [day] });
  await f.send(f.kid, 5, { kind: 'submit_chore', occurrenceId: `chore:${day}` });
  await f.send(f.parent, 6, { kind: 'review_chore', occurrenceId: `chore:${day}`, decision: 'approved' });
  await f.send(f.kid, 7, { kind: 'allocate', goalId: 'goal', amountCents: 100 });
  if (funded) await f.send(f.parent, 8, { kind: 'fund_match', matchId: `${childId}:${op(7)}:match`, amountCents: 50, method: 'manual', paidAt: at });
  await f.send(f.kid, 9, { kind: 'release_goal', goalId: 'goal', amountCents: 100 });
  await f.send(f.kid, 10, { kind: 'request_payout', amountCents: 100 });
  await f.send(f.parent, 11, { kind: 'report_payment', payoutId: `${childId}:${op(10)}`, amountCents: 100, method: 'manual', paidAt: at });
}
function threshold(f: ReturnType<typeof fixture>) {
  for (let n = 0; n < 99; n++) {
    f.seed({ kind: 'assign_chore', choreId: `closed-${n}`, title: 'Fictional closed task', rewardCents: 1, dates: [day] });
    f.seed({ kind: 'close_chore', occurrenceId: `closed-${n}:${day}`, status: 'cancelled', note: 'Fictional closure' });
  }
  f.db.state = checkpointState(f.db.state);
}
const unavailable = (error: unknown) => error instanceof FinanceServiceError && error.code === 'temporarily_unavailable' && error.message === 'Financial service is temporarily unavailable.';

test('a new chore after rollover uses the permanent commit registry without an unsupported archive kind', async () => {
  const f = fixture();
  for (let n = 0; n < 128; n++) f.seed({ kind: 'configure_plan', plan });
  await f.send(f.parent, 500, { kind: 'configure_plan', plan });
  assert.ok(f.db.state.checkpoint);
  const view = await f.send(f.parent, 501, { kind: 'assign_chore', choreId: 'new-after-checkpoint', title: 'Fictional next task', rewardCents: 1, dates: [day] });
  assert.equal(view.occurrences.length, 1);
  assert.equal(f.db.calls.filter(name => name === 'finance_archive_lookup').length, 0);
});

test('hashed service rotates exactly at independent128 visible and32 hidden tail boundaries', async () => {
  for (const [hidden, count] of [[false, 128], [true, 32]] as const) {
    const f = fixture();
    for (let n = 0; n < count - 1; n++) f.seed(hidden
      ? { kind: 'configure_matching', rule: { enabled: false, percent: 100, monthlyCapCents: n, parentBudgetCents: n, surprise: true } }
      : { kind: 'configure_plan', plan });
    const action: FinanceAction = hidden
      ? { kind: 'configure_matching', rule: { enabled: false, percent: 100, monthlyCapCents: 100, parentBudgetCents: 100, surprise: true } }
      : { kind: 'configure_plan', plan };
    await f.send(f.parent, 500, action);
    assert.equal(f.db.state.events.length, count); assert.equal(f.db.state.checkpoint, undefined);
    const old = clone(f.db.state);
    const view = await f.send(f.parent, 501, action), envelope = f.db.envelopes.at(-1)!;
    assert.equal(f.db.state.events.length, 1); assert.ok(f.db.state.checkpoint);
    assert.deepEqual(envelope.coveredActivity, financeEventActivity(old));
    assert.equal(envelope.eventActivity.id, `${parentId}:${op(501)}`);
    assert.deepEqual(envelope.parentProjection, financeView(f.db.state, parentActor, child, at));
    assert.deepEqual(envelope.childProjection, financeView(f.db.state, childActor, child, at));
    assert.deepEqual(view, envelope.parentProjection); assert.equal(envelope.capsules.length, 0);
  }
});

test('visible thresholds publish exact archives while hidden rollover leaves visible collections intact', async () => {
  const a = fixture(), b = fixture(); await paid(a); await paid(b, true);
  threshold(a); threshold(b);
  const before = (await b.kid.read(family, child)).occurrences;
  for (let n = 0; n < 32; n++) b.seed({ kind: 'configure_matching', rule: { enabled: false, percent: 100, monthlyCapCents: n, parentBudgetCents: n, surprise: true } });
  await b.send(b.parent, 400, { kind: 'configure_matching', rule: { enabled: false, percent: 100, monthlyCapCents: 0, parentBudgetCents: 0, surprise: true } });
  assert.deepEqual((await b.kid.read(family, child)).occurrences, before); assert.equal(b.db.visible.length, 0);
  for (const f of [a, b]) {
    await f.send(f.parent, 401, { kind: 'configure_plan', plan });
    assert.equal(exportBooks(f.db.state)[child].occurrences.length, 0);
    assert.equal(f.db.visible.reduce((sum, row) => sum + row.capsule.occurrences.length, 0), 100);
  }
  const av = await a.kid.read(family, child), bv = await b.kid.read(family, child);
  assert.deepEqual(av, bv);
  const json = JSON.stringify(await b.kid.history(family, child));
  for (const key of ['sourceCents', 'allocations', 'matching', 'lots', 'stateHash', 'revision', 'hash', 'active']) assert.equal(json.includes(`"${key}"`), false);
});

test('old visible correction hydrates exact capsule and forever operation retry never reapplies approval', async () => {
  const f = fixture(); await paid(f); threshold(f);
  await f.send(f.parent, 401, { kind: 'configure_plan', plan });
  const committed = f.db.envelopes.length;
  const replay = await f.send(f.parent, 6, { kind: 'review_chore', occurrenceId: `chore:${day}`, decision: 'approved' });
  assert.equal(replay.balances.earnedCents, 100); assert.equal(f.db.envelopes.length, committed);
  await assert.rejects(f.send(f.parent, 6, { kind: 'review_chore', occurrenceId: `chore:${day}`, decision: 'declined' }),
    error => error instanceof FinanceServiceError && error.code === 'invalid_action');
  await f.send(f.parent, 402, { kind: 'reverse_payment', paymentId: `${parentId}:${op(11)}`, note: 'Fictional old correction' });
  assert.equal(f.db.envelopes.at(-1)!.hydratedCapsules.length, 1);
  assert.equal((await f.kid.read(family, child)).balances.paidCents, 0);
  assert.equal((await f.kid.read(family, child)).balances.heldPayoutCents, 100);
});

test('the32-payout threshold archives only once the final held amount is actually settled', async () => {
  const f = fixture(); f.seed({ kind: 'configure_plan', plan });
  f.seed({ kind: 'assign_chore', choreId: 'many-payouts', title: 'Fictional task', rewardCents: 3200, dates: [day] });
  f.seed({ kind: 'submit_chore', occurrenceId: `many-payouts:${day}` }, childActor);
  f.seed({ kind: 'review_chore', occurrenceId: `many-payouts:${day}`, decision: 'approved' });
  let last = '';
  for (let n = 0; n < 32; n++) {
    last = f.seed({ kind: 'request_payout', amountCents: 100 }, childActor);
    if (n !== 31) f.seed({ kind: 'report_payment', payoutId: last, amountCents: 100, method: 'manual', paidAt: at });
  }
  f.db.state = checkpointState(f.db.state);
  assert.equal(exportBooks(f.db.state)[child].payouts.length, 32);
  await f.send(f.parent, 401, { kind: 'report_payment', payoutId: last, amountCents: 100, method: 'manual', paidAt: at });
  assert.equal(exportBooks(f.db.state)[child].payouts.length, 0); assert.equal(f.db.visible.length, 1);
  assert.equal(f.db.visible[0].capsule.payouts.length, 32); assert.equal(f.db.visible[0].capsule.paidCents, 3200);
  assert.equal(f.db.envelopes.at(-1)!.eventActivity.amountCents, 100);
});

test('parent private lookup restores exact old reveal and reconciliation and immediately rearchives', async () => {
  const f = fixture(); await paid(f, true, true); threshold(f);
  await f.send(f.parent, 401, { kind: 'configure_plan', plan });
  assert.equal(f.db.hidden.length, 1); const matchId = `${childId}:${op(7)}:match`;
  const reveal = await f.send(f.parent, 402, { kind: 'reveal_match', matchId });
  assert.equal(reveal.goals[0].parentContributedCents, 50);
  assert.equal(f.db.envelopes.at(-1)!.hydratedPrivateCapsules.length, 1);
  assert.equal(f.db.envelopes.at(-1)!.privateCapsules.length, 1);
  await f.send(f.parent, 403, { kind: 'reconcile_match', matchId, amountCents: 20, resolution: 'report_corrected', paidAt: at, note: 'Fictional old reconciliation' });
  assert.equal((await f.kid.read(family, child)).goals[0].parentContributedCents, 30);
  const history = JSON.stringify(await f.parent.parentHistory(family, child));
  assert.equal(history.includes('sourceCents'), false); assert.equal(history.includes('invalidatedCents'), false);
  const calls = f.db.calls.length;
  await assert.rejects(f.kid.parentHistory(family, child), error => error instanceof FinanceServiceError && error.code === 'not_authorized');
  assert.equal(f.db.calls.length, calls);
});

test('archive source conflict and CAS conflict reload before publishing any mutation', async () => {
  const f = fixture(); await paid(f); threshold(f); f.db.budgetConflicts = 1; f.db.commitConflicts = 1;
  const loads = f.db.loads, commits = f.db.envelopes.length;
  await f.send(f.parent, 401, { kind: 'configure_plan', plan });
  assert.equal(f.db.loads - loads, 3); assert.equal(f.db.envelopes.length - commits, 1);
  assert.equal(f.db.visible.reduce((sum, row) => sum + row.capsule.paidCents, 0), 100);
});

test('failed archive commit preserves state, immutable stores, money and replay registry', async () => {
  const f = fixture(); await paid(f, true); threshold(f);
  const state = JSON.stringify(f.db.state), revision = f.db.revision, commands = f.db.commands.size;
  f.db.failCommit = true;
  await assert.rejects(f.send(f.parent, 401, { kind: 'configure_plan', plan }), unavailable);
  assert.equal(JSON.stringify(f.db.state), state); assert.equal(f.db.revision, revision);
  assert.equal(f.db.visible.length + f.db.hidden.length, 0); assert.equal(f.db.commands.size, commands);
});

test('malformed current hashes and archived hashes fail with generic temporary service errors', async () => {
  const f = fixture(); f.db.badHash = true;
  await assert.rejects(f.parent.read(family, child), unavailable);
  f.db.badHash = false; await paid(f); threshold(f); await f.send(f.parent, 401, { kind: 'configure_plan', plan });
  f.db.badArchive = true; const before = f.db.envelopes.length;
  await assert.rejects(f.send(f.parent, 402, { kind: 'reverse_earning', occurrenceId: `chore:${day}`, note: 'Fictional old correction' }), unavailable);
  assert.equal(f.db.envelopes.length, before);
});

test('a checksum-consistent corrupt checkpoint is still rejected as generic503 on read', async () => {
  const f = fixture(); f.db.state = clone(checkpointState(f.db.state));
  f.db.state.checkpoint!.books[child].archivedPaidCents = 1;
  await assert.rejects(f.kid.read(family, child), unavailable);
});
