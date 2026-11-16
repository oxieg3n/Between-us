import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createPrivacyService } from '../../src/privacy.ts';
import { integrationFixture, sessionId, submittedEarning, success, type LocalPerson } from './integration-fixtures.ts';

// Test-only authenticator for actual local GoTrue enrollment. No production identity/crypto helper.
// RFC 6238 section 4.2: https://www.rfc-editor.org/rfc/rfc6238.html#section-4.2
// RFC 4226 section 5.3: https://www.rfc-editor.org/rfc/rfc4226.html#section-5.3
function totp(secret: Buffer, milliseconds: number, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(milliseconds / 30_000)));
  const digest = createHmac('sha1', secret).update(counter).digest(), offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0');
}
function base32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', result: number[] = [];
  let bits = 0, buffer = 0;
  for (const character of value.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(character); if (index < 0) throw Error('Invalid local TOTP fixture encoding.');
    buffer = (buffer << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; result.push((buffer >>> bits) & 255); buffer &= (1 << bits) - 1; }
  }
  return Buffer.from(result);
}
type Fixture = Awaited<ReturnType<typeof integrationFixture>>;
async function sessions(f: Fixture, person: LocalPerson): Promise<string[]> {
  return (await f.database.query('select id from auth.sessions where user_id=$1 order by id', [person.user.id])).rows.map((row: { id: string }) => row.id);
}
const reauthenticate = (f: Fixture, person: LocalPerson, password = person.secret) =>
  f.request(person, '/v1/privacy/reauthenticate', { password });
async function approve(f: Fixture, jobId: string) {
  assert.ok(f.operator);
  success(await f.service.rpc('review_privacy_job', { p_job_id: jobId, p_operator_id: f.operator.user.id,
    p_decision: 'approve', p_reference: 'fixture:independent-local-review-only' }), 'independent privacy review');
}

test('actual password reauthentication rejects wrong credentials, retires temporary sessions and binds proof to the original managed session', { timeout: 45_000 }, async () => {
  const f = await integrationFixture({ child: false, privacy: true });
  try {
    const oldSession = sessionId(f.parent), before = await sessions(f, f.parent);
    assert.ok((await f.parent.auth.rpc('request_own_export', { p_client_id: randomUUID() })).error, 'ordinary login is not fresh proof');
    const wrong = await reauthenticate(f, f.parent, 'Fictional-wrong-password-1234');
    assert.equal(wrong.status, 403); assert.equal((await wrong.text()).includes(f.parent.secret), false);
    assert.equal((await f.database.query('select count(*)::int count from app_private.privacy_reauthentication where user_id=$1', [f.parent.user.id])).rows[0].count, 0);
    assert.deepEqual(await sessions(f, f.parent), before);
    const checked = await reauthenticate(f, f.parent); assert.equal(checked.status, 200);
    const response = await checked.json(); assert.deepEqual(Object.keys(response), ['expiresAt']); assert.ok(Date.parse(response.expiresAt) > Date.now());
    assert.deepEqual(await sessions(f, f.parent), before, 'isolated password sign-in session must be retired before success');
    const proof = (await f.database.query(`select session_id,method,auth_event_ref from app_private.privacy_reauthentication
      where user_id=$1 order by verified_at desc limit 1`, [f.parent.user.id])).rows[0];
    assert.equal(proof.session_id, oldSession); assert.equal(proof.method, 'managed_password');
    assert.ok(proof.auth_event_ref.startsWith('managed-auth-session:'));
    const temporary = proof.auth_event_ref.slice('managed-auth-session:'.length);
    assert.notEqual(temporary, oldSession);
    assert.equal((await f.database.query('select count(*)::int count from auth.sessions where id=$1', [temporary])).rows[0].count, 0);
    assert.equal((await f.request(f.parent, '/v1/context')).status, 200, 'original session remains valid');
    const otherSession = await f.signIn(f.parent.email, f.parent.secret);
    assert.notEqual(sessionId(otherSession), oldSession);
    assert.ok((await otherSession.auth.rpc('request_own_export', { p_client_id: randomUUID() })).error, 'a second current login cannot borrow old-session proof');
    const own = success(await f.parent.auth.rpc('request_own_export', { p_client_id: randomUUID() }), 'fresh original-session export request');
    const job = (await f.database.query('select requested_session,reauth_id from app_private.privacy_lifecycle_jobs where id=$1', [own.id])).rows[0];
    assert.equal(job.requested_session, oldSession); assert.ok(job.reauth_id);
  } finally { await f.close(); }
});

test('a genuinely enrolled and verified managed TOTP factor cannot be downgraded to password-only privacy proof', { timeout: 45_000 }, async () => {
  // RFC 6238 Appendix B SHA-1 vectors verify the test authenticator, including the leading zero.
  const vectorSecret = Buffer.from('12345678901234567890');
  assert.equal(totp(vectorSecret, 59_000, 8), '94287082');
  assert.equal(totp(vectorSecret, 1_111_111_109_000, 8), '07081804');
  const f = await integrationFixture({ child: false, privacy: true });
  try {
    const enrolled = success(await f.parent.auth.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Fictional local integration factor' }), 'managed TOTP enrollment');
    assert.equal(enrolled.type, 'totp'); assert.ok(enrolled.totp.secret);
    const challenge = success(await f.parent.auth.auth.mfa.challenge({ factorId: enrolled.id }), 'managed TOTP challenge');
    success(await f.parent.auth.auth.mfa.verify({ factorId: enrolled.id, challengeId: challenge.id,
      code: totp(base32(enrolled.totp.secret), Date.now()) }), 'managed TOTP verification');
    const current = success(await f.parent.auth.auth.getSession(), 'current MFA session'); assert.ok(current.session); f.parent.session = current.session;
    const factors = success(await f.parent.auth.auth.mfa.listFactors(), 'managed factor list');
    assert.ok(factors.totp.some(factor => factor.id === enrolled.id && factor.status === 'verified'));
    const before = await sessions(f, f.parent);
    const denied = await reauthenticate(f, f.parent); assert.equal(denied.status, 403);
    assert.deepEqual(await sessions(f, f.parent), before, 'failed downgrade retires its temporary managed session');
    assert.equal((await f.database.query('select count(*)::int count from app_private.privacy_reauthentication where user_id=$1', [f.parent.user.id])).rows[0].count, 0);
  } finally { await f.close(); }
});

test('real child export uses the role-safe finance projector; guardian deletion blocks and child deletion never claims complete erasure', { timeout: 90_000 }, async () => {
  const f = await integrationFixture({ privacy: true });
  try {
    assert.ok(f.child && f.operator);
    await f.finance(f.parent, { kind: 'configure_plan', plan: { budgetCents: 5000, period: 'monthly', anchorDate: f.today,
      payoutCadence: 'per_task', minimumPayoutCents: 0, allowGoalRelease: true } });
    const occurrenceId = await submittedEarning(f, 'privacy');
    await f.finance(f.parent, { kind: 'review_chore', occurrenceId, decision: 'approved' });
    const hiddenOperation = randomUUID();
    await f.finance(f.parent, { kind: 'configure_matching', rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 3000, surprise: true } }, hiddenOperation);
    const goalId = randomUUID();
    await f.finance(f.child, { kind: 'create_goal', goalId, title: 'Fictional private export goal', targetCents: 5000 });
    await f.finance(f.child, { kind: 'allocate', goalId, amountCents: 1000 });
    assert.equal((await f.finance(f.parent)).matching?.usedCents, 1000, 'fixture must contain a real hidden matching commitment');
    const beforeSessions = await sessions(f, f.child);
    assert.equal((await reauthenticate(f, f.child)).status, 200);
    assert.deepEqual(await sessions(f, f.child), beforeSessions);
    const job = success(await f.child.auth.rpc('request_own_export', { p_client_id: randomUUID() }), 'own child export request');
    assert.equal(job.completed, false);
    assert.ok((await f.child.auth.rpc('get_own_export', { p_job_id: job.id })).error, 'requesting an export does not generate an artifact');
    await approve(f, job.id);
    const privacy = createPrivacyService({ url: 'http://127.0.0.1:54321', publicKey: f.publicKey, serviceClient: f.service });
    const executed = await privacy.executeAndProject(job.id, f.operator.user.id);
    assert.equal(executed.status, 'ready'); assert.equal(executed.completed, true); assert.equal(executed.journalIncluded, false);
    const artifact = success(await f.child.auth.rpc('get_own_export', { p_job_id: job.id }), 'own completed child artifact');
    assert.equal(artifact.completed, true); assert.equal(artifact.journalIncluded, false);
    assert.equal(artifact.data.subject.id, f.child.user.id);
    assert.equal(artifact.data.finance.length, 1);
    const projected = artifact.data.finance[0];
    assert.deepEqual(projected, await f.finance(f.child));
    assert.equal(projected.matching, undefined); assert.equal(projected.goals[0].parentPlannedCents, 0);
    const bytes = JSON.stringify(artifact.data);
    for (const field of ['journal', 'draft', 'matching', 'events', 'revision', 'fingerprint', 'sourceHash', 'finance_manifest', 'registration_token']) {
      assert.equal(bytes.includes(`"${field}"`), false, `export excludes ${field}`);
    }
    assert.equal(bytes.includes(hiddenOperation), false);
    assert.equal((await reauthenticate(f, f.parent)).status, 200);
    assert.ok((await f.parent.auth.rpc('get_own_export', { p_job_id: job.id })).error, 'fresh guardian proof still cannot read another author export');

    const parentDeletion = success(await f.parent.auth.rpc('request_own_deletion', { p_client_id: randomUUID() }), 'own guardian deletion request');
    await approve(f, parentDeletion.id);
    const blocked = await privacy.executeAndProject(parentDeletion.id, f.operator.user.id);
    assert.equal(blocked.status, 'blocked'); assert.equal(blocked.completed, false);
    const blockedStatus = success(await f.parent.auth.rpc('get_own_privacy_job', { p_job_id: parentDeletion.id }), 'blocked guardian status');
    assert.ok(blockedStatus.blockers.includes('guardian_handoff_review_required')); assert.equal(blockedStatus.deletionComplete, false);
    assert.equal((await f.request(f.child, '/v1/context')).status, 200, 'blocked guardian deletion must not strand the active child');

    const childDeletion = success(await f.child.auth.rpc('request_own_deletion', { p_client_id: randomUUID() }), 'own child deletion request');
    await approve(f, childDeletion.id);
    const revoked = await privacy.executeAndProject(childDeletion.id, f.operator.user.id);
    assert.equal(revoked.status, 'access_revoked'); assert.equal(revoked.completed, false); assert.equal(revoked.journalIncluded, false);
    assert.deepEqual(await sessions(f, f.child), []);
    assert.ok([401, 403].includes((await f.request(f.child, f.path)).status), 'retained old JWT cannot use the ledger after deletion');
    const retained = await f.signIn(f.child.email, f.child.secret);
    const status = success(await retained.auth.rpc('get_own_privacy_job', { p_job_id: childDeletion.id }), 'retained identity can inspect own privacy status');
    assert.equal(status.deletionComplete, false); assert.equal(status.journalIncluded, false);
    assert.ok(status.blockers.includes('auth_identity_purge_pending')); assert.ok(status.blockers.includes('backup_expiry_confirmation_pending'));
    assert.equal((await f.database.query('select state from app_private.profiles where user_id=$1', [f.child.user.id])).rows[0].state, 'closed');
    assert.equal((await f.database.query('select count(*)::int count from app_private.finance_events where family_id=$1', [f.familyId])).rows[0].count > 0, true, 'immutable shared history is retained honestly');
  } finally { await f.close(); }
});
