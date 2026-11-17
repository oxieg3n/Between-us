begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not has_function_privilege('authenticated','api.finance_archive_page(jsonb,uuid,integer)','EXECUTE'),'clients cannot bypass visible page projection/authorization');
select ok(not has_function_privilege('authenticated','api.finance_private_match_page(jsonb,uuid,integer)','EXECUTE'),'clients cannot directly read private capsule payloads');
select ok(has_function_privilege('service_role','api.finance_archive_page(jsonb,uuid,integer)','EXECUTE'),'trusted service retains the visible page port');
select ok(has_function_privilege('service_role','api.finance_private_match_page(jsonb,uuid,integer)','EXECUTE'),'trusted service retains the private parent page port');
select ok(exists(select 1 from pg_trigger where tgrelid='app_private.finance_archived_occurrences'::regclass and tgname='immutable_history' and tgenabled='O'),
  'permanent archived occurrence budget bases retain their enabled immutability trigger');
select ok(position('offset 0' in lower(pg_get_functiondef('api.finance_archive_page(jsonb,uuid,integer)'::regprocedure)))>0,
  'visible page retains the parameterized payload lookup optimization barrier');
select ok(position('offset 0' in lower(pg_get_functiondef('api.finance_private_match_page(jsonb,uuid,integer)'::regprocedure)))>0,
  'private page retains the parameterized payload lookup optimization barrier');

-- Local plan proof for the exact correlated payload/hash fetch shape, not an Auth or financial source fixture.
-- Existing checkpoint/private SQL suites exercise actual page scopes, cursor/limit/hash errors and revocation.
create temporary table archive_page_plan_capsules(id uuid primary key,family_id uuid not null,child_id uuid not null,payload jsonb not null,hash text not null);
insert into archive_page_plan_capsules
  select md5(n::text)::uuid,'61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002',
    jsonb_build_object('version',1,'childId','fictional-plan-child','sample',n),
    app_private.finance_state_hash(jsonb_build_object('version',1,'childId','fictional-plan-child','sample',n)) from generate_series(1,5369) n;
analyze archive_page_plan_capsules;
do $$ declare ids uuid[];plan jsonb;begin
  select array_agg(id order by id) into ids from(select id from archive_page_plan_capsules order by id limit 20) chosen;
  execute $sql$explain(analyze,format json) select c.payload,c.hash=app_private.finance_state_hash(c.payload) valid
    from unnest($1::uuid[]) page_id cross join lateral(
      select id,payload,hash from pg_temp.archive_page_plan_capsules where id=page_id
        and family_id='61000000-0000-0000-0000-000000000001' and child_id='61000000-0000-0000-0000-000000000002' offset 0) c$sql$ into plan using ids;
  perform set_config('test.archive_page_plan',plan::text,true);
end $$;
select ok((current_setting('test.archive_page_plan')::jsonb->0->'Plan'->>'Actual Rows')::integer=20,'twenty selected IDs return exactly twenty payloads');
with recursive nodes(node) as(select current_setting('test.archive_page_plan')::jsonb->0->'Plan'
  union all select child from nodes cross join lateral jsonb_array_elements(coalesce(node->'Plans','[]')) child)
select ok(exists(select 1 from nodes where node->>'Relation Name'='archive_page_plan_capsules'
  and node->>'Node Type' in('Index Scan','Index Only Scan') and(node->>'Actual Rows')::integer=1 and(node->>'Actual Loops')::integer=20),
  'payload reads use twenty single-row parameterized index probes despite5369historical capsules');
with recursive nodes(node) as(select current_setting('test.archive_page_plan')::jsonb->0->'Plan'
  union all select child from nodes cross join lateral jsonb_array_elements(coalesce(node->'Plans','[]')) child)
select ok(not exists(select 1 from nodes where node->>'Node Type' in('Hash Join','Merge Join')
  or(node->>'Relation Name'='archive_page_plan_capsules' and node->>'Node Type'='Seq Scan')),
  'payload lookup cannot flatten into a broad capsule hash/merge/sequence scan');
select * from finish();
rollback;
