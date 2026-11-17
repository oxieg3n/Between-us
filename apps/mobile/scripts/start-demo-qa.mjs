import { spawn as spawnProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '::1']);
const refusal = 'Demo QA refused: production/native port 8081 is active or could not be checked. Stop the verified owner Metro terminal and quiesce native QA before retrying.';

/**
 * ECONNREFUSED alone proves this address free; silence and other errors fail closed.
 * @param {string} host
 * @param {{connect?:(options:{host:string,port:number})=>Pick<import('node:events').EventEmitter,'once'> & {destroy:()=>void},timeoutMs?:number}} options
 * @returns {Promise<'active'|'free'|'unknown'>}
 */
export function probeProductionPort(host, { connect = createConnection, timeoutMs = 750 } = {}) {
  return new Promise(resolveProbe => {
    let socket;
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket?.destroy();
      resolveProbe(result);
    };
    const timer = setTimeout(() => finish('unknown'), timeoutMs);
    try {
      socket = connect({ host, port: 8081 });
      socket.once('connect', () => finish('active'));
      socket.once('error', error => finish(error?.code === 'ECONNREFUSED' ? 'free' : 'unknown'));
      socket.once('close', () => finish('unknown'));
    } catch { finish('unknown'); }
  });
}

/**
 * @param {{probe?:(host:string)=>Promise<string>,spawn?:(command:string,args:string[],options:{cwd:string,env:Record<string,string|undefined>,shell:false,detached:false,windowsHide:true,stdio:'inherit'})=>Pick<import('node:events').EventEmitter,'once'>,env?:Record<string,string|undefined>}} options
 * @returns {Promise<number>}
 */
export async function startDemoQa({ probe = probeProductionPort, spawn = spawnProcess, env = process.env } = {}) {
  let results;
  try { results = await Promise.all(LOOPBACK_HOSTS.map(host => probe(host))); }
  catch { throw new Error(refusal); }
  if (results.some(result => result !== 'free')) throw new Error(refusal);

  // Stay in Playwright's process tree/group so its teardown owns Expo and descendants.
  let child;
  try {
    child = spawn(process.execPath, [resolve(mobileRoot, 'node_modules/expo/bin/cli'),
      'start', '--web', '--localhost', '--port', '8084', '--clear'], {
      cwd: mobileRoot, env: { ...env, EXPO_PUBLIC_APP_MODE: 'demo', CI: '1' },
      shell: false, detached: false, windowsHide: true, stdio: 'inherit',
    });
  } catch { throw new Error('Demo QA could not start the pinned local Expo CLI.'); }
  return new Promise((resolveExit, reject) => {
    child.once('error', () => reject(new Error('Demo QA could not start the pinned local Expo CLI.')));
    child.once('exit', code => resolveExit(code ?? 1));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startDemoQa().then(code => { process.exitCode = code; }, error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
