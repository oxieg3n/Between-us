import assert from 'node:assert/strict';
import { SCHEMAS, sha256, fail, targetGuard, tombstoneGuard, canonicalAcl } from './guards.mjs';

const quote = value => { if (!/^[a-z_][a-z0-9_]*$/.test(value)) fail(); return `"${value}"`; };
export async function inventory(db) {
  await db.query("set timezone='UTC'");
  const tables = (await db.query(`select n.nspname schema,c.relname name,c.relrowsecurity rls,c.relowner::regrole::text owner,
    (select jsonb_agg(jsonb_build_object('grantee',coalesce(g.rolname,'PUBLIC'),'grantor',r.rolname,
      'privilege',a.privilege_type,'grantable',a.is_grantable))
      from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      join pg_roles r on r.oid=a.grantor left join pg_roles g on g.oid=a.grantee) acl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[])
    and c.relkind='r' order by n.nspname,c.relname`, [SCHEMAS])).rows;
  const rows = [];
  for (const table of tables) {
    const result = (await db.query(`select count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(h,'' order by h),''),'UTF8')),'hex') hash
      from(select encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') h from ${quote(table.schema)}.${quote(table.name)} t) x`)).rows[0];
    rows.push({ ...table, acl: canonicalAcl(table.acl ?? []), ...result });
  }
  const functions = (await db.query(`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,
    p.prosecdef definer,p.proconfig config,p.proowner::regrole::text owner,
    (select jsonb_agg(jsonb_build_object('grantee',coalesce(g.rolname,'PUBLIC'),'grantor',r.rolname,
      'privilege',a.privilege_type,'grantable',a.is_grantable))
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      join pg_roles r on r.oid=a.grantor left join pg_roles g on g.oid=a.grantee) acl,
    pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=any($1::text[]) and p.prokind='f'
    order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`, [SCHEMAS])).rows;
  const policies = (await db.query('select * from pg_policies where schemaname=any($1::text[]) order by schemaname,tablename,policyname', [SCHEMAS])).rows;
  const extensions = (await db.query('select extname,extversion,nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by extname')).rows;
  const extensionSchema = (await db.query(`select owner.rolname owner,coalesce(grantee.rolname,'PUBLIC') grantee,
    a.privilege_type privilege,a.is_grantable grantable from pg_namespace n
    join pg_roles owner on owner.oid=n.nspowner
    cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    left join pg_roles grantee on grantee.oid=a.grantee where n.nspname='extensions'
    order by grantee,privilege`)).rows;
  const migrations = (await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version);
  const canonicalFunctions = functions.map(fn => ({ ...fn, acl: canonicalAcl(fn.acl ?? []) }));
  return { tables: rows, codeHash: sha256(JSON.stringify({ functions: canonicalFunctions, policies })), extensions, extensionSchema, migrations };
}
export function assertSnapshot(actual, expected) {
  assert.deepEqual(actual.tables, expected.tables, 'restored table rows/RLS/ACL must exactly match the snapshot');
  assert.equal(actual.codeHash, expected.codeHash, 'restored function definitions/grants and policies must match');
  assert.deepEqual(actual.migrations, expected.migrations);
  assert.deepEqual(actual.extensionSchema, expected.extensionSchema);
}
export async function quarantineGuard(db, name, runId, kind = 'recovery') {
  targetGuard(name, runId, kind);
  const state = (await db.query(`select current_database() name,d.datconnlimit,
    shobj_description(d.oid,'pg_database') marker from pg_database d where d.datname=current_database()`)).rows[0];
  if (state.name !== name || state.datconnlimit !== 0 || state.marker !== `BetweenUs isolated synthetic ${kind} ${runId}`) fail();
  const allowed = (await db.query(`select r.rolname from pg_roles r where not r.rolsuper
    and has_database_privilege(r.oid,current_database(),'CONNECT')`)).rows;
  if (allowed.length) fail();
}
export async function replayFixture(db, f, tombstone, snapshotHash, name) {
  tombstoneGuard(tombstone, f.runId, snapshotHash, f.subjects, tombstone.snapshotAt);
  if (tombstone.childId !== f.childId || tombstone.familyId !== f.familyId || tombstone.contactId !== f.contactId
    || tombstone.partialDeletion.messageId !== f.childMessageId) fail();
  await quarantineGuard(db, name, f.runId);
  await db.query('begin');
  try {
    const exists = (await db.query(`select count(*)::int n from auth.users where id=any($1::uuid[]) and email like '%.test'`, [f.subjects])).rows[0];
    if (exists.n !== 3) fail();
    await db.query('update auth.sessions set not_after=$2 where user_id=any($1::uuid[])', [f.subjects, tombstone.effectiveAt]);
    await db.query("update app_private.consents set status='withdrawn',withdrawn_at=$3 where child_id=$1 and family_id=$2", [f.childId, f.familyId, tombstone.effectiveAt]);
    await db.query("update app_private.profiles set state='closed',display_name='Deleted fictional account' where user_id=$1", [f.subjects[2]]);
    await db.query("update app_private.children set state='closed',name='Deleted fictional account' where id=$1 and account_user_id=$2", [f.childId, f.subjects[2]]);
    await db.query("update app_private.memberships set status='revoked' where user_id=$1 and family_id=$2", [f.subjects[2], f.familyId]);
    await db.query('update app_private.operators set active=false where user_id=$1', [f.subjects[1]]);
    await db.query('update app_private.trusted_contacts set revoked_at=$2 where id=$1', [f.contactId, tombstone.effectiveAt]);
    await db.query('update app_private.device_tokens set revoked_at=$2 where user_id=any($1::uuid[])', [f.subjects, tombstone.effectiveAt]);
    await db.query(`update app_private.notification_outbox set status='suppressed',lease_until=null,lease_token=null,last_outcome='authorization'
      where recipient_id=any($1::uuid[]) or message_id in(select id from app_private.messages where sender_id=any($1::uuid[]))`, [f.subjects]);
    await db.query('update app_private.domain_notification_events set cancelled_at=$2 where recipient_id=any($1::uuid[]) or actor_id=any($1::uuid[])', [f.subjects, tombstone.effectiveAt]);
    await db.query('update app_private.registration_intents set expires_at=least(expires_at,$2::timestamptz) where issued_by=any($1::uuid[]) or bound_user_id=any($1::uuid[])', [f.subjects, tombstone.effectiveAt]);
    await db.query('update app_private.guardian_invites set revoked_at=coalesce(revoked_at,$2) where issued_by=any($1::uuid[]) or accepted_by=any($1::uuid[])', [f.subjects, tombstone.effectiveAt]);
    await db.query('update app_private.external_contact_invitations set revoked_at=coalesce(revoked_at,$2) where subject_user_id=any($1::uuid[]) or requested_by=any($1::uuid[]) or consumed_by=any($1::uuid[])', [f.subjects, tombstone.effectiveAt]);
    await db.query('update app_private.checkin_schedules set enabled=false,removed_at=coalesce(removed_at,$2) where child_id=$1', [f.childId, tombstone.effectiveAt]);
    await db.query('update app_private.checkin_invitations set expires_at=least(expires_at,$2::timestamptz) where recipient_id=any($1::uuid[]) or creator_id=any($1::uuid[])', [f.subjects, tombstone.effectiveAt]);
    await db.query("update app_private.privacy_lifecycle_jobs set artifact=null,artifact_expires_at=null,status='expired' where subject_id=any($1::uuid[]) and kind='export'", [f.subjects]);
    await db.query(`delete from app_private.messages m where m.id=$1 and m.sender_id=$2 and m.conversation_id=$3 and m.acknowledged_at is null
      and not app_private.privacy_has_hold(m.sender_id,'messages') and not app_private.privacy_has_hold(m.recipient_id,'messages')
      and not exists(select 1 from app_private.safety_reports r where r.message_id=m.id)`, [f.childMessageId, f.subjects[2], f.conversationId]);
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; }
}
export async function withClaims(db, tokenClaims, role, sql, args = []) {
  if (!['authenticated', 'service_role', 'anon'].includes(role)) fail();
  await db.query('begin');
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(tokenClaims)]);
    await db.query(`set local role ${role}`);
    const result = await db.query(sql, args);
    await db.query('commit'); return result;
  } catch (error) { await db.query('rollback'); throw error; }
}
export async function assertReplay(db, f, name) {
  await quarantineGuard(db, name, f.runId);
  for (const token of [f.parentClaims, f.childClaims]) {
    for (const [sql, args] of [ ['select api.get_context()', []],
      ['select api.send_message($1,$2,$3,$4)', [f.conversationId, 'Fictional recovery message.', f.clientId, 'later']],
      ['select api.finance_scope($1,$2)', [f.familyId, f.childId]] ]) {
      let denied = false;
      try { await withClaims(db, token, 'authenticated', sql, args); } catch (error) { denied = error.code === '42501'; }
      if (!denied) fail();
    }
  }
  const result = (await db.query(`select
    (select count(*)::int from app_private.messages where id=$1) erased,
    (select count(*)::int from app_private.messages where id=$2 and sender_id=$3 and client_id=$4) retained,
    (select count(*)::int from app_private.finance_commands where family_id=$5 and actor_id=$3 and operation_id=$6) commands,
    (select count(*)::int from auth.sessions where user_id=any($7::uuid[]) and (not_after is null or not_after>clock_timestamp())) sessions,
    (select count(*)::int from app_private.operators where user_id=$8 and active) operators`,
  [f.childMessageId, f.parentMessageId, f.subjects[0], f.clientId, f.familyId, f.financeOperationId, f.subjects, f.subjects[1]])).rows[0];
  assert.deepEqual(result, { erased: 0, retained: 1, commands: 1, sessions: 0, operators: 0 });
  return result;
}
