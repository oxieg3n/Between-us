import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
// @ts-expect-error pg is exercised against the real isolated local PostgreSQL service.
import pg from 'pg';
import { createApi } from '../../src/api.ts';
const values = JSON.parse((await readFile(new URL('../../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
if (values.API_URL !== 'http://127.0.0.1:54321' || new URL(values.DB_URL).port !== '54322') throw Error('Integration tests require isolated local services.');
const client = (key = values.ANON_KEY) => createClient(values.API_URL, key, { db: { schema: 'api' }, auth: { autoRefreshToken: false, persistSession: false } });
const service = client(values.SERVICE_ROLE_KEY);
const handle = createApi({ url: values.API_URL, publicKey: values.ANON_KEY, serviceKey: values.SERVICE_ROLE_KEY, syntheticLocal: true });
const password = () => `Synthetic-${randomUUID()}-A9`;
async function adult(label: string) {
  const email = `${label}-${randomUUID()}@fixture.test`; const secret = password();
  const intent = await service.rpc('issue_parent_registration', { p_email: email }); assert.ifError(intent.error);
  const created = await service.auth.admin.createUser({ email, password: secret, email_confirm: true, user_metadata: { registration_token: intent.data.token, role: 'guardian' } }); assert.ifError(created.error);
  const auth = client(); const signed = await auth.auth.signInWithPassword({ email, password: secret }); assert.ifError(signed.error);
  assert.ok(!('registration_token' in signed.data.user!.user_metadata), 'Subsequent managed session does not retain enrollment metadata');
  const boot = await auth.rpc('bootstrap_parent', { p_display_name: `Fictional ${label}` }); assert.ifError(boot.error);
  return { auth, user: created.data.user!, session: signed.data.session!, secret, email };
}
test('managed parent signup requires an intent and real local email verification; recovery mail is local only', async () => {
  const email = `email-${randomUUID()}@fixture.test`; const secret = password();
  const uninvited = await client().auth.signUp({ email, password: secret, options: { data: { role: 'guardian' } } });
  assert.ok(uninvited.error, 'before-user-created hook blocks uninvited direct Auth signup');
  const intent = await service.rpc('issue_parent_registration', { p_email: email }); assert.ifError(intent.error);
  const auth = client();
  const signup = await auth.auth.signUp({ email, password: secret, options: { data: { registration_token: intent.data.token } } }); assert.ifError(signup.error);
  assert.equal(signup.data.session, null, 'unverified signup gets no active session');
  assert.ok((await auth.auth.signInWithPassword({ email, password: secret })).error);
  async function deliveredHash(kind: 'signup' | 'recovery'): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const inbox = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
      for (const item of inbox.messages ?? []) {
        if (!(item.To ?? []).some((to: { Address: string }) => to.Address === email)) continue;
        const message = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${encodeURIComponent(item.ID)}`)).json();
        const html = `${message.HTML ?? ''} ${message.Text ?? ''}`.replaceAll('&amp;', '&');
        const links = html.match(/https?:\/\/[^\s"<>]+/g) ?? [];
        for (const link of links) { const url = new URL(link); if (url.pathname === '/auth/v1/verify' && url.searchParams.get('type') === kind && url.searchParams.has('token')) return url.searchParams.get('token')!; }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('Local managed Auth email was not received in Mailpit.');
  }
  const verified = await auth.auth.verifyOtp({ token_hash: await deliveredHash('signup'), type: 'signup' }); assert.ifError(verified.error);
  assert.ok(verified.data.session); assert.ok(!('registration_token' in verified.data.user!.user_metadata));
  assert.ifError((await auth.rpc('bootstrap_parent', { p_display_name: 'Fictional mail owner' })).error);
  const reset = await client().auth.resetPasswordForEmail(email); assert.ifError(reset.error);
  const recovery = client(); assert.ifError((await recovery.auth.verifyOtp({ token_hash: await deliveredHash('recovery'), type: 'recovery' })).error);
  const replacement = password(); assert.ifError((await recovery.auth.updateUser({ password: replacement })).error);
  assert.ok((await client().auth.signInWithPassword({ email, password: secret })).error);
  assert.ifError((await client().auth.signInWithPassword({ email, password: replacement })).error);
});
test('real managed Auth enforces joint guardian enrollment, distinct child identity, server roles and immediate revocation', async () => {
  const database = new pg.Client({ connectionString: values.DB_URL }); await database.connect();
  try {
    const forged = await service.auth.admin.createUser({ email: `forged-${randomUUID()}@fixture.test`, password: password(), email_confirm: true, user_metadata: { role: 'guardian', kind: 'parent' } });
    assert.ok(forged.error, 'admin Auth creation still requires an enrollment intent');
    const parent = await adult('parent'); const operator = await adult('operator'); const stranger = await adult('other-family');
    const wrongPassword = await client().auth.signInWithPassword({ email: parent.email, password: 'Wrong-Password1234' }); assert.ok(wrongPassword.error);
    const family = await parent.auth.rpc('create_family', { p_name: 'Fictional Family', p_timezone: 'America/New_York' }); assert.ifError(family.error);
    const subject = await parent.auth.rpc('create_child', { p_family_id: family.data, p_name: 'Fictional teen' }); assert.ifError(subject.error);
    const request = (actor: typeof parent, path: string, payload?: unknown) => handle(new Request(`http://127.0.0.1:8787${path}`, { method: payload === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${actor.session.access_token}`, 'content-type': 'application/json' }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }));
    assert.equal((await request(stranger, '/v1/enrollment/child', { childId: subject.data, password: password() })).status, 403);
    assert.equal((await request(parent, '/v1/enrollment/child', { childId: subject.data, password: password() })).status, 403, 'teen cannot bypass verified guardian consent');
    const consent = await parent.auth.rpc('request_child_consent', { p_child_id: subject.data, p_notice_version: 'synthetic-v1', p_policy_version: 'synthetic-v1' }); assert.ifError(consent.error);
    const selfVerify = await parent.auth.rpc('verify_child_consent', { p_consent_id: consent.data, p_method: 'synthetic_fixture', p_evidence_reference: 'fixture-only', p_expires_at: new Date(Date.now() + 86400000).toISOString() }); assert.ok(selfVerify.error);
    await database.query("insert into app_private.operators(user_id,scope,active) values($1,'consent',true),($1,'verification',true)", [operator.user.id]);
    const verified = await operator.auth.rpc('verify_child_consent', { p_consent_id: consent.data, p_method: 'synthetic_fixture', p_evidence_reference: 'FICTIONAL-only-not-real-VPC', p_expires_at: new Date(Date.now() + 86400000).toISOString() }); assert.ifError(verified.error);
    const childSecret = password(); const provision = await request(parent, '/v1/enrollment/child', { childId: subject.data, password: childSecret }); assert.equal(provision.status, 201);
    const enrollment = await provision.json(); assert.equal(enrollment.guardianManaged, true);
    const child = client(); const signed = await child.auth.signInWithPassword({ email: enrollment.email, password: childSecret }); assert.ifError(signed.error); assert.notEqual(signed.data.user!.id, parent.user.id);
    const parentAccept = await parent.auth.rpc('accept_child_enrollment', { p_token: enrollment.acceptanceToken }); assert.ok(parentAccept.error);
    const accept = await child.rpc('accept_child_enrollment', { p_token: enrollment.acceptanceToken }); assert.ifError(accept.error);
    const promote = await child.rpc('bootstrap_parent', { p_display_name: 'forged adult' }); assert.ok(promote.error);
    const context = await child.rpc('get_context'); assert.ifError(context.error); assert.equal(context.data.user.kind, 'child'); assert.equal(context.data.policy.guardianManagedChildren, true);
    const crossFamily = await stranger.auth.rpc('create_child', { p_family_id: family.data, p_name: 'forged subject' }); assert.ok(crossFamily.error);
    const rawWrite = await child.schema('app_private').from('memberships').select('*'); assert.ok(rawWrite.error);
    assert.equal((await request(stranger, `/v1/finance/${family.data}/${subject.data}`)).status, 403);
    assert.equal((await request(parent, `/v1/finance/${family.data}/${subject.data}`, { id: randomUUID(), action: { kind: 'create_goal', role: 'parent', label: 'forgery' } })).status, 400);
    const withdraw = await parent.auth.rpc('withdraw_consent', { p_child_id: subject.data }); assert.ifError(withdraw.error);
    assert.ok((await child.rpc('get_context')).error, 'withdrawal immediately denies ordinary child access');
    const oldJwt = parent.session.access_token; await parent.auth.auth.signOut({ scope: 'local' });
    // Exercise the old bearer explicitly: Auth JWT expiry alone must not authorize it.
    const denied = await handle(new Request('http://127.0.0.1:8787/v1/context', { headers: { Authorization: `Bearer ${oldJwt}` } }));
    assert.ok([401, 403].includes(denied.status));
  } finally { await database.end(); }
});
