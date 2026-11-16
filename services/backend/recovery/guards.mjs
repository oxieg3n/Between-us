import { createHash } from 'node:crypto';

export const CONTAINER = 'supabase_db_betweenus-production-local';
export const SCHEMAS = ['app_private', 'api', 'auth', 'supabase_migrations'];
export const MAX_BYTES = 128 * 1024 * 1024;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = () => { throw Error('Recovery safety check failed.'); };
export function canonicalAcl(entries) {
  if (!Array.isArray(entries)) fail();
  return entries.map(entry => {
    if (typeof entry.grantor !== 'string' || !entry.grantor || typeof entry.grantee !== 'string' || !entry.grantee
      || typeof entry.privilege !== 'string' || typeof entry.grantable !== 'boolean') fail();
    return { grantor: entry.grantor, grantee: entry.grantee, privilege: entry.privilege, grantable: entry.grantable };
  }).sort((a, b) => { const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0; });
}
class RecoveryOperationError extends Error {
  constructor(label, code) {
    super('Recovery fixture operation failed.');
    this.recoveryStage = label;
    if (/^[0-9A-Z]{5}$/.test(code ?? '')) this.code = code;
  }
}
export function operationError(error, label) {
  if (!/^[a-z-]{1,60}$/.test(label)) fail();
  return new RecoveryOperationError(label, error?.code);
}
export function safeFailure(error) {
  const metadata = {};
  if (/^[0-9A-Z]{5}$/.test(error?.code ?? '')) metadata.sqlState = error.code;
  if (error instanceof RecoveryOperationError) metadata.operation = error.recoveryStage;
  const location = /\b(fixture|database|guards|backup-recovery)\.mjs:(\d{1,6}):(\d{1,6})/.exec(error?.stack ?? '');
  if (location) metadata.sourceLocation = { file: `${location[1]}.mjs`, line: Number(location[2]), column: Number(location[3]) };
  return metadata;
}
export function checkedResult(result, label, allowVoid = false) {
  if (!/^[a-z-]{1,60}$/.test(label)) fail();
  if (result.error || !allowVoid && result.data == null) {
    throw operationError(result.error, label);
  }
  return result.data;
}

export function sourceGuard(status) {
  const url = new URL(status.DB_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.port !== '54322' || url.pathname !== '/postgres' || url.search || url.hash
    || status.API_URL !== 'http://127.0.0.1:54321' || typeof status.ANON_KEY !== 'string'
    || typeof status.SERVICE_ROLE_KEY !== 'string') fail();
  return url;
}
export function targetGuard(name, runId, kind = 'recovery') {
  if (!['recovery', 'qualification'].includes(kind) || !/^[a-f0-9]{32}$/.test(runId) || name !== `betweenus_${kind}_${runId}`) fail();
  return name;
}
export function spaceGuard(available, estimate) {
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(estimate) || estimate < 1
    || estimate > MAX_BYTES || available < estimate * 3 + MAX_BYTES) fail();
}
export function versionGuard(serverNumber, dumpVersion, restoreVersion) {
  const major = Math.floor(Number(serverNumber) / 10000);
  if (major < 14 || major > 18 || !new RegExp(`\\b${major}\\.`).test(dumpVersion)
    || dumpVersion.replace('pg_dump', '') !== restoreVersion.replace('pg_restore', '')) fail();
}
export function tombstoneGuard(value, runId, expectedSnapshotHash, fixtureIds, snapshotAt, now = Date.now()) {
  const snapshotTime = Date.parse(snapshotAt), effectiveTime = Date.parse(value?.effectiveAt);
  if (!value || value.format !== 1 || value.runId !== runId || value.snapshotHash !== expectedSnapshotHash
    || value.snapshotAt !== snapshotAt || !Number.isFinite(snapshotTime) || !Number.isFinite(effectiveTime)
    || !Number.isFinite(now) || effectiveTime < snapshotTime || effectiveTime > now || !Array.isArray(value.subjects)
    || JSON.stringify(value.subjects) !== JSON.stringify(fixtureIds) || !value.partialDeletion
    || typeof value.partialDeletion.messageId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.partialDeletion.messageId)) fail();
  return value;
}
export function scheduleHealth(lastSuccessAt, now, maximumAgeMs = 26 * 60 * 60 * 1000) {
  const completed = Date.parse(lastSuccessAt);
  return Number.isFinite(completed) && Number.isFinite(now) && now >= completed && now - completed <= maximumAgeMs;
}

// A public age recipient does not authenticate the archive's origin. The caller must supply the trusted registry digest.
export async function authenticatedRestore({ ciphertext, expectedHash, decrypt, createQuarantine, restore, verify, replay }) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || ciphertext.length > MAX_BYTES || sha256(ciphertext) !== expectedHash) fail();
  const cleartext = await decrypt(ciphertext); // age must finish successfully before any target mutation.
  try {
    if (!Buffer.isBuffer(cleartext) || cleartext.length > MAX_BYTES || cleartext.subarray(0, 5).toString() !== 'PGDMP') fail();
    await createQuarantine();
    await restore(cleartext);
    await verify('snapshot');
    await replay();
    await verify('replayed');
    await replay();
    await verify('idempotent');
  } finally { if (Buffer.isBuffer(cleartext)) cleartext.fill(0); }
}

export function tapSummary(results) {
  const values = (Array.isArray(results) ? results : [results]).flatMap(result => result.rows ?? [])
    .flatMap(row => Object.values(row)).filter(value => typeof value === 'string');
  const assertions = values.filter(value => /^ok \d+\b/m.test(value)).length;
  if (!assertions || values.some(value => /^not ok\b|^# Looks like|^Bail out!/m.test(value))
    || !values.some(value => /^1\.\.\d+$/m.test(value))) fail();
  return assertions;
}
