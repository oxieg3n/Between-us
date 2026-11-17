import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sourceGuard } from '../recovery/guards.mjs';

const backend = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(backend, '../..');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function canonicalStorageJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStorageJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map(([key, value]) => `${JSON.stringify(key)}:${canonicalStorageJson(value)}`).join(',')}}`;
  return JSON.stringify(value);
}
const deny = () => { throw Error('Local synthetic storage benchmark safety check failed.'); };
let stage = 'arguments';
const familyId = 'b1000000-0000-4000-8000-000000000001';
const childId = 'b1000000-0000-4000-8000-000000000002';
const actors = { parent: 'b1000000-0000-4000-8000-000000000003', child: 'b1000000-0000-4000-8000-000000000004' };
const uuid = value => { const v = hash(value); return `${v.slice(0, 8)}-${v.slice(8, 12)}-4${v.slice(13, 16)}-8${v.slice(17, 20)}-${v.slice(20, 32)}`; };
export const TABLES = Object.freeze(['finance_aggregates', 'finance_events', 'finance_commands', 'finance_checkpoints',
  'finance_entity_ids', 'finance_archive_capsules', 'finance_archive_residency', 'finance_archive_entity_keys', 'finance_archive_current_entities',
  'finance_archived_occurrences', 'finance_archive_budget_heads', 'finance_archive_budget_periods',
  'finance_private_match_origins', 'finance_private_match_capsules', 'finance_private_match_residency',
  'finance_activity', 'finance_projection_snapshots']);
const temp = name => { if (!TABLES.includes(name)) deny(); return `pg_temp."benchmark_${name}"`; };

export function parseArguments(args) {
  if (!Array.isArray(args) || args.some(v => typeof v !== 'string') || new Set(args).size !== args.length) deny();
  const weeksFlag = args.find(v => v.startsWith('--weeks='));
  const weeks = weeksFlag ? weeksFlag.slice(8).split(',').map(Number) : [52, 260, 780];
  if (weeks.length < 1 || weeks.length > 3 || new Set(weeks).size !== weeks.length || weeks.some(n => !Number.isInteger(n) || n < 1 || n > 1040)) deny();
  const rest = args.filter(v => v !== weeksFlag);
  const execute = rest.includes('--execute');
  if (execute ? rest.length !== 2 || !rest.includes('--confirm-local-synthetic-benchmark')
    : rest.length > 1 || rest.length === 1 && rest[0] !== 'plan') deny();
  return { execute, weeks };
}
export function dryRunPlan(weeks) {
  return { format: 1, mode: 'dry-run', weeks, databaseConnected: false, statusFileRead: false, generatedPayloads: false,
    operation: 'LOCAL PostgreSQL temporary finance storage and indexed query benchmark',
    appTableWrites: false, temporaryTableNames: TABLES.map(name => `benchmark_${name}`),
    transaction: 'one owned connection; all temporary writes rolled back',
    required: ['canonical repository', 'local loopback sourceGuard', 'local_synthetic=true', 'all public/data/report flags=false', '--execute', '--confirm-local-synthetic-benchmark'],
    limits: { maximumWeeks: 1040, maximumScenarios: 3, edgeCpuMs: 2000, edgeMemoryBytes: 268435456, databaseBytes: 500000000 },
    hostedQualification: false, authoritativeArchiveProvenance: false };
}
export function policyGuard(policy) {
  if (!policy || policy.local_synthetic !== true || policy.public_enrollment_enabled !== false
    || policy.real_child_data_enabled !== false || policy.public_reports_enabled !== false) deny();
}

/** Consistent representative identities; all bindings below are synthetic, never SQL source-verification evidence. */
export function normalizeFixture(fixture) {
  if (!fixture || !Array.isArray(fixture.events) || !fixture.state || !Array.isArray(fixture.checkpointSnapshots)) deny();
  const identities = new Map([[fixture.state.children[0].id, childId]]);
  for (const event of fixture.events) {
    identities.set(event.id, `${actors[event.actor.role]}:${uuid(`operation:${event.id}`)}`);
    if (event.kind === 'assign_chore') {
      const chore = uuid(`chore:${event.choreId}`); identities.set(event.choreId, chore);
      for (const date of event.dates) identities.set(`${event.choreId}:${date}`, `${chore}:${date}`);
    }
    if (event.kind === 'create_goal') identities.set(event.goalId, uuid(`goal:${event.goalId}`));
  }
  const convertString = value => identities.get(value) ?? (value.endsWith(':match') && identities.has(value.slice(0, -6)) ? `${identities.get(value.slice(0, -6))}:match` : value);
  const convert = value => Array.isArray(value) ? value.map(convert) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, value]) => [convertString(key), convert(value)]))
    : typeof value === 'string' ? convertString(value) : value;
  return convert(fixture);
}

export function buildDataset(input) {
  const fixture = normalizeFixture(input), rows = Object.fromEntries(TABLES.map(name => [name, []]));
  const eventSequences = new Map(fixture.events.map((event, index) => [event.id, index + 1]));
  const sequenceFor = value => eventSequences.get(value) ?? 1;
  const checkpointIds = fixture.checkpointSnapshots.map((_, index) => uuid(`checkpoint:${index}`));
  const defaultCheckpoint = checkpointIds.at(-1);
  if ((fixture.capsules.length || fixture.privateCapsules.length) && !defaultCheckpoint) deny();
  rows.finance_aggregates.push({ family_id: familyId, revision: fixture.events.length, state: fixture.state, updated_at: fixture.at });
  const entities = new Map(), origins = new Map();
  const entity = (kind, id, sequence) => { const key = `${kind}:${id}`;
    if (!entities.has(key)) entities.set(key, { family_id: familyId, child_id: childId, kind, entity_id: id, source_sequence: sequence }); };
  fixture.events.forEach((event, index) => {
    const sequence = index + 1;
    rows.finance_events.push({ family_id: familyId, sequence, event_id: event.id, child_id: childId, payload: event });
    rows.finance_commands.push({ family_id: familyId, actor_id: actors[event.actor.role], operation_id: event.id.slice(-36), child_id: childId,
      fingerprint: hash(event), event_sequence: sequence, server_at: event.at });
    if (!fixture.eventActivity?.[index] || fixture.eventActivity[index].id !== event.id) deny();
    rows.finance_activity.push({ family_id: familyId, sequence, child_id: childId, event_id: event.id, kind: event.kind,
      event_at: event.at, actor_role: event.actor.role, activity: fixture.eventActivity[index] });
    if (event.kind === 'assign_chore') { entity('chore', event.choreId, sequence); for (const date of event.dates) entity('occurrence', `${event.choreId}:${date}`, sequence); }
    if (event.kind === 'create_goal') entity('goal', event.goalId, sequence);
    if (['allocate', 'transfer_goal'].includes(event.kind)) entity('allocation', event.id, sequence);
    if (['request_payout', 'prepare_payout'].includes(event.kind)) entity('payout', event.id, sequence);
    if (event.kind === 'report_payment') entity('payment', event.id, sequence);
    for (const effect of event.effects) if (effect.kind === 'match_committed') origins.set(effect.referenceId,
      { family_id: familyId, child_id: childId, match_id: effect.referenceId, source_sequence: sequence, cents: effect.cents, created_at: event.at });
  });
  rows.finance_entity_ids = [...entities.values()]; rows.finance_private_match_origins = [...origins.values()];
  if (!fixture.childProjection || !fixture.parentProjection) deny();
  rows.finance_projection_snapshots.push({ family_id: familyId, child_id: childId, last_sequence: fixture.events.length,
    child_projection: fixture.childProjection, parent_projection: fixture.parentProjection,
    child_projection_hash: hash(canonicalStorageJson(fixture.childProjection)), parent_projection_hash: hash(canonicalStorageJson(fixture.parentProjection)), updated_at: fixture.at });
  fixture.checkpointSnapshots.forEach((checkpoint, index) => {
    const through = fixture.events.filter(event => event.at <= checkpoint.lastEventAt).length;
    rows.finance_checkpoints.push({ id: checkpointIds[index], family_id: familyId, through_sequence: through, aggregate_revision: index + 1,
      previous_id: checkpointIds[index - 1] ?? null, previous_state_hash: hash(fixture.checkpointSnapshots[index - 1] ?? {}), state_hash: hash(checkpoint),
      covered_events_hash: hash({ syntheticBoundary: index }), covered_count: through, checkpoint, created_at: checkpoint.lastEventAt ?? fixture.at });
  });
  const costs = new Map();
  fixture.capsules.forEach((capsule, index) => {
    const id = uuid(`visible-capsule:${index}`);
    const keys = [...capsule.occurrences.map(o => ['occurrence', o.id]), ...capsule.payouts.flatMap(p => [['payout', p.id], ...p.payments.map(pay => ['payment', pay.id])]),
      ...capsule.allocations.map(a => ['allocation', a.id])];
    const sequence = Math.max(1, ...keys.map(([, id]) => sequenceFor(id)));
    rows.finance_archive_capsules.push({ id, family_id: familyId, child_id: childId, source_sequence: sequence, checkpoint_id: defaultCheckpoint,
      previous_state_hash: hash({ syntheticSource: index }), hash: hash(capsule), payload: capsule, created_at: fixture.at });
    rows.finance_archive_residency.push({ capsule_id: id, family_id: familyId, child_id: childId, active: true, hydrated_sequence: null });
    for (const [kind, entity_id] of keys) {
      rows.finance_archive_entity_keys.push({ family_id: familyId, child_id: childId, kind, entity_id, capsule_id: id, source_sequence: sequence });
      rows.finance_archive_current_entities.push({ family_id: familyId, child_id: childId, kind, entity_id, capsule_id: id });
    }
    for (const o of capsule.occurrences) costs.set(o.id, { family_id: familyId, child_id: childId, occurrence_id: o.id, chore_id: o.choreId,
      due_date: o.dueDate, reward_cents: o.rewardCents, budget_cents: ['cancelled', 'expired', 'declined'].includes(o.status) ? 0 : o.rewardCents,
      source_sequence: sequence, kind: 'occurrence' });
  });
  rows.finance_archived_occurrences = [...costs.values()];
  const book = fixture.state.checkpoint?.books[childId];
  const latestPlan = book?.plan ?? fixture.events.findLast(e => e.kind === 'configure_plan')?.plan;
  if (latestPlan) {
    if (latestPlan.period !== 'monthly') deny(); // Generator contract; no alternate calendar implementation.
    rows.finance_archive_budget_heads.push({ family_id: familyId, child_id: childId, period: latestPlan.period, anchor_date: latestPlan.anchorDate });
    const totals = new Map(); for (const row of costs.values()) { const key = row.due_date.slice(0, 7); totals.set(key, (totals.get(key) ?? 0) + row.budget_cents); }
    rows.finance_archive_budget_periods = [...totals].map(([period_key, total_cents]) => ({ family_id: familyId, child_id: childId, period_key, total_cents }));
  }
  fixture.privateCapsules.forEach((capsule, index) => {
    const id = uuid(`private-capsule:${index}`), origin = origins.get(capsule.match.id); if (!origin) deny();
    rows.finance_private_match_capsules.push({ id, family_id: familyId, child_id: childId, match_id: capsule.match.id, source_sequence: origin.source_sequence,
      checkpoint_id: defaultCheckpoint, previous_state_hash: hash({ syntheticSource: index }), hash: hash(capsule), payload: capsule, created_at: fixture.at });
    rows.finance_private_match_residency.push({ capsule_id: id, family_id: familyId, child_id: childId, match_id: capsule.match.id, active: true, hydrated_sequence: null });
  });
  return { rows, result: fixture.result, sample: { occurrenceId: rows.finance_archive_entity_keys.find(row => row.kind === 'occurrence')?.entity_id ?? 'no-archived-occurrence',
    periodKey: fixture.at.slice(0, 7), afterId: '00000000-0000-0000-0000-000000000000' } };
}

export function temporaryTableSql(name) {
  if (!TABLES.includes(name)) deny();
  return `create temporary table "benchmark_${name}" (like app_private."${name}" including all) on commit drop`;
}
async function populate(client, dataset) {
  for (const name of TABLES) {
    const rows = dataset.rows[name];
    if (!rows.length) continue;
    stage = `populate:${name}`;
    const keys = Object.keys(rows[0]); if (keys.some(key => !/^[a-z_]+$/.test(key))) deny();
    // Small batches bound parameter memory; jsonb_populate_record preserves actual column types/checks.
    for (let start = 0; start < rows.length; start += 100) await client.query(`insert into ${temp(name)} (${keys.map(key => `"${key}"`).join(',')})
      select ${keys.map(key => `r."${key}"`).join(',')} from jsonb_populate_recordset(null::${temp(name)}, $1::jsonb) r`, [JSON.stringify(rows.slice(start, start + 100))]);
  }
}
export function summarizeExplain(source) {
  const entry = source?.[0]; if (!entry?.Plan) deny();
  const summarize = node => ({ nodeType: node['Node Type'], actualRows: node['Actual Rows'], loops: node['Actual Loops'],
    actualTotalMs: node['Actual Total Time'], indexUsed: typeof node['Index Name'] === 'string',
    localReadBlocks: node['Local Read Blocks'] ?? 0, localHitBlocks: node['Local Hit Blocks'] ?? 0,
    children: (node.Plans ?? []).map(summarize) });
  return { planningMs: entry['Planning Time'], executionMs: entry['Execution Time'], plan: summarize(entry.Plan) };
}
async function queryPlans(client, sample) {
  const queries = {
    exactArchive: [`select c.payload from ${temp('finance_archive_current_entities')} k join ${temp('finance_archive_capsules')} c on c.id=k.capsule_id
      join ${temp('finance_archive_residency')} r on r.capsule_id=c.id and r.active
      where k.family_id=$1 and k.child_id=$2 and k.kind='occurrence' and k.entity_id=$3 limit 1`, [familyId, childId, sample.occurrenceId]],
    currentBudget: [`select total_cents from ${temp('finance_archive_budget_periods')} where family_id=$1 and child_id=$2 and period_key=$3 limit 1`, [familyId, childId, sample.periodKey]],
    maximumBudget: [`select total_cents from ${temp('finance_archive_budget_periods')} where family_id=$1 and child_id=$2 order by total_cents desc limit 1`, [familyId, childId]],
    historyPage: [`select c.payload from (select capsule_id from ${temp('finance_archive_residency')}
      where family_id=$1 and child_id=$2 and active and capsule_id>$3 order by capsule_id limit 20) r
      join ${temp('finance_archive_capsules')} c on c.id=r.capsule_id order by c.id`, [familyId, childId, sample.afterId]],
    parentHistoryPage: [`select c.payload from (select capsule_id from ${temp('finance_private_match_residency')}
      where family_id=$1 and child_id=$2 and active and capsule_id>$3 order by capsule_id limit 20) r
      join ${temp('finance_private_match_capsules')} c on c.id=r.capsule_id order by c.id`, [familyId, childId, sample.afterId]],
    activityPage: [`select activity from ${temp('finance_activity')} where family_id=$1 and child_id=$2 order by sequence desc limit 20`, [familyId, childId]],
    currentProjection: [`select child_projection,parent_projection from ${temp('finance_projection_snapshots')} where family_id=$1 and child_id=$2 limit 1`, [familyId, childId]],
  };
  return Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([name, [sql, args]]) => {
    const result = await client.query(`explain (analyze, buffers, format json) ${sql}`, args);
    return [name, summarizeExplain(result.rows[0]['QUERY PLAN'])];
  })));
}
async function footprints(client, dataset) {
  const values = [];
  for (const name of TABLES) {
    const size = (await client.query(`select pg_relation_size(oid)::text heap_bytes,pg_indexes_size(oid)::text index_bytes,
      case when reltoastrelid=0 then 0 else pg_total_relation_size(reltoastrelid) end::text toast_bytes,
      pg_total_relation_size(oid)::text total_bytes from pg_class where oid=$1::regclass`, [temp(name)])).rows[0];
    values.push({ table: name, rows: dataset.rows[name].length, heapBytes: Number(size.heap_bytes), indexBytes: Number(size.index_bytes),
      toastBytes: Number(size.toast_bytes), totalBytes: Number(size.total_bytes) });
  }
  return { tables: values, totalBytes: values.reduce((sum, value) => sum + value.totalBytes, 0) };
}
export function storageForecast(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 1) deny();
  return { measuredChildFinanceBytes: bytes, databaseBytes: 500000000, assumedUsableFraction: .7,
    assumptions: 'Linear child-copy finance-only estimate;30% headroom; excludes auth, messaging, notifications, backups and other application tables.',
    scenarios: [1, 2, 12].map(childrenPerFamily => ({ childrenPerFamily, estimatedMaximumFamilies: Math.floor(350000000 / (bytes * childrenPerFamily)),
      families: [10, 100, 500, 1000].map(families => ({ families, estimatedFinanceBytes: bytes * families * childrenPerFamily,
        withinAssumedFinanceBudget: bytes * families * childrenPerFamily <= 350000000 })) })) };
}
async function canonicalGuard() {
  if ((await realpath(root)).toLowerCase() !== 'd:\\projects\\betweenus'
    || await lstat('D:\\proejcts\\BetweenUs').then(() => true, error => error.code === 'ENOENT' ? false : deny())) deny();
}
async function sourceManifest() {
  const sources = ['services/backend/scripts/finance-checkpoint-storage-benchmark.mjs', 'services/backend/scripts/finance-checkpoint-benchmark.mjs',
    'apps/mobile/src/finance/engine.ts', 'apps/mobile/src/finance/checkpoint.ts', 'apps/mobile/src/finance/types.ts',
    'services/backend/supabase/migrations/202611160003_finance.sql', 'services/backend/supabase/migrations/202611160027_finance_checkpoints.sql',
    'services/backend/supabase/migrations/202611160028_finance_private_match_archives.sql',
    'services/backend/supabase/migrations/202611160029_finance_privacy_archives.sql',
    'services/backend/supabase/migrations/202611160030_finance_write_admission.sql'];
  return Object.fromEntries(await Promise.all(sources.map(async name => [name, hash(await readFile(path.join(root, name), 'utf8'))])));
}
export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (!options.execute) { console.log(JSON.stringify(dryRunPlan(options.weeks))); return; }
  stage = 'canonical-source-guards';
  await canonicalGuard();
  const status = JSON.parse((await readFile(path.join(backend, '.local/status.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const source = sourceGuard(status);
  const { default: pg } = await import('pg');
  const { checkpointLongevityFixture } = await import('./finance-checkpoint-benchmark.mjs');
  const { financeEventActivity, financeView } = await import('../../../apps/mobile/src/finance/engine.ts');
  const client = new pg.Client({ connectionString: source.href, connectionTimeoutMillis: 5000 });
  const report = { format: 1, scope: 'LOCAL synthetic PostgreSQL TEMP JSONB/TOAST/index storage benchmark; NOT authoritative archive provenance or hosted Edge qualification',
    measuredAt: new Date().toISOString(), node: process.version, appTableWrites: false, rollback: false,
    identityNormalization: 'Representative UUID chore/goal/child IDs and actorUUID:operationUUID event IDs; deterministic synthetic metadata hashes/bindings.',
    temporarySchemaSemantics: 'LIKE INCLUDING ALL copies actual column types, storage/compression settings, CHECK constraints and indexes; PostgreSQL LIKE does not copy foreign keys, RLS policies or triggers. All required columns populated explicitly; no source verification or circuit enforcement proof.',
    tablesExcluded: ['finance notification observations/signals', 'all nonfinance application tables'],
    hostedQualification: false, limits: { edgeCpuMs: 2000, edgeMemoryBytes: 268435456, databaseBytes: 500000000 }, scenarios: [], sourceSha256: await sourceManifest() };
  let connected = false, transaction = false;
  try {
    stage = 'connect';
    await client.connect(); connected = true;
    await client.query('begin'); transaction = true;
    await client.query("set local statement_timeout='60s'; set local lock_timeout='3s'; set local idle_in_transaction_session_timeout='60min'; set local search_path=pg_temp,pg_catalog");
    stage = 'deployment-policy';
    policyGuard((await client.query('select local_synthetic,public_enrollment_enabled,real_child_data_enabled,public_reports_enabled from app_private.deployment_policy where singleton')).rows[0]);
    report.postgresMajor = Math.floor(Number((await client.query("select current_setting('server_version_num') version")).rows[0].version) / 10000);
    report.actualSchemaSha256 = hash((await client.query(`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,
      coalesce(pg_get_expr(d.adbin,d.adrelid),'') default_expr,
      (select coalesce(json_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid),'[]') from pg_index i where i.indrelid=c.oid) indexes
      from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='app_private' and c.relname=any($1::text[]) order by c.relname,a.attnum`, [TABLES])).rows);
    for (const name of TABLES) { stage = `clone:${name}`; await client.query(temporaryTableSql(name)); }
    for (const weeks of options.weeks) {
      for (const name of TABLES) await client.query(`truncate ${temp(name)}`);
      stage = 'local-node-generation';
      const cpu = process.cpuUsage(), started = performance.now(), fixture = checkpointLongevityFixture({ weeks });
      fixture.eventActivity = financeEventActivity({ timezone: fixture.state.timezone, children: fixture.state.children, events: fixture.events });
      fixture.childProjection = financeView(fixture.state, { role: 'child', childId: fixture.state.children[0].id }, fixture.state.children[0].id, fixture.at);
      fixture.parentProjection = financeView(fixture.state, { role: 'parent' }, fixture.state.children[0].id, fixture.at);
      const dataset = buildDataset(fixture), elapsed = process.cpuUsage(cpu);
      const generator = { wallMs: performance.now() - started, cpuMs: (elapsed.user + elapsed.system) / 1000,
        memory: process.memoryUsage(), perCommand: fixture.result, environment: 'local Node generation+normalization; current process RSS/heap includes runner and prior scenarios, not peak perrequest physical memory or Edge CPU' };
      const populateStarted = performance.now(); await populate(client, dataset);
      for (const name of TABLES) await client.query(`analyze ${temp(name)}`);
      stage = 'footprints-and-explain';
      const storage = await footprints(client, dataset), plans = await queryPlans(client, dataset.sample);
      report.scenarios.push({ weeks, generator, populateAndAnalyzeMs: performance.now() - populateStarted, storage, plans, forecast: storageForecast(storage.totalBytes) });
    }
    stage = 'rollback'; await client.query('rollback'); transaction = false; report.rollback = true;
  } finally {
    if (transaction) await client.query('rollback').catch(() => {});
    if (connected) await client.end().catch(() => {});
  }
  stage = 'write-sanitized-report';
  const folder = path.join(root, 'spec/production/staging/finance-checkpoints'); await mkdir(folder, { recursive: true });
  if ((await realpath(folder)).toLowerCase() !== folder.toLowerCase()) deny();
  const filename = `local-postgres-storage-${new Date().toISOString().replaceAll(/[^0-9]/g, '')}-${uuid(String(performance.now())).slice(0, 8)}.json`;
  await writeFile(path.join(folder, filename), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'PASS', report: `spec/production/staging/finance-checkpoints/${filename}`, rollback: report.rollback,
    scenarios: report.scenarios.map(value => ({ weeks: value.weeks, financeBytes: value.storage.totalBytes })), hostedQualification: false }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error(JSON.stringify({ status: 'FAIL', stage, message: 'Local synthetic finance storage benchmark failed; no connection details or database errors emitted.' })); process.exitCode = 1;
});
