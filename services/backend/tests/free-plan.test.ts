import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FREE_QUOTAS, DEFAULT_CAPACITY_ASSUMPTIONS, estimateCapacity, assessUsage, OPERATION_LIMITS, PILOT_SCOPE_REQUIREMENTS } from '../src/free-plan.ts';
const { validateTarget, inventoryMigrations, runPreflight } = await import(new URL('../scripts/staging-preflight.mjs', import.meta.url).href);
const { prepareCommands } = await import(new URL('../scripts/staging-plan.mjs', import.meta.url).href);
const now = 1_000_000;
async function cleanTemporaryDirectory(dir: string) {
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('betweenus-'));
  await rm(dir, { recursive: true, force: true });
}
const sample = () => ({ plan: 'free', projectAvailable: true, collectedAtMs: now,
  metrics: Object.fromEntries(Object.keys(FREE_QUOTAS).map(k => [k, 0])) });
const target = () => ({ environment: 'hosted-staging', plan: 'free', projectRef: 'abcdefghijklmnopqrst', region: 'us-east-1',
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co', allowedOrigins: ['https://staging.example.org'],
  authRedirectUrls: ['between-us://auth/callback', 'https://staging.example.org/auth/callback'], syntheticOnly: true,
  publicEnrollmentEnabled: false, realChildDataEnabled: false, publicReportsEnabled: false, pushDeliveryEnabled: false, approvalId: 'OWNER_SYNTHETIC_STAGE' });

test('capacity scenarios repeat exactly and expose finance horizon, index overhead, backup egress and quotas', () => {
  for (const families of [3, 10, 100, 500]) {
    const result = estimateCapacity(families);
    assert.deepEqual(result, estimateCapacity(families));
    assert.equal(result.estimates.monthlyActiveUsers, families * 4);
    assert.equal(result.databaseComponents.financeBytes, families * 8 * 365 * 5000);
    assert.equal(result.backupEgressBytes, result.estimates.databaseBytes * 4);
    assert.equal(result.estimates.uncachedEgressBytes, Math.ceil(families * 4 * 100_000 * 30 * 1.1 + result.backupEgressBytes));
    assert.equal(result.hostingCapacityProven, false);
    assert.ok(result.assumptions.storedFinanceCommandBytes >= result.financeStorageMeasurement.bytesIncludingIndexes / result.financeStorageMeasurement.events);
    assert.equal(result.financeStorageMeasurement.sha256.length, 64);
  }
  assert.equal(PILOT_SCOPE_REQUIREMENTS.intendedFamilies, 3);
  assert.equal(PILOT_SCOPE_REQUIREMENTS.historyWindowMonths, 12);
  assert.equal(PILOT_SCOPE_REQUIREMENTS.financeForecastDays, 365);
  assert.equal(PILOT_SCOPE_REQUIREMENTS.enrollmentCapEnforced, false);
  assert.equal(PILOT_SCOPE_REQUIREMENTS.automaticFinancialDeletionApproved, false);
  assert.equal(estimateCapacity(3).estimates.databaseBytes, 112_514_311);
  assert.ok(estimateCapacity(3).estimates.databaseBytes < FREE_QUOTAS.databaseBytes);
  assert.ok(estimateCapacity(100).estimates.databaseBytes > FREE_QUOTAS.databaseBytes);
  assert.ok(estimateCapacity(500).estimates.edgeInvocations > FREE_QUOTAS.edgeInvocations);
  assert.ok(estimateCapacity(1000).estimates.peakRealtimeConnections > FREE_QUOTAS.peakRealtimeConnections);
  const cap = estimateCapacity(10).applicationCapacity;
  assert.equal(cap.limits.visibleEventsPerChild, 128); assert.equal(cap.limits.hiddenEventsPerChild, 32);
  assert.ok(cap.hotTailRolloverDays.visible! < 36); assert.ok(cap.hotTailRolloverDays.hidden! <= 80);
  assert.equal(cap.historyMode, 'validated_checkpoint_archive'); assert.equal(cap.settledHistoryRetained, true);
  assert.equal(cap.outstandingWorkCapacityProven, false); assert.equal(cap.hostedRuntimeCapacityProven, false); assert.equal(cap.automaticDeletion, false);
  assert.equal(estimateCapacity(10, { financeCommandsPerFamilyDay: 0 }).applicationCapacity.hotTailRolloverDays.visible, null);
  const short = estimateCapacity(10, { financeGrowthDays: 30 });
  assert.ok(short.estimates.databaseBytes < estimateCapacity(10).estimates.databaseBytes);
  assert.ok(estimateCapacity(10, { fullExportsPerMonth: 30 }).estimates.uncachedEgressBytes > estimateCapacity(10).estimates.uncachedEgressBytes);
});
test('capacity rejects nonfinite, unknown, unsafe and optimistic-invalid assumptions without mutation', () => {
  for (const n of [0, -1, 1.5, NaN, Infinity, 1_000_001]) assert.throws(() => estimateCapacity(n));
  for (const overrides of [{ retryMultiplier: 0 }, { activeAccountFraction: 2 }, { indexAndOverheadMultiplier: 0.9 },
    { accountsPerFamily: 0 }, { financeGrowthDays: NaN }, { fixedDatabaseBytes: -1 }, { logicalExportToDatabaseRatio: 0.5 }, { secret: 'sensitive-sentinel' }])
    assert.throws(() => estimateCapacity(10, overrides));
  assert.equal(DEFAULT_CAPACITY_ASSUMPTIONS.financeGrowthDays, 365);
});
test('operator usage bands cross 50/70/90 exactly; warning differs from hard rejection', () => {
  for (const [fraction, state, mutations, background] of [[0.49, 'normal', true, true], [0.5, 'warning', true, true], [0.7, 'restricted', true, false], [0.9, 'unavailable', false, false]] as const) {
    const input = sample(); input.metrics.databaseBytes = FREE_QUOTAS.databaseBytes * fraction;
    const result = assessUsage(input, now);
    assert.equal(result.state, state); assert.equal(result.allowMutations, mutations); assert.equal(result.allowBackgroundWork, background);
  }
});
test('every resource trips independently; input missing, stale, paused or carrying content fails closed', () => {
  for (const [name, quota] of Object.entries(FREE_QUOTAS)) {
    const input = sample(); input.metrics[name] = quota;
    assert.equal(assessUsage(input, now).state, 'unavailable');
  }
  const paused = sample(); paused.projectAvailable = false;
  assert.equal(assessUsage(paused, now).reason, 'provider_unavailable');
  assert.equal(assessUsage(sample(), now + OPERATION_LIMITS.usageFreshnessMs).reason, 'evaluated');
  assert.equal(assessUsage(sample(), now + OPERATION_LIMITS.usageFreshnessMs + 1).reason, 'stale_input');
  assert.equal(assessUsage(sample(), now - 1).reason, 'stale_input');
  for (const value of [null, [], {}, { ...sample(), plan: 'pro' }, { ...sample(), message: 'sensitive-sentinel' },
    { ...sample(), metrics: { ...sample().metrics, userId: 'sensitive-sentinel' } },
    { ...sample(), metrics: { ...sample().metrics, databaseBytes: NaN } },
    { ...sample(), metrics: { ...sample().metrics, databaseBytes: '10' } }]) {
    const result = assessUsage(value, now); assert.equal(result.allowMutations, false); assert.deepEqual(result.metrics, []);
    assert.ok(!JSON.stringify(result).includes('sensitive-sentinel'));
  }
});
test('hosted target requires exact reviewed Free staging metadata and explicit closed gates', () => {
  const good = target(); const allow = { schemaVersion: 1, targets: [good] };
  assert.deepEqual(validateTarget(good, allow), good);
  for (const patch of [{ environment: 'production' }, { plan: 'pro' }, { projectRef: 'staging' }, { projectRef: '12345678901234567890' },
    { supabaseUrl: good.supabaseUrl + '.evil.org' }, { syntheticOnly: false }, { publicEnrollmentEnabled: true }, { realChildDataEnabled: true },
    { pushDeliveryEnabled: true }, { publicReportsEnabled: true }, { approvalId: '' }, { extra: 'sensitive-sentinel' },
    { allowedOrigins: ['http://127.0.0.1:8081'] }, { allowedOrigins: ['https://*.example.org'] }, { allowedOrigins: ['https://name:password@example.org'] },
    { allowedOrigins: ['https://staging.example.org/'] }, { authRedirectUrls: ['https://evil.example.org/auth/callback'] },
    { authRedirectUrls: ['between-us://auth/callback?code=secret'] }, { authRedirectUrls: ['https://staging.example.org/auth/%63allback'] }]) {
    const invalid = { ...good, ...patch }; assert.throws(() => validateTarget(invalid, { schemaVersion: 1, targets: [invalid] }));
  }
  assert.throws(() => validateTarget(good, { schemaVersion: 1, targets: [] }));
  assert.throws(() => validateTarget({ ...good, region: 'eu-west-1' }, allow));
});
test('migration inventory hashes changed bytes and refuses pending/ambiguous files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'betweenus-migrations-'));
  try {
    const file = path.join(dir, '202611160001_first.sql'); await writeFile(file, 'select 1;');
    const before = await inventoryMigrations(dir); await writeFile(file, 'select 2;');
    assert.notEqual((await inventoryMigrations(dir))[0].sha256, before[0].sha256);
    await writeFile(path.join(dir, '202611160002_wait.sql.pending'), 'select 3;');
    await assert.rejects(inventoryMigrations(dir));
  } finally { await cleanTemporaryDirectory(dir); }
});
test('plan requires exact ref plus current fingerprint, prints explicit remote/skip-vault and never invents deploy dry-run', () => {
  const preflight = { mode: 'hosted-staging-preparation', target: target(), fingerprint: 'a'.repeat(64) };
  const confirmation = `PLAN:${preflight.target.projectRef}:${preflight.fingerprint}`;
  for (const bad of ['', 'yes', `PLAN:staging:${preflight.fingerprint}`, confirmation.replace(/a$/, 'b')]) assert.throws(() => prepareCommands(preflight, bad));
  const commands = prepareCommands(preflight, confirmation);
  assert.ok(commands.every((c: { argv: string[] }) => c.argv.includes('--remote=abcdefghijklmnopqrst')));
  assert.ok(commands[0].argv.includes('--dry-run')); assert.ok(commands[0].argv.includes('--skip-vault'));
  assert.ok(commands[1].argv.includes('--skip-vault')); assert.ok(!commands[2].argv.includes('--dry-run'));
  assert.ok(!JSON.stringify(commands).includes('--yes')); assert.ok(!JSON.stringify(commands).includes('--prune'));
  assert.throws(() => prepareCommands({ ...preflight, mode: 'local-inventory' }, confirmation));
  assert.throws(() => prepareCommands({ ...preflight, target: { ...target(), environment: 'production' } }, confirmation));
});
test('local preflight hashes source without network or credential reads and hosted target stays unapproved', async () => {
  const result = await runPreflight({ local: true });
  assert.equal(result.networkPerformed, false); assert.equal(result.credentialsRead, false);
  assert.equal(result.deploymentAuthorized, false); assert.equal(result.cliVersion, '3.1.0');
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/); assert.ok(result.migrations.length >= 24);
  assert.ok(result.artifacts.some((f: { name: string }) => f.name === 'src/free-plan.ts'));
  assert.ok(result.artifacts.some((f: { name: string }) => f.name === '../../apps/mobile/src/finance/engine.ts'));
  for (const name of ['../../apps/mobile/src/finance/checkpoint.ts', '../../apps/mobile/src/production/finance-history-types.ts']) {
    const artifact = result.artifacts.find((item: { name: string }) => item.name === name);
    assert.ok(artifact, `The reviewed plan must cover shared finance dependency ${name}`);
    assert.equal(artifact.sha256, createHash('sha256').update(await readFile(new URL(`../${name}`, import.meta.url))).digest('hex'));
  }
  await assert.rejects(runPreflight());
});
test('dashboard writes numeric-only offline sample, and refuses content-bearing input without echo', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'betweenus-budget-'));
  const script = new URL('../scripts/free-plan-dashboard.mjs', import.meta.url);
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(script), '--sample', '--output', dir], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(path.join(dir, 'dashboard.json'), 'utf8'));
    assert.equal(report.source, 'synthetic-sample'); assert.equal(report.enforcement, false); assert.equal(report.scenarios.length, 4);
    assert.ok((await readFile(path.join(dir, 'dashboard.html'), 'utf8')).includes('not hosting qualification'));
    const input = path.join(dir, 'input.json'); await writeFile(input, JSON.stringify({ ...sample(), message: 'sensitive-sentinel' }));
    const rejected = spawnSync(process.execPath, [fileURLToPath(script), '--input', input, '--output', dir], { encoding: 'utf8' });
    assert.equal(rejected.status, 1); assert.ok(!rejected.stderr.includes('sensitive-sentinel'));
  } finally { await cleanTemporaryDirectory(dir); }
});
