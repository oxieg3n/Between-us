import { readFile } from 'node:fs/promises';
import pg from 'pg';
const values = JSON.parse((await readFile('.local/status.json', 'utf8')).replace(/^\uFEFF/, ''));
const db = new URL(values.DB_URL);
if (db.hostname !== '127.0.0.1' || db.port !== '54322' || values.API_URL !== 'http://127.0.0.1:54321') throw Error('Refusing nonlocal seed.');
const client = new pg.Client({ connectionString: values.DB_URL }); await client.connect();
try {
  await client.query('begin');
  await client.query("update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton and not public_enrollment_enabled and not real_child_data_enabled");
  await client.query('update app_private.communication_policy set synthetic_fixture_mode=true where singleton and not public_report_intake and not staffed_support_promises');
  await client.query("update app_private.account_management_policy set auth_issuer='http://127.0.0.1:54321/auth/v1' where singleton");
  await client.query("update app_private.privacy_lifecycle_policy set synthetic_fixture_mode=true,execution_enabled=true,reviewed_policy_id='FICTIONAL-local-engineering-not-legal',reauth_methods=array['managed_password','managed_totp'] where singleton and exists(select 1 from app_private.deployment_policy where singleton and local_synthetic and not public_enrollment_enabled and not real_child_data_enabled)");
  await client.query('commit'); process.stdout.write('Local fictional-account policy initialized; public enrollment remains closed.\n');
} catch (error) { await client.query('rollback'); throw error; } finally { await client.end(); }
