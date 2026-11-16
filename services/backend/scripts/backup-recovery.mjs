import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { readFile, writeFile, mkdir, statfs, realpath, lstat, link } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { CONTAINER, MAX_BYTES, SCHEMAS, sha256, fail, sourceGuard, targetGuard, spaceGuard, versionGuard,
  authenticatedRestore, tapSummary, tombstoneGuard, safeFailure } from '../recovery/guards.mjs';
import { createFixture, fixtureRecord, revokeFixture, retireOwnedIdentities } from '../recovery/fixture.mjs';
import { inventory, assertSnapshot, quarantineGuard, replayFixture, assertReplay, withClaims } from '../recovery/database.mjs';

const backend = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const privateRoot = path.join(backend, '.local', 'recovery');
const tools = path.join(backend, '.local', 'tools', 'age-v1.3.2', 'age');
const age = path.join(tools, 'age.exe'), keygen = path.join(tools, 'age-keygen.exe');
// Populated only after the root operator verifies the pinned upstream archive and reviews the extracted tools.
const AGE_HASH = '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0';
const KEYGEN_HASH = '1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c';
const TOOL_RELEASE = { version: '1.3.2', archiveBytes: 20250704,
  archiveSha256: 'f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7', license: 'BSD-3-Clause' };

async function processBytes(executable, args, input, maximum = MAX_BYTES) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: backend, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AGEDEBUG: '', PGPASSWORD: '', PGOPTIONS: '', PGSERVICE: '', PGSERVICEFILE: '' } });
    const chunks = []; let size = 0, rejected = false;
    const stop = () => { if (!rejected) { rejected = true; child.kill(); chunks.forEach(bytes => bytes.fill(0)); reject(Error('Recovery subprocess failed.')); } };
    const timer = setTimeout(stop, 120000);
    child.on('error', stop);
    child.stdout.on('data', bytes => { size += bytes.length; if (size > maximum) stop(); else chunks.push(bytes); });
    child.stderr.on('data', () => {}); // Provider/SQL/tool diagnostics are never printed or written into reports.
    child.stdin.on('error', stop);
    child.on('close', code => { clearTimeout(timer); if (code !== 0) stop(); else if (!rejected) resolve(Buffer.concat(chunks)); });
    child.stdin.end(input);
  });
}
const docker = (program, args, input, cap) => processBytes('docker', ['exec', '-i', CONTAINER, program, ...args], input, cap);
async function encryptedDump(snapshotId, recipient) {
  const options = { cwd: backend, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] };
  const dump = spawn('docker', ['exec', '-i', CONTAINER, 'pg_dump', '--username=supabase_admin', '--dbname=postgres', '--format=custom',
    '--no-publications', '--no-subscriptions', `--snapshot=${snapshotId}`, ...SCHEMAS.map(schema => `--schema=${schema}`)], options);
  const encryption = spawn(age, ['--encrypt', '--recipient', recipient], options);
  let plaintextBytes = 0, ciphertextBytes = 0;
  const ciphertext = [];
  const stop = () => { dump.kill(); encryption.kill(); };
  const timer = setTimeout(stop, 120000);
  const completion = child => new Promise((resolve, reject) => {
    child.on('error', () => { stop(); reject(Error('Recovery encrypted stream failed.')); });
    child.on('close', code => code === 0 ? resolve() : (stop(), reject(Error('Recovery encrypted stream failed.'))));
    child.stderr.on('data', () => {});
  });
  const bounded = new Transform({ transform(bytes, encoding, callback) {
    plaintextBytes += bytes.length;
    callback(plaintextBytes > MAX_BYTES ? Error('Recovery encrypted stream exceeded its limit.') : null, bytes);
  } });
  encryption.stdout.on('data', bytes => { ciphertextBytes += bytes.length; if (ciphertextBytes > MAX_BYTES) stop(); else ciphertext.push(bytes); });
  dump.stdin.end();
  try {
    await Promise.all([completion(dump), completion(encryption), pipeline(dump.stdout, bounded, encryption.stdin)]);
    if (!plaintextBytes || ciphertextBytes > MAX_BYTES) fail();
    return Buffer.concat(ciphertext);
  } catch { stop(); fail(); } finally { clearTimeout(timer); }
}
async function protectedDirectory(directory) {
  await mkdir(directory, { mode: 0o700 }); // Exclusive creation: never inherit ownership of an older drill.
  if (process.platform === 'win32') {
    const identity = (await processBytes('whoami', ['/user', '/fo', 'csv', '/nh'], undefined, 4096)).toString();
    const sid = identity.match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid) fail();
    await processBytes('icacls', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], undefined, 8192);
  }
}
async function writeExclusive(file, value) {
  await writeFile(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
}
async function trustedTool(file, expected) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || !/^[a-f0-9]{64}$/.test(expected) || sha256(await readFile(file)) !== expected) fail();
  return file;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.length === 1 && args[0] === 'plan') {
    console.log(JSON.stringify({ operation: 'isolated-local-synthetic-recovery', mode: 'dry-run', source: 'loopback:54322/postgres',
      container: CONTAINER, schemas: SCHEMAS, tool: TOOL_RELEASE, encryptionBeforePersistence: true,
      writes: 'new run-scoped synthetic fixture, encrypted private files, unique quarantined database only',
      hostedDR: false, offsiteCopy: false, providerDeletion: false, journalRecovery: false })); return;
  }
  if (JSON.stringify(args) !== JSON.stringify(['drill', '--execute', '--confirm-local-synthetic-recovery'])) fail();
  const canonical = await realpath(path.resolve(backend, '../..'));
  if (canonical.toLowerCase() !== 'd:\\projects\\betweenus' || await lstat('D:\\proejcts\\BetweenUs').then(() => true, e => e.code === 'ENOENT' ? false : fail())) fail();
  const status = JSON.parse((await readFile(path.join(backend, '.local/status.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const sourceUrl = sourceGuard(status);
  // Root verified this existing local account with the existing protected password; hosted credentials are never accepted.
  sourceUrl.username = 'supabase_admin';
  await trustedTool(age, AGE_HASH); await trustedTool(keygen, KEYGEN_HASH);
  if ((await processBytes(age, ['--version'], undefined, 128)).toString().trim() !== 'v1.3.2') fail();
  const source = new pg.Client({ connectionString: sourceUrl.href, connectionTimeoutMillis: 5000 });
  let target;
  const runId = randomUUID().replaceAll('-', ''), name = targetGuard(`betweenus_recovery_${runId}`, runId);
  const report = { format: 1, runId, scope: 'LOCAL synthetic logical recovery', status: 'FAIL', sourceDatabaseMutations: 'new owned fixture only',
    hostedDR: false, offsiteCopy: false, providerDeletion: false, journalRecovery: false, targetQuarantined: true,
    tool: TOOL_RELEASE, startedAt: new Date().toISOString(), stage: 'source-preflight' };
  let run;
  const identities = [];
  try {
    await source.connect();
    const policy = (await source.query(`select local_synthetic,public_enrollment_enabled,real_child_data_enabled,public_reports_enabled
      from app_private.deployment_policy where singleton`)).rows[0];
    if (!policy?.local_synthetic || policy.public_enrollment_enabled || policy.real_child_data_enabled || policy.public_reports_enabled) fail();
    const database = (await source.query(`select current_setting('server_version_num') version,pg_database_size(current_database())::int bytes,
      (select rolsuper from pg_roles where rolname=current_user) superuser`)).rows[0];
    if (database.superuser !== true) fail();
    const dumpVersion = (await docker('pg_dump', ['--version'], undefined, 256)).toString().trim();
    const restoreVersion = (await docker('pg_restore', ['--version'], undefined, 256)).toString().trim();
    versionGuard(database.version, dumpVersion, restoreVersion);
    const disk = await statfs(path.join(backend, '.local'));
    spaceGuard(disk.bavail * disk.bsize, database.bytes);
    report.databaseVersion = database.version; report.dumpVersion = dumpVersion;
    await mkdir(privateRoot, { recursive: true, mode: 0o700 });
    if ((await realpath(privateRoot)).toLowerCase() !== privateRoot.toLowerCase()) fail();
    run = path.join(privateRoot, runId); await protectedDirectory(run);
    // Keys and encrypted archives are in distinct ACL-protected directories, both local for this drill.
    const keys = path.join(run, 'keys'), archives = path.join(run, 'archives'), registry = path.join(run, 'registry');
    await protectedDirectory(keys); await protectedDirectory(archives); await protectedDirectory(registry);
    const identity = path.join(keys, 'identity.txt'), wrongIdentity = path.join(keys, 'wrong-identity.txt');
    await processBytes(keygen, ['--output', identity], undefined, 4096);
    await processBytes(keygen, ['--output', wrongIdentity], undefined, 4096);
    const recipient = (await processBytes(keygen, ['-y', identity], undefined, 256)).toString().trim();
    if (!/^age1[0-9a-z]{58}$/.test(recipient)) fail();
    const encrypt = async bytes => processBytes(age, ['--encrypt', '--recipient', recipient], bytes);
    const decrypt = async (bytes, key = identity) => processBytes(age, ['--decrypt', '--identity', key], bytes);
    await writeExclusive(path.join(archives, 'construction-0.age'), await encrypt(Buffer.from(JSON.stringify({ runId,
      guardianEmail: `recovery-${runId}-guardian@fixture.test`, verifierEmail: `recovery-${runId}-independent@fixture.test`,
      source: 'local-only', identities: [] }))));
    report.stage = 'new-managed-fixture';
    const fixture = await createFixture(status, source, runId, async identityRecord => {
      identities.push(identityRecord);
      await writeExclusive(path.join(archives, `construction-${identities.length}.age`), await encrypt(Buffer.from(JSON.stringify({ runId, identities }))));
    }, operation => { report.operation = operation; });
    const f = fixtureRecord(fixture);
    report.ownFixtureCreated = true;
    report.stage = 'snapshot-encrypted-export';
    await source.query('begin isolation level repeatable read read only');
    let snapshot, encrypted, snapshotAt;
    try {
      const state = (await source.query('select pg_export_snapshot() as snapshot_id,clock_timestamp() as observed_at')).rows[0];
      if (!/^[A-Fa-f0-9-]+$/.test(state.snapshot_id)) fail();
      snapshotAt = state.observed_at.toISOString();
      snapshot = await inventory(source);
      encrypted = await encryptedDump(state.snapshot_id, recipient);
      await source.query('commit');
    } catch (error) { await source.query('rollback'); throw error; }
    const ciphertextHash = sha256(encrypted);
    const partial = path.join(archives, 'snapshot.age.partial'), backup = path.join(archives, 'snapshot.age');
    await writeExclusive(partial, encrypted);
    // link() publishes without replacing any existing destination; the encrypted partial is retained as evidence.
    await link(partial, backup);
    const trustedRegistry = { format: 1, runId, ciphertextHash, snapshotAt, snapshot,
      archive: 'snapshot.age', tool: TOOL_RELEASE, operatorOriginVerification: 'local root only; off-host registry not qualified' };
    await writeExclusive(path.join(registry, 'snapshot.json'), trustedRegistry);
    report.stage = 'source-owned-post-snapshot-revocation';
    const tombstone = await revokeFixture(source, fixture, ciphertextHash, snapshotAt);
    report.sourcePostSnapshotRevocation = true; report.sourceManagedOldTokenDenied = tombstone.sourceManagedOldTokenDenied;
    const tombstoneBytes = await encrypt(Buffer.from(JSON.stringify(tombstone)));
    await writeExclusive(path.join(archives, 'post-snapshot-tombstones.age'), tombstoneBytes);
    await writeExclusive(path.join(registry, 'tombstone.json'), { runId, snapshotHash: ciphertextHash, ciphertextHash: sha256(tombstoneBytes) });
    await writeExclusive(path.join(archives, 'fixture.age'), await encrypt(Buffer.from(JSON.stringify(f))));
    report.backup = { ciphertextHash, ciphertextBytes: encrypted.length, snapshotAt, tableCount: snapshot.tables.length,
      totalRows: snapshot.tables.reduce((n, table) => n + table.count, 0), migrations: snapshot.migrations };
    report.stage = 'actual-age-faults';
    const faults = {};
    for (const kind of ['corruption', 'truncation', 'wrongKey']) {
      const bytes = Buffer.from(encrypted);
      if (kind === 'corruption') bytes[bytes.length - 25] ^= 1;
      const damaged = kind === 'truncation' ? bytes.subarray(0, bytes.length - 20) : bytes;
      let denied = false;
      try { const clear = await decrypt(damaged, kind === 'wrongKey' ? wrongIdentity : identity); clear.fill(0); }
      catch { denied = true; }
      if (!denied) fail();
      faults[kind] = 'maintained age CLI denied before target creation';
    }
    report.faults = faults;
    const restoreStarted = performance.now();
    const trusted = JSON.parse(await readFile(path.join(registry, 'snapshot.json'), 'utf8'));
    const trustedTombstone = JSON.parse(await readFile(path.join(registry, 'tombstone.json'), 'utf8'));
    if (trusted.runId !== runId || trusted.ciphertextHash !== ciphertextHash || trustedTombstone.runId !== runId
      || trustedTombstone.snapshotHash !== ciphertextHash || trustedTombstone.ciphertextHash !== sha256(tombstoneBytes)) fail();
    const tombstoneClear = await decrypt(tombstoneBytes);
    let replay;
    try { replay = tombstoneGuard(JSON.parse(tombstoneClear.toString()), runId, trusted.ciphertextHash, f.subjects, trusted.snapshotAt); }
    finally { tombstoneClear.fill(0); }
    let replayDigest;
    await authenticatedRestore({ ciphertext: await readFile(backup), expectedHash: trusted.ciphertextHash, decrypt,
      createQuarantine: async () => {
        report.stage = 'create-quarantined-target';
        // No --create/--clean/overwrite path exists. This name is generated once and cannot be supplied by a caller.
        if ((await source.query('select 1 from pg_database where datname=$1', [name])).rowCount) fail();
        await source.query(`create database "${name}" with template template0 connection limit 0`);
        await source.query(`comment on database "${name}" is 'BetweenUs isolated synthetic recovery ${runId}'`);
        await source.query(`revoke connect on database "${name}" from public`);
        const roles = (await source.query('select rolname from pg_roles where not rolsuper')).rows;
        for (const role of roles) {
          if (!/^[a-z_][a-z0-9_]*$/.test(role.rolname)) fail();
          await source.query(`revoke connect on database "${name}" from "${role.rolname}"`);
        }
        const targetUrl = new URL(sourceUrl.href); targetUrl.pathname = `/${name}`;
        target = new pg.Client({ connectionString: targetUrl.href, connectionTimeoutMillis: 5000 }); await target.connect();
        await quarantineGuard(target, name, runId);
        await target.query('create schema extensions; create extension pgcrypto with schema extensions');
        const owner = snapshot.extensionSchema[0]?.owner;
        if (!/^[a-z_][a-z0-9_]*$/.test(owner ?? '')) fail();
        await target.query(`alter schema extensions owner to "${owner}"`);
        await target.query('revoke all on schema extensions from public');
        for (const grant of snapshot.extensionSchema) {
          if (!['USAGE', 'CREATE'].includes(grant.privilege) || grant.owner !== owner
            || grant.grantee !== 'PUBLIC' && !/^[a-z_][a-z0-9_]*$/.test(grant.grantee)) fail();
          const grantee = grant.grantee === 'PUBLIC' ? 'public' : `"${grant.grantee}"`;
          await target.query(`grant ${grant.privilege} on schema extensions to ${grantee}${grant.grantable ? ' with grant option' : ''}`);
        }
      },
      restore: async clear => { report.stage = 'transactional-logical-restore'; await docker('pg_restore', ['--username=supabase_admin', `--dbname=${name}`, '--exit-on-error', '--single-transaction'], clear); },
      verify: async stage => {
        report.stage = `verify-${stage}`;
        await quarantineGuard(target, name, runId);
        if (stage === 'snapshot') {
          assertSnapshot(await inventory(target), snapshot);
          report.snapshotIntegrity = 'exact rows, table ACL/RLS, functions/policies, migrations';
          const suites = [];
          for (const file of ['finance.test.sql', 'communication.test.sql', 'privacy_lifecycle.test.sql', 'message_receipts.test.sql']) {
            report.stage = `restored-sql-${file}`;
            const sql = await readFile(path.join(backend, 'supabase/tests', file), 'utf8');
            suites.push({ file, sha256: sha256(sql), assertions: tapSummary(await target.query(sql)) });
          }
          report.restoredSqlSuites = suites;
          assertSnapshot(await inventory(target), snapshot);
          // Real persisted pre-snapshot commands replay against restored SQL, preserving the 400-cent earning.
          const parent = f.parentClaims;
          await withClaims(target, parent, 'authenticated', 'select api.send_message($1,$2,$3,$4)',
            [f.conversationId, 'Fictional recovery message.', f.clientId, 'later']);
          const scope = (await withClaims(target, parent, 'authenticated', 'select api.finance_scope($1,$2) value', [f.familyId, f.childId])).rows[0].value;
          const command = (await target.query('select fingerprint from app_private.finance_commands where family_id=$1 and actor_id=$2 and operation_id=$3',
            [f.familyId, f.subjects[0], f.financeOperationId])).rows[0];
          const result = (await withClaims(target, parent, 'service_role', 'select api.finance_load($1,$2,$3) value', [scope, f.financeOperationId, command.fingerprint])).rows[0].value;
          if (!result.replay) fail();
          const replayResult = (await withClaims(target, parent, 'service_role', 'select api.finance_commit($1,$2,$3,$4,$5,$6) value',
            [scope, f.financeOperationId, command.fingerprint, result.revision, result.state, result.serverAt])).rows[0].value;
          if (replayResult.status !== 'replayed') fail();
          let mismatchDenied = false;
          try { await withClaims(target, parent, 'service_role', 'select api.finance_load($1,$2,$3)', [scope, f.financeOperationId, '0'.repeat(64)]); }
          catch (error) { mismatchDenied = error.code === '22023'; }
          if (!mismatchDenied) fail();
          const earning = (await target.query("select count(*)::int n from app_private.finance_events where family_id=$1 and payload->>'kind'='review_chore' and payload->>'decision'='approved'", [f.familyId])).rows[0];
          if (earning.n !== 1) fail();
          const savedMessages = (await target.query('select count(*)::int n from app_private.messages where sender_id=$1 and client_id=$2', [f.subjects[0], f.clientId])).rows[0].n;
          if (savedMessages !== 1) fail();
          report.persistedIdempotency = { savedMessageUuidCount: savedMessages, approvalCount: earning.n, earnedCents: 400, changedBodyFinanceDenied: true };
        } else {
          report.replayAssertions = await assertReplay(target, f, name);
          const digest = sha256(JSON.stringify(await inventory(target)));
          if (stage === 'replayed') replayDigest = digest; else if (digest !== replayDigest) fail();
        }
      }, replay: () => { report.stage = 'replay-owned-tombstones'; return replayFixture(target, f, replay, ciphertextHash, name); } });
    report.restoreMilliseconds = Math.ceil(performance.now() - restoreStarted);
    report.snapshotAgeAtRecoveryMilliseconds = Math.max(0, Date.now() - Date.parse(snapshotAt));
    report.replayRuns = 2; report.status = 'PASS'; report.stage = 'complete-quarantine-retained'; report.completedAt = new Date().toISOString();
    await writeExclusive(path.join(registry, 'result.json'), report);
    console.log(JSON.stringify(report));
  } catch (error) {
    report.status = 'FAIL';
    Object.assign(report, safeFailure(error));
    throw error;
  } finally {
    if (report.status !== 'PASS' && identities.length) {
      await retireOwnedIdentities(source, runId, identities).then(() => { report.failedRunIdentityAccessRetired = true; }, () => { report.failedRunIdentityAccessRetired = false; });
    }
    if (target) await target.end();
    await source.end();
    if (run && report.status !== 'PASS') {
      await writeExclusive(path.join(run, 'failure.json'), { ...report, error: 'Root review required; owned resources retained, no automatic cleanup.' }).catch(() => {});
    }
  }
}
main().catch(() => { console.error('Recovery drill failed closed. Inspect private metadata and the reviewed source; no raw provider error is printed.'); process.exitCode = 1; });
