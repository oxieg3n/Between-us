import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { sourceGuard } from '../recovery/guards.mjs';
import { mobileFixturePlan } from '../recovery/mobile-fixture-path.mjs';
const execute = promisify(execFile);
const backend = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

async function main() {
const plan = mobileFixturePlan(process.argv.slice(2), randomUUID().replaceAll('-', ''));
const cwd = await realpath(process.cwd());
if (cwd.toLowerCase() !== (await realpath(backend)).toLowerCase()
  || process.platform === 'win32' && cwd.toLowerCase() !== 'd:\\projects\\betweenus\\services\\backend') throw Error('Canonical backend workspace required.');
if (process.platform === 'win32' && await lstat('D:\\proejcts\\BetweenUs').then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) throw Error('Relocation required.');
const values = JSON.parse((await readFile('.local/status.json', 'utf8')).replace(/^\uFEFF/, ''));
sourceGuard(values); // Ordinary existing postgres access, never the recovery superuser override.
const mobileEnvironment=`EXPO_PUBLIC_APP_MODE=production\nEXPO_PUBLIC_SUPABASE_URL=${values.API_URL}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${values.ANON_KEY}\nEXPO_PUBLIC_API_URL=http://127.0.0.1:8787\n`;
const previousEnvironment=await readFile('../../apps/mobile/.env.local','utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(previousEnvironment!==null && previousEnvironment!==mobileEnvironment)throw Error('Existing mobile environment differs. Review it privately; no file was overwritten.');
const previousFixture=plan.isolated ? null : await readFile(plan.relativePath,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(previousFixture!==null && !plan.replace)throw Error('A local fixture already exists. Reuse it, or explicitly request --replace-fictional-fixture after reviewing its fictional ownership.');
let runDirectory;
const identities=[];
if(plan.isolated){
  const parent=path.join(backend,'.local/ui-runs');await mkdir(parent,{recursive:true,mode:0o700});
  if((await realpath(parent)).toLowerCase()!==parent.toLowerCase())throw Error('Private fixture directory required.');
  runDirectory=path.dirname(path.join(backend,plan.relativePath));await mkdir(runDirectory,{mode:0o700});
  if(process.platform==='win32'){
    const identity=await execute('whoami',['/user','/fo','csv','/nh'],{windowsHide:true});
    const sid=identity.stdout.match(/S-1-5-[0-9-]+/)?.[0];if(!sid)throw Error('Private fixture ownership required.');
    await execute('icacls',[runDirectory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`],{windowsHide:true});
  }
  await writeFile(path.join(runDirectory,'ownership-0.json'),JSON.stringify({runId:plan.runId,expectedAdultEmails:
    ['parent','operator'].map(label=>`mobile-${label}-${plan.runId}@fixture.test`)},null,2),{flag:'wx',mode:0o600});
}
const recordIdentity=async identity=>{
  identities.push(identity);
  if(runDirectory)await writeFile(path.join(runDirectory,`ownership-${identities.length}.json`),JSON.stringify({runId:plan.runId,identities},null,2),{flag:'wx',mode:0o600});
};
const client = key => createClient(values.API_URL, key, {db:{schema:'api'},auth:{persistSession:false,autoRefreshToken:false}});
const service = client(values.SERVICE_ROLE_KEY);
const database = new pg.Client({connectionString:values.DB_URL}); await database.connect();
const checked = async value => { const {data,error}=await value;if(error)throw Error('Synthetic fixture step failed.');return data; };
try {
  const policy = await database.query('select local_synthetic,public_enrollment_enabled,real_child_data_enabled from app_private.deployment_policy where singleton');
  if (!policy.rows[0]?.local_synthetic || policy.rows[0].public_enrollment_enabled || policy.rows[0].real_child_data_enabled) throw Error('Fictional-only policy required.');
  async function adult(label,name) {
    const email=`mobile-${label}-${plan.runId??randomUUID()}@fixture.test`, password=`Synthetic-${randomUUID()}-A9`;
    if(plan.isolated && (await database.query('select 1 from auth.users where email=$1',[email])).rowCount)throw Error('Fresh fixture identity required.');
    const intent=await checked(service.rpc('issue_parent_registration',{p_email:email}));
    const result=await checked(service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{registration_token:intent.token}}));
    await recordIdentity({id:result.user.id,email,label});
    const auth=client(values.ANON_KEY);await checked(auth.auth.signInWithPassword({email,password}));
    await checked(auth.rpc('bootstrap_parent',{p_display_name:name})); return {email,password,auth,id:result.user.id};
  }
  const parent=await adult('parent','Sam'), operator=await adult('operator','Fictional independent operator');
  await database.query("insert into app_private.operators(user_id,scope,active) values($1,'consent',true),($1,'verification',true),($1,'privacy',true),($1,'safety',true)",[operator.id]);
  const familyId=await checked(parent.auth.rpc('create_family',{p_name:'Fictional Harbor Family',p_timezone:'America/New_York'}));
  const childId=await checked(parent.auth.rpc('create_child',{p_family_id:familyId,p_name:'Alex'}));
  const consentId=await checked(parent.auth.rpc('request_child_consent',{p_child_id:childId,p_notice_version:'synthetic-v1',p_policy_version:'synthetic-v1'}));
  await checked(operator.auth.rpc('verify_child_consent',{p_consent_id:consentId,p_method:'synthetic_fixture',p_evidence_reference:'FICTIONAL-no-legal-VPC',p_expires_at:new Date(Date.now()+86400000*7).toISOString()}));
  const invitation=await checked(parent.auth.rpc('begin_child_enrollment',{p_child_id:childId}));
  if(!invitation.email?.endsWith('.test'))throw Error('Fictional child identity required.');
  const childPassword=`Synthetic-${randomUUID()}-A9`;
  const childUser=await checked(service.auth.admin.createUser({email:invitation.email,password:childPassword,email_confirm:true,user_metadata:{registration_token:invitation.token}}));
  await recordIdentity({id:childUser.user.id,email:invitation.email,label:'child',childId,familyId,guardianId:parent.id});
  const child=client(values.ANON_KEY);await checked(child.auth.signInWithPassword({email:invitation.email,password:childPassword}));
  await checked(child.rpc('accept_child_enrollment',{p_token:invitation.token}));
  await checked(parent.auth.rpc('request_contact',{p_family_id:familyId,p_recipient_email:invitation.email}));
  const contacts=await checked(child.rpc('list_contacts'));const contact=contacts.find(c=>c.a===parent.id||c.b===parent.id);
  if(!contact)throw Error('No fixture contact.');
  await checked(child.rpc('accept_contact',{p_contact_id:contact.id}));await checked(parent.auth.rpc('approve_contact',{p_contact_id:contact.id}));
  await checked(service.rpc('verify_contact',{p_contact_id:contact.id,p_operator_id:operator.id,p_method:'synthetic_fixture',p_evidence_ref:'FICTIONAL-independent-identity-fixture'}));
  const conversation=await checked(parent.auth.rpc('create_conversation',{p_contact_id:contact.id}));
  await checked(parent.auth.rpc('send_message',{p_conversation_id:conversation.id,p_body:'Would you like to tell me about your day?',p_client_id:randomUUID(),p_response:'listen'}));
  const fixture={url:values.API_URL,publicKey:values.ANON_KEY,apiUrl:'http://127.0.0.1:8787',familyId,childId,
    parent:{email:parent.email,password:parent.password,name:'Sam',id:parent.id},child:{email:invitation.email,password:childPassword,name:'Alex',id:childUser.user.id},conversation:{id:conversation.id,peerId:parent.id}};
  await writeFile(plan.relativePath,JSON.stringify(fixture,null,2),{flag:plan.writeFlag,mode:0o600});
  if(previousEnvironment===null) await writeFile('../../apps/mobile/.env.local',mobileEnvironment,{flag:'wx'});
  process.stdout.write(plan.isolated ? `${plan.relativePath}\n` : 'Fictional managed accounts and verified conversation seeded. Credentials saved only in ignored local fixture; mobile public configuration written.\n');
} catch(error) {
  if(runDirectory){
    const retirement=[];
    for(const identity of identities){
      try{
        const adult=['parent','operator'].includes(identity.label)&&identity.email===`mobile-${identity.label}-${plan.runId}@fixture.test`;
        const child=identity.label==='child'&&identity.email.endsWith('.test')&&(await database.query(`select 1 from app_private.children c
          where c.id=$1 and c.family_id=$2 and exists(select 1 from auth.users u where u.id=$4 and u.email=$5)
          and(c.account_user_id=$3 or exists(select 1 from app_private.registration_intents r where r.child_id=c.id
            and r.bound_user_id=$3 and r.issued_by=$4 and r.purpose='child'))`,
          [identity.childId,identity.familyId,identity.id,identity.guardianId,`mobile-parent-${plan.runId}@fixture.test`])).rowCount===1;
        if(!adult&&!child)throw Error('Ownership not verified.');
        if((await database.query('select 1 from auth.users where id=$1 and email=$2',[identity.id,identity.email])).rowCount!==1)throw Error('Ownership not verified.');
        await database.query('begin');
        try{
          await database.query('update auth.sessions set not_after=least(coalesce(not_after,clock_timestamp()),clock_timestamp()) where user_id=$1',[identity.id]);
          await database.query('update app_private.operators set active=false where user_id=$1',[identity.id]);
          await database.query('commit');
        }catch{await database.query('rollback');throw Error('Access retirement unconfirmed.');}
        retirement.push({id:identity.id,accessRetired:true});
      }catch{retirement.push({id:identity.id,accessRetired:false});}
    }
    await writeFile(path.join(runDirectory,'setup-failure.json'),JSON.stringify({runId:plan.runId,status:'FAIL',identities,retirement,
      note:'Only new run identities were considered; source history and existing fixtures preserved.'},null,2),{flag:'wx',mode:0o600}).catch(()=>{});
  }
  throw error;
} finally {await database.end();}
}
main().catch(()=>{process.stderr.write('Mobile fixture setup refused or failed. Existing fixtures/history were preserved unless explicit replacement was requested; inspect the new private run ownership receipts if present.\n');process.exitCode=1;});
