import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
// @ts-expect-error Runtime integration uses the installed PostgreSQL driver.
import pg from 'pg';
// @ts-expect-error Shared guarded ordinary ESM tooling.
import { sourceGuard } from '../../recovery/guards.mjs';
import { applyFinanceCommand, checkpointState, financeEventActivity, financeView, sealFinanceState } from '../../../../apps/mobile/src/finance/engine.ts';
import type { FinanceState } from '../../../../apps/mobile/src/finance/types.ts';
import { financeDigest } from '../../src/finance-checkpoints.ts';
import { integrationFixture, success } from './integration-fixtures.ts';

test('two real SQL writers serialize admission, retry stale CAS and roll back the over-budget checkpoint', { timeout: 120_000 }, async () => {
  const f = await integrationFixture();
  const status = JSON.parse((await readFile(new URL('../../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  const url = sourceGuard(status).href;
  const run = randomUUID();
  const a = new pg.Client({ connectionString: url, application_name: `betweenus-admission-a-${run}` });
  const b = new pg.Client({ connectionString: url, application_name: `betweenus-admission-b-${run}` });
  const oldPolicy = (await f.database.query('select local_synthetic from app_private.deployment_policy where singleton')).rows[0];
  const oldSample = (await f.database.query('select * from app_private.resource_sample where singleton')).rows[0];
  try {
    await a.connect(); await b.connect();
    const scope = success(await f.parent.auth.rpc('finance_scope', { p_family_id: f.familyId, p_child_id: f.childId }), 'managed admission scope');
    const load = async (db = f.database) => (await db.query('select api.finance_load($1) value', [scope])).rows[0].value;
    const first = await load(), at = first.serverAt;
    const plan = { budgetCents: 5000, period: 'monthly' as const, anchorDate: f.today, payoutCadence: 'per_task' as const, minimumPayoutCents: 0, allowGoalRelease: true };
    const action = { kind: 'configure_plan' as const, plan };
    const fingerprint = await financeDigest({ familyId: f.familyId, childId: f.childId, action });
    function request(loaded: { state: FinanceState; stateHash: string; revision: number }, rollover = false) {
      const id = randomUUID(), state = sealFinanceState(loaded.state);
      let next = applyFinanceCommand(state, { role: 'parent' }, { ...action, id: `${f.parent.user.id}:${id}`, childId: f.childId, at });
      const event = next.events.at(-1)!, eventActivity = financeEventActivity(next).at(-1)!;
      if (rollover) next = checkpointState(next);
      return [scope, id, fingerprint, loaded.revision, { state: next, event, previousStateHash: loaded.stateHash,
        capsules: [], hydratedCapsules: [], privateCapsules: [], hydratedPrivateCapsules: [], eventActivity,
        coveredActivity: financeEventActivity(state), childProjection: financeView(next, { role: 'child', childId: f.childId }, f.childId, at),
        parentProjection: financeView(next, { role: 'parent' }, f.childId, at) }, at];
    }
    const call = (db: typeof a, args: unknown[]) => db.query('select api.finance_commit($1,$2,$3,$4,$5,$6) value', args);
    // Exercise the real circuit with its synthetic bypass OFF and a genuine fresh local size sample.
    await f.database.query(`select api.record_resource_sample($1)`, [{ plan: 'free', projectAvailable: true, collectedAtMs: Date.now(), metrics: {
      databaseBytes: 0, uncachedEgressBytes: 0, cachedEgressBytes: 0, storageBytes: 0, monthlyActiveUsers: 0,
      edgeInvocations: 0, realtimeMessages: 0, peakRealtimeConnections: 0, realtimeMessagesPerSecond: 0, channelJoinsPerSecond: 0,
    } }]);
    await f.database.query('update app_private.deployment_policy set local_synthetic=false where singleton');
    for (let n = 0; n < 59; n++) assert.equal((await call(f.database, request(await load()))).rows[0].value.status, 'committed');
    const loaded = await load(), argsA = request(loaded), argsB = request(structuredClone(loaded));
    await a.query('BEGIN'); await b.query('BEGIN');
    assert.equal((await call(a, argsA)).rows[0].value.status, 'committed');
    const pidB = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const waiting = call(b, argsB);
    void waiting.catch(() => undefined); // Keep early SQL denial handled while the observer checks its owned wait.
    let release = false;
    try {
      const deadline = Date.now() + 5000; let blocked = false;
      while (Date.now() < deadline) {
        const state = (await f.database.query('select wait_event_type from pg_stat_activity where pid=$1 and application_name=$2', [pidB, `betweenus-admission-b-${run}`])).rows[0];
        if (state?.wait_event_type === 'Lock') { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(blocked, true, 'the independently owned second writer waits for the same family transaction');
      await a.query('COMMIT'); release = true;
      assert.equal((await waiting).rows[0].value.status, 'conflict');
      const after = await load(b);
      await assert.rejects(call(b, request(after, true)), (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'PT429');
      await b.query('ROLLBACK');
    } finally {
      if (!release) await a.query('ROLLBACK');
      await waiting.catch(() => undefined); await b.query('ROLLBACK');
    }
    const rows = (await f.database.query(`select
      (select count(*)::int from app_private.finance_events where family_id=$1) events,
      (select count(*)::int from app_private.finance_commands where family_id=$1) commands,
      (select count(*)::int from app_private.finance_activity where family_id=$1) activity,
      (select count(*)::int from app_private.finance_checkpoints where family_id=$1) checkpoints`, [f.familyId])).rows[0];
    assert.deepEqual(rows, { events: 60, commands: 60, activity: 60, checkpoints: 0 });
    assert.equal((await call(f.database, argsA)).rows[0].value.status, 'replayed', 'exact replay still works at the saturated minute budget');
  } finally {
    await a.query('ROLLBACK').catch(() => undefined); await b.query('ROLLBACK').catch(() => undefined);
    await a.end().catch(() => undefined); await b.end().catch(() => undefined);
    await f.database.query('update app_private.deployment_policy set local_synthetic=$1 where singleton', [oldPolicy.local_synthetic]);
    if (oldSample) await f.database.query(`update app_private.resource_sample set collected_at=$1,received_at=$2,project_available=$3,metrics=$4 where singleton`,
      [oldSample.collected_at, oldSample.received_at, oldSample.project_available, oldSample.metrics]);
    else await f.database.query('delete from app_private.resource_sample where singleton');
    await f.close();
  }
});
