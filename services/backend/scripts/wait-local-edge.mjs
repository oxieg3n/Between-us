import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const BACKEND_BUILD = '1116-FinanceCheckpoints-r2';
const origin = 'http://127.0.0.1:54321';
const endpoint = `${origin}/functions/v1/api/health`;
const failure = code => Object.assign(Error('Local Edge readiness unavailable.'), { code });

async function healthy(fetcher, key, signal) {
  const response = await fetcher(endpoint, { method: 'GET', redirect: 'error', cache: 'no-store', signal,
    headers: { authorization: `Bearer ${key}`, apikey: key, accept: 'application/json' } });
  if (response.status !== 200 || !response.body) return false;
  const reader = response.body.getReader(), parts = [];let size = 0;
  try {
    while (true) {
      const item = await reader.read();if (item.done) break;
      size += item.value.byteLength;if (size > 4096) return false;parts.push(item.value);
    }
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
    return body?.service === 'between-us' && body.publicEnrollment === false && body.build === BACKEND_BUILD;
  } finally { void reader.cancel().catch(() => {}); }
}

/** Availability check only: an expected health string is not source/artifact attestation. */
export async function waitLocalEdge({ status, fetcher = globalThis.fetch, now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 90000, attemptMs = 2000, intervalMs = 500 } = {}) {
  if (status?.API_URL !== origin || typeof status.ANON_KEY !== 'string' || status.ANON_KEY.length > 8192
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(status.ANON_KEY)
    || ![timeoutMs, attemptMs, intervalMs].every(n => Number.isSafeInteger(n) && n > 0)
    || timeoutMs > 90000 || attemptMs > 5000 || intervalMs > 5000) throw failure('invalid_configuration');
  let previous = now();if (!Number.isFinite(previous)) throw failure('invalid_clock');
  const deadline = previous + timeoutMs, maximumAttempts = Math.ceil(timeoutMs / intervalMs) + 1;
  for (let attempts = 1; attempts <= maximumAttempts; attempts++) {
    const current = now();if (!Number.isFinite(current) || current < previous) throw failure('invalid_clock');previous = current;
    if (current >= deadline) break;
    const controller = new AbortController();let timer;
    try {
      const ready = await Promise.race([
        healthy(fetcher, status.ANON_KEY, controller.signal).catch(() => false),
        new Promise(resolve => { timer = setTimeout(() => { controller.abort();resolve(false); }, Math.min(attemptMs, deadline - current)); }),
      ]);
      if (ready && now() < deadline) return { ready: true, attempts, expectedBackendBuild: BACKEND_BUILD, availabilityOnly: true };
    } finally { clearTimeout(timer);controller.abort(); }
    const remaining = deadline - now();if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  throw failure('timeout');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw failure('invalid_configuration');
    const status = JSON.parse((await readFile(new URL('../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
    console.log(JSON.stringify(await waitLocalEdge({ status })));
  } catch {
    console.error('Local JWT-verified API readiness failed. Credentials and raw health/server diagnostics are withheld.');process.exitCode = 1;
  }
}
