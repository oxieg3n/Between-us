import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient, type Session, type User } from '@supabase/supabase-js';
// @ts-expect-error pg is exercised against the real isolated local PostgreSQL service.
import pg from 'pg';
import { createApi } from '../../src/api.ts';
import type { FinanceAction } from '../../src/finance.ts';
import type { FinanceView } from '../../../../apps/mobile/src/finance/types.ts';

const values = JSON.parse((await readFile(new URL('../../.local/status.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const databaseUrl = new URL(values.DB_URL);
if (values.API_URL !== 'http://127.0.0.1:54321' || !['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname) || databaseUrl.port !== '54322'
  || databaseUrl.pathname !== '/postgres' || databaseUrl.search || databaseUrl.hash
  || typeof values.ANON_KEY !== 'string' || typeof values.SERVICE_ROLE_KEY !== 'string') {
  throw Error('Integration fixtures require isolated local services.');
}
const client = (key = values.ANON_KEY) => createClient(values.API_URL, key,
  { db: { schema: 'api' }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
export type LocalPerson = { auth: ReturnType<typeof client>; user: User; session: Session; email: string; secret: string };
export function success<R extends { data: unknown; error: unknown }>(result: R, step: string): NonNullable<R['data']> {
  // Do not print provider errors or response objects that could contain a credential.
  assert.equal(result.error == null, true, step); assert.ok(result.data != null, step); return result.data as NonNullable<R['data']>;
}
export function sessionId(person: LocalPerson): string {
  const claims = JSON.parse(Buffer.from(person.session.access_token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.sub, person.user.id); assert.equal(typeof claims.session_id, 'string'); return claims.session_id;
}

/** Real managed Auth + real SQL. Run serially; never enable these fixtures against a hosted URL.
 * Immutable synthetic finance/audit records remain in the local test DB; sessions and changed policy are retired.
 */
export async function integrationFixture(options: { child?: boolean; privacy?: boolean } = {}) {
  const database = new pg.Client({ connectionString: values.DB_URL }); await database.connect();
  const service = client(values.SERVICE_ROLE_KEY);
  const handle = createApi({ url: values.API_URL, publicKey: values.ANON_KEY, serviceKey: values.SERVICE_ROLE_KEY, syntheticLocal: true });
  const people: LocalPerson[] = [];
  let savedPrivacy: { execution_enabled: boolean; synthetic_fixture_mode: boolean; reviewed_policy_id: string | null; reauth_methods: string[] } | undefined;
  const close = async () => {
    try {
      // Keep immutable fictional history, but no active fixture sessions survive the test.
      if (people.length) await database.query('delete from auth.sessions where user_id=any($1::uuid[])', [[...new Set(people.map(person => person.user.id))]]);
    } finally {
      try {
        if (savedPrivacy) await database.query(`update app_private.privacy_lifecycle_policy set execution_enabled=$1,
          synthetic_fixture_mode=$2,reviewed_policy_id=$3,reauth_methods=$4 where singleton`,
        [savedPrivacy.execution_enabled, savedPrivacy.synthetic_fixture_mode, savedPrivacy.reviewed_policy_id, savedPrivacy.reauth_methods]);
      } finally { await database.end(); }
    }
  };
  const signIn = async (email: string, secret: string): Promise<LocalPerson> => {
    assert.ok(email.endsWith('.test'), 'fictional identity only');
    const auth = client(); const data = success(await auth.auth.signInWithPassword({ email, password: secret }), 'managed sign-in');
    assert.ok(data.session && data.user, 'managed sign-in must return its own identity/session');
    const person = { auth, user: data.user, session: data.session, email, secret }; people.push(person); return person;
  };
  const adult = async (label: string) => {
    const email = `${label}-${randomUUID()}@fixture.test`, secret = `Synthetic-${randomUUID()}-A9`;
    const intent = success(await service.rpc('issue_parent_registration', { p_email: email }), 'parent intent');
    success(await service.auth.admin.createUser({ email, password: secret, email_confirm: true,
      user_metadata: { registration_token: intent.token } }), 'managed parent identity');
    const person = await signIn(email, secret);
    success(await person.auth.rpc('bootstrap_parent', { p_display_name: `Fictional ${label}` }), 'parent bootstrap'); return person;
  };
  const request = (person: LocalPerson, path: string, value?: unknown) => handle(new Request(`http://127.0.0.1:8787${path}`,
    { method: value === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${person.session.access_token}`, 'Content-Type': 'application/json' },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }) }));
  try {
    const policy = (await database.query(`select local_synthetic,public_enrollment_enabled,real_child_data_enabled,
      guardian_managed_children,notice_version,consent_policy_version from app_private.deployment_policy where singleton`)).rows[0];
    assert.equal(policy?.local_synthetic, true); assert.equal(policy.public_enrollment_enabled, false);
    assert.equal(policy.real_child_data_enabled, false); assert.equal(policy.guardian_managed_children, true);
    if (options.privacy) {
      savedPrivacy = (await database.query(`select execution_enabled,synthetic_fixture_mode,reviewed_policy_id,reauth_methods
        from app_private.privacy_lifecycle_policy where singleton`)).rows[0];
      assert.ok(savedPrivacy);
      await database.query(`update app_private.privacy_lifecycle_policy set execution_enabled=true,synthetic_fixture_mode=true,
        reviewed_policy_id=$1,reauth_methods=array['managed_password','managed_password_totp']::text[] where singleton`, [`local-test-only:${randomUUID()}`]);
    }
    const parent = await adult('http-parent');
    let operator: LocalPerson | undefined, child: LocalPerson | undefined, familyId = '', childId = '';
    if (options.child !== false) {
      operator = await adult('http-independent-operator');
      await database.query("insert into app_private.operators(user_id,scope,active) values($1,'consent',true),($1,'privacy',true)", [operator.user.id]);
      familyId = success(await parent.auth.rpc('create_family', { p_name: 'Fictional HTTP family', p_timezone: 'UTC' }), 'family creation');
      childId = success(await parent.auth.rpc('create_child', { p_family_id: familyId, p_name: 'Fictional child' }), 'child registry');
      const consent = success(await parent.auth.rpc('request_child_consent', { p_child_id: childId,
        p_notice_version: policy.notice_version, p_policy_version: policy.consent_policy_version }), 'guardian consent request');
      const selfVerify = await parent.auth.rpc('verify_child_consent', { p_consent_id: consent, p_method: 'synthetic_fixture',
        p_evidence_reference: 'fixture:not-real-consent', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() });
      assert.ok(selfVerify.error, 'guardian cannot independently verify their own consent');
      const verified = await operator.auth.rpc('verify_child_consent', { p_consent_id: consent, p_method: 'synthetic_fixture',
        p_evidence_reference: 'fixture:not-real-consent', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() });
      assert.equal(verified.error == null, true, 'independent managed operator verifies the synthetic fixture');
      const secret = `Synthetic-child-${randomUUID()}-B9`;
      const provision = await request(parent, '/v1/enrollment/child', { childId, password: secret });
      assert.equal(provision.status, 201, 'joint guardian enrollment');
      const enrollment = await provision.json(); assert.equal(enrollment.guardianManaged, true);
      child = await signIn(enrollment.email, secret); assert.notEqual(child.user.id, parent.user.id);
      assert.ok((await parent.auth.rpc('accept_child_enrollment', { p_token: enrollment.acceptanceToken })).error);
      success(await child.auth.rpc('accept_child_enrollment', { p_token: enrollment.acceptanceToken }), 'distinct child acceptance');
    }
    const path = `/v1/finance/${familyId}/${childId}`;
    const finance = async (person: LocalPerson, action?: FinanceAction, operationId = randomUUID()): Promise<FinanceView> => {
      const response = await request(person, path, action === undefined ? undefined : { id: operationId, action });
      assert.equal(response.status, 200, `finance ${action?.kind ?? 'read'}`); assert.equal(response.headers.get('etag'), null);
      return await response.json() as FinanceView;
    };
    const today = (await database.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD') as local_day")).rows[0].local_day as string;
    return { database, service, publicKey: values.ANON_KEY as string, parent, operator, child, familyId, childId, today, path, request, finance, adult, signIn, close };
  } catch (error) { await close(); throw error; }
}

export async function submittedEarning(f: Awaited<ReturnType<typeof integrationFixture>>, suffix: string, rewardCents = 3000) {
  assert.ok(f.child);
  const choreId = `fictional-${suffix}-${randomUUID()}`, occurrenceId = `${choreId}:${f.today}`;
  await f.finance(f.parent, { kind: 'assign_chore', choreId, title: 'Fictional task', rewardCents, dates: [f.today] });
  await f.finance(f.child, { kind: 'submit_chore', occurrenceId }); return occurrenceId;
}
