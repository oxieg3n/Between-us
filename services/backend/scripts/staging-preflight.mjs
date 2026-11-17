import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, names) => object(value) && Object.keys(value).length === names.length && Object.keys(value).every(k => names.includes(k));
const stable = value => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const fail = () => { throw Error('Offline staging preflight refused.'); };
const fields = ['environment', 'plan', 'projectRef', 'region', 'supabaseUrl', 'allowedOrigins', 'authRedirectUrls', 'syntheticOnly', 'publicEnrollmentEnabled', 'realChildDataEnabled', 'publicReportsEnabled', 'pushDeliveryEnabled', 'approvalId'];
function safeHttps(value, originOnly = false) {
  if (typeof value !== 'string' || value.length > 300 || /[*%\\\s]/.test(value)) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash
    && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(u.hostname) && !u.hostname.endsWith('.test') && !u.hostname.endsWith('.invalid')
    && !['.localhost', '.local', '.internal'].some(suffix => u.hostname.endsWith(suffix))
    && !/^\d+(?:\.\d+){3}$/.test(u.hostname) && (!originOnly || value === u.origin); } catch { return false; }
}
export function validateTarget(value, allowlist) {
  if (!exact(value, fields) || value.environment !== 'hosted-staging' || value.plan !== 'free' || typeof value.projectRef !== 'string' || !/^[a-z]{20}$/.test(value.projectRef)
    || typeof value.region !== 'string' || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(value.region)
    || value.supabaseUrl !== `https://${value.projectRef}.supabase.co` || value.syntheticOnly !== true
    || ['publicEnrollmentEnabled', 'realChildDataEnabled', 'publicReportsEnabled', 'pushDeliveryEnabled'].some(k => value[k] !== false)
    || typeof value.approvalId !== 'string' || !/^[A-Z][A-Z0-9_-]{5,79}$/.test(value.approvalId)) fail();
  if (!Array.isArray(value.allowedOrigins) || value.allowedOrigins.length < 1 || value.allowedOrigins.length > 5
    || value.allowedOrigins.some(v => !safeHttps(v, true)) || new Set(value.allowedOrigins).size !== value.allowedOrigins.length) fail();
  if (!Array.isArray(value.authRedirectUrls) || value.authRedirectUrls.length < 1 || value.authRedirectUrls.length > 6
    || new Set(value.authRedirectUrls).size !== value.authRedirectUrls.length
    || value.authRedirectUrls.some(v => v !== 'between-us://auth/callback' && (!safeHttps(v) || !value.allowedOrigins.some(origin => v === `${origin}/auth/callback`)))) fail();
  if (!exact(allowlist, ['schemaVersion', 'targets']) || allowlist.schemaVersion !== 1 || !Array.isArray(allowlist.targets)
    || allowlist.targets.length > 1 || !allowlist.targets.some(t => stable(t) === stable(value))) fail();
  return JSON.parse(stable(value));
}
async function boundedJson(file) {
  const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384) fail();
  return JSON.parse(await readFile(file, 'utf8'));
}
export async function inventoryMigrations(directory) {
  const directoryInfo = await lstat(directory), resolvedDirectory = await realpath(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) fail();
  const entries = await readdir(directory, { withFileTypes: true });
  if (!entries.length || entries.some(e => !e.isFile() || !/^\d{12}_[a-z0-9_]+\.sql$/.test(e.name))) fail();
  const names = entries.map(e => e.name).sort();
  if (new Set(names.map(n => n.slice(0, 12))).size !== names.length) fail();
  return Promise.all(names.map(async name => {
    const file = path.join(directory, name), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || !(await realpath(file)).startsWith(resolvedDirectory + path.sep)) fail();
    return { name, sha256: hash(await readFile(file)) };
  }));
}
export async function runPreflight({ local = false, targetPath } = {}) {
  const root = await realpath(backendRoot);
  const repositoryRoot = await realpath(path.join(root, '../..'));
  if (process.platform === 'win32' && root.toLowerCase() !== 'd:\\projects\\betweenus\\services\\backend') fail();
  const pkg = await boundedJson(path.join(root, 'package.json'));
  const installed = await boundedJson(path.join(root, 'node_modules/supabase/package.json'));
  if (pkg.devDependencies?.supabase !== '3.1.0' || installed.version !== '3.1.0') fail();
  const allowlist = await boundedJson(path.join(root, 'config/staging/approved-targets.json'));
  const expectedTarget = path.join(root, '.local/staging/target.json');
  if (!local && (typeof targetPath !== 'string' || path.resolve(targetPath) !== expectedTarget || await realpath(path.dirname(targetPath)) !== path.dirname(expectedTarget))) fail();
  const target = local ? { environment: 'local', syntheticOnly: true, hostedTarget: false }
    : validateTarget(await boundedJson(targetPath), allowlist);
  if (local && targetPath) fail();
  const migrations = await inventoryMigrations(path.join(root, 'supabase/migrations'));
  const files = ['package.json', 'package-lock.json', 'supabase/config.toml', 'supabase/functions/api/index.ts', 'supabase/functions/_shared/api.bundle.js',
    'config/staging/approved-targets.json', 'scripts/staging-preflight.mjs', 'scripts/staging-plan.mjs', 'scripts/build.mjs',
    '../../apps/mobile/src/finance/engine.ts', '../../apps/mobile/src/finance/checkpoint.ts', '../../apps/mobile/src/production/finance-history-types.ts', '../../apps/mobile/src/finance/types.ts', '../../apps/mobile/src/finance/money-calendar.ts',
    '../../apps/mobile/src/production/deployment-target.ts', '../../apps/mobile/src/production/client.ts',
    '../../apps/mobile/app.json', '../../apps/mobile/package.json', '../../apps/mobile/package-lock.json', '../../apps/mobile/src/build.ts'];
  for (const entry of await readdir(path.join(root, 'src'), { withFileTypes: true })) {
    if (!entry.isFile() || !/^[a-z0-9-]+\.ts$/.test(entry.name)) fail(); files.push(`src/${entry.name}`);
  }
  const artifacts = await Promise.all(files.sort().map(async name => {
    const file = path.join(root, name), info = await lstat(file), resolved = await realpath(file);
    if (!info.isFile() || info.isSymbolicLink() || !resolved.startsWith(repositoryRoot + path.sep)) fail();
    return { name, sha256: hash(await readFile(file)) };
  }));
  const fingerprint = hash(stable({ target, migrations, artifacts, cliVersion: '3.1.0' }));
  return { format: 'between-us-offline-staging-plan-v1', mode: local ? 'local-inventory' : 'hosted-staging-preparation',
    cliVersion: '3.1.0', target, fingerprint, migrations, artifacts, networkPerformed: false, credentialsRead: false,
    hostedPlanVerified: false, deploymentAuthorized: false, migrationApplicationVerified: false };
}
export async function preflightMain(args) {
  if (!(args.length === 1 && args[0] === '--local') && !(args.length === 2 && args[0] === '--target')) fail();
  const result = await runPreflight(args[0] === '--local' ? { local: true } : { targetPath: args[1] });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  preflightMain(process.argv.slice(2)).catch(() => { process.stderr.write('Offline staging preflight refused: check reviewed target, pinned CLI and built artifact; no private diagnostic is printed.\n'); process.exitCode = 1; });
}
