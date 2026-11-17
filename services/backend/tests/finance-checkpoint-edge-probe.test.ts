import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
// @ts-expect-error Owned executable local Edge preparation exposes pure helper guards; importing it starts no server or Docker command.
import { EDGE_IMAGE, EDGE_LIMITS, TELEMETRY_POLICY, RPC_PORT, EDGE_PORT, dockerPlan, edgeArguments, sanitizeRuntimeEvent, invocationVerdict, createRuntimeEventCollector, waitForEdgeReadiness, mainSource, userSource, eventsSource } from '../scripts/finance-checkpoint-edge-probe.mjs';

const runId = 'a'.repeat(32), executionId = 'a0000000-0000-4000-8000-000000000001';
const shutdown = (cpu = 100, total = 1_000_000, reason = 'EarlyDrop') => sanitizeRuntimeEvent({
  metadata: { execution_id: executionId, discarded: 'private-source' }, event_type: 'Shutdown',
  event: { reason, cpu_time_used: cpu, memory_used: { total, heap: 1000, external: 10, mem_check_captured: 'discarded' }, discarded: 'private-source' },
});

test('Edge execution requires exact run confirmation and cannot select remote endpoints or relaxed limits', () => {
  assert.deepEqual(edgeArguments([]), { mode: 'plan' }); assert.deepEqual(edgeArguments(['prepare']), { mode: 'prepare' });
  assert.deepEqual(edgeArguments([`--run-id=${runId}`, '--execute', '--confirm-local-edge-probe']), { mode: 'execute', runId });
  for (const args of [['--execute'], ['prepare', '--execute'], [`--run-id=${runId}`, '--execute', '--remote'],
    ['--run-id=../other', '--execute', '--confirm-local-edge-probe'], [`--run-id=${runId}`, '--execute', '--execute'], ['--memory=512']]) assert.throws(() => edgeArguments(args));
  assert.deepEqual(EDGE_LIMITS, { memoryLimitMb: 256, cpuTimeSoftLimitMs: 2000, cpuTimeHardLimitMs: 2000, workerTimeoutMs: 150000 });
});

test('reviewable Docker plan is pinned, read-only, loopback-only and separate from the production API', () => {
  const plan = dockerPlan(runId), args: string[] = plan.create;
  assert.equal(plan.image, EDGE_IMAGE); assert.match(EDGE_IMAGE, /@sha256:[a-f0-9]{64}$/);
  assert.ok(args.includes(`127.0.0.1:${EDGE_PORT}:9000`)); assert.ok(args.includes('oneshot'));
  assert.ok(args.some(arg => arg.includes('/finance-edge-probe') || arg.includes('\\finance-edge-probe')));
  assert.ok(args.some(arg => arg.includes('dst=/probe,readonly')));
  for (const unsafe of ['--privileged', '--network=host', '--no-verify-jwt', '54321:9000']) assert.ok(!args.includes(unsafe));
  assert.equal(plan.appJwtConfigurationChanged, false); assert.equal(plan.reviewedExecutionRequired, true);
  assert.throws(() => dockerPlan('../foreign'));
});

test('runtime event evidence strips arbitrary payloads while retaining all CPU/memory failures', () => {
  const event = shutdown(2001, 268435457, 'Memory');
  assert.equal(event.cpuMs, 2001); assert.equal(event.memory.total, 268435457); assert.equal(event.reason, 'Memory');
  assert.equal(JSON.stringify(event).includes('private-source'), false); assert.equal(JSON.stringify(event).includes('mem_check_captured'), false);
  const failure = sanitizeRuntimeEvent({ metadata: { execution_id: executionId }, event_type: 'BootFailure', event: { msg: 'secret stack' } });
  assert.deepEqual(failure, { executionId, type: 'BootFailure' });
  assert.throws(() => shutdown(NaN)); assert.throws(() => shutdown(1, -1)); assert.throws(() => shutdown(1, 1, 'unknown'));
  assert.throws(() => sanitizeRuntimeEvent({ metadata: { execution_id: 'wrong' }, event_type: 'Shutdown' }));
});

test('success needs exact functional projection plus one normal shutdown with measured isolate references', () => {
  const input = { id: `${runId}-1`, executionId, status: 200, exactProjection: true };
  assert.equal(invocationVerdict(input, [shutdown(2000, 268435456)]).localIsolateReferencePass, true);
  for (const events of [[], [shutdown(2001)], [shutdown(1, 268435457)], [shutdown(1, 1, 'CPUTime')],
    [shutdown(1, 1, 'WallClockTime')], [shutdown(1, 1, 'TerminationRequested')], [shutdown(), shutdown()],
    [shutdown(), { executionId, type: 'BootFailure' }]]) assert.equal(invocationVerdict(input, events).localIsolateReferencePass, false);
  assert.equal(invocationVerdict({ ...input, status: 503 }, [shutdown()]).localIsolateReferencePass, false);
  assert.equal(invocationVerdict({ ...input, exactProjection: false }, [shutdown()]).localIsolateReferencePass, false);
  assert.equal(invocationVerdict(input, []).completeMetrics, false);
});

test('telemetry delivery retries acknowledge exact duplicates once and reject conflicting replacements', () => {
  const collector = createRuntimeEventCollector();
  const packet = { deliveryId: `${executionId}:Shutdown:2`, deliveryAttempt: 1, metadata: { execution_id: executionId },
    event_type: 'Shutdown', event: { reason: 'EarlyDrop', cpu_time_used: 1213, memory_used: { total: 32_000_000, heap: 31_000_000, external: 1_000_000 } } };
  assert.deepEqual(collector.ingest(packet), { accepted: true, duplicate: false });
  assert.deepEqual(collector.ingest({ ...packet, deliveryAttempt: 2 }), { accepted: true, duplicate: true });
  assert.equal(collector.events.length, 1); assert.equal(collector.metrics.duplicateAcknowledgments, 1);
  assert.equal(collector.metrics.retriedRequestsReceived, 1);
  assert.throws(() => collector.ingest({ ...packet, deliveryAttempt: 2, event: { ...packet.event, cpu_time_used: 2001 } }));
  assert.equal(collector.events[0].cpuMs, 1213, 'a conflicting retry cannot replace accepted measurements');
  assert.equal(collector.metrics.rejectedDeliveries, 1, 'the caller retains an explicit telemetry-integrity failure');
  assert.throws(() => collector.ingest({ ...packet, deliveryId: 'foreign:Shutdown:2' }));
  assert.throws(() => collector.ingest({ ...packet, deliveryAttempt: 3 }));
  const distinct = createRuntimeEventCollector(); distinct.ingest(packet); distinct.ingest({ ...packet, deliveryId: `${executionId}:Shutdown:3` });
  assert.equal(invocationVerdict({ id: 'invocation', executionId, status: 200, exactProjection: true }, distinct.events).localIsolateReferencePass, false,
    'two actual terminal event deliveries with different IDs are not hidden by retry deduplication');
});

test('startup health retries stay within ten seconds and telemetry waits do not change isolate limits', async () => {
  let now = 0, calls = 0;
  const success = await waitForEdgeReadiness(async (timeout: number) => {
    assert.ok(timeout <= 2000); if (++calls === 1) throw Error('not-ready'); return calls === 3;
  }, { now: () => now, pause: async (ms: number) => { now += ms; } });
  assert.deepEqual(success, { ready: true, attempts: 3, elapsedMs: 400 });
  now = 0;
  const failure = await waitForEdgeReadiness(async (timeout: number) => { now += timeout; return false; },
    { now: () => now, pause: async (ms: number) => { now += ms; } });
  assert.equal(failure.ready, false); assert.equal(failure.elapsedMs, 10000);
  assert.equal(TELEMETRY_POLICY.eventAttemptTimeoutMs, 30000); assert.equal(TELEMETRY_POLICY.eventMaximumAttempts, 2);
  assert.equal(TELEMETRY_POLICY.finalCollectorWaitMs, 35000);
  assert.deepEqual(EDGE_LIMITS, { memoryLimitMb: 256, cpuTimeSoftLimitMs: 2000, cpuTimeHardLimitMs: 2000, workerTimeoutMs: 150000 });
  assert.ok(eventsSource().includes('AbortSignal.timeout(30000)')); assert.ok(eventsSource().includes('deliveryAttempt:attempt'));
});

test('isolated main, actual-service user entry and sanitized event listener are syntactically valid and use only owned transport', async () => {
  for (const source of [mainSource(), userSource(), eventsSource()]) {
    const result = await transform(source, { loader: 'ts', format: 'esm', target: 'es2023' }); assert.ok(result.code.length > 0);
    assert.ok(source.includes(`host.docker.internal:${RPC_PORT}`)); assert.ok(!source.includes('SUPABASE_SERVICE_ROLE_KEY'));
  }
  assert.ok(mainSource().includes('forceCreate:true')); assert.ok(mainSource().includes('EdgeRuntime.applySupabaseTag'));
  assert.ok(userSource().includes('createFinanceService')); assert.ok(userSource().includes('service.command'));
  assert.ok(userSource().includes('service.read')); assert.ok(eventsSource().includes('new globalThis.EventManager()'));
});
