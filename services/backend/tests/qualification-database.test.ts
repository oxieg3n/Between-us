import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Ordinary ESM orchestration, with no database operations during import.
import { migrationPlan, platformBootstrap, ownedProbePid, schemaParity, heldFinanceTransaction } from '../recovery/qualification.mjs';
const run = 'a'.repeat(32), name = `betweenus_qualification_${run}`;
test('financial crash fixture preserves initial BEGIN and removes only the exact terminal rollback', () => {
  const body = 'begin;\nselect $$rollback;$$;\nselect * from finish();\n';
  assert.equal(heldFinanceTransaction(body + 'rollback;\n'), body);
  for (const sql of [body + 'commit;\n', body + 'rollback;\nselect 1;', body.replace('begin;\n', '') + 'rollback;\n',
    'begin;\nselect 1;\nrollback;\n']) assert.throws(() => heldFinanceTransaction(sql));
});
test('fresh qualification requires the entire reviewed contiguous migration set', () => {
  const files = Array.from({ length: 26 }, (_, i) => `20261116${String(i + 1).padStart(4, '0')}_reviewed.sql`);
  assert.equal(migrationPlan(files.reverse()).length, 26);
  assert.throws(() => migrationPlan(files.slice(1)));
  assert.throws(() => migrationPlan([...files, 'new.pending']));
  assert.throws(() => migrationPlan([...files.slice(1), '202611160027_unreviewed.sql']));
});
test('platform bootstrap omits only the three app triggers that migrations recreate and rejects other dependencies/data', () => {
  const sql = 'CREATE SCHEMA auth;\n' + [ ['between_us_auth_profile', 'on_auth_user_created', 'AFTER INSERT'],
    ['between_us_consume_registration', 'consume_auth_registration', 'BEFORE INSERT'],
    ['between_us_strip_registration', 'strip_registration_metadata', 'BEFORE UPDATE'] ]
    .map(([trigger, fn, event]) => `CREATE TRIGGER ${trigger} ${event} ON auth.users FOR EACH ROW EXECUTE FUNCTION app_private.${fn}();`).join('\n');
  assert.equal(platformBootstrap(sql).omittedHooks.length, 3);
  assert.equal(platformBootstrap(sql).sql.includes('app_private.'), false);
  for (const extra of ['\nCOPY auth.users FROM stdin;', '\nINSERT INTO auth.users VALUES(1);', '\nSELECT app_private.secret();']) {
    assert.throws(() => platformBootstrap(sql + extra));
  }
  assert.throws(() => platformBootstrap(sql.replace('consume_auth_registration', 'other_function')));
});
test('connection termination requires the exact fresh database, run application and independently owned positive PID', () => {
  const own = { pid: 123, database: name, application: `betweenus-qualification-${run}` };
  assert.equal(ownedProbePid(own, name, run, 456), 123);
  for (const change of [{ pid: 0 }, { pid: 456 }, { database: 'postgres' }, { application: 'existing-service' }]) {
    assert.throws(() => ownedProbePid({ ...own, ...change }, name, run, 456));
  }
  assert.throws(() => ownedProbePid(own, 'postgres', run, 456));
});
test('fresh schema parity ignores intended empty data while enforcing owners, RLS, grants, code and migration state', () => {
  const source = { tables: [{ schema: 'api', name: 'data', owner: 'postgres', rls: true, acl: [], count: 10, hash: 'old' }],
    codeHash: 'same', extensionSchema: [], migrations: ['001'] };
  const fresh = { ...source, tables: [{ ...source.tables[0], count: 0, hash: 'empty' }] };
  schemaParity(fresh, source);
  for (const property of ['owner', 'rls', 'acl']) {
    assert.throws(() => schemaParity({ ...fresh, tables: [{ ...fresh.tables[0], [property]: 'changed' }] }, source));
  }
  assert.throws(() => schemaParity({ ...fresh, codeHash: 'changed' }, source));
  assert.throws(() => schemaParity({ ...fresh, migrations: [] }, source));
});
