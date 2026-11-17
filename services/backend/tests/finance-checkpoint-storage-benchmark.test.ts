import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { applyFinanceCommand, checkpointState, exportBooks, financeEventActivity, financeView } from '../../../apps/mobile/src/finance/engine.ts';
import { compactBook, compactPrivateMatches } from '../../../apps/mobile/src/finance/checkpoint.ts';
import type { FinanceCommand, FinanceState } from '../../../apps/mobile/src/finance/types.ts';
import { financeDigest } from '../src/finance-checkpoints.ts';
// @ts-expect-error Executable benchmark helpers are JavaScript and deliberately import no database client in dry-run mode.
import { buildDataset, dryRunPlan, normalizeFixture, parseArguments, policyGuard, storageForecast, summarizeExplain, TABLES, temporaryTableSql } from '../scripts/finance-checkpoint-storage-benchmark.mjs';
// @ts-expect-error Reuse the real, independently owned pure-engine generator.
import { checkpointLongevityFixture } from '../scripts/finance-checkpoint-benchmark.mjs';

test('storage CLI dry-run is plain Node, offline, and requires both exact execution flags', async () => {
  assert.deepEqual(parseArguments([]), { execute: false, weeks: [52, 260, 780] });
  assert.deepEqual(parseArguments(['--execute', '--confirm-local-synthetic-benchmark', '--weeks=52,1040']), { execute: true, weeks: [52, 1040] });
  for (const args of [['--execute'], ['--confirm-local-synthetic-benchmark'], ['--execute', '--confirm-local-synthetic-benchmark', '--remote'],
    ['--weeks=0'], ['--weeks=1041'], ['--weeks=1,2,3,4'], ['--weeks=1,1'], ['--weeks=NaN'], ['plan', 'plan']]) assert.throws(() => parseArguments(args));
  const script = fileURLToPath(new URL('../scripts/finance-checkpoint-storage-benchmark.mjs', import.meta.url));
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [script, 'plan', '--weeks=52']);
  assert.equal(stderr, ''); const plan = JSON.parse(stdout);
  assert.equal(plan.databaseConnected, false); assert.equal(plan.statusFileRead, false);
  assert.equal(plan.generatedPayloads, false); assert.equal(plan.appTableWrites, false);
  assert.equal(plan.hostedQualification, false); assert.deepEqual(plan.weeks, [52]);
  assert.deepEqual(dryRunPlan([52]), plan);
});

test('policy and fixed TEMP table allowlists reject uncertain or public-enabled environments', () => {
  const policy = { local_synthetic: true, public_enrollment_enabled: false, real_child_data_enabled: false, public_reports_enabled: false };
  assert.doesNotThrow(() => policyGuard(policy));
  for (const key of Object.keys(policy)) {
    assert.throws(() => policyGuard({ ...policy, [key]: !policy[key as keyof typeof policy] }));
    assert.throws(() => policyGuard({ ...policy, [key]: undefined }));
  }
  assert.throws(() => temporaryTableSql('families')); assert.throws(() => temporaryTableSql('finance_events;delete from app_private.families'));
  for (const table of TABLES) assert.equal(temporaryTableSql(table), `create temporary table "benchmark_${table}" (like app_private."${table}" including all) on commit drop`);
});

test('actual engine payloads retain every identity relationship after representative UUID normalization', async () => {
  const generated = checkpointLongevityFixture({ weeks: 1 });
  const id = generated.state.children[0].id, at = generated.at;
  let state: FinanceState = generated.state;
  const send = (action: Record<string, unknown>, role: 'parent' | 'child') => {
    const commandId = `storage-extra-${generated.events.length}`;
    state = applyFinanceCommand(state, role === 'parent' ? { role } : { role, childId: id }, { ...action, id: commandId, childId: id, at } as FinanceCommand);
    generated.events.push(state.events.at(-1)); return commandId;
  };
  const own = financeView(state, { role: 'child', childId: id }, id, at).goals[0].ownCents;
  send({ kind: 'release_goal', goalId: 'goal', amountCents: own, note: 'Fictional settlement' }, 'child');
  const payoutId = send({ kind: 'request_payout', amountCents: own }, 'child');
  send({ kind: 'report_payment', payoutId, amountCents: own, method: 'manual', paidAt: at }, 'parent');
  const visible = compactBook(exportBooks(state)[id], id), privateResult = compactPrivateMatches(visible.book, id, at, state.timezone);
  assert.ok(visible.capsules.length > 0); assert.ok(privateResult.capsules.length > 0);
  generated.state = checkpointState(state, { [id]: privateResult.book }); generated.capsules.push(...visible.capsules);
  generated.privateCapsules.push(...privateResult.capsules); generated.checkpointSnapshots.push(generated.state.checkpoint);
  generated.eventActivity = financeEventActivity({ timezone: state.timezone, children: state.children, events: generated.events });
  generated.childProjection = financeView(generated.state, { role: 'child', childId: id }, id, at);
  generated.parentProjection = financeView(generated.state, { role: 'parent' }, id, at);
  const normalized = normalizeFixture(generated), dataset = buildDataset(generated);
  assert.equal(normalized.state.children[0].id.length, 36);
  for (const event of normalized.events) assert.match(event.id, /^[a-f0-9-]{36}:[a-f0-9-]{36}$/);
  assert.equal(dataset.rows.finance_events.length, generated.events.length);
  assert.equal(dataset.rows.finance_commands.length, generated.events.length);
  assert.equal(dataset.rows.finance_activity.length, generated.events.length);
  assert.equal(dataset.rows.finance_projection_snapshots.length, 1);
  const registry = new Set(dataset.rows.finance_entity_ids.map((row: { kind: string; entity_id: string }) => `${row.kind}:${row.entity_id}`));
  const origins = new Set(dataset.rows.finance_private_match_origins.map((row: { match_id: string }) => row.match_id));
  for (const row of dataset.rows.finance_archive_entity_keys) assert.ok(registry.has(`${row.kind}:${row.entity_id}`));
  for (const row of dataset.rows.finance_private_match_capsules) assert.ok(origins.has(row.match_id));
  for (const row of dataset.rows.finance_archive_capsules) for (const occurrence of row.payload.occurrences) {
    assert.match(occurrence.choreId, /^[a-f0-9-]{36}$/); assert.equal(occurrence.id, `${occurrence.choreId}:${occurrence.dueDate}`);
  }
  assert.equal(dataset.rows.finance_archive_current_entities.length, dataset.rows.finance_archive_entity_keys.length);
  assert.equal(dataset.rows.finance_archive_residency.every((row: { family_id: string; child_id: string }) => row.family_id && row.child_id), true);
  const sum = dataset.rows.finance_archived_occurrences.reduce((total: number, row: { budget_cents: number }) => total + row.budget_cents, 0);
  assert.equal(sum, 700); assert.equal(dataset.rows.finance_archive_budget_periods[0].total_cents, 700);
  assert.equal(JSON.stringify(dataset.rows.finance_projection_snapshots[0].child_projection).includes('sourceCents'), false);
  const snapshot = dataset.rows.finance_projection_snapshots[0];
  assert.equal(snapshot.child_projection_hash, await financeDigest(snapshot.child_projection));
  assert.equal(snapshot.parent_projection_hash, await financeDigest(snapshot.parent_projection));
});

test('query evidence strips literals and source metadata and forecasts state explicit finance-only assumptions', () => {
  const safe = summarizeExplain([{ 'Planning Time': .2, 'Execution Time': .4, Plan: { 'Node Type': 'Index Scan', 'Actual Rows': 1,
    'Actual Loops': 1, 'Actual Total Time': .3, 'Index Name': 'private-index-name', 'Index Cond': 'sensitive literal',
    'Relation Name': 'private-table-name', 'Output': ['private field'] } }]);
  const json = JSON.stringify(safe);
  assert.equal(json.includes('private'), false); assert.equal(json.includes('sensitive'), false); assert.equal(safe.plan.indexUsed, true);
  assert.equal(safe.plan.actualRows, 1);
  const forecast = storageForecast(1_000_000);
  assert.equal(forecast.databaseBytes, 500_000_000); assert.equal(forecast.scenarios[0].estimatedMaximumFamilies, 350);
  assert.deepEqual(forecast.scenarios[0].families.map((row: { families: number }) => row.families), [10, 100, 500, 1000]);
  assert.throws(() => storageForecast(0)); assert.throws(() => storageForecast(Infinity));
});
