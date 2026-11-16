import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
const values = JSON.parse((await readFile('.local/status.json', 'utf8')).replace(/^\uFEFF/, ''));
if (values.API_URL !== 'http://127.0.0.1:54321' || new URL(values.DB_URL).port !== '54322') throw Error('Refusing nonlocal fixture.');
const mobileEnvironment=`EXPO_PUBLIC_APP_MODE=production\nEXPO_PUBLIC_SUPABASE_URL=${values.API_URL}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${values.ANON_KEY}\nEXPO_PUBLIC_API_URL=http://127.0.0.1:8787\n`;
const previousEnvironment=await readFile('../../apps/mobile/.env.local','utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(previousEnvironment!==null && previousEnvironment!==mobileEnvironment)throw Error('Existing mobile environment differs. Review it privately; no file was overwritten.');
const previousFixture=await readFile('.local/mobile-fixture.json','utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(previousFixture!==null && !process.argv.includes('--replace-fictional-fixture'))throw Error('A local fixture already exists. Reuse it, or explicitly request --replace-fictional-fixture after reviewing its fictional ownership.');
const client = key => createClient(values.API_URL, key, {db:{schema:'api'},auth:{persistSession:false,autoRefreshToken:false}});
const service = client(values.SERVICE_ROLE_KEY);
const database = new pg.Client({connectionString:values.DB_URL}); await database.connect();
const checked = async value => { const {data,error}=await value;if(error)throw Error('Synthetic fixture step failed: '+error.code);return data; };
try {
  const policy = await database.query('select local_synthetic,public_enrollment_enabled,real_child_data_enabled from app_private.deployment_policy where singleton');
  if (!policy.rows[0]?.local_synthetic || policy.rows[0].public_enrollment_enabled || policy.rows[0].real_child_data_enabled) throw Error('Fictional-only policy required.');
  async function adult(label,name) {
    const email=`mobile-${label}-${randomUUID()}@fixture.test`, password=`Synthetic-${randomUUID()}-A9`;
    const intent=await checked(service.rpc('issue_parent_registration',{p_email:email}));
    const result=await checked(service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{registration_token:intent.token}}));
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
  const childPassword=`Synthetic-${randomUUID()}-A9`;
  const childUser=await checked(service.auth.admin.createUser({email:invitation.email,password:childPassword,email_confirm:true,user_metadata:{registration_token:invitation.token}}));
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
  await writeFile('.local/mobile-fixture.json',JSON.stringify(fixture,null,2));
  if(previousEnvironment===null) await writeFile('../../apps/mobile/.env.local',mobileEnvironment,{flag:'wx'});
  process.stdout.write('Fictional managed accounts and verified conversation seeded. Credentials saved only in ignored local fixture; mobile public configuration written.\n');
} finally {await database.end();}
