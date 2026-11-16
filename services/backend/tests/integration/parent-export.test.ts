import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPrivacyService } from '../../src/privacy.ts';
import type { FinanceAction } from '../../src/finance.ts';
import type { FinanceView } from '../../../../apps/mobile/src/finance/types.ts';
import { integrationFixture, submittedEarning, success, type LocalPerson } from './integration-fixtures.ts';

test('real managed parent export attaches every authorized finance scope and rechecks guardian revocation before retrieval', { timeout: 120_000 }, async () => {
  const f = await integrationFixture({ privacy: true });
  let exportId: string | undefined, reportId: string | undefined;
  try {
    assert.ok(f.child && f.operator);
    const siblingId = success(await f.parent.auth.rpc('create_child', { p_family_id: f.familyId, p_name: 'Fictional second child scope' }), 'second child registry');
    const secondFamilyId = success(await f.parent.auth.rpc('create_family', { p_name: 'Fictional second export family', p_timezone: 'UTC' }), 'second current family');
    const otherChildId = success(await f.parent.auth.rpc('create_child', { p_family_id: secondFamilyId, p_name: 'Fictional other family child scope' }), 'other family child registry');
    // These additional registry rows have no child Auth identity yet. Current parent
    // finance authorization explicitly permits nonclosed pending registry scopes.
    const ledger = async (person: LocalPerson, familyId: string, childId: string, action?: FinanceAction): Promise<FinanceView> => {
      const response = await f.request(person, `/v1/finance/${familyId}/${childId}`, action ? { id: randomUUID(), action } : undefined);
      assert.equal(response.status, 200, `real finance ${action?.kind ?? 'read'}`);
      return await response.json() as FinanceView;
    };
    const plan = { budgetCents: 5000, period: 'monthly' as const, anchorDate: f.today,
      payoutCadence: 'per_task' as const, minimumPayoutCents: 0, allowGoalRelease: true };
    await f.finance(f.parent, { kind: 'configure_plan', plan });
    const occurrenceId = await submittedEarning(f, 'parent-export');
    await f.finance(f.parent, { kind: 'review_chore', occurrenceId, decision: 'approved' });
    await f.finance(f.parent, { kind: 'configure_matching', rule: {
      enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 3000, surprise: true,
    } });
    const goalId = randomUUID();
    await f.finance(f.child, { kind: 'create_goal', goalId, title: 'Fictional parent-export goal', targetCents: 5000 });
    await f.finance(f.child, { kind: 'allocate', goalId, amountCents: 1000 });
    await ledger(f.parent, f.familyId, siblingId, { kind: 'configure_plan', plan });
    await ledger(f.parent, secondFamilyId, otherChildId, { kind: 'configure_plan', plan });
    const childBefore = await f.finance(f.child);
    assert.equal(childBefore.matching, undefined, 'fixture matching remains hidden from the child');
    const parentBefore = await f.finance(f.parent);
    assert.equal(parentBefore.matching?.usedCents, 1000, 'fixture includes a real hidden matching commitment visible to the guardian');
    assert.equal(parentBefore.matching?.rule.surprise, true);

    const stranger = await f.adult('parent-export-stranger');
    const unknownFamilyId = success(await stranger.auth.rpc('create_family', { p_name: 'Fictional unknown export family', p_timezone: 'UTC' }), 'unknown family');
    const unknownName = `UNKNOWN-FINANCE-${randomUUID()}`;
    const unknownChildId = success(await stranger.auth.rpc('create_child', { p_family_id: unknownFamilyId, p_name: unknownName }), 'unknown child registry');
    await ledger(stranger, unknownFamilyId, unknownChildId, { kind: 'configure_plan', plan });
    assert.equal((await f.request(f.parent, `/v1/finance/${unknownFamilyId}/${unknownChildId}`)).status, 403);

    const coGuardian = await f.adult('parent-export-co-guardian');
    const invitation = success(await f.parent.auth.rpc('invite_guardian', { p_family_id: secondFamilyId, p_email: coGuardian.email }), 'second-family guardian invitation');
    success(await coGuardian.auth.rpc('accept_guardian_invite', { p_token: invitation.token }), 'independent guardian acceptance');

    // Synthetic restricted evidence fixture only. This does not enable public
    // intake or promise an operator; export filtering still runs through real SQL.
    reportId = randomUUID();
    const confidentialWords = `CHILD-REPORT-EXCLUDED-${randomUUID()}`;
    await f.database.query(`insert into app_private.safety_reports(id,reporter_id,reported_user_id,description)
      values($1,$2,$3,$4)`, [reportId, f.child.user.id, f.parent.user.id, confidentialWords]);

    const sessionsBefore = (await f.database.query('select id from auth.sessions where user_id=$1 order by id', [f.parent.user.id])).rows;
    const reauthenticated = await f.request(f.parent, '/v1/privacy/reauthenticate', { password: f.parent.secret });
    assert.equal(reauthenticated.status, 200, 'actual managed password step-up succeeds');
    const proof = await reauthenticated.json();
    assert.deepEqual(Object.keys(proof), ['expiresAt']);
    assert.ok(Date.parse(proof.expiresAt) > Date.now());
    assert.deepEqual((await f.database.query('select id from auth.sessions where user_id=$1 order by id', [f.parent.user.id])).rows,
      sessionsBefore, 'temporary managed step-up session is actually retired');

    const requested = success(await f.parent.auth.rpc('request_own_export', { p_client_id: randomUUID() }), 'own parent export request');
    exportId = requested.id;
    assert.equal(typeof exportId, 'string'); assert.equal(requested.completed, false);
    assert.ok((await f.parent.auth.rpc('get_own_export', { p_job_id: exportId })).error, 'request alone creates no complete artifact');
    success(await f.service.rpc('review_privacy_job', { p_job_id: exportId, p_operator_id: f.operator.user.id,
      p_decision: 'approve', p_reference: 'fixture:actual-parent-export-independent-review' }), 'independent parent export review');
    const initial = success(await f.service.rpc('execute_privacy_job', { p_job_id: exportId, p_operator_id: f.operator.user.id }), 'actual core execution');
    assert.equal(initial.status, 'partial_ready'); assert.equal(initial.completed, false); assert.equal(initial.projectionKind, 'parent');
    assert.ok((await f.parent.auth.rpc('get_own_export', { p_job_id: exportId })).error, 'missing parent financial views cannot be downloaded as complete');

    const privacy = createPrivacyService({ url: 'http://127.0.0.1:54321', publicKey: f.publicKey, serviceClient: f.service });
    const executed = await privacy.executeAndProject(exportId!, f.operator.user.id);
    assert.deepEqual(executed, { id: exportId, status: 'ready', completed: true, journalIncluded: false });
    const artifact = success(await f.parent.auth.rpc('get_own_export', { p_job_id: exportId }), 'actual completed parent export retrieval');
    assert.equal(artifact.completed, true); assert.equal(artifact.journalIncluded, false);
    assert.equal(artifact.data.subject.id, f.parent.user.id);
    const views = artifact.data.finance as { familyId: string; childId: string; view: FinanceView }[];
    assert.equal(views.length, 3, 'every child in both current authorized families is included');
    assert.deepEqual(views.map(row => `${row.familyId}/${row.childId}`).sort(),
      [`${f.familyId}/${f.childId}`, `${f.familyId}/${siblingId}`, `${secondFamilyId}/${otherChildId}`].sort());
    for (const scope of views) assert.deepEqual(scope.view, await ledger(f.parent, scope.familyId, scope.childId), 'export uses the real parent finance view');
    const matching = views.find(row => row.childId === f.childId)!.view.matching;
    assert.equal(matching?.usedCents, 1000); assert.equal(matching?.rule.surprise, true);
    assert.equal(matching?.commitments.reduce((total, item) => total + item.activeCents, 0), 1000);
    const bytes = JSON.stringify(artifact.data);
    for (const excluded of [confidentialWords, reportId, unknownName, unknownFamilyId, unknownChildId]) assert.equal(bytes.includes(excluded), false, 'no child report or other family data');
    for (const field of ['journal', 'draft', 'events', 'revision', 'sourceHash', 'finance_manifest', 'registration_token']) {
      assert.equal(bytes.includes(`"${field}"`), false, `parent artifact excludes raw/private field ${field}`);
    }
    assert.deepEqual(await f.finance(f.child), childBefore, 'parent export does not expose matching or mutate the child view');
    assert.ok((await stranger.auth.rpc('get_own_export', { p_job_id: exportId })).error, 'another managed parent cannot fetch this artifact');
    assert.ok((await f.parent.auth.rpc('privacy_parent_finance_sources', { p_job_id: exportId, p_operator_id: f.operator.user.id })).error,
      'even the subject parent cannot call service-only raw sources');

    const revocation = await coGuardian.auth.rpc('revoke_membership', { p_family_id: secondFamilyId, p_user_id: f.parent.user.id });
    // This RPC returns SQL void: successful data is null, unlike success()'s
    // nonnull-data contract. Never print the Auth/provider response on failure.
    assert.equal(revocation.error == null, true, 'actual other guardian revocation');
    assert.equal((await f.request(f.parent, `/v1/finance/${secondFamilyId}/${otherChildId}`)).status, 403);
    const denied = await f.parent.auth.rpc('get_own_export', { p_job_id: exportId });
    assert.equal(denied.error?.code, '42501', 'formerly authorized ready artifact must be denied after membership revocation');
    const restaged = await privacy.executeAndProject(exportId!, f.operator.user.id);
    assert.equal(restaged.status, 'partial_ready'); assert.equal(restaged.completed, false);
    const status = success(await f.parent.auth.rpc('get_own_privacy_job', { p_job_id: exportId }), 'restaged own export status');
    assert.equal(status.exportComplete, false); assert.ok(status.blockers.includes('financial_scope_review_required'));
    const partial = success(await f.parent.auth.rpc('get_own_export', { p_job_id: exportId, p_allow_partial: true }), 'explicitly partial currently authorized data');
    assert.equal(partial.completed, false); assert.equal(partial.data.finance.length, 2);
    assert.equal(partial.data.finance.every((scope: { familyId: string }) => scope.familyId === f.familyId), true, 'revoked family views are actually removed');
    assert.equal(JSON.stringify(partial.data).includes(confidentialWords), false);
  } finally {
    try {
      // Retire the private artifact and exact synthetic evidence fixture. The
      // shared helper retires all managed sessions and restores policy; immutable
      // fictional financial history remains local, as its contract requires.
      if (exportId) await f.database.query("update app_private.privacy_lifecycle_jobs set artifact=null,artifact_expires_at=null,status='expired' where id=$1", [exportId]);
      if (reportId) await f.database.query('delete from app_private.safety_reports where id=$1', [reportId]);
    } finally { await f.close(); }
  }
});
