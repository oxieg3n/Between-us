import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
// @ts-expect-error pg is exercised against the real isolated local PostgreSQL service.
import pg from 'pg';

// This test uses only local SQL and synthetic identities. It never calls a push provider.
const values = JSON.parse((await readFile(new URL('../../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const databaseUrl = new URL(values.DB_URL);
if (values.API_URL !== 'http://127.0.0.1:54321' || !['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname) || databaseUrl.port !== '54322'
  || databaseUrl.pathname !== '/postgres' || databaseUrl.search || databaseUrl.hash) {
  throw Error('Receipt lock tests require isolated local services.');
}

test('receipt leasing prelocks the whole family union before waiting on any relationship pair', { timeout: 25_000 }, async () => {
  const setup = new pg.Client({ connectionString: values.DB_URL });
  const blocker = new pg.Client({ connectionString: values.DB_URL });
  const worker = new pg.Client({ connectionString: values.DB_URL });
  const observer = new pg.Client({ connectionString: values.DB_URL });
  const clients = [setup, blocker, worker, observer];
  const connected: typeof clients = [];
  const prefix = randomUUID().slice(0, 24);
  const id = (suffix: number) => `${prefix}${String(suffix).padStart(12, '0')}`;
  const families = [id(1), id(2), id(3)]; // A < B < Z.
  const users = [id(101), id(102), id(103), id(104)]; // A, B, Z, independent verifier.
  const emails = users.map((user) => `receipt-lock-${user}@fixture.test`);
  const contacts = [id(201), id(202)], conversations = [id(301), id(302)];
  const messages = [id(401), id(402)], outboxes = [id(501), id(502)], device = id(601);
  let originalPush: boolean | undefined;
  let fixtureCommitted = false;
  let leasing: Promise<{ result?: unknown[]; failed?: boolean }> | undefined;
  try {
    for (const client of clients) { await client.connect(); connected.push(client); }
    await setup.query('begin');
    const policy = await setup.query(`select d.local_synthetic,d.public_enrollment_enabled,d.real_child_data_enabled,
      c.synthetic_fixture_mode,c.push_delivery_enabled from app_private.deployment_policy d
      cross join app_private.communication_policy c where d.singleton and c.singleton for update of c`);
    assert.equal(policy.rows.length, 1);
    assert.equal(policy.rows[0].local_synthetic, true, 'existing local-only fixture policy is required');
    assert.equal(policy.rows[0].synthetic_fixture_mode, true);
    assert.equal(policy.rows[0].public_enrollment_enabled, false);
    assert.equal(policy.rows[0].real_child_data_enabled, false);
    originalPush = policy.rows[0].push_delivery_enabled;
    const existing = await setup.query(`select count(*)::int count from app_private.notification_receipts
      where (status='pending' or (status='leased' and lease_until<clock_timestamp())) and next_attempt_at<=clock_timestamp()`);
    assert.equal(existing.rows[0].count, 0, 'run serially in the isolated local database, without unrelated due receipts');
    await setup.query('update app_private.communication_policy set push_delivery_enabled=true where singleton');
    for (let index = 0; index < users.length; index++) {
      assert.ok(emails[index].endsWith('@fixture.test'));
      await setup.query(`with intent as (select app_private.issue_parent_registration($2)->>'token' token)
        insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        select $1,$2,now(),'{}'::jsonb,jsonb_build_object('registration_token',token),now(),now() from intent`, [users[index], emails[index]]);
    }
    await setup.query(`update app_private.profiles set kind='parent',state='active',display_name='Fictional receipt lock fixture' where user_id=any($1::uuid[])`, [users]);
    await setup.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$1,now(),now())', [users[2]]);
    for (let index = 0; index < families.length; index++) {
      await setup.query("insert into app_private.families(id,name,timezone) values($1,'Fictional receipt lock family','UTC')", [families[index]]);
      await setup.query("insert into app_private.memberships(family_id,user_id,role) values($1,$2,'guardian')", [families[index], users[index]]);
    }
    await setup.query("insert into app_private.operators(user_id,scope,active) values($1,'verification',true)", [users[3]]);
    // The old anchor-family order reaches B/Z before A/Z and waits on B/Z without holding A.
    for (let index = 0; index < contacts.length; index++) {
      const endpoint = index === 0 ? 1 : 0;
      await setup.query(`insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,external_connection,family_a_id,family_b_id,
        accepted_a_at,accepted_b_at,verified_by,verified_at,verified_until,verification_method,verification_evidence_ref)
        values($1,$2,$3,$4,$3,true,$5,$6,now(),now(),$7,now(),now()+interval '1 day','synthetic_fixture','fixture:receipt-lock-order')`,
      [contacts[index], index === 0 ? families[1] : families[2], users[endpoint], users[2], families[endpoint], families[2], users[3]]);
      await setup.query('insert into app_private.conversations(id,contact_id) values($1,$2)', [conversations[index], contacts[index]]);
      await setup.query(`insert into app_private.messages(id,conversation_id,sender_id,recipient_id,client_id,body,response)
        values($1,$2,$3,$4,$5,'Fictional receipt lock fixture body','listen')`, [messages[index], conversations[index], users[endpoint], users[2], randomUUID()]);
    }
    await setup.query("insert into app_private.notification_preferences(user_id,enabled,timezone,quiet_start,quiet_end) values($1,true,'UTC',0,0)", [users[2]]);
    const syntheticToken = `ExponentPushToken[fictional_receipt_lock_${randomUUID().replaceAll('-', '')}]`;
    await setup.query(`insert into app_private.device_tokens(id,user_id,session_id,platform,token,token_hash)
      values($1,$2,$2,'android',$3,sha256(convert_to($3,'UTF8')))`, [device, users[2], syntheticToken]);
    for (let index = 0; index < outboxes.length; index++) {
      await setup.query(`insert into app_private.notification_outbox(id,recipient_id,message_id,device_id,status,attempts,last_outcome)
        values($1,$2,$3,$4,'provider_accepted',1,'accepted')`, [outboxes[index], users[2], messages[index], device]);
      await setup.query(`insert into app_private.notification_receipts(outbox_id,ticket_id,dispatch_lease_token,next_attempt_at)
        values($1,$2,$3,clock_timestamp()-interval '1 second')`, [outboxes[index], `fictional-receipt-lock-${id(index + 701)}`, randomUUID()]);
      const allowed = await setup.query('select app_private.notification_allowed($1) allowed', [outboxes[index]]);
      assert.equal(allowed.rows[0].allowed, true, 'each fixture is an actually permitted external adult relationship');
    }
    await setup.query('commit'); fixtureCommitted = true;

    await blocker.query('begin');
    // Intentionally hold ONLY the B/Z pair key. Taking a family key here would invalidate the property test.
    await blocker.query("select pg_advisory_xact_lock(hashtextextended('betweenus-contact:'||$1::text||':'||$2::text,0))", [users[1], users[2]]);
    await worker.query('begin'); await worker.query("set local statement_timeout='10s'");
    const pid = (await worker.query('select pg_backend_pid() pid')).rows[0].pid;
    await worker.query('set local role service_role');
    // Attach both continuations immediately so a database failure never becomes an unhandled rejection.
    leasing = worker.query('select api.lease_notification_receipts(20) leased')
      .then((response: { rows: { leased: unknown[] }[] }) => ({ result: response.rows[0].leased }), () => ({ failed: true }));
    let waiting = false;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const activity = await observer.query("select wait_event_type,wait_event from pg_stat_activity where pid=$1", [pid]);
      if (activity.rows[0]?.wait_event_type === 'Lock' && activity.rows[0]?.wait_event === 'advisory') { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(waiting, true, 'worker must reach the deliberately blocked B/Z pair');
    await observer.query('begin');
    const probe = await observer.query('select pg_try_advisory_xact_lock(hashtextextended($1::text,1729)) acquired', [families[0]]);
    assert.equal(probe.rows[0].acquired, false, 'A must already be locked before waiting on the B/Z pair; old009 acquires A here');
    await observer.query('rollback'); await blocker.query('rollback');
    const finished = await leasing;
    assert.ok(finished);
    assert.equal(finished.failed, undefined, 'receipt batch completes after releasing the pair blocker');
    assert.ok(Array.isArray(finished.result)); assert.equal(finished.result.length, 2);
    for (const row of finished.result) assert.deepEqual(Object.keys(row as object).sort(), ['id', 'leaseToken', 'ticketId']);
    await worker.query('rollback'); // Do not retain receipt leases from the concurrency check.
  } finally {
    try {
      if (connected.includes(observer)) await observer.query('rollback');
      if (connected.includes(blocker)) await blocker.query('rollback');
      if (leasing) await leasing;
      if (connected.includes(worker)) await worker.query('rollback');
      if (connected.includes(setup)) {
        await setup.query('rollback');
        if (fixtureCommitted) {
          try {
            await setup.query('begin');
            await setup.query('delete from app_private.notification_outbox where id=any($1::uuid[])', [outboxes]);
            await setup.query('delete from app_private.messages where id=any($1::uuid[])', [messages]);
            await setup.query('delete from app_private.conversations where id=any($1::uuid[])', [conversations]);
            await setup.query('delete from app_private.trusted_contacts where id=any($1::uuid[])', [contacts]);
            await setup.query('delete from app_private.notification_preferences where user_id=any($1::uuid[])', [users]);
            await setup.query('delete from app_private.device_tokens where id=$1', [device]);
            await setup.query('delete from app_private.memberships where family_id=any($1::uuid[])', [families]);
            await setup.query('delete from app_private.families where id=any($1::uuid[])', [families]);
            await setup.query('delete from app_private.operators where user_id=any($1::uuid[])', [users]);
            await setup.query('delete from app_private.identity_audit where actor_id=any($1::uuid[]) or subject_id=any($1::uuid[])', [users]);
            await setup.query('delete from app_private.registration_intents where bound_user_id=any($1::uuid[]) or email=any($2::text[])', [users, emails]);
            await setup.query('delete from auth.users where id=any($1::uuid[]) and email=any($2::text[])', [users, emails]);
            await setup.query('commit');
          } finally {
            // Restore the policy even if a future FK makes fixture erasure fail.
            await setup.query('rollback');
            await setup.query('update app_private.communication_policy set push_delivery_enabled=$1 where singleton', [originalPush]);
          }
        }
      }
    } finally {
      await Promise.allSettled(connected.map(client => client.end()));
    }
  }
});
