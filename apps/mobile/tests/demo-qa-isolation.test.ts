import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { LOOPBACK_HOSTS, probeProductionPort, startDemoQa } from '../scripts/start-demo-qa.mjs';

class FakeSocket extends EventEmitter {
  destroyed = false;
  destroy() { this.destroyed = true; this.emit('close'); }
}
function fakeConnection(event: 'connect' | 'error' | 'close' | 'silent', code?: string) {
  const socket = new FakeSocket();
  const connect = (options: { host: string; port: number }) => {
    assert.equal(options.port, 8081);
    assert.ok(LOOPBACK_HOSTS.includes(options.host));
    if (event !== 'silent') queueMicrotask(() => socket.emit(event, { code, message: 'private fixture must not appear' }));
    return socket;
  };
  return { socket, connect };
}

test('production port probe recognizes listeners on both loopbacks and destroys every socket', async () => {
  for (const host of LOOPBACK_HOSTS) {
    const fake = fakeConnection('connect');
    assert.equal(await probeProductionPort(host, { connect: fake.connect }), 'active');
    assert.equal(fake.socket.destroyed, true);
    const refused = fakeConnection('error', 'ECONNREFUSED');
    assert.equal(await probeProductionPort(host, { connect: refused.connect }), 'free');
    assert.equal(refused.socket.destroyed, true);
  }
});

test('unexpected errors, premature close, throw and bounded silence remain unknown', async () => {
  for (const [event, code] of [['error', 'EACCES'], ['error', 'EAFNOSUPPORT'], ['close', undefined], ['silent', undefined]] as const) {
    const fake = fakeConnection(event, code);
    assert.equal(await probeProductionPort('::1', { connect: fake.connect, timeoutMs: 5 }), 'unknown');
    assert.equal(fake.socket.destroyed, true);
  }
  assert.equal(await probeProductionPort('127.0.0.1', { connect: () => { throw new Error('private fixture'); } }), 'unknown');
});

test('either listener or unknown probe refuses before any Expo spawn and redacts failures', async () => {
  for (const blocked of LOOPBACK_HOSTS) {
    for (const result of ['active', 'unknown', 'unexpected']) {
      const visited: string[] = [];
      let spawns = 0;
      await assert.rejects(startDemoQa({
        probe: async (host: string) => { visited.push(host); return host === blocked ? result : 'free'; },
        spawn: () => { spawns += 1; throw new Error('must not launch'); },
      }), /^Error: Demo QA refused:/);
      assert.deepEqual(visited, [...LOOPBACK_HOSTS]);
      assert.equal(spawns, 0);
    }
  }
  await assert.rejects(startDemoQa({
    probe: async () => { throw new Error('TOKEN=private fixture'); },
    spawn: () => { assert.fail('must not launch'); },
  }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Demo QA refused/);
    assert.doesNotMatch(error.message, /TOKEN|private fixture/);
    return true;
  });
});

test('free probes launch only local pinned Expo in the owned process tree and propagate exit', async () => {
  const env = { EXPO_PUBLIC_APP_MODE: 'production', CI: 'false' };
  const child = new EventEmitter();
  const checked: string[] = [];
  const exit = await startDemoQa({
    env,
    probe: async (host: string) => { checked.push(host); return 'free'; },
    spawn: (command, args, options) => {
      assert.deepEqual(checked, [...LOOPBACK_HOSTS]);
      assert.equal(command, process.execPath);
      assert.deepEqual(args, [resolve(options.cwd, 'node_modules/expo/bin/cli'), 'start', '--web', '--localhost', '--port', '8084', '--clear']);
      assert.deepEqual(options.env, { EXPO_PUBLIC_APP_MODE: 'demo', CI: '1' });
      assert.equal(options.shell, false);
      assert.equal(options.detached, false);
      assert.equal(options.windowsHide, true);
      assert.equal(options.stdio, 'inherit');
      queueMicrotask(() => child.emit('exit', 7));
      return child;
    },
  });
  assert.equal(exit, 7);
  assert.deepEqual(env, { EXPO_PUBLIC_APP_MODE: 'production', CI: 'false' });
  const config = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
  assert.match(config, /command: "node scripts\/start-demo-qa\.mjs"/);
  assert.match(config, /reuseExistingServer: false/);
});
