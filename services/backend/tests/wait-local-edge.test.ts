import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// @ts-expect-error The stdlib-only readiness CLI exposes a fake-fetch port without running its command on import.
import { BACKEND_BUILD, waitLocalEdge } from '../scripts/wait-local-edge.mjs';

const key = 'fictional.local.jwt', status = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: key };
const response = (build = BACKEND_BUILD) => new Response(JSON.stringify({ service: 'between-us', publicEnrollment: false, build }));
function timer() { let elapsed = 0;return { now: () => elapsed, sleep: async (ms: number) => { elapsed += ms; } }; }

test('readiness refuses nonlocal/ambiguous endpoints and malformed credentials before any fetch', async () => {
  let calls = 0;const fetcher = async () => { calls++;return response(); };
  for (const API_URL of ['https://project.supabase.co', 'https://127.0.0.1:54321', 'http://localhost:54321', 'http://127.0.0.1:54322',
    'http://user:private@127.0.0.1:54321', 'http://127.0.0.1:54321/path', 'http://127.0.0.1:54321?key=private']) {
    await assert.rejects(waitLocalEdge({ status: { ...status, API_URL }, fetcher }), { code: 'invalid_configuration' });
  }
  await assert.rejects(waitLocalEdge({ status: { ...status, ANON_KEY: 'private\r\nheader' }, fetcher }), { code: 'invalid_configuration' });
  assert.equal(calls, 0);
});

test('JWT-authenticated readiness retries startup errors/stale builds and reports availability only', async () => {
  let calls = 0;const time = timer();
  const result = await waitLocalEdge({ status, ...time, timeoutMs: 1000, intervalMs: 10, fetcher: async (url: string, options: {
    headers: Record<string, string>;redirect: string;cache: string;signal: AbortSignal;
  }) => {
    assert.equal(url, 'http://127.0.0.1:54321/functions/v1/api/health');assert.equal(options.headers.authorization, `Bearer ${key}`);
    assert.equal(options.headers.apikey, key);assert.equal(options.redirect, 'error');assert.equal(options.cache, 'no-store');assert.equal(options.signal.aborted, false);
    calls++;if (calls === 1) throw Error('private-provider-diagnostic');
    if (calls === 2) return new Response('private-proxy-body', { status: 503 });
    return response(calls === 3 ? 'old-backend-build' : BACKEND_BUILD);
  } });
  assert.equal(result.ready, true);assert.equal(result.attempts, 4);assert.equal(result.expectedBackendBuild, '1116-FinanceCheckpoints-r2');
  assert.equal(result.availabilityOnly, true);assert.equal(JSON.stringify(result).includes(key), false);
});

test('stale, unavailable, malformed and oversized health replies time out without leaking diagnostics', async () => {
  for (const fetcher of [async () => response('stale-private-build'), async () => new Response('private-body', { status: 401 }),
    async () => new Response('private-invalid-json'), async () => new Response(JSON.stringify({ secret: 'private-' + 'x'.repeat(5000) })),
    async () => { throw Error(`private-${key}`); }]) {
    await assert.rejects(waitLocalEdge({ status, ...timer(), timeoutMs: 30, intervalMs: 10, fetcher }), (error: unknown) => {
      assert.equal((error as {code: string}).code, 'timeout');assert.doesNotMatch(String(error), /private|fictional/);
      assert.doesNotMatch(JSON.stringify(error), /private|fictional/);return true;
    });
  }
});

test('a hanging fake fetch is aborted within the bounded attempt and overall deadline', async () => {
  let aborted = false;
  await assert.rejects(waitLocalEdge({ status, timeoutMs: 15, attemptMs: 5, intervalMs: 1,
    fetcher: async (_url: string, options: {signal: AbortSignal}) => {
      options.signal.addEventListener('abort', () => { aborted = true; });return new Promise(() => {});
    } }), { code: 'timeout' });
  assert.equal(aborted, true);
});

test('readiness rejects unbounded timing and a backward clock', async () => {
  for (const timeoutMs of [0, -1, Infinity, 90001]) await assert.rejects(waitLocalEdge({ status, timeoutMs }), { code: 'invalid_configuration' });
  let now = 1;await assert.rejects(waitLocalEdge({ status, now: () => --now, fetcher: async () => response() }), { code: 'invalid_clock' });
});

test('inactive manual CI launches JWT-verified API privately before integration and retires its own child', async () => {
  const file = new URL('../../../spec/production/release/production-checks.workflow.yml', import.meta.url);
  assert.ok(file.pathname.includes('/spec/production/release/'));assert.equal(file.pathname.includes('/.github/'), false);
  const workflow = await readFile(file, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);assert.match(workflow, /inputs\.quota_reviewed == true/);
  const launch = workflow.indexOf('functions serve api >.local/ci-edge.log 2>&1 &'), ready = workflow.indexOf('node scripts/wait-local-edge.mjs'), integration = workflow.indexOf('npm run test:integration');
  assert.ok(launch > 0 && ready > launch && integration > ready);
  assert.ok(workflow.includes('edge_pid=$!'));assert.ok(workflow.includes('trap retire_edge EXIT'));assert.ok(workflow.includes('$(jobs -pr)'));
  assert.ok(workflow.includes('wait "$edge_pid"'));assert.ok(workflow.includes('.local/ci-edge-ready.log'));
  assert.doesNotMatch(workflow, /--no-verify-jwt|\bpkill\b|\bkillall\b|upload-artifact|^\s*(push|pull_request|schedule):/m);
});
