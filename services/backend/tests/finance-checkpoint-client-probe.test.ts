import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFinanceCommand, checkpointState, createFinanceState, exportBooks } from '../../../apps/mobile/src/finance/engine.ts';
import { createFinanceService } from '../src/finance.ts';
import { financeDigest } from '../src/finance-checkpoints.ts';
// @ts-expect-error The executable isolated probe exposes pure protocol helpers without running a benchmark on import.
import { createServerModel, descriptorGuard, rpcBridge, isolatedClient } from '../scripts/finance-checkpoint-client-probe.mjs';
// @ts-expect-error Exact original fixture/protocol semantics are reused, not reimplemented.
import { nearCapSeed, familyState, referenceComparison } from '../scripts/finance-checkpoint-family-probe.mjs';

function input() {
  const id = 'fictional-child', at = '2026-01-01T00:00:00.000Z';
  let state = createFinanceState('UTC', [{ id, name: 'Fictional child' }]);
  state = applyFinanceCommand(state, { role: 'parent' }, { id: 'seed-plan', childId: id, at, kind: 'configure_plan', plan: {
    budgetCents: 5000, period: 'monthly', anchorDate: '2026-01-01', payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
  state = applyFinanceCommand(state, { role: 'child', childId: id }, { id: 'seed-goal', childId: id, at, kind: 'create_goal', goalId: 'goal', title: 'Fictional goal', targetCents: 1000 });
  const books = exportBooks(state); books[id].archivedBudget = { period: 'monthly', anchorDate: '2026-01-01', maximumCents: 0, byPeriod: {}, excludedOccurrenceIds: [] };
  state = nearCapSeed(checkpointState(state, books), '2026-01-02T00:00:00.000Z');
  return { format: 1, weeks: 52, children: 1, role: 'parent', repeats: 10, sourceSequence: 1000, state: familyState(state, 1) };
}

test('RPC server owns original state; client descriptor carries no initial-state reference or golden history', async () => {
  const original = input(), state = original.state, digest = await financeDigest(state);
  const server = await createServerModel(original);
  assert.equal('state' in original, false); assert.equal(server.model.db.state, state);
  assert.equal(server.descriptor.initialStateHash, digest); descriptorGuard(server.descriptor);
  const descriptor = server.descriptor;
  for (const key of ['state', 'events', 'checkpoint', 'books', 'capsules', 'checkpointSnapshots']) assert.equal(JSON.stringify(descriptor).includes(`"${key}"`), false);
  descriptor.action.plan.budgetCents = 10000;
  assert.equal(server.model.db.state.checkpoint.books[descriptor.target].plan.budgetCents, 5000, 'action metadata is copied, never a retained book reference');
  assert.throws(() => descriptorGuard({ ...descriptor, state }));
  assert.throws(() => descriptorGuard({ ...descriptor, initialTail: 158 }));
  assert.throws(() => descriptorGuard({ ...descriptor, initialStateHash: 'bad' }));
});

test('serialized RPC bridge preserves exact strict model hashing, commit and permanent UUID replay semantics', async () => {
  const server = await createServerModel(input());
  let samples = 0;
  const messages: { type: string; id: number; channel: string; name: string; args: Record<string, unknown> }[] = [];
  let compactCommitObserved = false;
  const bridge = rpcBridge((message: typeof messages[number]) => {
    const request = JSON.parse(JSON.stringify(message)); messages.push(request);
    setImmediate(async () => {
      try {
        const result = await server.dispatch(request.channel, request.name, request.args);
        if (request.name === 'finance_commit' && result.data.status === 'committed') {
          assert.equal(Object.hasOwn(result.data, 'state'), false); compactCommitObserved = true;
        }
        bridge.accept(JSON.parse(JSON.stringify({ type: 'rpc_result', id: request.id, result })));
      }
      catch { bridge.accept({ type: 'rpc_result', id: request.id, failed: true }); }
    });
  }, () => samples++);
  const service = createFinanceService(bridge), family = 'a1000000-0000-0000-0000-000000000001', target = server.descriptor.target;
  const request = { id: 'a3000000-0000-0000-0000-000000000001', action: server.descriptor.action };
  const view = await service.command(family, target, request);
  assert.equal(view.plan!.budgetCents, 5000); assert.equal(server.model.metrics.committed, 1);
  await service.command(family, target, request); assert.equal(server.model.metrics.committed, 1);
  await assert.rejects(service.command(family, target, { ...request, action: { ...request.action, plan: { ...request.action.plan, budgetCents: 6000 } } }));
  assert.ok(samples >= 4); assert.deepEqual(messages.map(row => row.id), messages.map((_, index) => index + 1));
  assert.ok(messages.some(row => row.name === 'finance_commit'));
  assert.equal(compactCommitObserved, true);
  const accepted = messages.find(row => row.name === 'finance_commit')!;
  const replay = await server.dispatch('service', 'finance_commit', accepted.args);
  assert.equal(replay.data.status, 'replayed'); assert.deepEqual(replay.data.state, server.model.db.state);
  assert.equal('envelopes' in server.model.db, false); assert.equal('snapshots' in server.model.db, false);
});

test('bridge enforces one request at a time and rejects disconnected or mismatched responses', async () => {
  const bridge = rpcBridge(() => {});
  const pending = bridge.userClient.rpc('finance_scope', {});
  await assert.rejects(bridge.serviceClient.rpc('finance_load', {}));
  assert.throws(() => bridge.accept({ type: 'rpc_result', id: 999, result: {} }));
  bridge.reject(); await assert.rejects(pending, /rpc_connection_closed/);
});

test('client reference comparison never includes separately reported server CPU or memory', () => {
  const client = { command: { cpuMs: { maximum: 1999 } }, memory: { processLifetimeMaxRssKiB: 262144 },
    server: { total: { cpuMs: 999999 }, memory: { processLifetimeMaxRssKiB: 999999 } } };
  const measured = referenceComparison(client);
  assert.equal(measured.referenceLimitsPassed, true); assert.equal(measured.commandCpu.measuredMs, 1999);
  assert.equal(measured.lifetimeRss.measuredBytes, 268435456);
  assert.equal(referenceComparison({ ...client, command: { cpuMs: { maximum: 2000.001 } } }).referenceLimitsPassed, false);
});

test('lightweight two-process IPC harness smoke retains initial state exclusively in the server', async () => {
  // This tiny empty-money seed tests process protocol only; it generates no longevity
  // corpus/evidence file and makes no performance-capacity assertion.
  const result = await isolatedClient(input());
  assert.notEqual(result.pid, result.server.pid); assert.notEqual(result.pid, process.pid);
  assert.equal(result.server.rpc.committed, 10); assert.equal(result.command.count, 10); assert.equal(result.read.count, 10);
  assert.equal(result.initialStateOwnership.initialStateReferenceAbsent, true);
  assert.equal(result.initialStateOwnership.receivedBeforeBaseline, false);
  assert.equal(result.initialStateOwnership.baselineGcCompleted, true);
  assert.ok(result.transport.rpcRequests > 0); assert.ok(result.server.rpc.wireResponseBytes > 0);
  assert.ok(result.memory.processLifetimeMaxRssKiB > 0); assert.ok(result.server.memory.processLifetimeMaxRssKiB > 0);
});
