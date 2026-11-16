import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
// @ts-expect-error pg is exercised against real isolated local PostgreSQL.
import pg from 'pg';
import { integrationFixture, sessionId, success } from './integration-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof integrationFixture>>;
function fixedBearer(f: Fixture, token: string) {
  return createClient('http://127.0.0.1:54321', f.publicKey, {
    db: { schema: 'api' }, accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
async function permittedConversation(f: Fixture) {
  assert.ok(f.child && f.operator);
  await f.database.query("insert into app_private.operators(user_id,scope,active) values($1,'verification',true)", [f.operator.user.id]);
  success(await f.parent.auth.rpc('request_contact', { p_family_id: f.familyId, p_recipient_email: f.child.email }), 'authorized contact request');
  const contact = (await f.database.query(`select id from app_private.trusted_contacts
    where a=least($1::uuid,$2::uuid) and b=greatest($1::uuid,$2::uuid)`, [f.parent.user.id, f.child.user.id])).rows[0];
  assert.ok(contact?.id, 'authorized invitation creates the relationship');
  success(await f.child.auth.rpc('accept_contact', { p_contact_id: contact.id }), 'child accepts contact');
  success(await f.parent.auth.rpc('approve_contact', { p_contact_id: contact.id }), 'separate guardian approval');
  success(await f.service.rpc('verify_contact', { p_contact_id: contact.id, p_operator_id: f.operator.user.id,
    p_method: 'synthetic_fixture', p_evidence_ref: 'fixture:qualification-not-real-verification' }), 'independent synthetic verification');
  return success(await f.parent.auth.rpc('create_conversation', { p_contact_id: contact.id }), 'permitted conversation') as { id: string };
}

test('immutable managed bearers preserve message identity across changed replay, block and session revocation', { timeout: 60_000 }, async () => {
  const f = await integrationFixture();
  try {
    assert.ok(f.child);
    const conversation = await permittedConversation(f);
    const sender = fixedBearer(f, f.parent.session.access_token), recipient = fixedBearer(f, f.child.session.access_token);
    const clientId = randomUUID();
    const command = { p_conversation_id: conversation.id, p_body: 'Fictional approved qualification message', p_client_id: clientId, p_response: 'listen' };
    const saved = success(await sender.rpc('send_message', command), 'explicit send');
    assert.deepEqual(success(await sender.rpc('send_message', command), 'exact retry'), saved);
    assert.equal((await sender.rpc('send_message', { ...command, p_body: 'Different fictional words' })).error?.code, '22023');
    assert.equal((await sender.rpc('send_message', { ...command, p_response: 'reply' })).error?.code, '22023');
    const unavailable = success(await recipient.rpc('get_message_receipt', { p_client_id: clientId }), 'recipient opaque receipt');
    assert.deepEqual(unavailable, { status: 'unknown', clientId }, 'recipient cannot inspect sender nonce');
    success(await recipient.rpc('block_user', { p_user_id: f.parent.user.id }), 'child independently blocks');
    assert.equal((await sender.rpc('send_message', command)).error?.code, '42501', 'saved nonce confers no replay permission after block');
    const history = success(await recipient.rpc('fetch_messages', { p_conversation_id: conversation.id }), 'blocked recipient fetch');
    assert.deepEqual(history.messages, [], 'unacknowledged body cannot cross the block');
    const receipt = success(await sender.rpc('get_message_receipt', { p_client_id: clientId }), 'sender saved receipt after block');
    assert.equal(receipt.status, 'saved');
    assert.deepEqual(Object.keys(receipt).sort(), ['clientId', 'conversationId', 'messageId', 'peerId', 'status']);
    assert.equal((await f.database.query('select count(*)::int n from app_private.messages where sender_id=$1 and client_id=$2',
      [f.parent.user.id, clientId])).rows[0].n, 1);
    assert.equal((await f.service.auth.admin.signOut(f.parent.session.access_token, 'local')).error, null, 'remote managed-session revocation');
    // These clients retain the original JWT; SDK sign-out/unsubscribe cannot explain the denials.
    assert.equal((await sender.rpc('get_message_receipt', { p_client_id: clientId })).error?.code, '42501');
    assert.equal((await sender.rpc('send_message', command)).error?.code, '42501');
    assert.ok([401, 403].includes((await f.request(f.parent, '/v1/context')).status));
  } finally { await f.close(); }
});

test('managed report access follows current independent assignment, never guardian or forged metadata', { timeout: 60_000 }, async () => {
  const f = await integrationFixture();
  try {
    assert.ok(f.child);
    await permittedConversation(f);
    const reviewer = await f.adult('qualification-safety-reviewer');
    await f.database.query("insert into app_private.operators(user_id,scope,active) values($1,'safety',true)", [reviewer.user.id]);
    const report = success(await f.child.auth.rpc('submit_report', { p_reported_user_id: f.parent.user.id,
      p_description: 'Fictional unsafe guardian exercise; no real person', p_message_id: null }), 'child confidential report');
    assert.equal(report.staffedResponsePromised, false);
    assert.equal((await f.parent.auth.rpc('get_report', { p_report_id: report.id })).error?.code, '42501');
    assert.equal((await reviewer.auth.rpc('get_report', { p_report_id: report.id })).error?.code, '42501', 'unassigned active staff denied');
    const assignment = await f.service.rpc('assign_report', { p_report_id: report.id, p_operator_id: reviewer.user.id });
    assert.equal(assignment.error, null, 'independent case assignment');
    assert.equal(assignment.data, null, 'assignment RPC has a void response');
    const reader = fixedBearer(f, reviewer.session.access_token);
    assert.equal(success(await reader.rpc('get_report', { p_report_id: report.id }), 'assigned reader').id, report.id);
    success(await reader.rpc('update_report', { p_report_id: report.id, p_status: 'triaged', p_response: 'Synthetic drill only' }), 'assigned update');
    const invite = success(await f.parent.auth.rpc('invite_guardian', { p_family_id: f.familyId, p_email: reviewer.email }), 'guardian invitation');
    success(await reviewer.auth.rpc('accept_guardian_invite', { p_token: invite.token }), 'reviewer becomes guardian through authorized flow');
    assert.equal((await reader.rpc('get_report', { p_report_id: report.id })).error?.code, '42501', 'old assigned bearer loses independence immediately');
    assert.equal((await reader.rpc('update_report', { p_report_id: report.id, p_status: 'closed', p_response: '' })).error?.code, '42501');
    success(await f.child.auth.auth.updateUser({ data: { role: 'guardian', kind: 'parent', operator: true, scope: 'safety' } }), 'untrusted metadata update');
    const forged = await f.signIn(f.child.email, f.child.secret);
    assert.equal(forged.user.user_metadata.role, 'guardian', 'positive control: new managed user metadata contains forgery');
    const context = success(await forged.auth.rpc('get_context'), 'current child context');
    assert.equal(context.user.kind, 'child');
    assert.equal((await forged.auth.rpc('bootstrap_parent', { p_display_name: 'Forged' })).error?.code, '42501');
    assert.equal((await forged.auth.rpc('assign_report', { p_report_id: report.id, p_operator_id: forged.user.id })).error?.code, '42501');
    assert.equal(success(await forged.auth.rpc('get_report', { p_report_id: report.id }), 'reporter own access remains').id, report.id);
  } finally { await f.close(); }
});

for (const operation of ['context', 'privacy', 'reauthentication'] as const) test(`${operation} session-row lock wait cannot carry authorization past the managed deadline`, { timeout: 25_000 }, async () => {
  const f = await integrationFixture({ child: false, privacy: operation === 'reauthentication' });
  const values = JSON.parse((await readFile(new URL('../../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  const endpoint = new URL(values.DB_URL);
  assert.equal(values.API_URL, 'http://127.0.0.1:54321');
  assert.ok(['postgres:', 'postgresql:'].includes(endpoint.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
    && endpoint.port === '54322' && endpoint.pathname === '/postgres' && !endpoint.search && !endpoint.hash, 'isolated local database only');
  const blocker = new pg.Client({ connectionString: values.DB_URL }), worker = new pg.Client({ connectionString: values.DB_URL });
  let pending: Promise<{ code: string | undefined }> | undefined;
  try {
    await blocker.connect(); await worker.connect();
    const sid = sessionId(f.parent);
    await f.database.query("update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id=$1", [sid]);
    await blocker.query('begin');
    await blocker.query('select id from auth.sessions where id=$1 for update', [sid]);
    await worker.query('begin'); await worker.query("set local statement_timeout='10s'");
    const pid = (await worker.query('select pg_backend_pid() pid')).rows[0].pid;
    // SQL claims identify an actual managed account/session; this is a PostgreSQL lock test, not a forged HTTP JWT.
    await worker.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: f.parent.user.id,
      session_id: sid, role: 'authenticated', exp: f.parent.session.expires_at })]);
    await worker.query(`set local role ${operation === 'reauthentication' ? 'service_role' : 'authenticated'}`);
    const sql = operation === 'context' ? 'select api.get_context()' : operation === 'privacy' ? 'select api.list_own_sessions()'
      : "select api.record_privacy_reauthentication($1,$2,'managed_password','fixture:trusted-service-lock-drill')";
    pending = worker.query(sql, operation === 'reauthentication' ? [f.parent.user.id, sid] : [])
      .then(() => ({ code: undefined }), (error: { code?: string }) => ({ code: error.code }));
    let waited = false;
    const waitDeadline = performance.now() + 5000;
    while (performance.now() < waitDeadline) {
      const activity = (await f.database.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0];
      if (activity?.wait_event_type === 'Lock') { waited = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(waited, true, 'positive control: actor actually waits on the held managed-session row');
    let expired = false;
    const expiryDeadline = performance.now() + 5000;
    while (performance.now() < expiryDeadline) {
      expired = (await f.database.query('select not_after<=clock_timestamp() expired from auth.sessions where id=$1', [sid])).rows[0]?.expired === true;
      if (expired) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(expired, true, 'DB clock passes the actual deadline before releasing the blocker');
    await blocker.query('rollback');
    assert.ok(pending);
    assert.equal((await pending).code, '42501', 'post-lock authorization must use current DB time');
  } finally {
    await blocker.query('rollback').catch(() => {});
    if (pending) await pending;
    await worker.query('rollback').catch(() => {});
    await Promise.allSettled([blocker.end(), worker.end()]);
    await f.close();
  }
});

test('finance service scope rechecks the managed deadline after its actual family-lock wait', { timeout: 30_000 }, async () => {
  const f = await integrationFixture();
  const values = JSON.parse((await readFile(new URL('../../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  const endpoint = new URL(values.DB_URL);
  assert.equal(values.API_URL, 'http://127.0.0.1:54321');
  assert.ok(['postgres:', 'postgresql:'].includes(endpoint.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
    && endpoint.port === '54322' && endpoint.pathname === '/postgres' && !endpoint.search && !endpoint.hash, 'isolated local database only');
  const blocker = new pg.Client({ connectionString: values.DB_URL }), worker = new pg.Client({ connectionString: values.DB_URL });
  let pending: Promise<{ code: string | undefined }> | undefined;
  try {
    assert.ok(f.child);
    const scope = success(await f.parent.auth.rpc('finance_scope', { p_family_id: f.familyId, p_child_id: f.childId }), 'real managed finance scope');
    await blocker.connect(); await worker.connect();
    const sid = sessionId(f.parent);
    await blocker.query('begin'); await blocker.query('select app_private.lock_family($1)', [f.familyId]);
    await f.database.query("update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id=$1", [sid]);
    await worker.query('begin'); await worker.query("set local statement_timeout='10s'");
    const pid = (await worker.query('select pg_backend_pid() pid')).rows[0].pid;
    await worker.query('set local role service_role');
    pending = worker.query('select api.finance_load($1)', [scope])
      .then(() => ({ code: undefined }), (error: { code?: string }) => ({ code: error.code }));
    let waited = false;
    const waitDeadline = performance.now() + 5000;
    while (performance.now() < waitDeadline) {
      const activity = (await f.database.query('select wait_event_type,wait_event from pg_stat_activity where pid=$1', [pid])).rows[0];
      if (activity?.wait_event_type === 'Lock' && activity.wait_event === 'advisory') { waited = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(waited, true, 'positive control: finance actually holds its session SHARE and waits on the family');
    let expired = false;
    const expiryDeadline = performance.now() + 5000;
    while (performance.now() < expiryDeadline) {
      expired = (await f.database.query('select not_after<=clock_timestamp() expired from auth.sessions where id=$1', [sid])).rows[0]?.expired === true;
      if (expired) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(expired, true, 'DB session deadline passes while family is still locked');
    await blocker.query('rollback'); assert.ok(pending);
    assert.equal((await pending).code, '42501', 'finance cannot use an expired pre-family authorization');
  } finally {
    await blocker.query('rollback').catch(() => {});
    if (pending) await pending;
    await worker.query('rollback').catch(() => {});
    await Promise.allSettled([blocker.end(), worker.end()]);
    await f.close();
  }
});
