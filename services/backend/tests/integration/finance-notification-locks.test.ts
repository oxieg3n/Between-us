import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// @ts-expect-error pg is exercised only against the guarded local PostgreSQL service by Root.
import pg from 'pg';

let databaseUrl:string;
try {
  const status=JSON.parse((await readFile(new URL('../../.local/status.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
  const parsed=new URL(status.DB_URL);
  if(status.API_URL!=='http://127.0.0.1:54321'||!['postgres:','postgresql:'].includes(parsed.protocol)
    ||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||parsed.port!=='54322'||parsed.pathname!=='/postgres'||parsed.search||parsed.hash)throw Error();
  databaseUrl=status.DB_URL;
} catch { throw Error('Financial notification lock test requires the ignored isolated loopback fixture; configuration details suppressed.'); }

test('empty-event observation retention waits for the actual hold family lock and rechecks the newly committed hold',{timeout:25_000},async()=>{
  const setup=new pg.Client({connectionString:databaseUrl}),holder=new pg.Client({connectionString:databaseUrl});
  const worker=new pg.Client({connectionString:databaseUrl}),observer=new pg.Client({connectionString:databaseUrl});
  const clients=[setup,holder,worker,observer],connected:typeof clients=[];
  const owner=randomUUID(),operator=randomUUID(),family=randomUUID(),child=randomUUID(),users=[owner,operator];
  const emails=users.map(id=>`finance-notice-lock-${id}@fixture.test`);
  type Policy={execution_enabled:boolean;retention_enabled:boolean;synthetic_fixture_mode:boolean;reviewed_policy_id:string|null;reauth_methods:string[]};
  let policy:Policy|undefined,committed=false,phase='setup';
  let retaining:Promise<{deleted?:number;failed?:boolean}>|undefined;
  try {
    for(const client of clients){await client.connect();connected.push(client);}
    await setup.query('begin');
    const safety=await setup.query('select local_synthetic,public_enrollment_enabled,real_child_data_enabled from app_private.deployment_policy where singleton');
    assert.equal(safety.rows[0]?.local_synthetic,true);assert.equal(safety.rows[0]?.public_enrollment_enabled,false);assert.equal(safety.rows[0]?.real_child_data_enabled,false);
    policy=(await setup.query(`select execution_enabled,retention_enabled,synthetic_fixture_mode,reviewed_policy_id,reauth_methods
      from app_private.privacy_lifecycle_policy where singleton for update`)).rows[0];
    assert.ok(policy);
    await setup.query(`update app_private.privacy_lifecycle_policy set execution_enabled=true,retention_enabled=true,synthetic_fixture_mode=true,
      reviewed_policy_id='local-finance-notice-lock-only',reauth_methods=array['synthetic_fixture'] where singleton`);
    for(let index=0;index<users.length;index++){
      assert.ok(emails[index].endsWith('@fixture.test'));
      await setup.query(`with intent as(select app_private.issue_parent_registration($2)->>'token' token)
        insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        select $1,$2,now(),'{}'::jsonb,jsonb_build_object('registration_token',token),now(),now() from intent`,[users[index],emails[index]]);
    }
    await setup.query("update app_private.profiles set kind='parent',state='active' where user_id=$1",[operator]);
    await setup.query("update app_private.profiles set kind='child',state='closed',auth_alias=true where user_id=$1",[owner]);
    await setup.query("insert into app_private.families(id,name,timezone) values($1,'Fictional finance hold lock family','UTC')",[family]);
    await setup.query("insert into app_private.children(id,family_id,name,account_user_id,state) values($1,$2,'Fictional closed child',$3,'closed')",[child,family,owner]);
    await setup.query("insert into app_private.memberships(family_id,user_id,role,child_id,status) values($1,$2,'child',$3,'revoked')",[family,owner,child]);
    await setup.query("insert into app_private.operators(user_id,scope,active) values($1,'privacy',true)",[operator]);
    await setup.query(`insert into app_private.finance_notification_observations(child_id,family_id,owner_id,goals)
      values($1,$2,$3,'{"fictional-goal":{"complete":true,"announced":false}}'::jsonb)`,[child,family,owner]);
    const existing=await setup.query('select count(*)::int count from app_private.domain_notification_events where $1::uuid in(actor_id,recipient_id)',[owner]);
    assert.equal(existing.rows[0].count,0,'the observation-only path must have no old event family scope');
    await setup.query('commit');committed=true;

    phase='hold acquisition';await holder.query('begin');await holder.query('set local role service_role');
    await holder.query("select api.set_privacy_hold($1,'finance','fixture:observation-lock',clock_timestamp()+interval '1 day',$2)",[owner,operator]);
    // The hold exists only in holder's uncommitted transaction, which owns the shared family advisory lock.
    phase='retention lock wait';await worker.query('begin');await worker.query("set local statement_timeout='10s'");
    const pid=(await worker.query('select pg_backend_pid() pid')).rows[0].pid;
    await worker.query('set local role service_role');let settled=false;
    retaining=worker.query('select api.run_domain_notification_retention($1,$2,20) result',[owner,operator])
      .then((response:{rows:{result:{deleted:number}}[]})=>{settled=true;return {deleted:response.rows[0].result.deleted};},()=>{settled=true;return {failed:true};});
    let waiting=false;const deadline=Date.now()+5_000;
    while(Date.now()<deadline&&!settled){
      const activity=await observer.query('select wait_event_type,wait_event from pg_stat_activity where pid=$1',[pid]);
      if(activity.rows[0]?.wait_event_type==='Lock'&&activity.rows[0]?.wait_event==='advisory'){waiting=true;break;}
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(waiting,true,'empty-event retention must wait on the observation/subject family before erasing its marker');
    phase='post-lock hold recheck';await holder.query('commit');
    const result=await retaining;assert.ok(result);assert.equal(result.failed,undefined);assert.equal(result.deleted,0,'newly committed finite hold must be rechecked inside DELETE');
    await worker.query('rollback');
    const remaining=await observer.query('select count(*)::int count from app_private.finance_notification_observations where child_id=$1 and owner_id=$2',[child,owner]);
    assert.equal(remaining.rows[0].count,1,'closed own metadata remains while held');
  } catch { throw Error(`Financial notification lock regression failed during ${phase}; private database diagnostics suppressed.`); }
  finally {
    let cleanupFailed=false;
    try {
      if(connected.includes(holder))await holder.query('rollback');
      if(retaining)await retaining;
      if(connected.includes(worker))await worker.query('rollback');
      if(connected.includes(setup)){
        await setup.query('rollback');
        if(committed){
          await setup.query('begin');
          await setup.query('delete from app_private.privacy_legal_holds where subject_id=$1 and operator_id=$2',[owner,operator]);
          await setup.query('delete from app_private.finance_notification_observations where child_id=$1 and owner_id=$2',[child,owner]);
          await setup.query('delete from app_private.memberships where family_id=$1 and user_id=$2',[family,owner]);
          await setup.query('delete from app_private.children where id=$1 and account_user_id=$2',[child,owner]);
          await setup.query('delete from app_private.families where id=$1',[family]);
          await setup.query("delete from app_private.operators where user_id=$1 and scope='privacy'",[operator]);
          await setup.query('delete from app_private.identity_audit where actor_id=any($1::uuid[]) or subject_id=any($1::uuid[])',[users]);
          await setup.query('delete from app_private.registration_intents where bound_user_id=any($1::uuid[]) or email=any($2::text[])',[users,emails]);
          await setup.query('delete from auth.users where id=any($1::uuid[]) and email=any($2::text[])',[users,emails]);
          await setup.query('commit');
        }
      }
    } catch {cleanupFailed=true;}
    try {
      if(connected.includes(setup)){
        await setup.query('rollback');
        if(policy)await setup.query(`update app_private.privacy_lifecycle_policy set execution_enabled=$1,retention_enabled=$2,
          synthetic_fixture_mode=$3,reviewed_policy_id=$4,reauth_methods=$5 where singleton`,
        [policy.execution_enabled,policy.retention_enabled,policy.synthetic_fixture_mode,policy.reviewed_policy_id,policy.reauth_methods]);
      }
    } catch {cleanupFailed=true;}
    await Promise.allSettled(connected.map(client=>client.end()));
    if(cleanupFailed)throw Error('Financial notification lock fixture cleanup needs owner review; private database details suppressed.');
  }
});
