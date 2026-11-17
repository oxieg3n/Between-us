import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPrivacyService } from '../../src/privacy.ts';
import { integrationFixture, success } from './integration-fixtures.ts';
import type { FinanceView } from '../../../../apps/mobile/src/finance/types.ts';
import type { FinanceHistoryPage, ParentMatchHistoryPage } from '../../../../apps/mobile/src/production/finance-history-types.ts';

test('managed HTTP crosses old history windows, preserves forever retries and rejects a corrupted checkpoint on read', { timeout: 180_000 }, async () => {
  const f = await integrationFixture();
  try {
    const plan = { budgetCents: 10000, period: 'monthly' as const, anchorDate: f.today, payoutCadence: 'per_task' as const, minimumPayoutCents: 0, allowGoalRelease: true };
    const first = randomUUID();
    await f.finance(f.parent, { kind: 'configure_plan', plan }, first);
    for (let i = 1; i < 127; i++) await f.finance(f.parent, { kind: 'configure_plan', plan });
    await Promise.all([f.finance(f.parent, { kind: 'configure_plan', plan }), f.finance(f.parent, { kind: 'configure_plan', plan })]);
    const record = (await f.database.query(`select revision,state,
      (select count(*)::int from app_private.finance_events where family_id=$1) events,
      (select count(*)::int from app_private.finance_commands where family_id=$1) commands,
      (select count(*)::int from app_private.finance_checkpoints where family_id=$1) checkpoints
      from app_private.finance_aggregates where family_id=$1`, [f.familyId])).rows[0];
    assert.equal(record.events, 129); assert.equal(record.commands, 129); assert.ok(record.checkpoints > 0);
    assert.ok(record.state.events.length <= 128); assert.ok(record.state.checkpoint);
    await f.finance(f.parent, { kind: 'configure_plan', plan }, first);
    assert.equal((await f.database.query('select count(*)::int n from app_private.finance_events where family_id=$1', [f.familyId])).rows[0].n, 129);
    assert.equal((await f.request(f.parent, f.path, { id: first, action: { kind: 'configure_plan', plan: { ...plan, budgetCents: 9999 } } })).status, 400);
    // Only this owned fictional family's derived cache is altered; immutable source rows stay intact.
    try {
      const damaged = structuredClone(record.state); damaged.checkpoint.books[f.childId].earnedCents = 1;
      await f.database.query('update app_private.finance_aggregates set state=$2 where family_id=$1', [f.familyId, damaged]);
      const denied = await f.request(f.parent, f.path);
      assert.equal(denied.status, 503, 'corruption fails closed before publishing a false balance');
      assert.deepEqual(await denied.json(), { error: 'Financial service is temporarily unavailable.' });
    } finally { await f.database.query('update app_private.finance_aggregates set state=$2 where family_id=$1', [f.familyId, record.state]); }
    assert.equal((await f.request(f.parent, f.path)).status, 200);
  } finally { await f.close(); }
});

test('real settled archives retain corrections, complete role-safe exports and cross-family denial', { timeout: 300_000 }, async () => {
  const f = await integrationFixture({ privacy: true });
  try {
    assert.ok(f.child);
    await f.finance(f.parent, { kind: 'configure_plan', plan: { budgetCents: 10000, period: 'monthly', anchorDate: f.today, payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
    const goalId = randomUUID(); await f.finance(f.child, { kind: 'create_goal', goalId, title: 'Fictional savings', targetCents: 10000 });
    await f.finance(f.parent, { kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
    let oldOccurrence = '', oldPayment = '', oldMatch = '';
    for (let i = 0; i < 32; i++) {
      const choreId = randomUUID(), occurrenceId = `${choreId}:${f.today}`;
      await f.finance(f.parent, { kind: 'assign_chore', choreId, title: `Fictional archive task ${i}`, rewardCents: 100, dates: [f.today] });
      await f.finance(f.child, { kind: 'submit_chore', occurrenceId });
      await f.finance(f.parent, { kind: 'review_chore', occurrenceId, decision: 'approved' });
      const allocation = randomUUID(); await f.finance(f.child, { kind: 'allocate', goalId, amountCents: 100 }, allocation);
      const matchId = `${f.child.user.id}:${allocation}:match`;
      await f.finance(f.parent, { kind: 'fund_match', matchId, amountCents: 50, method: 'manual', paidAt: `${f.today}T00:00:00.000Z` });
      await f.finance(f.child, { kind: 'release_goal', goalId, amountCents: 100, note: 'Fictional goal cash-out' });
      const payout = randomUUID();
      if (i === 31) await Promise.all([
        f.finance(f.child, { kind: 'request_payout', amountCents: 100 }, payout),
        f.finance(f.child, { kind: 'request_payout', amountCents: 100 }, payout),
      ]);
      else await f.finance(f.child, { kind: 'request_payout', amountCents: 100 }, payout);
      const payment = randomUUID(); await f.finance(f.parent, { kind: 'report_payment', payoutId: `${f.child.user.id}:${payout}`, amountCents: 100, method: 'cash', paidAt: `${f.today}T00:00:00.000Z` }, payment);
      if (!i) { oldOccurrence = occurrenceId; oldPayment = `${f.parent.user.id}:${payment}`; oldMatch = matchId; }
    }
    const current = await f.finance(f.child);
    assert.equal(current.balances.earnedCents, 3200); assert.equal(current.balances.paidCents, 3200);
    assert.equal(current.goals[0].parentContributedCents, 0); assert.ok(current.occurrences.length < 32);
    const pageResponse = await f.request(f.child, `${f.path}/history`); assert.equal(pageResponse.status, 200);
    const page = await pageResponse.json() as FinanceHistoryPage;
    assert.equal(page.items.length, 20); assert.ok(page.nextAfterId);
    const json = JSON.stringify(page);
    for (const key of ['matching', 'sourceCents', 'lots', 'effects', 'stateHash', 'sequence', 'revision', 'allocations']) assert.equal(json.includes(`"${key}"`), false);
    assert.equal((await f.request(f.child, `${f.path}/parent-history`)).status, 403);
    const stranger = await f.adult('archive-other-family');
    assert.equal((await f.request(stranger, `${f.path}/history?after=${page.items[0].id}`)).status, 403);
    const parentPage = await f.request(f.parent, `${f.path}/parent-history`); assert.equal(parentPage.status, 200);
    assert.ok(((await parentPage.json()) as ParentMatchHistoryPage).items.length);
    assert.equal((await f.request(f.child, `${f.path}/parent-open-history`)).status, 403);
    assert.equal((await f.request(stranger, `${f.path}/parent-open-history`)).status, 403);
    const openParent = await f.request(f.parent, `${f.path}/parent-open-history`);
    assert.equal(openParent.status, 200);
    const openRecords = await openParent.json();
    assert.ok(openRecords.items.length > 0 && openRecords.items.length <= 20);
    assert.equal(openRecords.nextAfterId, null);
    for (const key of ['sourceCents', 'invalidatedCents', 'lots', 'effects', 'stateHash'])
      assert.equal(JSON.stringify(openRecords).includes(`"${key}"`), false);
    await f.finance(f.parent, { kind: 'reveal_match', matchId: oldMatch });
    assert.equal((await f.finance(f.child)).goals[0].parentContributedCents, 50);
    await f.finance(f.parent, { kind: 'reconcile_match', matchId: oldMatch, amountCents: 50, resolution: 'report_corrected', paidAt: `${f.today}T00:00:00.000Z`, note: 'Fictional retained contribution correction' });
    assert.equal((await f.finance(f.child)).goals[0].parentContributedCents, 0);
    await f.finance(f.child, { kind: 'acknowledge_payment', paymentId: oldPayment });
    await f.finance(f.parent, { kind: 'reverse_earning', occurrenceId: oldOccurrence, note: 'Fictional historical earning correction' });
    const reversed = await f.finance(f.child); assert.equal(reversed.balances.earnedCents, 3100); assert.equal(reversed.balances.correctionDueCents, 100);
    await f.finance(f.parent, { kind: 'reverse_payment', paymentId: oldPayment, note: 'Fictional historical payment correction' });
    const reconciled = await f.finance(f.child); assert.equal(reconciled.balances.paidCents, 3100); assert.equal(reconciled.balances.correctionDueCents, 0);
    assert.equal((await f.finance(f.parent)).matching?.usedCents, 1550);
    const audit = (await f.database.query(`select count(*)::int n,count(distinct event_id)::int unique_events from app_private.finance_events where family_id=$1`, [f.familyId])).rows[0];
    assert.equal(audit.n, audit.unique_events); assert.ok(audit.n > 128);
    assert.ok(f.operator);
    const privacy = createPrivacyService({ url: 'http://127.0.0.1:54321', publicKey: f.publicKey, serviceClient: f.service });
    for (const person of [f.child, f.parent]) {
      assert.equal((await f.request(person, '/v1/privacy/reauthenticate', { password: person.secret })).status, 200);
      const job = success(await person.auth.rpc('request_own_export', { p_client_id: randomUUID() }), 'archive export request');
      success(await f.service.rpc('review_privacy_job', { p_job_id: job.id, p_operator_id: f.operator.user.id,
        p_decision: 'approve', p_reference: 'fixture:archive-export-reviewed' }), 'archive export review');
      const result = await privacy.executeAndProject(job.id, f.operator.user.id);
      assert.equal(result.status, 'ready', 'captured source and archived DTOs produce a complete artifact');
      assert.equal(result.completed, true);
      const artifact = success(await person.auth.rpc('get_own_export', { p_job_id: job.id }), 'complete archive export');
      const view: FinanceView = person === f.child ? artifact.data.finance[0] : artifact.data.finance[0].view;
      assert.equal(view.occurrences.length, 32, 'all archived and hot occurrences are exported once');
      assert.equal(view.payouts.length, 32, 'all archived and hot payouts are exported once');
      assert.equal(view.activity.length > 100, true, 'export retains full accepted activity beyond the UI window');
      assert.equal(view.balances.earnedCents, 3100); assert.equal(view.balances.paidCents, 3100);
      if (person === f.child) {
        assert.equal(view.matching, undefined);
        for (const field of ['matching', 'sourceCents', 'lots', 'effects', 'stateHash', 'sequence', 'revision', 'checkpoint'])
          assert.equal(JSON.stringify(artifact.data).includes(`"${field}"`), false, `child export excludes ${field}`);
      } else {
        assert.ok(view.matching);
        assert.equal(view.matching.usedCents, 1550);
        assert.equal(view.matching.commitments.length, 32, 'parent export includes retired private matching history');
      }
      assert.equal(artifact.journalIncluded, false);
    }
    const retainedAudit = async () => (await f.database.query(`select
      (select count(*)::int from app_private.finance_events where family_id=$1) events,
      (select count(*)::int from app_private.finance_commands where family_id=$1) commands,
      (select count(*)::int from app_private.finance_checkpoints where family_id=$1) checkpoints,
      (select count(*)::int from app_private.finance_archive_capsules where family_id=$1) visible,
      (select count(*)::int from app_private.finance_private_match_capsules where family_id=$1) private`, [f.familyId])).rows[0];
    const beforeClosure = await retainedAudit();
    assert.ok(beforeClosure.checkpoints > 0 && beforeClosure.visible > 0 && beforeClosure.private > 0);
    const hold = success(await f.service.rpc('set_privacy_hold', { p_subject_id: f.child.user.id,
      p_scope: 'finance', p_reference: 'fixture:archived-finance-finite-hold',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(), p_operator_id: f.operator.user.id }), 'finite finance hold');
    const deletion = success(await f.child.auth.rpc('request_own_deletion', { p_client_id: randomUUID() }), 'own closure with archived history');
    success(await f.service.rpc('review_privacy_job', { p_job_id: deletion.id, p_operator_id: f.operator.user.id,
      p_decision: 'approve', p_reference: 'fixture:archived-closure-review' }), 'archived closure review');
    const closed = await privacy.executeAndProject(deletion.id, f.operator.user.id);
    assert.equal(closed.status, 'access_revoked'); assert.equal(closed.completed, false);
    assert.ok([401, 403].includes((await f.request(f.child, `${f.path}/history`)).status));
    assert.deepEqual(await retainedAudit(), beforeClosure, 'closure and legal hold preserve every immutable finance source');
    const released = await f.service.rpc('release_privacy_hold', { p_hold_id: hold, p_operator_id: f.operator.user.id });
    assert.equal(released.error, null);
    assert.deepEqual(await retainedAudit(), beforeClosure, 'hold release is not unapproved audit deletion');
  } finally { await f.close(); }
});
