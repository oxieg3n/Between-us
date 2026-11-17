import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServerModel } from './finance-checkpoint-client-probe.mjs';
import { familyState, nearCapSeed } from './finance-checkpoint-family-probe.mjs';
import { financeDigest } from '../src/finance-checkpoints.ts';
import { financeView } from '../../../apps/mobile/src/finance/engine.ts';

export const EDGE_IMAGE = 'public.ecr.aws/supabase/edge-runtime@sha256:362e9177660ae4d3affb6978480cc6161a8ea0764f1c2c7f738348eda1c3fbf2';
export const EDGE_LIMITS = Object.freeze({ memoryLimitMb: 256, cpuTimeSoftLimitMs: 2000, cpuTimeHardLimitMs: 2000, workerTimeoutMs: 150000 });
export const TELEMETRY_POLICY = Object.freeze({ eventAttemptTimeoutMs: 30000, eventMaximumAttempts: 2, eventRetryDelayMs: 250,
  finalCollectorWaitMs: 35000, readinessMaximumMs: 10000, readinessAttemptTimeoutMs: 2000, readinessRetryDelayMs: 200 });
export const RPC_PORT = 57681, EDGE_PORT = 57682;
const MAX_BODY = 8 * 1024 * 1024;
const root = fileURLToPath(new URL('../../../', import.meta.url));
const backend = fileURLToPath(new URL('../', import.meta.url));
const scratchParent = path.join(backend, '.local/finance-edge-probe');
const familyId = 'a1000000-0000-0000-0000-000000000001';
const operation = n => `a3000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));
const SOURCES = ['apps/mobile/src/finance/engine.ts', 'apps/mobile/src/finance/checkpoint.ts', 'apps/mobile/src/finance/types.ts',
  'apps/mobile/src/finance/money-calendar.ts', 'services/backend/src/finance.ts', 'services/backend/src/finance-checkpoints.ts',
  'services/backend/src/finance-history.ts', 'services/backend/scripts/finance-checkpoint-benchmark.mjs',
  'services/backend/scripts/finance-checkpoint-family-probe.mjs', 'services/backend/scripts/finance-checkpoint-client-probe.mjs',
  'services/backend/scripts/finance-checkpoint-edge-probe.mjs'];
export const OFFICIAL_REFERENCES = Object.freeze({
  options: 'https://github.com/supabase/edge-runtime/blob/v1.78.1/examples/main/index.ts',
  events: 'https://github.com/supabase/edge-runtime/blob/v1.78.1/ext/event_worker/events.rs',
  eventWorker: 'https://github.com/supabase/edge-runtime/blob/v1.78.1/examples/event-manager/index.ts',
  policies: 'https://github.com/supabase/edge-runtime/blob/v1.78.1/cli/src/flags.rs',
  hostNetworking: 'https://docs.docker.com/desktop/features/networking/networking-how-tos/',
  hostedLimits: 'https://supabase.com/docs/guides/functions/limits',
});
const sourceHashes = async () => Object.fromEntries(await Promise.all(SOURCES.map(async name => [name, sha(await readFile(path.join(root, name)))])));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function edgeArguments(args) {
  if (same(args, []) || same(args, ['plan'])) return { mode: 'plan' };
  if (same(args, ['prepare'])) return { mode: 'prepare' };
  assert.equal(args.length, 3); assert.ok(args.includes('--execute') && args.includes('--confirm-local-edge-probe'));
  const id = args.find(arg => /^--run-id=[a-f0-9]{32}$/.test(arg)); assert.ok(id);
  return { mode: 'execute', runId: id.slice(9) };
}
export function dockerPlan(runId) {
  assert.match(runId, /^[a-f0-9]{32}$/);
  const folder = path.join(scratchParent, runId), name = `betweenus-finance-edge-${runId}`;
  return { name, reviewedExecutionRequired: true, image: EDGE_IMAGE,
    create: ['create', '--name', name, '--pull=never', '-p', `127.0.0.1:${EDGE_PORT}:9000`,
      '--mount', `type=bind,src=${path.join(folder, 'mount')},dst=/probe,readonly`, '--env-file', path.join(folder, 'probe.env'),
      EDGE_IMAGE, 'start', '--main-service', '/probe/main', '--event-worker', '/probe/events', '--policy', 'oneshot',
      '--request-read-timeout', '150000', '--user-worker-request-idle-timeout', '150000', '--port', '9000'],
    start: ['start', name], stop: ['stop', name], remove: ['rm', name],
    appJwtConfigurationChanged: false, privileged: false, hostNetwork: false, publishedOnlyOnLoopback: true };
}
export function sanitizeRuntimeEvent(source) {
  assert.ok(source && typeof source === 'object');
  const executionId = source.metadata?.execution_id; assert.match(executionId, /^[a-f0-9-]{36}$/i);
  const result = { executionId, type: source.event_type };
  assert.ok(['Boot', 'BootFailure', 'UncaughtException', 'Shutdown'].includes(result.type));
  const event = source.event;
  if (result.type === 'Boot') { assert.ok(Number.isSafeInteger(event.boot_time) && event.boot_time >= 0); result.bootMs = event.boot_time; }
  if (result.type === 'UncaughtException' || result.type === 'Shutdown') {
    assert.ok(Number.isSafeInteger(event.cpu_time_used) && event.cpu_time_used >= 0); result.cpuMs = event.cpu_time_used;
  }
  if (result.type === 'Shutdown') {
    assert.ok(['EventLoopCompleted', 'WallClockTime', 'CPUTime', 'Memory', 'EarlyDrop', 'TerminationRequested'].includes(event.reason));
    result.reason = event.reason; result.memory = {};
    for (const field of ['total', 'heap', 'external']) { assert.ok(Number.isSafeInteger(event.memory_used[field]) && event.memory_used[field] >= 0); result.memory[field] = event.memory_used[field]; }
  }
  return result;
}
export function invocationVerdict(invocation, events) {
  const own = events.filter(event => event.executionId === invocation.executionId);
  const shutdowns = own.filter(event => event.type === 'Shutdown');
  const fatal = own.some(event => ['BootFailure', 'UncaughtException'].includes(event.type));
  const shutdown = shutdowns[0];
  return { invocation: invocation.id, executionId: invocation.executionId ?? null,
    completeMetrics: shutdowns.length === 1, functionalPass: invocation.status === 200 && invocation.exactProjection === true,
    shutdown: shutdown ?? null, fatal,
    localIsolateReferencePass: invocation.status === 200 && invocation.exactProjection === true && !fatal && shutdowns.length === 1
      && ['EarlyDrop', 'EventLoopCompleted'].includes(shutdown.reason) && shutdown.cpuMs <= 2000 && shutdown.memory.total <= 268435456 };
}
/** Retry acknowledgments are idempotent; different events with one delivery ID are never silently replaced. */
export function createRuntimeEventCollector() {
  const events = [], accepted = new Map();
  const metrics = { uniqueDeliveries: 0, duplicateAcknowledgments: 0, retriedRequestsReceived: 0, rejectedDeliveries: 0 };
  return { events, metrics, ingest(input) {
    try {
      const event = sanitizeRuntimeEvent(input);
      assert.equal(typeof input.deliveryId, 'string');
      const match = /^([a-f0-9-]{36}):(Boot|BootFailure|UncaughtException|Shutdown):([1-9][0-9]{0,3})$/i.exec(input.deliveryId);
      assert.ok(match && match[1] === event.executionId && match[2] === event.type);
      assert.ok(Number.isInteger(input.deliveryAttempt) && input.deliveryAttempt >= 1 && input.deliveryAttempt <= TELEMETRY_POLICY.eventMaximumAttempts);
      const fingerprint = JSON.stringify(event);
      if (input.deliveryAttempt > 1) metrics.retriedRequestsReceived++;
      if (accepted.has(input.deliveryId)) {
        assert.equal(accepted.get(input.deliveryId), fingerprint); metrics.duplicateAcknowledgments++;
        return { accepted: true, duplicate: true };
      }
      assert.ok(events.length < 1000); accepted.set(input.deliveryId, fingerprint);
      events.push({ ...event, deliveryId: input.deliveryId }); metrics.uniqueDeliveries++;
      return { accepted: true, duplicate: false };
    } catch (error) { metrics.rejectedDeliveries++; throw error; }
  } };
}
export async function waitForEdgeReadiness(check, { now = () => performance.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const start = now(); let attempts = 0;
  while (now() - start < TELEMETRY_POLICY.readinessMaximumMs) {
    attempts++;
    const remaining = TELEMETRY_POLICY.readinessMaximumMs - (now() - start);
    try { if (await check(Math.min(TELEMETRY_POLICY.readinessAttemptTimeoutMs, remaining))) return { ready: true, attempts, elapsedMs: now() - start }; }
    catch { /* An unavailable local container is a bounded readiness failure, never a reason to widen the bind. */ }
    const after = TELEMETRY_POLICY.readinessMaximumMs - (now() - start);
    if (after > 0) await pause(Math.min(TELEMETRY_POLICY.readinessRetryDelayMs, after));
  }
  return { ready: false, attempts, elapsedMs: now() - start };
}
function tokenMatches(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const bytes = Buffer.from(header.slice(7)), expected = Buffer.from(token);
  return bytes.length === expected.length && timingSafeEqual(bytes, expected);
}
async function body(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; assert.ok(size <= MAX_BODY); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const json = (response, status, value) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };

export function mainSource() {
  return `const token=Deno.env.get("PROBE_TOKEN"), origin=Deno.env.get("PROBE_RPC_ORIGIN");
if(!/^[a-f0-9]{64}$/.test(token??"")||origin!=="http://host.docker.internal:${RPC_PORT}")throw Error("probe_configuration");
const post=async(path,data)=>{const r=await fetch(origin+path,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error("probe_host_unreachable");return r.json()};
Deno.serve(async req=>{if(req.headers.get("authorization")!=="Bearer "+token)return new Response(null,{status:401});
const url=new URL(req.url);if(url.pathname==="/health"){try{const r=await fetch(origin+"/health",{headers:{authorization:"Bearer "+token},signal:AbortSignal.timeout(5000)});return Response.json({hostLoopbackReachable:r.ok},{status:r.ok?200:503})}catch{return Response.json({hostLoopbackReachable:false},{status:503})}}
if(req.method!=="POST"||url.pathname!=="/invoke")return new Response(null,{status:404});
try{const input=await req.json();if(!/^[a-f0-9]{32}-[1-9][0-9]*$/.test(input.invocation))throw Error("probe_invocation");
const worker=await EdgeRuntime.userWorkers.create({servicePath:"/probe/user",memoryLimitMb:256,workerTimeoutMs:150000,cpuTimeSoftLimitMs:2000,cpuTimeHardLimitMs:2000,forceCreate:true,noModuleCache:false,allowRemoteModules:false,envVars:[["PROBE_TOKEN",token],["PROBE_RPC_ORIGIN",origin]]});
if(!/^[a-f0-9-]{36}$/i.test(worker.key))throw Error("probe_execution_key");await post("/register",{invocation:input.invocation,executionId:worker.key});
const forwarded=new Request(req.url,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(input)});EdgeRuntime.applySupabaseTag(req,forwarded);
const response=await worker.fetch(forwarded);const headers=new Headers(response.headers);headers.set("x-probe-execution-id",worker.key);return new Response(response.body,{status:response.status,headers});
}catch(error){return Response.json({code:"local_probe_worker_failed",errorName:/^[A-Za-z]+$/.test(error?.name??"")?error.name:"Error"},{status:503})}});
`;
}
export function userSource() {
  return `import {createFinanceService} from "./finance.bundle.js";
const token=Deno.env.get("PROBE_TOKEN"),origin=Deno.env.get("PROBE_RPC_ORIGIN");
if(!/^[a-f0-9]{64}$/.test(token??"")||origin!=="http://host.docker.internal:${RPC_PORT}")throw Error("probe_configuration");
Deno.serve(async req=>{if(req.headers.get("authorization")!=="Bearer "+token)return new Response(null,{status:401});
try{const input=await req.json();if(!/^[a-f0-9]{32}-[1-9][0-9]*$/.test(input.invocation)||!["command","read"].includes(input.mode))throw Error("probe_request");
const rpc=channel=>({rpc:async(name,args={})=>{const response=await fetch(origin+"/rpc",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({invocation:input.invocation,channel,name,args}),signal:AbortSignal.timeout(150000)});if(!response.ok)throw Error("probe_rpc_failed");return response.json()}});
const service=createFinanceService({userClient:rpc("user"),serviceClient:rpc("service")});
const view=input.mode==="command"?await service.command(input.familyId,input.target,input.request):await service.read(input.familyId,input.target);
return Response.json({format:1,invocation:input.invocation,view});
}catch{return Response.json({code:"local_finance_probe_failed"},{status:503})}});
`;
}
export function eventsSource() {
  return `const token=Deno.env.get("PROBE_TOKEN"),origin=Deno.env.get("PROBE_RPC_ORIGIN");
if(!/^[a-f0-9]{64}$/.test(token??"")||origin!=="http://host.docker.internal:${RPC_PORT}")throw Error("probe_configuration");
let sequence=0;
for await(const data of new globalThis.EventManager()){if(!data||!["Boot","BootFailure","UncaughtException","Shutdown"].includes(data.event_type))continue;
const event={deliveryId:data.metadata?.execution_id+":"+data.event_type+":"+(++sequence),metadata:{execution_id:data.metadata?.execution_id},event_type:data.event_type,event:{}};
if(data.event_type==="Boot")event.event.boot_time=data.event.boot_time;
if(["UncaughtException","Shutdown"].includes(data.event_type))event.event.cpu_time_used=data.event.cpu_time_used;
if(data.event_type==="Shutdown"){event.event.reason=data.event.reason;event.event.memory_used={total:data.event.memory_used.total,heap:data.event.memory_used.heap,external:data.event.memory_used.external}}
let delivered=false;
for(let attempt=1;attempt<=${TELEMETRY_POLICY.eventMaximumAttempts};attempt++){try{const response=await fetch(origin+"/event",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({...event,deliveryAttempt:attempt}),signal:AbortSignal.timeout(${TELEMETRY_POLICY.eventAttemptTimeoutMs})});if(!response.ok)throw Error("delivery");await response.arrayBuffer();delivered=true;break}catch{console.log(JSON.stringify({probeRuntimeMetricDeliveryRetry:true,attempt}));if(attempt<${TELEMETRY_POLICY.eventMaximumAttempts})await new Promise(resolve=>setTimeout(resolve,${TELEMETRY_POLICY.eventRetryDelayMs}))}}
if(!delivered)console.log(JSON.stringify({probeRuntimeMetricDeliveryFailed:true}));}
`;
}
async function canonicalGuard() {
  assert.equal((await realpath(root)).toLowerCase(), 'd:\\projects\\betweenus');
  assert.equal(await lstat('D:\\proejcts\\BetweenUs').then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error)), false);
}
export async function prepareEdgeProbe() {
  await canonicalGuard(); const runId = randomUUID().replaceAll('-', ''), folder = path.join(scratchParent, runId);
  for (const leaf of ['main', 'user', 'events']) await mkdir(path.join(folder, 'mount', leaf), { recursive: true });
  assert.equal((await realpath(folder)).toLowerCase(), folder.toLowerCase());
  const before = await sourceHashes(); const { build } = await import('esbuild');
  await build({ entryPoints: [path.join(backend, 'src/finance.ts')], outfile: path.join(folder, 'mount/user/finance.bundle.js'), bundle: true,
    format: 'esm', platform: 'neutral', target: 'es2023', legalComments: 'eof' });
  await writeFile(path.join(folder, 'mount/main/index.ts'), mainSource(), { flag: 'wx' });
  await writeFile(path.join(folder, 'mount/user/index.ts'), userSource(), { flag: 'wx' });
  await writeFile(path.join(folder, 'mount/events/index.ts'), eventsSource(), { flag: 'wx' });
  await writeFile(path.join(folder, 'probe.env'), `PROBE_TOKEN=${randomBytes(32).toString('hex')}\nPROBE_RPC_ORIGIN=http://host.docker.internal:${RPC_PORT}\n`, { flag: 'wx', mode: 0o600 });
  const generated = {};
  for (const name of ['main/index.ts', 'user/index.ts', 'user/finance.bundle.js', 'events/index.ts']) generated[name] = sha(await readFile(path.join(folder, 'mount', name)));
  const after = await sourceHashes(); assert.ok(same(before, after));
  const manifest = { format: 1, runId, scope: 'LOCAL fictional standalone Edge probe preparation only', preparedAt: new Date().toISOString(),
    limits: EDGE_LIMITS, telemetryPolicy: TELEMETRY_POLICY, policy: 'oneshot', sourceHashes: before, generatedHashes: generated, docker: dockerPlan(runId), references: OFFICIAL_REFERENCES,
    qualifications: { executed: false, productionApiModified: false, jwtVerificationDisabled: false, hosted: false },
    transportGate: 'host.docker.internal to host127.0.0.1 RPC must pass health handshake; never broaden bind automatically' };
  await writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { runId, manifest: path.relative(root, path.join(folder, 'manifest.json')).replaceAll('\\', '/'), docker: manifest.docker };
}

export async function executeEdgeProbe(runId) {
  assert.match(runId, /^[a-f0-9]{32}$/); await canonicalGuard(); const folder = path.join(scratchParent, runId);
  assert.equal((await realpath(folder)).toLowerCase(), folder.toLowerCase());
  const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
  assert.equal(manifest.runId, runId); assert.ok(same(manifest.sourceHashes, await sourceHashes()));
  assert.ok(same(manifest.limits, EDGE_LIMITS) && manifest.policy === 'oneshot' && manifest.docker.image === EDGE_IMAGE);
  assert.ok(same(manifest.telemetryPolicy, TELEMETRY_POLICY));
  assert.deepEqual(Object.keys(manifest.generatedHashes).sort(), ['events/index.ts', 'main/index.ts', 'user/finance.bundle.js', 'user/index.ts']);
  for (const [name, digest] of Object.entries(manifest.generatedHashes)) {
    assert.ok(['main/index.ts', 'user/index.ts', 'user/finance.bundle.js', 'events/index.ts'].includes(name));
    assert.equal(sha(await readFile(path.join(folder, 'mount', name))), digest);
  }
  const env = await readFile(path.join(folder, 'probe.env'), 'utf8'), token = /^PROBE_TOKEN=([a-f0-9]{64})$/m.exec(env)?.[1]; assert.ok(token);
  const collector = createRuntimeEventCollector(), events = collector.events, registrations = new Map(), invocations = [], scenarios = []; let active, inFlight, rpcBusy = false;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const server = createServer(async (request, response) => {
    try {
      if (!tokenMatches(request.headers.authorization, token)) { json(response, 401, { code: 'local_probe_unauthorized' }); return; }
      if (request.method === 'GET' && request.url === '/health') { json(response, 200, { localSyntheticProbe: true }); return; }
      if (request.method !== 'POST') { json(response, 404, { code: 'local_probe_route' }); return; }
      const input = await body(request);
      if (request.url === '/event') { json(response, 200, collector.ingest(input)); return; }
      assert.ok(active && inFlight);
      if (request.url === '/register') {
        assert.equal(input.invocation, inFlight.id); assert.match(input.executionId, /^[a-f0-9-]{36}$/i); assert.ok(!registrations.has(input.invocation));
        registrations.set(input.invocation, input.executionId); inFlight.executionId = input.executionId; json(response, 200, {}); return;
      }
      assert.equal(request.url, '/rpc'); assert.equal(input.invocation, inFlight.id); assert.equal(rpcBusy, false); rpcBusy = true;
      try {
        const result = await active.server.dispatch(input.channel, input.name, input.args);
        if (result.data?.serverAt) active.lastServerAt = result.data.serverAt;
        json(response, 200, result);
      } finally { rpcBusy = false; }
    } catch { if (!response.headersSent) json(response, 503, { code: 'local_probe_protocol_failed' }); else response.end(); }
  });
  const report = { format: 1, measuredAt: new Date().toISOString(), scope: 'LOCAL official Edge user isolates+fictional HTTP RPC model; NOT hosted Auth/SQL qualification',
    expectedImage: EDGE_IMAGE, imageAttestation: 'Owner-reviewed pinned Docker command; this script never executes or inspects Docker.',
    limits: EDGE_LIMITS, telemetryPolicy: TELEMETRY_POLICY, telemetry: collector.metrics,
    policy: 'oneshot', coldUserWorkerPerRequest: true, node: process.version, scenarios, invocations, events,
    sourceHashes: manifest.sourceHashes, generatedHashes: manifest.generatedHashes, references: OFFICIAL_REFERENCES,
    noHostedQualification: true, productionApiModified: false, jwtVerificationDisabled: false,
    nodeModelMemoryNotCountedAsIsolate: true, transport: '127.0.0.1 host HTTP, Docker host.docker.internal, ephemeral synthetic capability; no real credentials',
    limitations: ['Cold isolate per command/read differs from warm NodeIPC worker reuse and is reported explicitly.',
      'Runtime shutdown memory is a snapshot, not a certified peak; hard-limit termination events are retained and count as failures.',
      'Model replaces SQL/Auth; local runtime/image/Docker is not the hosted deployment.', 'No source/runtime/storage limits raised.'] };
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(RPC_PORT, '127.0.0.1', resolve); });
    report.readiness = await waitForEdgeReadiness(async timeout => {
      const health = await fetch(`http://127.0.0.1:${EDGE_PORT}/health`, { headers, signal: AbortSignal.timeout(timeout) });
      const ready = health.status === 200; await health.arrayBuffer(); return ready;
    });
    assert.equal(report.readiness.ready, true, 'loopback_container_connectivity_blocked'); report.hostLoopbackHandshake = true;
    const { checkpointLongevityFixture } = await import('./finance-checkpoint-benchmark.mjs');
    let fixture = checkpointLongevityFixture({ weeks: 52 });
    const sourceSequence = fixture.result.events + 157, seed = nearCapSeed(fixture.state, fixture.at); fixture = undefined;
    let index = 0;
    for (const children of [1, 2, 12]) for (const role of ['parent', 'child']) {
      active = { server: await createServerModel({ format: 1, weeks: 52, repeats: 10, role, children,
        sourceSequence: sourceSequence * children, state: familyState(seed, children) }), lastServerAt: null };
      const scenario = { children, role, weeks: 52, repeats: 10, originalTailPerChild: { visible: 126, hidden: 31 }, invocationIds: [], functionalPass: true };
      scenarios.push(scenario); const descriptor = active.server.descriptor;
      for (let n = 1; n <= 10; n++) for (const mode of ['command', 'read']) {
        const invocation = { id: `${runId}-${++index}`, children, role, iteration: n, mode, status: null, exactProjection: false };
        invocations.push(invocation); scenario.invocationIds.push(invocation.id); inFlight = invocation;
        const started = performance.now();
        try {
          const response = await fetch(`http://127.0.0.1:${EDGE_PORT}/invoke`, { method: 'POST', headers,
            body: JSON.stringify({ invocation: invocation.id, mode, familyId, target: descriptor.target,
              ...(mode === 'command' ? { request: { id: operation(n), action: descriptor.action } } : {}) }), signal: AbortSignal.timeout(155000) });
          invocation.status = response.status;
          if (response.ok) {
            const output = await response.json(); assert.equal(output.invocation, invocation.id);
            const expected = financeView(active.server.model.db.state, role === 'parent' ? { role } : { role, childId: descriptor.target }, descriptor.target, active.lastServerAt);
            invocation.projectionHash = await financeDigest(output.view); invocation.expectedProjectionHash = await financeDigest(expected);
            invocation.exactProjection = invocation.projectionHash === invocation.expectedProjectionHash;
          }
        } catch { invocation.transportOrWorkerFailure = true; }
        invocation.wallMs = performance.now() - started;
        scenario.functionalPass &&= invocation.status === 200 && invocation.exactProjection;
        // Let host-only telemetry callbacks run after expected-projection CPU work.
        await new Promise(resolve => setImmediate(resolve));
      }
      scenario.rpc = active.server.model.metrics;
      scenario.committedExactlyTen = scenario.rpc.committed === 10;
      scenario.functionalPass &&= scenario.committedExactlyTen;
    }
    // Give the dedicated event worker a bounded chance to deliver terminal events.
    const collectionStarted = performance.now();
    while (performance.now() - collectionStarted < TELEMETRY_POLICY.finalCollectorWaitMs
      && invocations.some(invocation => !events.some(event => event.type === 'Shutdown' && event.executionId === invocation.executionId))) await new Promise(resolve => setTimeout(resolve, 100));
    report.finalCollectorWaitMs = performance.now() - collectionStarted;
  } catch { report.blocked = true; report.blocker = report.hostLoopbackHandshake ? 'local_edge_probe_incomplete' : 'loopback_container_connectivity_or_startup'; }
  finally { await new Promise(resolve => server.close(resolve)); server.closeAllConnections(); }
  report.verdicts = invocations.map(invocation => invocationVerdict(invocation, events));
  report.finalSourceHashes = await sourceHashes(); report.sourceUnchanged = same(report.sourceHashes, report.finalSourceHashes);
  report.allFunctionalPass = !report.blocked && scenarios.length === 6 && invocations.length === 120 && scenarios.every(scenario => scenario.functionalPass);
  report.localIsolateReferencesPass = report.allFunctionalPass && report.sourceUnchanged && collector.metrics.rejectedDeliveries === 0
    && report.verdicts.every(verdict => verdict.localIsolateReferencePass);
  const outputFolder = path.join(root, 'spec/production/staging/finance-checkpoints'); await mkdir(outputFolder, { recursive: true });
  const output = path.join(outputFolder, `service-edge-isolate-probe-${runId}-${randomUUID().replaceAll('-', '')}.json`);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return { output: path.relative(root, output).replaceAll('\\', '/'), allFunctionalPass: report.allFunctionalPass,
    localIsolateReferencesPass: report.localIsolateReferencesPass, sourceUnchanged: report.sourceUnchanged, blocked: report.blocked ?? false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = edgeArguments(process.argv.slice(2));
    const result = config.mode === 'plan' ? { mode: 'plan', DockerExecutionByScript: false, HTTPStarted: false, limits: EDGE_LIMITS,
      image: EDGE_IMAGE, officialReferences: OFFICIAL_REFERENCES, next: 'prepare writes ignored scratch bundle+reviewable Docker argv; owner separately creates/starts named container, then explicitly executes probe.' }
      : config.mode === 'prepare' ? await prepareEdgeProbe() : await executeEdgeProbe(config.runId);
    console.log(JSON.stringify(result));
    if (config.mode === 'execute' && !result.localIsolateReferencesPass) process.exitCode = 1;
  } catch { console.error(JSON.stringify({ status: 'failed', code: 'local_edge_probe_guard_or_preparation' })); process.exitCode = 1; }
}
