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
  const indexes = (await db.query(`select n.nspname schema,t.relname table_name,i.relname name,i.relowner::regrole::text owner,
    pg_get_indexdef(i.oid) definition,x.indisvalid valid,x.indisready ready from pg_index x join pg_class i on i.oid=x.indexrelid
    join pg_class t on t.oid=x.indrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname=any($1::text[]) order by n.nspname,t.relname,i.relname`, [SCHEMAS])).rows;
  const constraints = (await db.query(`select n.nspname schema,c.relname table_name,x.conname name,x.convalidated valid,
    pg_get_constraintdef(x.oid) definition from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=any($1::text[]) order by n.nspname,c.relname,x.conname`, [SCHEMAS])).rows;
  const triggers = (await db.query(`select n.nspname schema,c.relname table_name,t.tgname name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=any($1::text[]) and not t.tgisinternal order by n.nspname,c.relname,t.tgname`, [SCHEMAS])).rows;
  return { tables: rows, codeHash: sha256(JSON.stringify({ functions: canonicalFunctions, policies })),
    structureHash: sha256(JSON.stringify({ indexes, constraints, triggers })), extensions, extensionSchema, migrations };
}
export function assertSnapshot(actual, expected) {
  if (typeof actual.structureHash !== 'string' || typeof expected.structureHash !== 'string') fail();
  assert.deepEqual(actual.tables, expected.tables, 'restored table rows/RLS/ACL must exactly match the snapshot');
  assert.equal(actual.codeHash, expected.codeHash, 'restored function definitions/grants and policies must match');
  assert.equal(actual.structureHash, expected.structureHash, 'restored indexes, constraints and trigger definitions/enabled state must match');
  assert.deepEqual(actual.migrations, expected.migrations);
  assert.deepEqual(actual.extensionSchema, expected.extensionSchema);
}

export function archiveAuditSummary(row, requireExisting = false) {
  const fields = ['families','checkpoints','visibleCapsules','activeVisibleCapsules','visibleCurrentEntities','archivedOccurrences',
    'privateOrigins','privateCapsules','activePrivateCapsules','projectionSnapshots','activityRows'];
  if (!row || row.issues !== 0 || fields.some(key => !Number.isSafeInteger(row[key]) || row[key] < 0)
    || row.activeVisibleCapsules > row.visibleCapsules || row.activePrivateCapsules > row.privateCapsules) fail();
  const actualArchiveCoverage = row.checkpoints > 0 && row.visibleCapsules > 0 && row.privateCapsules > 0;
  if (requireExisting && !actualArchiveCoverage) fail();
  return { ...Object.fromEntries(fields.map(key => [key, row[key]])), actualArchiveCoverage, checks: 'canonical checkpoint/capsule/snapshot hashes; covered ledger prefixes; source/origin/residency/current-entity bindings' };
}

/** Read-only whole-snapshot audit. No authority bypass or old-operation execution is inferred from these checks. */
export async function financeArchiveIntegrity(db, requireExisting = false) {
  const verified = await db.query('select app_private.finance_verify_source(family_id) checked from app_private.finance_aggregates');
  const row = (await db.query(`with
    checkpoint_issues as(select c.id from app_private.finance_checkpoints c
      left join app_private.finance_checkpoints p on p.id=c.previous_id
      cross join lateral(select count(*)::int n,app_private.finance_state_hash(coalesce(jsonb_agg(e.payload order by e.sequence),'[]')) hash
        from app_private.finance_events e where e.family_id=c.family_id and e.sequence>coalesce(p.through_sequence,0) and e.sequence<=c.through_sequence) covered
      where c.state_hash is distinct from app_private.finance_state_hash(c.checkpoint)
        or c.covered_count<>covered.n or c.covered_events_hash is distinct from covered.hash
        or c.through_sequence-coalesce(p.through_sequence,0)<>covered.n
        or(c.previous_id is not null and(p.id is null or p.family_id<>c.family_id or p.aggregate_revision>=c.aggregate_revision))),
    visible_issues as(select c.id from app_private.finance_archive_capsules c
      join app_private.finance_checkpoints p on p.id=c.checkpoint_id join app_private.finance_events e on e.family_id=c.family_id and e.sequence=c.source_sequence
      where c.hash is distinct from app_private.finance_state_hash(c.payload) or c.payload->>'childId' is distinct from c.child_id::text
        or c.payload->'version' is distinct from '1'::jsonb or p.family_id<>c.family_id or e.child_id<>c.child_id
        or c.previous_state_hash is distinct from p.previous_state_hash or c.source_sequence-p.through_sequence not between 0 and 1),
    visible_residency_issues as(select r.capsule_id from app_private.finance_archive_residency r join app_private.finance_archive_capsules c on c.id=r.capsule_id
      left join app_private.finance_events h on h.family_id=c.family_id and h.sequence=r.hydrated_sequence
      where r.family_id<>c.family_id or r.child_id<>c.child_id or(not r.active and(h.sequence is null or h.child_id<>c.child_id or h.sequence<=c.source_sequence))),
    current_issues as(select k.capsule_id from app_private.finance_archive_entity_keys k join app_private.finance_archive_residency r on r.capsule_id=k.capsule_id and r.active
      left join app_private.finance_archive_current_entities x on x.family_id=k.family_id and x.child_id=k.child_id and x.kind=k.kind and x.entity_id=k.entity_id and x.capsule_id=k.capsule_id
      where x.capsule_id is null union all
      select x.capsule_id from app_private.finance_archive_current_entities x join app_private.finance_archive_residency r on r.capsule_id=x.capsule_id
      where not r.active or x.family_id<>r.family_id or x.child_id<>r.child_id),
    entity_issues as(select k.capsule_id from app_private.finance_archive_entity_keys k join app_private.finance_archive_capsules c on c.id=k.capsule_id
      where k.family_id<>c.family_id or k.child_id<>c.child_id or k.source_sequence<>c.source_sequence or not exists(
        select 1 from jsonb_array_elements(case k.kind when 'occurrence' then c.payload->'occurrences' when 'payout' then c.payload->'payouts'
          when 'allocation' then c.payload->'allocations' else '[]'::jsonb end) entity where entity->>'id'=k.entity_id
        union all select 1 from jsonb_array_elements(c.payload->'payouts') payout cross join lateral jsonb_array_elements(payout->'payments') payment
          where k.kind='payment' and payment->>'id'=k.entity_id)),
    paid_issues as(select a.family_id from app_private.finance_aggregates a cross join lateral jsonb_array_elements(a.state->'children') child
      cross join lateral(select coalesce(sum((c.payload->>'paidCents')::numeric),0) total from app_private.finance_archive_residency r
        join app_private.finance_archive_capsules c on c.id=r.capsule_id where r.family_id=a.family_id and r.child_id=(child->>'id')::uuid and r.active) paid
      where paid.total is distinct from coalesce((a.state->'checkpoint'->'books'->(child->>'id')->>'archivedPaidCents')::numeric,0)),
    occurrence_issues as(select c.id from app_private.finance_archive_capsules c cross join lateral jsonb_array_elements(c.payload->'occurrences') o
      left join app_private.finance_archived_occurrences b on b.family_id=c.family_id and b.child_id=c.child_id and b.occurrence_id=o->>'id'
      where b.occurrence_id is null or b.chore_id is distinct from o->>'choreId' or b.due_date::text is distinct from o->>'dueDate'
        or b.reward_cents is distinct from(o->>'rewardCents')::bigint
        or b.budget_cents is distinct from case when o->>'status'='approved' then(o->>'rewardCents')::bigint else 0 end),
    origin_issues as(select o.match_id from app_private.finance_private_match_origins o
      join app_private.finance_events e on e.family_id=o.family_id and e.sequence=o.source_sequence
      where e.child_id<>o.child_id or o.created_at is distinct from e.payload->>'at'
        or not exists(select 1 from jsonb_array_elements(e.payload->'effects') effect where effect->>'kind'='match_committed'
          and effect->>'referenceId'=o.match_id and(effect->>'cents')::bigint=o.cents)),
    private_issues as(select c.id from app_private.finance_private_match_capsules c
      join app_private.finance_checkpoints p on p.id=c.checkpoint_id join app_private.finance_events e on e.family_id=c.family_id and e.sequence=c.source_sequence
      join app_private.finance_private_match_origins o on o.family_id=c.family_id and o.child_id=c.child_id and o.match_id=c.match_id
      where c.hash is distinct from app_private.finance_state_hash(c.payload) or not app_private.finance_private_capsule_safe(c.payload,c.child_id)
        or c.match_id is distinct from c.payload->'match'->>'id' or c.match_id is distinct from(c.payload->'match'->>'allocationId')||':match'
        or o.cents is distinct from(c.payload->'match'->>'cents')::bigint or o.created_at is distinct from c.payload->'match'->>'createdAt'
        or p.family_id<>c.family_id or e.child_id<>c.child_id or c.previous_state_hash is distinct from p.previous_state_hash
        or c.source_sequence-p.through_sequence not between 0 and 1),
    private_residency_issues as(select r.capsule_id from app_private.finance_private_match_residency r join app_private.finance_private_match_capsules c on c.id=r.capsule_id
      left join app_private.finance_events h on h.family_id=c.family_id and h.sequence=r.hydrated_sequence
      where r.family_id<>c.family_id or r.child_id<>c.child_id or r.match_id<>c.match_id
        or(not r.active and(h.sequence is null or h.child_id<>c.child_id or h.sequence<=c.source_sequence))),
    projection_issues as(select s.child_id from app_private.finance_projection_snapshots s
      join app_private.finance_events e on e.family_id=s.family_id and e.sequence=s.last_sequence
      where e.child_id<>s.child_id or s.child_projection_hash is distinct from app_private.finance_state_hash(s.child_projection)
        or s.parent_projection_hash is distinct from app_private.finance_state_hash(s.parent_projection)),
    activity_issues as(select x.event_id from app_private.finance_activity x join app_private.finance_events e on e.family_id=x.family_id and e.sequence=x.sequence
      where x.child_id<>e.child_id or x.event_id<>e.event_id or x.kind is distinct from e.payload->>'kind'
        or x.event_at is distinct from e.payload->>'at' or x.actor_role is distinct from e.payload->'actor'->>'role')
    select (select count(*)::int from app_private.finance_checkpoints) checkpoints,
      (select count(*)::int from app_private.finance_archive_capsules) "visibleCapsules",
      (select count(*)::int from app_private.finance_archive_residency where active) "activeVisibleCapsules",
      (select count(*)::int from app_private.finance_archive_current_entities) "visibleCurrentEntities",
      (select count(*)::int from app_private.finance_archived_occurrences) "archivedOccurrences",
      (select count(*)::int from app_private.finance_private_match_origins) "privateOrigins",
      (select count(*)::int from app_private.finance_private_match_capsules) "privateCapsules",
      (select count(*)::int from app_private.finance_private_match_residency where active) "activePrivateCapsules",
      (select count(*)::int from app_private.finance_projection_snapshots) "projectionSnapshots",
      (select count(*)::int from app_private.finance_activity) "activityRows",
      (select count(*)::int from(select 1 from checkpoint_issues union all select 1 from visible_issues union all select 1 from visible_residency_issues
        union all select 1 from current_issues union all select 1 from entity_issues union all select 1 from paid_issues
        union all select 1 from occurrence_issues union all select 1 from origin_issues union all select 1 from private_issues
        union all select 1 from private_residency_issues union all select 1 from projection_issues union all select 1 from activity_issues) invalid) issues`)).rows[0];
  return archiveAuditSummary({ ...row, families: verified.rowCount }, requireExisting);
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
