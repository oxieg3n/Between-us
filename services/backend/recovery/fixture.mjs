import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createFinanceService } from '../src/finance.ts';
import { fail, checkedResult, operationError } from './guards.mjs';

const success = checkedResult;
export const claims = person => JSON.parse(Buffer.from(person.session.access_token.split('.')[1], 'base64url').toString());
export function fixtureRecord(f) {
  return { runId: f.runId, subjects: [f.parent.user.id, f.operator.user.id, f.child.user.id],
    familyId: f.familyId, childId: f.childId, contactId: f.contactId, conversationId: f.conversationId,
    parentMessageId: f.parentMessage.id, childMessageId: f.childMessage.id,
    clientId: f.clientId, financeOperationId: f.financeOperationId, financeAction: f.financeAction,
    parentClaims: claims(f.parent), childClaims: claims(f.child) };
}

/** Root-executed only. All writes create new UUID-scoped fictional identities; existing fixtures are never reused. */
export async function createFixture(status, database, runId, recordIdentity, checkpoint = () => {}) {
  const query = async (label, sql, args) => {
    checkpoint(label);
    try { return await database.query(sql, args); } catch (error) { throw operationError(error, label); }
  };
  const client = key => createClient(status.API_URL, key, { db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const service = client(status.SERVICE_ROLE_KEY);
  const adult = async label => {
    const email = `recovery-${runId}-${label}@fixture.test`, password = `Fictional-${randomUUID()}-A9`;
    if ((await query('check-new-adult-email', 'select 1 from auth.users where lower(email)=$1', [email])).rowCount) fail();
    const intent = success(await service.rpc('issue_parent_registration', { p_email: email }), 'parent-registration-intent');
    const created = success(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { registration_token: intent.token } }), 'parent-auth-create');
    await recordIdentity({ userId: created.user.id, email, label });
    const auth = client(status.ANON_KEY), data = success(await auth.auth.signInWithPassword({ email, password }), 'parent-managed-sign-in');
    if (!data.user || !data.session || data.user.email !== email) fail();
    success(await auth.rpc('bootstrap_parent', { p_display_name: 'Fictional recovery adult' }), 'parent-bootstrap');
    return { auth, user: data.user, session: data.session, email };
  };
  const parent = await adult('guardian'), operator = await adult('independent');
  await query('new-independent-operator', "insert into app_private.operators(user_id,scope,active) values($1,'consent',true),($1,'verification',true)", [operator.user.id]);
  const familyId = success(await parent.auth.rpc('create_family', { p_name: `Fictional recovery ${runId}`, p_timezone: 'UTC' }), 'create-family');
  const childId = success(await parent.auth.rpc('create_child', { p_family_id: familyId, p_name: 'Fictional recovery child' }), 'create-child');
  const policy = (await query('read-local-policy', 'select notice_version,consent_policy_version from app_private.deployment_policy where singleton')).rows[0];
  const consentId = success(await parent.auth.rpc('request_child_consent', { p_child_id: childId,
    p_notice_version: policy.notice_version, p_policy_version: policy.consent_policy_version }), 'request-child-consent');
  success(await operator.auth.rpc('verify_child_consent', { p_consent_id: consentId, p_method: 'synthetic_fixture',
    p_evidence_reference: `fixture:recovery:${runId}`, p_expires_at: new Date(Date.now() + 86400000).toISOString() }), 'verify-child-consent', true);
  const enrollment = success(await parent.auth.rpc('begin_child_enrollment', { p_child_id: childId }), 'begin-child-enrollment');
  if (!enrollment.email?.endsWith('.test')) fail();
  const childPassword = `Fictional-${randomUUID()}-B9`;
  const createdChild = success(await service.auth.admin.createUser({ email: enrollment.email, password: childPassword, email_confirm: true,
    user_metadata: { registration_token: enrollment.token } }), 'child-auth-create');
  await recordIdentity({ userId: createdChild.user.id, email: enrollment.email, label: 'child', childId, familyId, guardianId: parent.user.id });
  const childAuth = client(status.ANON_KEY), childData = success(await childAuth.auth.signInWithPassword({ email: enrollment.email, password: childPassword }), 'child-managed-sign-in');
  if (!childData.user || !childData.session) fail();
  const child = { auth: childAuth, user: childData.user, session: childData.session, email: enrollment.email };
  success(await child.auth.rpc('accept_child_enrollment', { p_token: enrollment.token }), 'accept-child-enrollment');
  success(await parent.auth.rpc('request_contact', { p_family_id: familyId, p_recipient_email: child.email }), 'request-contact');
  const contact = (await query('find-new-fixture-contact', 'select id from app_private.trusted_contacts where family_id=$1 and $2 in(a,b) and $3 in(a,b)',
    [familyId, parent.user.id, child.user.id])).rows;
  if (contact.length !== 1) fail();
  const contactId = contact[0].id;
  success(await parent.auth.rpc('accept_contact', { p_contact_id: contactId }), 'parent-accept-contact');
  success(await child.auth.rpc('accept_contact', { p_contact_id: contactId }), 'child-accept-contact');
  success(await parent.auth.rpc('approve_contact', { p_contact_id: contactId }), 'parent-approve-contact');
  success(await service.rpc('verify_contact', { p_contact_id: contactId, p_operator_id: operator.user.id,
    p_method: 'synthetic_fixture', p_evidence_ref: `fixture:recovery:${runId}` }), 'independent-verify-contact');
  const conversationId = success(await parent.auth.rpc('create_conversation', { p_contact_id: contactId }), 'create-conversation').id;
  const clientId = randomUUID(), childClientId = randomUUID();
  const parentMessage = success(await parent.auth.rpc('send_message', { p_conversation_id: conversationId,
    p_body: 'Fictional recovery message.', p_client_id: clientId, p_response: 'later' }), 'parent-send-message');
  const childMessage = success(await child.auth.rpc('send_message', { p_conversation_id: conversationId,
    p_body: 'Fictional unshared deletion drill.', p_client_id: childClientId, p_response: 'later' }), 'child-send-message');
  const parentFinance = createFinanceService({ userClient: parent.auth, serviceClient: service });
  const childFinance = createFinanceService({ userClient: child.auth, serviceClient: service });
  const today = (await query('read-fixture-local-day', "select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD') as local_day")).rows[0].local_day;
  const command = (finance, action, id = randomUUID()) => finance.command(familyId, childId, { id, action });
  checkpoint('finance-configure-plan');
  await command(parentFinance, { kind: 'configure_plan', plan: { budgetCents: 10000, period: 'monthly', anchorDate: today,
    payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
  const choreId = `recovery-${runId}`, occurrenceId = `${choreId}:${today}`;
  checkpoint('finance-assign-chore');
  await command(parentFinance, { kind: 'assign_chore', choreId, title: 'Fictional recovery chore', rewardCents: 400, dates: [today] });
  checkpoint('finance-submit-chore');
  await command(childFinance, { kind: 'submit_chore', occurrenceId });
  const financeOperationId = randomUUID(), financeAction = { kind: 'review_chore', occurrenceId, decision: 'approved' };
  checkpoint('finance-first-approval');
  const first = await command(parentFinance, financeAction, financeOperationId);
  checkpoint('finance-exact-approval-retry');
  const duplicate = await command(parentFinance, financeAction, financeOperationId);
  if (first.balances.earnedCents !== 400 || duplicate.balances.earnedCents !== 400) fail();
  return { runId, parent, operator, child, familyId, childId, contactId, conversationId, clientId,
    parentMessage, childMessage, financeOperationId, financeAction, consentId };
}

export async function assertFixtureOwnership(db, f) {
  const found = (await db.query(`select count(*)::int n from auth.users u where
    (u.id=$1 and u.email=$2) or (u.id=$3 and u.email=$4) or
    (u.id=$5 and u.email=$6 and exists(select 1 from app_private.children c where c.id=$7 and c.family_id=$8 and c.account_user_id=u.id))`,
  [f.parent.user.id, f.parent.email, f.operator.user.id, f.operator.email, f.child.user.id, f.child.email, f.childId, f.familyId])).rows[0];
  if (found.n !== 3 || f.parent.email !== `recovery-${f.runId}-guardian@fixture.test`
    || f.operator.email !== `recovery-${f.runId}-independent@fixture.test` || !f.child.email.endsWith('.test')) fail();
}

/** Exact new fixture only; immutable finance and shared records remain. This is partial erasure, never provider deletion. */
export async function revokeFixture(db, f, snapshotHash, snapshotAt) {
  await db.query('begin');
  try {
    await assertFixtureOwnership(db, f);
    const subjectIds = [f.parent.user.id, f.operator.user.id, f.child.user.id];
    await db.query("update app_private.consents set status='withdrawn',withdrawn_at=clock_timestamp() where id=$1 and child_id=$2 and family_id=$3",
      [f.consentId, f.childId, f.familyId]);
    const effectiveAt = (await db.query('select clock_timestamp() as observed_at')).rows[0].observed_at.toISOString();
    await db.query('update auth.sessions set not_after=$2 where user_id=any($1::uuid[])', [subjectIds, effectiveAt]);
    await db.query("update app_private.profiles set state='closed',display_name='Deleted fictional account' where user_id=$1", [f.child.user.id]);
    await db.query("update app_private.children set state='closed',name='Deleted fictional account' where id=$1 and account_user_id=$2", [f.childId, f.child.user.id]);
    await db.query("update app_private.memberships set status='revoked' where user_id=$1 and family_id=$2", [f.child.user.id, f.familyId]);
    await db.query('update app_private.operators set active=false where user_id=$1', [f.operator.user.id]);
    await db.query('update app_private.trusted_contacts set revoked_at=$2 where id=$1', [f.contactId, effectiveAt]);
    const erased = await db.query(`delete from app_private.messages m where m.id=$1 and m.sender_id=$2 and m.conversation_id=$3
      and m.acknowledged_at is null and not app_private.privacy_has_hold(m.sender_id,'messages')
      and not app_private.privacy_has_hold(m.recipient_id,'messages')
      and not exists(select 1 from app_private.safety_reports r where r.message_id=m.id)`,
    [f.childMessage.id, f.child.user.id, f.conversationId]);
    if (erased.rowCount !== 1) fail();
    await db.query('commit');
    const old = await f.child.auth.rpc('get_context');
    if (!old.error || old.error.code !== '42501') fail();
    return { format: 1, runId: f.runId, snapshotHash, snapshotAt, effectiveAt, subjects: subjectIds,
      childId: f.childId, familyId: f.familyId, contactId: f.contactId,
      partialDeletion: { messageId: f.childMessage.id }, sourceManagedOldTokenDenied: true };
  } catch (error) { await db.query('rollback'); throw error; }
}

export async function retireOwnedIdentities(db, runId, identities) {
  await db.query('begin');
  let incomplete = false;
  try {
    for (const identity of identities) {
      await db.query('savepoint own_identity');
      try {
        const adult = ['guardian', 'independent'].includes(identity.label)
          && identity.email === `recovery-${runId}-${identity.label}@fixture.test`;
        const child = identity.label === 'child' && identity.email.endsWith('.test')
          && (await db.query(`select 1 from app_private.children c where c.id=$1 and c.family_id=$2
            and exists(select 1 from auth.users guardian where guardian.id=$4 and guardian.email=$5)
            and (c.account_user_id=$3 or exists(select 1 from app_private.registration_intents r
              where r.purpose='child' and r.child_id=c.id and r.bound_user_id=$3 and r.issued_by=$4))`,
          [identity.childId, identity.familyId, identity.userId, identity.guardianId, `recovery-${runId}-guardian@fixture.test`])).rowCount === 1;
        if (!adult && !child) fail();
        const own = (await db.query('select id from auth.users where id=$1 and email=$2', [identity.userId, identity.email])).rows;
        if (own.length !== 1) fail();
        await db.query('update auth.sessions set not_after=least(coalesce(not_after,clock_timestamp()),clock_timestamp()) where user_id=$1', [identity.userId]);
        await db.query('update app_private.operators set active=false where user_id=$1', [identity.userId]);
        await db.query('release savepoint own_identity');
      } catch {
        await db.query('rollback to savepoint own_identity');
        await db.query('release savepoint own_identity');
        incomplete = true;
      }
    }
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; }
  if (incomplete) fail(); // Verified identities were retired; unverified resources require root review.
}
