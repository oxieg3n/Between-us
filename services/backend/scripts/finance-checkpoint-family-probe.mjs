import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { applyFinanceCommand, checkpointState, exportBooks } from '../../../apps/mobile/src/finance/engine.ts';
import { createFinanceService } from '../src/finance.ts';
import { financeDigest, privateFinanceKinds } from '../src/finance-checkpoints.ts';

export const INPUT_LIMIT = 3 * 1024 * 1024;
export const REFERENCE_LIMITS = Object.freeze({ commandCpuMs: 2000, lifetimeRssBytes: 256 * 1024 * 1024 });
const familyId = 'a1000000-0000-0000-0000-000000000001';
const parentId = 'a1000000-0000-0000-0000-000000000002';
const childId = n => `a2000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const operation = n => `a3000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key));
const idFields = new Set(['id', 'childId', 'choreId', 'goalId', 'allocationId', 'earningId', 'matchAllocationId', 'referenceId', 'fromGoalId', 'toGoalId', 'matchId', 'payoutId', 'paymentId']);
const idMaps = new Set(['sourceCents', 'invalidatedCents', 'byGoal']);
const idArrays = new Set(['excludedOccurrenceIds', 'eligibleGoalIds']);
let workerPhase = 'startup', workerRpc = 'none';

export function options(args) {
  const result = { weeks: 15, repeats: 10 };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--(weeks|repeats)=(\d+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw Error('invalid_probe_arguments');
    seen.add(match[1]); result[match[1]] = Number(match[2]);
  }
  if (![15, 52].includes(result.weeks) || !Number.isInteger(result.repeats) || result.repeats < 10 || result.repeats > 100) throw Error('invalid_probe_arguments');
  return result;
}

/** Prefix entity IDs and source-map keys together; calendar period keys and monetary values remain exact. */
export function familyState(seed, count) {
  if (![1, 2, 12].includes(count) || seed.children.length !== 1 || !seed.checkpoint) throw Error('invalid_probe_seed');
  const originalChild = seed.children[0].id;
  const result = { timezone: seed.timezone, children: [], checkpoint: { version: 1, lastEventAt: seed.checkpoint.lastEventAt, books: {}, activity: {} }, events: [] };
  for (let n = 1; n <= count; n++) {
    const id = value => value === originalChild ? childId(n) : `c${String(n).padStart(2, '0')}:${value}`;
    const remap = (value, field = '') => {
      if (Array.isArray(value)) return value.map(item => idArrays.has(field) ? id(item) : remap(item));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [idMaps.has(field) ? id(key) : key, remap(item, key)]));
      return typeof value === 'string' && idFields.has(field) ? id(value) : value;
    };
    result.children.push({ id: childId(n), name: `Fictional probe child ${n}` });
    result.checkpoint.books[childId(n)] = remap(seed.checkpoint.books[originalChild]);
    result.checkpoint.activity[childId(n)] = remap(seed.checkpoint.activity[originalChild]);
    result.events.push(...seed.events.map(event => remap(event)));
  }
  result.events.sort((a, b) => a.at.localeCompare(b.at));
  return result;
}

export function nearCapSeed(state, at) {
  if (state.children.length !== 1) throw Error('invalid_probe_seed');
  const id = state.children[0].id, books = exportBooks(state), book = books[id];
  if (!book.plan || !book.archivedBudget || !book.goals.some(goal => goal.status === 'active')) throw Error('invalid_probe_seed');
  let next = checkpointState(state, books), sequence = 0;
  for (const [kind, amount] of [['configure_plan', 126], ['configure_matching', 31]]) {
    for (let n = 0; n < amount; n++) {
      const action = kind === 'configure_plan' ? { kind, plan: book.plan } : { kind, rule: book.matchingRule };
      next = applyFinanceCommand(next, { role: 'parent' }, { ...action, id: `near-cap-${++sequence}`, childId: id, at: new Date(Date.parse(at) + sequence).toISOString() });
    }
  }
  assert.equal(next.events.filter(event => !privateFinanceKinds.has(event.kind)).length, 126);
  assert.equal(next.events.filter(event => privateFinanceKinds.has(event.kind)).length, 31);
  return next;
}

export function validateWorkerInput(input) {
  if (!exactKeys(input, ['format', 'weeks', 'children', 'role', 'repeats', 'state', 'sourceSequence']) || input.format !== 1 || ![15, 52].includes(input.weeks)
    || ![1, 2, 12].includes(input.children) || !['parent', 'child'].includes(input.role) || !Number.isInteger(input.repeats) || input.repeats < 10 || input.repeats > 100
    || !input.state?.checkpoint || input.state.children?.length !== input.children || !Number.isSafeInteger(input.sourceSequence)
    || input.sourceSequence < input.state.events.length || jsonBytes(input) > INPUT_LIMIT) throw Error('invalid_worker_input');
  assert.deepEqual(input.state.children.map(row => row.id), Array.from({ length: input.children }, (_, n) => childId(n + 1)));
  for (const row of input.state.children) {
    const tail = input.state.events.filter(event => event.childId === row.id);
    if (tail.filter(event => privateFinanceKinds.has(event.kind)).length !== 31 || tail.filter(event => !privateFinanceKinds.has(event.kind)).length !== 126) throw Error('invalid_worker_tail');
  }
}

/** Strict local protocol model, not SQL/Auth enforcement. It retains state and UUID fingerprints, never old state/envelope snapshots. */
export function probeRpc(initialState, role, sampleMemory = () => {}, sourceSequence = 1_000_000) {
  const db = { state: initialState, revision: 1, sequence: sourceSequence, commands: new Map() };
  initialState = undefined;
  const metrics = { calls: {}, wireRequestBytes: 0, wireResponseBytes: 0, maximumEnvelopeBytes: 0, serializationWallMs: 0, committed: 0, replays: 0 };
  const scopeFor = id => ({ actorId: role === 'parent' ? parentId : id, sessionId: operation(999999), expiresAt: Math.floor(Date.now() / 1000) + 3600, familyId, childId: id, role });
  const wire = (value, direction) => {
    const start = performance.now(), serialized = JSON.stringify(value);
    metrics[direction === 'request' ? 'wireRequestBytes' : 'wireResponseBytes'] += Buffer.byteLength(serialized);
    const result = JSON.parse(serialized); metrics.serializationWallMs += performance.now() - start; sampleMemory(); return result;
  };
  const ok = data => wire({ data, error: null }, 'response');
  const scopeCheck = scope => {
    const expected = scopeFor(scope?.childId);
    assert.ok(Number.isInteger(scope?.expiresAt) && scope.expiresAt > Math.floor(Date.now() / 1000));
    assert.deepEqual({ ...scope, expiresAt: expected.expiresAt }, expected);
    assert.ok(db.state.children.some(row => row.id === scope.childId));
  };
  const clock = () => new Date(Math.max(Date.now(), Date.parse(db.state.events.at(-1)?.at ?? db.state.checkpoint.lastEventAt) + 1)).toISOString();
  const userClient = { async rpc(name, raw = {}) {
    workerRpc = 'finance_scope';
    assert.equal(name, 'finance_scope');const args = wire(raw, 'request');
    assert.ok(exactKeys(args, ['p_family_id', 'p_child_id']));assert.equal(args.p_family_id, familyId);
    assert.ok(db.state.children.some(row => row.id === args.p_child_id));
    metrics.calls[name] = (metrics.calls[name] ?? 0) + 1; return ok(scopeFor(args.p_child_id));
  } };
  const serviceClient = { async rpc(name, raw = {}) {
    workerRpc = ['finance_load', 'finance_archive_budget', 'finance_commit'].includes(name) ? name : 'unexpected';
    const args = wire(raw, 'request');scopeCheck(args.p_scope);metrics.calls[name] = (metrics.calls[name] ?? 0) + 1;
    const key = `${args.p_scope.actorId}:${args.p_operation_id}`, prior = db.commands.get(key);
    if (name === 'finance_load') {
      assert.ok(exactKeys(args, ['p_scope', 'p_operation_id', 'p_fingerprint']));
      if (prior !== undefined) assert.equal(prior, args.p_fingerprint);
      return ok({ state: db.state, stateHash: await financeDigest(db.state), revision: db.revision, throughSequence: db.sequence, serverAt: clock(), replay: prior !== undefined });
    }
    if (name === 'finance_archive_budget') {
      assert.ok(exactKeys(args, ['p_scope', 'p_period', 'p_anchor_date', 'p_period_keys', 'p_hot_occurrence_ids']));
      const basis = db.state.checkpoint.books[args.p_scope.childId].archivedBudget;
      assert.equal(args.p_period, basis.period);assert.equal(args.p_anchor_date, basis.anchorDate);
      assert.ok(Array.isArray(args.p_period_keys) && args.p_period_keys.length <= 131);
      assert.ok(Array.isArray(args.p_hot_occurrence_ids) && args.p_hot_occurrence_ids.length <= 100);
      return ok({ ...basis, byPeriod: Object.fromEntries(args.p_period_keys.map(key => [key, basis.byPeriod[key] ?? 0])),
        excludedOccurrenceIds: basis.excludedOccurrenceIds.filter(id => args.p_hot_occurrence_ids.includes(id)), revision: db.revision, stateHash: await financeDigest(db.state) });
    }
    assert.equal(name, 'finance_commit', 'unplanned RPC makes this scenario invalid');
    assert.ok(exactKeys(args, ['p_scope', 'p_operation_id', 'p_fingerprint', 'p_expected_revision', 'p_state', 'p_server_at']));
    const envelope = args.p_state;
    assert.ok(exactKeys(envelope, ['state', 'event', 'previousStateHash', 'capsules', 'hydratedCapsules', 'privateCapsules', 'hydratedPrivateCapsules', 'eventActivity', 'coveredActivity', 'childProjection', 'parentProjection']));
    if (prior !== undefined) { assert.equal(prior, args.p_fingerprint);metrics.replays++;return ok({ status: 'replayed', state: db.state, serverAt: clock() }); }
    if (args.p_expected_revision !== db.revision || envelope.previousStateHash !== await financeDigest(db.state)) return ok({ status: 'conflict' });
    assert.equal(envelope.event.id, `${args.p_scope.actorId}:${args.p_operation_id}`);assert.equal(envelope.event.childId, args.p_scope.childId);
    assert.equal(envelope.event.at, args.p_server_at);assert.deepEqual(envelope.event.actor, role === 'parent' ? { role: 'parent' } : { role: 'child', childId: args.p_scope.childId });
    const action = Object.fromEntries(Object.entries(envelope.event).filter(([key]) => !['id', 'at', 'childId', 'actor', 'effects'].includes(key)));
    assert.equal(args.p_fingerprint, await financeDigest({ familyId, childId: args.p_scope.childId, action }));
    assert.equal(action.kind, role === 'parent' ? 'configure_plan' : 'edit_goal');
    for (const field of ['capsules', 'hydratedCapsules', 'privateCapsules', 'hydratedPrivateCapsules']) assert.deepEqual(envelope[field], [], 'ordinary probe cannot require archive rows not sent to this worker');
    assert.equal(envelope.eventActivity.id, envelope.event.id);assert.ok(Array.isArray(envelope.coveredActivity));
    assert.equal(envelope.childProjection.childId, args.p_scope.childId);assert.equal(envelope.childProjection.matching, undefined);
    assert.equal(envelope.parentProjection.childId, args.p_scope.childId);assert.ok(envelope.parentProjection.matching);
    assert.deepEqual(envelope.state.children, db.state.children);assert.equal(envelope.state.timezone, db.state.timezone);
    metrics.maximumEnvelopeBytes = Math.max(metrics.maximumEnvelopeBytes, jsonBytes(envelope));
    db.state = envelope.state;db.revision++;db.sequence++;db.commands.set(key, args.p_fingerprint);metrics.committed++;
    // The current SQL envelope path acknowledges our submitted state without
    // echoing the full aggregate. Legacy/replayed responses retain current state.
    return ok({ status: 'committed', ...(Object.hasOwn(envelope, 'state') ? {} : { state: db.state }), serverAt: args.p_server_at });
  } };
  return { db, metrics, userClient, serviceClient };
}

const elapsed = (cpu, wall) => { const used = process.cpuUsage(cpu);return { wallMs: performance.now() - wall, cpuMs: (used.user + used.system) / 1000 }; };
const summary = samples => {
  const result = { count: samples.length, first: samples[0] };
  for (const field of ['wallMs', 'cpuMs']) {
    const sorted = samples.map(row => row[field]).sort((a, b) => a - b);
    result[field] = { minimum: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], maximum: sorted.at(-1) };
  }
  return result;
};

/** This compares measured Node process costs with references; it does not qualify a hosted runtime. */
export function referenceComparison(worker) {
  const cpu = worker.command?.cpuMs?.maximum, rssKiB = worker.memory?.processLifetimeMaxRssKiB;
  const validCpu = Number.isFinite(cpu) && cpu >= 0, validRss = Number.isSafeInteger(rssKiB) && rssKiB > 0;
  const commandCpu = { measuredMs: validCpu ? cpu : null, limitMs: REFERENCE_LIMITS.commandCpuMs, passed: validCpu && cpu <= REFERENCE_LIMITS.commandCpuMs };
  const lifetimeRss = { measuredKiB: validRss ? rssKiB : null, measuredBytes: validRss ? rssKiB * 1024 : null,
    limitBytes: REFERENCE_LIMITS.lifetimeRssBytes, passed: validRss && rssKiB * 1024 <= REFERENCE_LIMITS.lifetimeRssBytes };
  return { scope: 'Node command CPU maximum and process lifetime RSS comparison only; NOT Supabase Edge qualification',
    commandCpu, lifetimeRss, referenceLimitsPassed: commandCpu.passed && lifetimeRss.passed };
}

export async function runWorker(input) {
  workerPhase = 'input_validation';
  validateWorkerInput(input);
  const initialStateBytes = jsonBytes(input.state), initialTail = input.state.events.length;
  const peakMemory = { rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 };
  const sampleMemory = () => { const memory = process.memoryUsage();for (const key of Object.keys(peakMemory)) peakMemory[key] = Math.max(peakMemory[key], memory[key]); };
  const mock = probeRpc(input.state, input.role, sampleMemory, input.sourceSequence);delete input.state;
  if (globalThis.gc) globalThis.gc();const baselineMemory = process.memoryUsage();sampleMemory();
  const service = createFinanceService(mock), target = mock.db.state.children[0].id;
  const book = mock.db.state.checkpoint.books[target], goal = book.goals.find(row => row.status === 'active');
  const action = input.role === 'parent' ? { kind: 'configure_plan', plan: clone(book.plan) } : { kind: 'edit_goal', goalId: goal.id, title: goal.title, targetCents: goal.targetCents, ...(goal.targetDate ? { targetDate: goal.targetDate } : {}) };
  const commandSamples = [], readSamples = [], stateBytes = [initialStateBytes];
  const startCpu = process.cpuUsage(), startWall = performance.now();let resultBytes = 0;
  for (let n = 1; n <= input.repeats; n++) {
    workerPhase = 'command';
    let cpu = process.cpuUsage(), wall = performance.now();
    const commanded = await service.command(familyId, target, { id: operation(n), action });resultBytes += jsonBytes(commanded);
    commandSamples.push(elapsed(cpu, wall));sampleMemory();stateBytes.push(jsonBytes(mock.db.state));
    cpu = process.cpuUsage();wall = performance.now();
    workerPhase = 'read';
    const read = await service.read(familyId, target);resultBytes += jsonBytes(read);
    readSamples.push(elapsed(cpu, wall));sampleMemory();assert.deepEqual(read, commanded);
  }
  const total = elapsed(startCpu, startWall), finalMemory = process.memoryUsage();sampleMemory();
  assert.equal(mock.metrics.committed, input.repeats);
  const command = summary(commandSamples), memory = { baseline: baselineMemory, sampledPeak: peakMemory, final: finalMemory, processLifetimeMaxRssKiB: process.resourceUsage().maxRSS };
  return { format: 1, scope: 'LOCAL isolated Node actual finance service with strict in-memory serialized RPC model; NOT Supabase Edge, PostgreSQL or Auth evidence',
    weeks: input.weeks, children: input.children, role: input.role, repeats: input.repeats, initialTail,
    initialTailPerChild: { visible: 126, hidden: 31 }, originalTailLimits: { visible: 128, hidden: 32 }, safetyLimitsRaised: false,
    node: process.version, pid: process.pid, exposedGc: typeof globalThis.gc === 'function', total,
    command, read: summary(readSamples), rpc: mock.metrics,
    initialStateBytes, maximumStateBytes: Math.max(...stateBytes), finalStateBytes: stateBytes.at(-1), responseJsonBytes: resultBytes,
    sourceSequence: input.sourceSequence, finalSequence: mock.db.sequence,
    memory, referenceComparison: referenceComparison({ command, memory }),
    mockLimits: ['Source state and UUID fingerprints live in worker memory; remote database memory is not modeled.', 'JSON request/response cloning, actual service projections/activity/envelopes and digest work are measured.', 'Heap peaks are samples at RPC/service boundaries; process lifetime max RSS includes module startup.', 'Commands target the first child; all family children retain near-cap tails at worker start.', 'Fresh worker per role; first iteration is included, with subsequent JIT/cache effects visible in samples.'] };
}

async function readInput() {
  const chunks = [];let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length;if (size > INPUT_LIMIT) throw Error('worker_input_too_large');chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function isolated(input) {
  const serialized = JSON.stringify(input);if (Buffer.byteLength(serialized) > INPUT_LIMIT) throw Error('worker_input_too_large');
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, ['--expose-gc', '--import', import.meta.resolve('tsx'), fileURLToPath(import.meta.url), '--worker'],
      { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '', errors = '', settled = false;
    const finish = error => {
      if (settled) return;settled = true;clearTimeout(timer);
      if (error) reject(error);
      else { try { resolve(JSON.parse(output)); } catch { reject(Error('worker_invalid_result')); } }
    };
    const timer = setTimeout(() => { worker.kill();finish(Error('worker_timeout')); }, 300000);
    worker.stdout.on('data', chunk => { output += chunk;if (output.length > 131072) { worker.kill();finish(Error('worker_output_too_large')); } });
    worker.stderr.on('data', chunk => { errors += chunk;if (errors.length > 8192) errors = errors.slice(-8192); });
    worker.on('error', () => finish(Error('worker_start_failed')));
    worker.on('close', code => {
      if (code === 0) { finish(null);return; }
      const error = Error('worker_failed');
      try {
        const diagnostic = JSON.parse(errors.trim().split('\n').at(-1));
        if (['code', 'phase', 'rpc'].every(key => typeof diagnostic[key] === 'string' && /^\w+$/.test(diagnostic[key]))) error.diagnostic = diagnostic;
      } catch { /* Only the owned metadata-only error format may cross the worker boundary. */ }
      finish(error);
    });
    worker.stdin.on('error', () => finish(Error('worker_input_failed')));worker.stdin.end(serialized);
  });
}

export async function coordinate(args) {
  const config = options(args);
  const sourceFiles = ['apps/mobile/src/finance/engine.ts', 'apps/mobile/src/finance/checkpoint.ts', 'apps/mobile/src/finance/types.ts',
    'apps/mobile/src/finance/money-calendar.ts', 'services/backend/src/finance.ts', 'services/backend/src/finance-checkpoints.ts',
    'services/backend/scripts/finance-checkpoint-benchmark.mjs', 'services/backend/scripts/finance-checkpoint-family-probe.mjs'];
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, createHash('sha256').update(await readFile(path.join(root, name))).digest('hex')])));
  const sourceHashes = await hashes();
  // The generator retains a golden ledger and snapshots. It runs ONLY in this coordinator, never in measured workers.
  const { checkpointLongevityFixture } = await import('./finance-checkpoint-benchmark.mjs');
  let fixture = checkpointLongevityFixture({ weeks: config.weeks });
  const sourceSequence = fixture.result.events + 157, seed = nearCapSeed(fixture.state, fixture.at);fixture = undefined;
  const results = [];
  for (const children of [1, 2, 12]) for (const role of ['parent', 'child']) {
    const input = { format: 1, ...config, children, role, sourceSequence: sourceSequence * children, state: familyState(seed, children) };
    try { results.push({ status: 'passed', ...await isolated(input) }); }
    catch (error) { results.push({ status: 'failed', children, role, inputStateBytes: jsonBytes(input.state), code: /^\w+$/.test(error.message) ? error.message : 'worker_failed', ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) }); }
  }
  const finalSourceHashes = await hashes(), sourceUnchanged = JSON.stringify(sourceHashes) === JSON.stringify(finalSourceHashes);
  const report = { format: 1, measuredAt: new Date().toISOString(), platform: `${os.platform()} ${os.arch()}`, node: process.version,
    scope: 'LOCAL Node finance service family-path probe; no DB/network/hosted execution or Edge qualification', config, workers: results,
    sourceHashes, finalSourceHashes, sourceUnchanged, allWorkersPassed: sourceUnchanged && results.every(row => row.status === 'passed'),
    referenceLimits: REFERENCE_LIMITS,
    referenceLimitsPassed: sourceUnchanged && results.length === 6 && results.every(row => row.status === 'passed' && row.referenceComparison.referenceLimitsPassed),
    audit: ['The adapter independently replays/clones the family in exportBooks, financeView, applyFinanceCommand, checkpointState, financeEventActivity and final projections.',
      'One target child therefore pays repeated work over all siblings; Node CPU/RSS must be reviewed before any hosted limit claim.',
      'The mock also hashes/serializes source state as the RPC endpoint would; this adds local CPU and memory absent from an actual remote client process.',
      'Command/read summaries include real role projections and output JSON encoding; RPC metrics include full envelope/activity/projection encoding.'],
    noHostedQualification: true, inputLimitBytes: INPUT_LIMIT };
  const folder = fileURLToPath(new URL('../../../spec/production/staging/finance-checkpoints/', import.meta.url));
  await mkdir(folder, { recursive: true });const output = path.join(folder, `service-family-probe-${randomUUID().replaceAll('-', '')}.json`);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return { output: path.relative(fileURLToPath(new URL('../../../', import.meta.url)), output).replaceAll('\\', '/'), report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).length === 1 && process.argv[2] === '--worker') console.log(JSON.stringify(await runWorker(await readInput())));
    else { const result = await coordinate(process.argv.slice(2));console.log(JSON.stringify({ output: result.output, workers: result.report.workers.length,
      allWorkersPassed: result.report.allWorkersPassed, referenceLimitsPassed: result.report.referenceLimitsPassed }));
      if (!result.report.allWorkersPassed || !result.report.referenceLimitsPassed) process.exitCode = 1; }
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', code: /^\w+$/.test(error?.message ?? '') ? error.message : /^\w+$/.test(error?.code ?? '') ? error.code : 'probe_failed', phase: workerPhase, rpc: workerRpc }));process.exitCode = 1;
  }
}
