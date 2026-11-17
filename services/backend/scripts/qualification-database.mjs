import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { CONTAINER, MAX_BYTES, sourceGuard, targetGuard, versionGuard, fail, sha256, tapSummary, safeFailure } from '../recovery/guards.mjs';
import { inventory, financeArchiveIntegrity, quarantineGuard } from '../recovery/database.mjs';
import { migrationPlan, platformBootstrap, ownedProbePid, schemaParity, heldFinanceTransaction } from '../recovery/qualification.mjs';

const backend = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const migrations = path.join(backend, 'supabase/migrations');
async function command(program, args, input, maximum = MAX_BYTES) {
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: backend, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let size = 0, failed = false;
    const stop = () => { if (!failed) { failed = true; child.kill(); reject(Error('Qualification subprocess failed.')); } };
    const timeout = setTimeout(stop, 120000);
    child.on('error', stop); child.stderr.on('data', () => {}); child.stdin.on('error', stop);
    child.stdout.on('data', bytes => { size += bytes.length; if (size > maximum) stop(); else chunks.push(bytes); });
    child.on('close', code => { clearTimeout(timeout); if (code !== 0) stop(); else if (!failed) resolve(Buffer.concat(chunks)); });
    child.stdin.end(input);
  });
}
const docker = (program, args, input) => command('docker', ['exec', '-i', CONTAINER, program, ...args], input);
async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.length === 1 && args[0] === 'plan') {
    console.log(JSON.stringify({ mode: 'dry-run', operation: 'fresh-application-schema-qualification', migrations: 31,
      sourceWrites: false, creates: 'new quarantined database only', termination: 'own uncommitted probe connection only',
      hostedFreshInstall: false, financialCrashProof: false })); return;
  }
  if (JSON.stringify(args) !== JSON.stringify(['--execute', '--confirm-local-synthetic-qualification'])) fail();
  if ((await realpath(path.resolve(backend, '../..'))).toLowerCase() !== 'd:\\projects\\betweenus'
    || await lstat('D:\\proejcts\\BetweenUs').then(() => true, e => e.code === 'ENOENT' ? false : fail())) fail();
  const status = JSON.parse((await readFile(path.join(backend, '.local/status.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const sourceUrl = sourceGuard(status); sourceUrl.username = 'supabase_admin';
  const files = migrationPlan(await readdir(migrations));
  const runId = randomUUID().replaceAll('-', ''), name = targetGuard(`betweenus_qualification_${runId}`, runId, 'qualification');
  const source = new pg.Client({ connectionString: sourceUrl.href, connectionTimeoutMillis: 5000 });
  let target, output;
  const report = { format: 1, runId, status: 'FAIL', scope: 'LOCAL fresh app migration qualification', sourceWrites: false,
    targetQuarantined: true, hostedFreshInstall: false, financialCrashProof: false, stage: 'preflight', startedAt: new Date().toISOString() };
  try {
    await source.connect();
    const server = (await source.query(`select current_setting('server_version_num') version,
      (select rolsuper from pg_roles where rolname=current_user) superuser`)).rows[0];
    if (!server.superuser) fail();
    const dumpVersion = (await docker('pg_dump', ['--version'])).toString().trim();
    versionGuard(server.version, dumpVersion, (await docker('pg_restore', ['--version'])).toString().trim());
    const policy = (await source.query('select local_synthetic,public_enrollment_enabled,real_child_data_enabled,public_reports_enabled from app_private.deployment_policy where singleton')).rows[0];
    if (!policy.local_synthetic || policy.public_enrollment_enabled || policy.real_child_data_enabled || policy.public_reports_enabled) fail();
    const expected = await inventory(source);
    report.sourceArchives = await financeArchiveIntegrity(source);
    if (expected.migrations.length !== 31 || expected.migrations.at(-1) !== '202611160031') fail();
    const parent = path.join(backend, '.local/qualification'); await mkdir(parent, { recursive: true, mode: 0o700 });
    if ((await realpath(parent)).toLowerCase() !== parent.toLowerCase()) fail();
    output = path.join(parent, runId); await mkdir(output, { mode: 0o700 });
    report.stage = 'auth-schema-only-bootstrap';
    const exported = await docker('pg_dump', ['--username=supabase_admin', '--dbname=postgres', '--schema=auth',
      '--schema=supabase_migrations', '--schema-only', '--no-publications', '--no-subscriptions']);
    const bootstrap = platformBootstrap(exported.toString()); exported.fill(0);
    report.bootstrap = { schemas: ['auth', 'supabase_migrations'], rowsCopied: 0, omittedAppHooks: bootstrap.omittedHooks, sha256: bootstrap.sha256 };
    if ((await source.query('select 1 from pg_database where datname=$1', [name])).rowCount) fail();
    await source.query(`create database "${name}" with template template0 connection limit 0`);
    await source.query(`comment on database "${name}" is 'BetweenUs isolated synthetic qualification ${runId}'`);
    await source.query(`revoke connect on database "${name}" from public`);
    for (const { rolname } of (await source.query('select rolname from pg_roles where not rolsuper')).rows) {
      if (!/^[a-z_][a-z0-9_]*$/.test(rolname)) fail();
      await source.query(`revoke connect on database "${name}" from "${rolname}"`);
    }
    const targetUrl = new URL(sourceUrl.href); targetUrl.pathname = `/${name}`;
    target = new pg.Client({ connectionString: targetUrl.href }); await target.connect();
    await quarantineGuard(target, name, runId, 'qualification');
    await target.query('create schema extensions; create extension pgcrypto with schema extensions');
    const owner = expected.extensionSchema[0]?.owner;
    if (!/^[a-z_][a-z0-9_]*$/.test(owner ?? '')) fail();
    await target.query(`alter schema extensions owner to "${owner}"`);
    await target.query('revoke all on schema extensions from public');
    for (const grant of expected.extensionSchema) {
      if (!['USAGE', 'CREATE'].includes(grant.privilege) || grant.owner !== owner
        || grant.grantee !== 'PUBLIC' && !/^[a-z_][a-z0-9_]*$/.test(grant.grantee)) fail();
      await target.query(`grant ${grant.privilege} on schema extensions to ${grant.grantee === 'PUBLIC' ? 'public' : `"${grant.grantee}"`}${grant.grantable ? ' with grant option' : ''}`);
    }
    await docker('psql', ['--username=supabase_admin', `--dbname=${name}`, '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--single-transaction'], Buffer.from(bootstrap.sql));
    if ((await target.query('select count(*)::int n from auth.users')).rows[0].n !== 0) fail();
    // These are target-local platform prerequisites, never CONNECT or global role membership changes.
    await target.query('create publication supabase_realtime');
    await target.query('alter publication supabase_realtime owner to postgres');
    await target.query(`grant create on database "${name}" to postgres`);
    await target.query('set role postgres');
    report.migrations = [];
    for (const file of files) {
      report.stage = `migration-${file.slice(0, 12)}`;
      const sql = await readFile(path.join(migrations, file), 'utf8');
      await target.query(sql); // Preserve each migration's explicit BEGIN/COMMIT; no reset or wrapper rewrite.
      await target.query('insert into supabase_migrations.schema_migrations(version) values($1)', [file.slice(0, 12)]);
      report.migrations.push({ file, sha256: sha256(sql) });
    }
    await target.query('reset role');
    await quarantineGuard(target, name, runId, 'qualification');
    report.stage = 'fresh-schema-parity';
    const actual = await inventory(target); schemaParity(actual, expected);
    report.schemaParity = { tableCount: actual.tables.length, functionsPoliciesHash: actual.codeHash,
      structureHash: actual.structureHash,
      ownersRlsGrantsAndMigrationsEqual: true };
    const closed = (await target.query(`select not d.local_synthetic and not d.public_enrollment_enabled and not d.real_child_data_enabled
      and not d.public_reports_enabled and d.guardian_managed_children and not c.public_report_intake
      and not c.staffed_support_promises and not c.push_delivery_enabled and not p.execution_enabled and not p.retention_enabled closed
      from app_private.deployment_policy d cross join app_private.communication_policy c cross join app_private.privacy_lifecycle_policy p`)).rows[0];
    if (!closed?.closed) fail();
    report.freshDefaultsClosed = true;
    await target.query('update app_private.deployment_policy set local_synthetic=true where singleton');
    report.sqlSuites = [];
    for (const file of (await readdir(path.join(backend, 'supabase/tests'))).filter(file => file.endsWith('.test.sql')).sort()) {
      report.stage = `sql-${file}`;
      const sql = await readFile(path.join(backend, 'supabase/tests', file), 'utf8');
      report.sqlSuites.push({ file, sha256: sha256(sql), assertions: tapSummary(await target.query(sql)) });
    }
    report.freshArchiveIntegrity = await financeArchiveIntegrity(target);
    report.stage = 'owned-connection-crash';
    await quarantineGuard(target, name, runId, 'qualification');
    await target.query('create schema qualification_probe; create table qualification_probe.atomic_probe(id uuid primary key)');
    const application = `betweenus-qualification-${runId}`;
    const probe = new pg.Client({ connectionString: targetUrl.href, application_name: application });
    probe.on('error', () => {});
    try {
      await probe.connect();
      const own = (await probe.query('select pg_backend_pid() pid,current_database() database,current_setting(\'application_name\') application')).rows[0];
      const administrativePid = (await target.query('select pg_backend_pid() pid')).rows[0].pid;
      const pid = ownedProbePid(own, name, runId, administrativePid);
      await probe.query('begin'); await probe.query('insert into qualification_probe.atomic_probe(id) values($1)', [randomUUID()]);
      const killed = (await target.query(`select pg_terminate_backend($1) terminated where exists
        (select 1 from pg_stat_activity where pid=$1 and datname=$2 and application_name=$3)`, [pid, name, application])).rows[0];
      if (killed?.terminated !== true) fail();
    } finally { await probe.end().catch(() => {}); }
    if ((await target.query('select count(*)::int n from qualification_probe.atomic_probe')).rows[0].n !== 0) fail();
    const reconnected = new pg.Client({ connectionString: targetUrl.href, application_name: application });
    await reconnected.connect();
    try { if ((await reconnected.query('select count(*)::int n from qualification_probe.atomic_probe')).rows[0].n !== 0) fail(); }
    finally { await reconnected.end(); }
    await quarantineGuard(target, name, runId, 'qualification');
    report.crashProbe = { ownConnectionTerminated: true, uncommittedRowsAfterReconnect: 0, scope: 'disposable atomic probe; not a financial command crash' };
    report.stage = 'owned-financial-sql-transaction-crash';
    const financeSql = await readFile(path.join(backend, 'supabase/tests/finance.test.sql'), 'utf8');
    const financeHash = sha256(financeSql);
    if (financeHash !== '8916fe49dc5ad68d59c11edd4d9e90ff6954fe443c78e2f807a69618404f5311') fail();
    const finance = new pg.Client({ connectionString: targetUrl.href, application_name: application });
    finance.on('error', () => {});
    let family, financialTaps;
    const financialCounts = async connection => (await connection.query(`select
      (select count(*)::int from app_private.families where id=$1) families,
      (select count(*)::int from app_private.finance_events where family_id=$1) events,
      (select count(*)::int from app_private.finance_commands where family_id=$1) commands`, [family])).rows[0];
    const absent = counts => counts.families === 0 && counts.events === 0 && counts.commands === 0;
    try {
      await finance.connect();
      financialTaps = tapSummary(await finance.query(heldFinanceTransaction(financeSql)));
      if (financialTaps !== 31) fail();
      family = (await finance.query("select current_setting('test.finance_family') family")).rows[0].family;
      if (!/^[a-f0-9-]{36}$/.test(family)) fail();
      const staged = await financialCounts(finance);
      if (staged.families !== 1 || staged.events !== 2 || staged.commands !== 2) fail();
      // A separate privileged connection is the positive control that the financial transaction has not committed.
      if (!absent(await financialCounts(target))) fail();
      await quarantineGuard(target, name, runId, 'qualification');
      const own = (await finance.query("select pg_backend_pid() pid,current_database() database,current_setting('application_name') application")).rows[0];
      const administrativePid = (await target.query('select pg_backend_pid() pid')).rows[0].pid;
      const pid = ownedProbePid(own, name, runId, administrativePid);
      const killed = (await target.query(`select pg_terminate_backend($1) terminated where exists
        (select 1 from pg_stat_activity where pid=$1 and datname=$2 and application_name=$3)`, [pid, name, application])).rows[0];
      if (killed?.terminated !== true) fail();
    } finally { await finance.end().catch(() => {}); }
    if (!absent(await financialCounts(target))) fail();
    const recovered = new pg.Client({ connectionString: targetUrl.href, application_name: application });
    await recovered.connect();
    try { if (!absent(await financialCounts(recovered))) fail(); } finally { await recovered.end(); }
    await quarantineGuard(target, name, runId, 'qualification');
    report.financialCrashProof = true;
    report.financialSqlCrash = { sourceSha256: financeHash, heldTransactionTaps: financialTaps, stagedEvents: 2, stagedCommands: 2,
      externallyVisibleBeforeTermination: 0, familiesEventsCommandsAfterReconnect: 0, ownConnectionTerminated: true,
      scope: 'actual financial SQL transaction rollback; not network post-COMMIT recovery or an earned-cents claim' };
    report.status = 'PASS'; report.stage = 'complete-quarantine-retained'; report.completedAt = new Date().toISOString();
    await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(report));
  } catch (error) {
    report.status = 'FAIL'; Object.assign(report, safeFailure(error));
    if (target) await target.query('rollback').catch(() => {});
    if (output) await writeFile(path.join(output, 'failure.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }).catch(() => {});
    throw error;
  } finally { if (target) await target.end(); await source.end(); }
}
main().catch(() => { console.error('Fresh qualification failed closed; review private safe metadata. No source reset or cleanup occurred.'); process.exitCode = 1; });
