import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Recovery orchestration is ordinary ESM used by the reviewed CLI.
import { sourceGuard, targetGuard, spaceGuard, versionGuard, tombstoneGuard, scheduleHealth, sha256, authenticatedRestore, tapSummary, MAX_BYTES, checkedResult, safeFailure, canonicalAcl } from '../recovery/guards.mjs';
// @ts-expect-error Root-only fixture orchestration has a fake SQL port in this portable failure test.
import { retireOwnedIdentities } from '../recovery/fixture.mjs';

const run = 'a'.repeat(32);
const local = { DB_URL: 'postgresql://postgres:fictional@127.0.0.1:54322/postgres', API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'fictional', SERVICE_ROLE_KEY: 'fictional' };
test('ACL order is irrelevant while every grantor, grantee, privilege and grant option remains integrity checked', () => {
  const a = { grantor: 'owner', grantee: 'PUBLIC', privilege: 'EXECUTE', grantable: false };
  const b = { grantor: 'owner', grantee: 'authenticated', privilege: 'EXECUTE', grantable: false };
  const expected = canonicalAcl([a, b]);
  assert.deepEqual(canonicalAcl([b, a]), expected);
  for (const change of [{ ...a, grantor: 'other' }, { ...a, grantee: 'other' }, { ...a, privilege: 'SELECT' }, { ...a, grantable: true }]) {
    assert.notDeepEqual(canonicalAcl([change, b]), expected);
  }
  assert.notDeepEqual(canonicalAcl([a]), expected);
});
test('void RPC success is explicit; fixture errors retain only safe stage and SQLSTATE', () => {
  assert.equal(checkedResult({ data: null, error: null }, 'verify-child-consent', true), null);
  assert.throws(() => checkedResult({ data: null, error: null }, 'create-family'));
  try {
    checkedResult({ data: null, error: { code: '42501', message: 'secret must not leak' } }, 'verify-child-consent', true);
    assert.fail('must deny');
  } catch (error) {
    assert.equal((error as Error & { code: string }).code, '42501');
    assert.equal((error as Error & { recoveryStage: string }).recoveryStage, 'verify-child-consent');
    assert.equal((error as Error).message.includes('secret'), false);
    assert.equal(safeFailure(error).operation, 'verify-child-consent');
    assert.equal(safeFailure(error).sqlState, '42501');
    assert.equal(JSON.stringify(safeFailure(error)).includes('secret'), false);
  }
  assert.equal(safeFailure({ recoveryStage: 'provider-secret', message: 'private', stack: 'private' }).operation, undefined);
});
test('recovery permits only the exact local source and an internally bound unique database', () => {
  assert.equal(sourceGuard(local).pathname, '/postgres');
  for (const DB_URL of ['postgresql://postgres@other.test:54322/postgres', 'postgresql://postgres@127.0.0.1:54322/template0',
    'postgresql://postgres@127.0.0.1:54322/postgres?options=evil', 'postgresql://postgres@127.0.0.1:5432/postgres', 'https://127.0.0.1:54322/postgres']) {
    assert.throws(() => sourceGuard({ ...local, DB_URL }));
  }
  assert.throws(() => sourceGuard({ ...local, API_URL: 'https://other.test' }));
  assert.equal(targetGuard(`betweenus_recovery_${run}`, run), `betweenus_recovery_${run}`);
  for (const name of ['postgres', 'template0', `betweenus_recovery_${'b'.repeat(32)}`, 'betweenus_recovery_../postgres']) assert.throws(() => targetGuard(name, run));
});
test('low disk, oversized data and unreviewed tool/server versions stop before backup work', () => {
  spaceGuard(MAX_BYTES * 4, 1000);
  for (const estimate of [0, -1, NaN, MAX_BYTES + 1]) assert.throws(() => spaceGuard(MAX_BYTES * 8, estimate));
  assert.throws(() => spaceGuard(1, 1000));
  versionGuard('170011', 'pg_dump (PostgreSQL) 17.11', 'pg_restore (PostgreSQL) 17.11');
  assert.throws(() => versionGuard('170011', 'pg_dump (PostgreSQL) 16.11', 'pg_restore (PostgreSQL) 16.11'));
  assert.throws(() => versionGuard('170011', 'pg_dump (PostgreSQL) 17.11', 'pg_restore (PostgreSQL) 17.10'));
});
test('failed or missed schedules never acquire a successful heartbeat', () => {
  const time = Date.parse('2026-11-16T12:00:00Z');
  assert.equal(scheduleHealth('2026-11-16T11:00:00Z', time), true);
  for (const last of ['', 'invalid', '2026-11-14T12:00:00Z', '2026-11-17T12:00:00Z']) assert.equal(scheduleHealth(last, time), false);
});
test('tombstones are bound to the trusted snapshot and exact newly created fixture subjects', () => {
  const subjects = ['1', '2', '3'];
  const snapshotAt = '2026-11-16T11:00:00Z', now = Date.parse('2026-11-16T13:00:00Z');
  const valid = { format: 1, runId: run, snapshotHash: 'a'.repeat(64), snapshotAt, effectiveAt: '2026-11-16T12:00:00Z', subjects,
    partialDeletion: { messageId: 'a0000000-0000-0000-0000-000000000001' } };
  assert.equal(tombstoneGuard(valid, run, valid.snapshotHash, subjects, snapshotAt, now), valid);
  for (const change of [{ format: 2 }, { runId: 'b'.repeat(32) }, { snapshotHash: 'b'.repeat(64) },
    { subjects: ['1', '2'] }, { effectiveAt: 'invalid' }, { effectiveAt: '2026-11-16T10:00:00Z' },
    { effectiveAt: '2026-11-16T14:00:00Z' }, { snapshotAt: '2026-11-16T10:00:00Z' }, { partialDeletion: { messageId: 'DROP DATABASE postgres' } }]) {
    assert.throws(() => tombstoneGuard({ ...valid, ...change }, run, valid.snapshotHash, subjects, snapshotAt, now));
  }
});
function ports() {
  const calls: string[] = [];
  return { calls, ciphertext: Buffer.from('fictional age ciphertext'), decrypt: async () => Buffer.from('PGDMPfictional dump'),
    createQuarantine: async () => { calls.push('quarantine'); }, restore: async () => { calls.push('restore'); },
    verify: async (stage: string) => { calls.push(stage); }, replay: async () => { calls.push('replay'); } };
}
test('corrupt ciphertext, wrong origin digest, truncated output and wrong key never touch a target', async () => {
  for (const fault of ['digest', 'wrong-key', 'partial', 'oversize']) {
    const p = ports();
    const expectedHash = fault === 'digest' ? '0'.repeat(64) : sha256(p.ciphertext);
    const decrypt = fault === 'wrong-key' ? async () => { throw Error('simulated age authentication failure'); }
      : fault === 'partial' ? async () => Buffer.from('PGDM')
        : fault === 'oversize' ? async () => Buffer.alloc(MAX_BYTES + 1) : p.decrypt;
    await assert.rejects(authenticatedRestore({ ...p, expectedHash, decrypt }));
    assert.deepEqual(p.calls, []);
  }
});
test('successful restore stays quarantined, verifies the snapshot, then replays twice before its pass', async () => {
  const p = ports(), clear = Buffer.from('PGDMPfictional dump');
  await authenticatedRestore({ ...p, expectedHash: sha256(p.ciphertext), decrypt: async () => clear });
  assert.deepEqual(p.calls, ['quarantine', 'restore', 'snapshot', 'replay', 'replayed', 'replay', 'idempotent']);
  assert.equal(clear.every(byte => byte === 0), true);
});
test('expired credentials, interrupted restore, bad integrity or failed tombstone replay cannot advance', async () => {
  for (const failure of ['quarantine', 'restore', 'snapshot', 'replay']) {
    const p = ports(), clear = Buffer.from('PGDMPfictional dump');
    const callbacks = { createQuarantine: p.createQuarantine, restore: p.restore, verify: p.verify, replay: p.replay };
    if (failure === 'snapshot') callbacks.verify = async () => { throw Error('snapshot mismatch'); };
    else {
      const field = failure === 'quarantine' ? 'createQuarantine' : failure === 'restore' ? 'restore' : 'replay';
      callbacks[field] = async () => { throw Error('injected failure'); };
    }
    await assert.rejects(authenticatedRestore({ ...p, ...callbacks, expectedHash: sha256(p.ciphertext), decrypt: async () => clear }));
    assert.equal(p.calls.includes('replayed'), false);
    assert.equal(clear.every(byte => byte === 0), true);
  }
});
test('SQL completion alone is never a pgTAP pass', () => {
  assert.equal(tapSummary([{ rows: [{ ok: 'ok 1 - boundary' }] }, { rows: [{ finish: '1..1' }] }]), 1);
  for (const rows of [[], [{ x: 'ok 1 - partial' }], [{ x: 'not ok 1 - leaked' }, { x: '1..1' }],
    [{ x: 'ok 1 - first' }, { x: '# Looks like you failed 1 test' }, { x: '1..1' }]]) assert.throws(() => tapSummary({ rows }));
});
test('failed child ownership cannot roll back retirement of verified newly created adults', async () => {
  const retired: string[] = [], operations: string[] = [];
  const database = { async query(sql: string, args: string[] = []) {
    operations.push(sql);
    if (sql.startsWith('select 1 from app_private.children')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('select id from auth.users')) return { rows: [{ id: args[0] }], rowCount: 1 };
    if (sql.startsWith('update auth.sessions')) retired.push(args[0]);
    return { rows: [], rowCount: 1 };
  } };
  await assert.rejects(retireOwnedIdentities(database, run, [
    { userId: 'guardian', email: `recovery-${run}-guardian@fixture.test`, label: 'guardian' },
    { userId: 'child', email: 'child@fixture.test', label: 'child', childId: 'child', familyId: 'family', guardianId: 'guardian' },
    { userId: 'independent', email: `recovery-${run}-independent@fixture.test`, label: 'independent' },
  ]));
  assert.deepEqual(retired, ['guardian', 'independent']);
  assert.equal(operations.at(-1), 'commit');
});
