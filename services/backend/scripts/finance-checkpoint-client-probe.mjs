import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createFinanceService } from '../src/finance.ts';
import { financeDigest } from '../src/finance-checkpoints.ts';
import { INPUT_LIMIT, REFERENCE_LIMITS, options, familyState, nearCapSeed, probeRpc, referenceComparison, validateWorkerInput } from './finance-checkpoint-family-probe.mjs';

const familyId = 'a1000000-0000-0000-0000-000000000001';
const operation = n => `a3000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));
const ownFile = fileURLToPath(import.meta.url), root = fileURLToPath(new URL('../../../', import.meta.url));
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const elapsed = (cpu, wall) => { const used = process.cpuUsage(cpu); return { wallMs: performance.now() - wall, cpuMs: (used.user + used.system) / 1000 }; };
const summarize = rows => {
  assert.ok(rows.length);
  return { count: rows.length, first: rows[0], ...Object.fromEntries(['wallMs', 'cpuMs'].map(key => {
    const sorted = rows.map(row => row[key]).sort((a, b) => a - b);
    return [key, { minimum: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], maximum: sorted.at(-1) }];
  })) };
};
function memorySampler() {
  const sampledPeak = { rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 };
  const sample = () => { const value = process.memoryUsage(); for (const key of Object.keys(sampledPeak)) sampledPeak[key] = Math.max(sampledPeak[key], value[key]); };
  return { sample, finish: baseline => ({ baseline, sampledPeak, final: process.memoryUsage(), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS }) };
}

export function descriptorGuard(value) {
  assert.ok(exact(value, ['format', 'weeks', 'children', 'role', 'repeats', 'target', 'action', 'initialStateBytes', 'initialTail', 'sourceSequence', 'initialStateHash']));
  assert.equal(value.format, 1); assert.ok([15, 52].includes(value.weeks)); assert.ok([1, 2, 12].includes(value.children));
  assert.ok(['parent', 'child'].includes(value.role)); assert.ok(Number.isInteger(value.repeats) && value.repeats >= 10 && value.repeats <= 100);
  assert.equal(value.target, 'a2000000-0000-0000-0000-000000000001');
  assert.equal(value.action?.kind, value.role === 'parent' ? 'configure_plan' : 'edit_goal');
  assert.ok(Number.isInteger(value.initialStateBytes) && value.initialStateBytes > 0 && value.initialStateBytes <= INPUT_LIMIT);
  assert.equal(value.initialTail, value.children * 157);
  assert.ok(Number.isSafeInteger(value.sourceSequence) && value.sourceSequence >= value.initialTail);
  assert.match(value.initialStateHash, /^[a-f0-9]{64}$/); assert.ok(jsonBytes(value) <= 4096);
}

/** This model lives exclusively in the RPC-server process during measurements. */
export async function createServerModel(input, sampleMemory = () => {}) {
  validateWorkerInput(input);
  const target = input.state.children[0].id, book = input.state.checkpoint.books[target], goal = book.goals.find(row => row.status === 'active');
  const descriptor = { format: 1, weeks: input.weeks, children: input.children, role: input.role, repeats: input.repeats, target,
    action: input.role === 'parent' ? { kind: 'configure_plan', plan: clone(book.plan) }
      : { kind: 'edit_goal', goalId: goal.id, title: goal.title, targetCents: goal.targetCents, ...(goal.targetDate ? { targetDate: goal.targetDate } : {}) },
    initialStateBytes: jsonBytes(input.state), initialTail: input.state.events.length, sourceSequence: input.sourceSequence,
    initialStateHash: await financeDigest(input.state) };
  descriptorGuard(descriptor);
  const model = probeRpc(input.state, input.role, sampleMemory, input.sourceSequence);
  delete input.state; // The coordinator's input wrapper is not retained beside the model state.
  return { descriptor, model, async dispatch(channel, name, args) {
    assert.ok(['user', 'service'].includes(channel)); assert.equal(typeof name, 'string');
    return channel === 'user' ? model.userClient.rpc(name, args) : model.serviceClient.rpc(name, args);
  } };
}

/** No source state is accepted by this bridge or descriptor. IPC performs JSON wire serialization. */
export function rpcBridge(send, sampleMemory = () => {}) {
  let next = 0, pending;
  const call = (channel, name, args = {}) => new Promise((resolve, reject) => {
    assert.equal(pending, undefined, 'only one in-flight RPC is supported');
    pending = { id: ++next, resolve, reject };
    try { send({ type: 'rpc', id: next, channel, name, args }); } catch { pending = undefined; reject(Error('rpc_send_failed')); }
  });
  return { userClient: { rpc: (name, args) => call('user', name, args) }, serviceClient: { rpc: (name, args) => call('service', name, args) },
    accept(message) {
      assert.ok(pending && message.type === 'rpc_result' && message.id === pending.id);
      const current = pending; pending = undefined; sampleMemory();
      if (message.failed) current.reject(Error('rpc_model_rejected')); else current.resolve(message.result);
    },
    reject() { if (pending) { const current = pending; pending = undefined; current.reject(Error('rpc_connection_closed')); } },
  };
}

export async function runClient(descriptor, bridge, memory) {
  descriptorGuard(descriptor);
  assert.equal(typeof globalThis.gc, 'function', 'baseline GC is required');
  // The coordinator sent initial state only to the sibling RPC server. This worker
  // has never parsed or held it; its first full state arrives through finance_load.
  globalThis.gc(); const baseline = process.memoryUsage(); memory.sample();
  const service = createFinanceService(bridge), commands = [], reads = [], cpu = process.cpuUsage(), wall = performance.now();
  let responseJsonBytes = 0;
  for (let n = 1; n <= descriptor.repeats; n++) {
    let startCpu = process.cpuUsage(), startWall = performance.now();
    const commanded = await service.command(familyId, descriptor.target, { id: operation(n), action: descriptor.action });
    responseJsonBytes += jsonBytes(commanded); commands.push(elapsed(startCpu, startWall)); memory.sample();
    startCpu = process.cpuUsage(); startWall = performance.now();
    const read = await service.read(familyId, descriptor.target);
    responseJsonBytes += jsonBytes(read); reads.push(elapsed(startCpu, startWall)); memory.sample(); assert.deepEqual(read, commanded);
  }
  memory.sample(); const command = summarize(commands), resultMemory = memory.finish(baseline);
  return { format: 1, weeks: descriptor.weeks, children: descriptor.children, role: descriptor.role, repeats: descriptor.repeats,
    initialStateBytes: descriptor.initialStateBytes, initialTail: descriptor.initialTail, initialStateHash: descriptor.initialStateHash,
    initialTailPerChild: { visible: 126, hidden: 31 }, originalTailLimits: { visible: 128, hidden: 32 }, safetyLimitsRaised: false,
    initialStateOwnership: { receivedBeforeBaseline: false, coordinatorFixtureImported: false, initialStateReferenceAbsent: true, baselineGcCompleted: true },
    node: process.version, pid: process.pid, command, read: summarize(reads), total: elapsed(cpu, wall), memory: resultMemory,
    referenceComparison: referenceComparison({ command, memory: resultMemory }), responseJsonBytes,
    scope: 'LOCAL fresh Node client with JSON IPC RPC-server isolation; NOT hosted Edge, PostgreSQL or Auth qualification' };
}

function send(message) { return new Promise((resolve, reject) => process.send(message, error => error ? reject(Error('ipc_send_failed')) : resolve())); }
async function serverProcess() {
  const memory = memorySampler(); let server, startCpu, startWall, baseline, initialization, busy = false;
  const calls = [];
  process.on('message', async message => {
    try {
      assert.equal(busy, false); busy = true;
      if (message.type === 'initialize') {
        assert.equal(server, undefined); const cpu = process.cpuUsage(), wall = performance.now();
        server = await createServerModel(message.input, memory.sample); message.input = undefined;
        initialization = elapsed(cpu, wall);
        globalThis.gc(); baseline = process.memoryUsage(); memory.sample(); startCpu = process.cpuUsage(); startWall = performance.now();
        busy = false; await send({ type: 'ready', descriptor: server.descriptor }); return;
      }
      assert.ok(server);
      if (message.type === 'rpc') {
        const cpu = process.cpuUsage(), wall = performance.now(); memory.sample();
        const result = await server.dispatch(message.channel, message.name, message.args); memory.sample();
        calls.push({ rpc: message.name, ...elapsed(cpu, wall) });
        await send({ type: 'rpc_result', id: message.id, result }); busy = false; return;
      }
      assert.equal(message.type, 'finish'); memory.sample();
      const finalStateHash = await financeDigest(server.model.db.state); memory.sample();
      const report = { pid: process.pid, node: process.version, scope: 'Separate RPC model process; excluded from client CPU/RSS references',
        initialization, total: elapsed(startCpu, startWall), memory: memory.finish(baseline), calls, rpc: server.model.metrics,
        finalSequence: server.model.db.sequence, finalStateBytes: jsonBytes(server.model.db.state), finalStateHash };
      await send({ type: 'server_report', report }); process.disconnect();
    } catch { await send({ type: 'failed', code: 'rpc_model_failed' }).catch(() => {}); process.exitCode = 1; process.disconnect(); }
  });
}
async function clientProcess() {
  const memory = memorySampler(), bridge = rpcBridge(message => process.send(message), memory.sample);
  process.on('disconnect', () => bridge.reject());
  process.on('message', async message => {
    try {
      if (message.type === 'rpc_result') { bridge.accept(message); return; }
      assert.equal(message.type, 'run'); descriptorGuard(message.descriptor);
      const result = await runClient(message.descriptor, bridge, memory);
      await send({ type: 'client_report', report: result }); process.disconnect();
    } catch { await send({ type: 'failed', code: 'client_probe_failed' }).catch(() => {}); process.exitCode = 1; process.disconnect(); }
  });
}

export async function isolatedClient(input) {
  validateWorkerInput(input);
  return new Promise((resolve, reject) => {
    let client, clientReport, serverReport, settled = false, nextRequest = 1;
    const transport = { rpcRequests: 0, requestJsonBytes: 0, responseJsonBytes: 0, serializationMeasuredIn: 'each sender/receiver process via Node JSON IPC; relay accounting is coordinator-only' };
    const spawn = mode => fork(ownFile, [mode], { cwd: fileURLToPath(new URL('../', import.meta.url)),
      execArgv: ['--expose-gc', '--import', import.meta.resolve('tsx')], serialization: 'json', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
    const server = spawn('--rpc-server');
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer); server.kill(); client?.kill();
      if (error) reject(Error(error)); else resolve({ ...clientReport, server: serverReport, transport });
    };
    const check = () => { if (clientReport && serverReport) {
      try { assert.equal(serverReport.rpc.committed, input.repeats); assert.notEqual(serverReport.pid, clientReport.pid);
        assert.equal(clientReport.initialStateOwnership.initialStateReferenceAbsent, true); finish(); } catch { finish('isolated_evidence_invalid'); }
    } };
    const timer = setTimeout(() => finish('isolated_probe_timeout'), 300000);
    const watch = (worker, side) => {
      worker.on('error', () => finish(`${side}_start_failed`));
      worker.stderr.on('data', () => {}); // No raw stacks or input payloads cross the report boundary.
      worker.on('exit', code => { if (!settled && (code !== 0 || side === 'server' && !serverReport || side === 'client' && !clientReport)) finish(`${side}_process_failed`); });
    };
    watch(server, 'server');
    server.on('message', message => {
      try {
        if (message.type === 'ready') {
          assert.equal(client, undefined); descriptorGuard(message.descriptor); client = spawn('--client-worker'); watch(client, 'client');
          client.on('message', request => {
            try {
              if (request.type === 'rpc') {
                assert.equal(request.id, nextRequest++); assert.ok(['user', 'service'].includes(request.channel));
                transport.rpcRequests++; transport.requestJsonBytes += jsonBytes(request); server.send(request); return;
              }
              assert.equal(request.type, 'client_report'); assert.equal(clientReport, undefined); clientReport = request.report;
              server.send({ type: 'finish' }); check();
            } catch { finish('client_protocol_invalid'); }
          });
          client.send({ type: 'run', descriptor: message.descriptor }); return;
        }
        if (message.type === 'rpc_result') { assert.ok(client); transport.responseJsonBytes += jsonBytes(message); client.send(message); return; }
        assert.equal(message.type, 'server_report'); serverReport = message.report; check();
      } catch { finish('server_protocol_invalid'); }
    });
    server.send({ type: 'initialize', input });
  });
}

export async function coordinateClientProbe(args) {
  const config = options(args.some(arg => arg.startsWith('--weeks=')) ? args : [...args, '--weeks=52']);
  const files = ['apps/mobile/src/finance/engine.ts', 'apps/mobile/src/finance/checkpoint.ts', 'apps/mobile/src/finance/types.ts', 'apps/mobile/src/finance/money-calendar.ts',
    'services/backend/src/finance.ts', 'services/backend/src/finance-checkpoints.ts', 'services/backend/scripts/finance-checkpoint-benchmark.mjs',
    'services/backend/scripts/finance-checkpoint-family-probe.mjs', 'services/backend/scripts/finance-checkpoint-client-probe.mjs'];
  const hashes = async () => Object.fromEntries(await Promise.all(files.map(async name => [name, createHash('sha256').update(await readFile(path.join(root, name))).digest('hex')])));
  const sourceHashes = await hashes();
  const { checkpointLongevityFixture } = await import('./finance-checkpoint-benchmark.mjs');
  let fixture = checkpointLongevityFixture({ weeks: config.weeks });
  const sourceSequence = fixture.result.events + 157, seed = nearCapSeed(fixture.state, fixture.at); fixture = undefined;
  const workers = [];
  for (const children of [1, 2, 12]) for (const role of ['parent', 'child']) {
    try { workers.push({ status: 'passed', ...await isolatedClient({ format: 1, ...config, children, role, sourceSequence: sourceSequence * children, state: familyState(seed, children) }) }); }
    catch (error) { workers.push({ status: 'failed', children, role, code: /^\w+$/.test(error.message) ? error.message : 'isolated_probe_failed' }); }
  }
  const finalSourceHashes = await hashes(), sourceUnchanged = JSON.stringify(sourceHashes) === JSON.stringify(finalSourceHashes);
  const report = { format: 1, measuredAt: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.arch()}`, config,
    scope: 'LOCAL Node JSON IPC client/RPC-server isolation; no DB, network service, hosted Edge or Auth qualification',
    measurementCorrection: 'Earlier same-worker probes charged RPC-model hashing, serialization and retained database state to the client process. This run measures sibling processes separately; no estimated time/memory subtraction.',
    initialStateTransfer: 'Coordinator sends original fixture only to RPC server. Client accepts a bounded descriptor with action, counts and hash; no initial state or golden ledger exists in client before baseline GC.',
    workers, sourceHashes, finalSourceHashes, sourceUnchanged, referenceLimits: REFERENCE_LIMITS,
    allWorkersPassed: sourceUnchanged && workers.length === 6 && workers.every(row => row.status === 'passed'),
    referenceLimitsPassed: sourceUnchanged && workers.length === 6 && workers.every(row => row.status === 'passed' && row.referenceComparison.referenceLimitsPassed),
    noHostedQualification: true, limitations: ['Node IPC is not HTTP/TLS, PostgreSQL, Supabase Auth or Edge isolation.',
      'Client process lifetime max RSS includes Node/tsx startup and actual SDK-equivalent parsed aggregate/envelope data; no RSS baseline subtraction.',
      'Client CPU includes its own verified-load hashing, validation/sealing, projections, JSON IPC encoding/decoding and returned view encoding.',
      'Server total CPU/memory and detailed RPC-model costs are reported separately and never compared as Edge-client cost.',
      'Sampled heap peaks can miss allocations between samples; lifetime RSS is separately retained.',
      'The same ten-or-more commands target the first child, with reads after each; all children start at126 visible/31 hidden tail events.'] };
  const folder = path.join(root, 'spec/production/staging/finance-checkpoints'); await mkdir(folder, { recursive: true });
  const output = path.join(folder, `service-client-ipc-probe-${randomUUID().replaceAll('-', '')}.json`);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return { output: path.relative(root, output).replaceAll('\\', '/'), report };
}
if (process.argv[1] && path.resolve(process.argv[1]) === ownFile) {
  try {
    if (process.argv[2] === '--rpc-server' && process.argv.length === 3) await serverProcess();
    else if (process.argv[2] === '--client-worker' && process.argv.length === 3) await clientProcess();
    else { const result = await coordinateClientProbe(process.argv.slice(2)); console.log(JSON.stringify({ output: result.output,
      allWorkersPassed: result.report.allWorkersPassed, referenceLimitsPassed: result.report.referenceLimitsPassed }));
      if (!result.report.allWorkersPassed || !result.report.referenceLimitsPassed) process.exitCode = 1; }
  } catch { console.error(JSON.stringify({ status: 'failed', code: 'isolated_client_probe_failed' })); process.exitCode = 1; }
}
