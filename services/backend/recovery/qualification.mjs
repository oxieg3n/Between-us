import { fail, targetGuard, sha256 } from './guards.mjs';

export function migrationPlan(files) {
  const selected = files.filter(name => name.endsWith('.sql')).sort();
  if (files.some(name => name.endsWith('.pending')) || selected.length !== 31) fail();
  selected.forEach((name, index) => {
    if (!new RegExp(`^20261116${String(index + 1).padStart(4, '0')}_[a-z_]+\\.sql$`).test(name)) fail();
  });
  return selected;
}
export function platformBootstrap(sql) {
  const hooks = { between_us_auth_profile: 'on_auth_user_created', between_us_consume_registration: 'consume_auth_registration',
    between_us_strip_registration: 'strip_registration_metadata' };
  const omitted = [];
  const cleaned = sql.split('\n').filter(line => {
    const match = /^CREATE TRIGGER ([a-z_]+) (?:BEFORE|AFTER) (?:INSERT|UPDATE) ON auth\.users FOR EACH ROW EXECUTE FUNCTION app_private\.([a-z_]+)\(\);$/.exec(line);
    if (!match) return true;
    if (hooks[match[1]] !== match[2] || omitted.includes(match[1])) fail();
    omitted.push(match[1]); return false;
  }).join('\n');
  if (omitted.length !== 3 || cleaned.includes('app_private.') || /^(?:COPY |INSERT INTO |CREATE SCHEMA app_private)/m.test(cleaned)) fail();
  return { sql: cleaned, omittedHooks: omitted.sort(), sha256: sha256(cleaned) };
}
export function ownedProbePid(actual, name, runId, administrativePid) {
  targetGuard(name, runId, 'qualification');
  if (!Number.isSafeInteger(actual.pid) || actual.pid <= 0 || actual.pid === administrativePid
    || actual.database !== name || actual.application !== `betweenus-qualification-${runId}`) fail();
  return actual.pid;
}
export function schemaParity(actual, expected) {
  const tables = value => value.tables.map(({ count, hash, ...schema }) => schema);
  if (typeof actual.structureHash !== 'string' || typeof expected.structureHash !== 'string'
    || JSON.stringify(tables(actual)) !== JSON.stringify(tables(expected)) || actual.codeHash !== expected.codeHash
    || actual.structureHash !== expected.structureHash
    || JSON.stringify(actual.extensionSchema) !== JSON.stringify(expected.extensionSchema)
    || JSON.stringify(actual.migrations) !== JSON.stringify(expected.migrations)) fail();
}
export function heldFinanceTransaction(sql) {
  if (!/^begin;\r?\n/.test(sql) || !/\r?\nselect \* from finish\(\);\r?\nrollback;\s*$/.test(sql)) fail();
  return sql.replace(/rollback;\s*$/, ''); // Only the reviewed terminal rollback is removed; initial BEGIN remains.
}
