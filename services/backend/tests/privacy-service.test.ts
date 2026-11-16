import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { applyFinanceCommand, createFinanceState, financeView } from '../../../apps/mobile/src/finance/engine.ts';
import { createPrivacyService, PrivacyServiceError } from '../src/privacy.ts';

const uid = '40000000-0000-0000-0000-000000000001';
const oldSid = '40000000-0000-0000-0000-000000000002';
const newSid = '40000000-0000-0000-0000-000000000003';
const factor = '40000000-0000-0000-0000-000000000004';
const child = '40000000-0000-0000-0000-000000000005';
const job = '40000000-0000-0000-0000-000000000006';
const operator = '40000000-0000-0000-0000-000000000007';
const url = 'http://127.0.0.1:54321';
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(session: string, aal = 'aal1', sub = uid) {
  return `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub, aud: 'authenticated', role: 'authenticated', session_id: session,
    aal, iss: `${url}/auth/v1`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from('fictional-unit-signature').toString('base64url')}`;
}
const unauthorized = (error: unknown) => error instanceof PrivacyServiceError && error.code === 'not_authorized' && !error.message.includes('provider-private');

function authFixture(t: TestContext, options: { mfa?: 'totp' | 'phone'; wrongIdentity?: boolean; rejectMfa?: boolean; cleanupError?: boolean; rpcError?: boolean } = {}) {
  const original = jwt(oldSid), temporary = jwt(newSid), mfaToken = jwt(newSid, 'aal2');
  const factors = options.mfa ? [{ id: factor, factor_type: options.mfa, status: 'verified', created_at: '2026-11-16T00:00:00Z', updated_at: '2026-11-16T00:00:00Z' }] : [];
  const user = { id: uid, email: 'synthetic-child@reauth.test', email_confirmed_at: '2026-11-16T00:00:00Z', aud: 'authenticated',
    role: 'authenticated', created_at: '2026-11-16T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, factors };
  const calls: { path: string; data?: Record<string, unknown> }[] = [];
  const retired: { token: string; scope: string }[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init); const parsed = new URL(request.url);
    const data = request.method === 'POST' ? await request.json() as Record<string, unknown> : undefined;
    calls.push({ path: parsed.pathname, data });
    if (parsed.pathname === '/auth/v1/user') return ok(user);
    if (parsed.pathname === '/auth/v1/token') {
      if (data?.password !== 'fictional-correct-password') return ok({ code: 'invalid_credentials', msg: 'provider-private credentials' }, 400);
      return ok({ access_token: temporary, refresh_token: 'fictional-refresh', expires_in: 3600, token_type: 'bearer',
        user: options.wrongIdentity ? { ...user, id: operator } : user });
    }
    if (parsed.pathname === `/auth/v1/factors/${factor}/challenge`) return ok({ id: factor, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 120 });
    if (parsed.pathname === `/auth/v1/factors/${factor}/verify`) {
      if (options.rejectMfa || data?.code !== '123456') return ok({ code: 'mfa_verification_failed', msg: 'provider-private code' }, 400);
      return ok({ access_token: mfaToken, refresh_token: 'fictional-mfa-refresh', expires_in: 3600, token_type: 'bearer', user });
    }
    throw new Error(`Unexpected unit Auth path: ${parsed.pathname}`);
  });
  const serviceClient = {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ name, args });
      assert.equal(retired.length, 1, 'temporary managed session must be revoked before attestation');
      return options.rpcError ? { data: null, error: { code: '42501', message: 'provider-private policy' } }
        : { data: { expiresAt: new Date(Date.now() + 300_000).toISOString() }, error: null };
    },
    auth: { admin: { async signOut(token: string, scope: 'local') { retired.push({ token, scope }); return { error: options.cleanupError ? { message: 'provider-private cleanup' } : null }; } } },
  };
  const service = createPrivacyService({ url, publicKey: 'synthetic-public-key', serviceClient });
  return { service, calls, retired, rpcCalls, original, temporary, mfaToken };
}

test('managed reauthentication binds old verified identity/session and retires only temporary local session', async t => {
  const f = authFixture(t);
  const result = await f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password' });
  assert.ok(Date.parse(result.expiresAt) > Date.now());
  assert.deepEqual(f.retired, [{ token: f.temporary, scope: 'local' }]);
  assert.equal(f.rpcCalls[0].name, 'record_privacy_reauthentication');
  assert.deepEqual(f.rpcCalls[0].args, { p_user_id: uid, p_session_id: oldSid, p_method: 'managed_password', p_auth_event_ref: `managed-auth-session:${newSid}` });
  assert.equal(JSON.stringify(f.rpcCalls).includes('fictional-correct-password'), false);
  assert.equal(JSON.stringify(f.rpcCalls).includes(f.original), false);
});

test('wrong credential cannot mint proof and provider details do not escape', async t => {
  const f = authFixture(t);
  await assert.rejects(f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'wrong' }), unauthorized);
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.retired.length, 0);
});

test('verified identity mismatch still retires the newly created session', async t => {
  const f = authFixture(t, { wrongIdentity: true });
  await assert.rejects(f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password' }), unauthorized);
  assert.equal(f.rpcCalls.length, 0); assert.deepEqual(f.retired, [{ token: f.temporary, scope: 'local' }]);
});

test('existing verified TOTP cannot be downgraded to password-only', async t => {
  const f = authFixture(t, { mfa: 'totp' });
  await assert.rejects(f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password' }), unauthorized);
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.retired.length, 1);
});

test('fresh TOTP challenge is verified and latest token retires its one temporary session', async t => {
  const f = authFixture(t, { mfa: 'totp' });
  await f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password', totp: '123456' });
  assert.ok(f.calls.some(call => call.path.endsWith('/challenge')));
  assert.ok(f.calls.some(call => call.path.endsWith('/verify')));
  assert.equal(f.rpcCalls[0].args.p_method, 'managed_password_totp');
  assert.deepEqual(f.retired, [{ token: f.mfaToken, scope: 'local' }]);
});

test('failed TOTP retires temporary session without attestation', async t => {
  const f = authFixture(t, { mfa: 'totp', rejectMfa: true });
  await assert.rejects(f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password', totp: '123456' }), unauthorized);
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.retired.length, 1);
});

test('non-TOTP verified MFA account fails closed instead of password downgrade', async t => {
  const f = authFixture(t, { mfa: 'phone' });
  await assert.rejects(f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password', totp: '123456' }), unauthorized);
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.retired.length, 1);
});

test('temporary session cleanup failure cannot write successful proof', async t => {
  const f = authFixture(t, { cleanupError: true });
  await assert.rejects(f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password' }),
    error => error instanceof PrivacyServiceError && error.code === 'temporarily_unavailable');
  assert.equal(f.retired.length, 1); assert.equal(f.rpcCalls.length, 0);
});

test('policy or old-session denial after credential verification is generic and temporary session is gone', async t => {
  const f = authFixture(t, { rpcError: true });
  await assert.rejects(f.service.reauthenticate({ authorization: `Bearer ${f.original}`, password: 'fictional-correct-password' }), unauthorized);
  assert.equal(f.retired.length, 1); assert.equal(f.rpcCalls.length, 1);
});

function workerFixture(conflicts = 0, executedStatus = 'partial_ready') {
  const at = '2026-11-16T12:00:00.000Z';
  let state = createFinanceState('UTC', [{ id: child, name: 'Fictional child' }]);
  state = applyFinanceCommand(state, { role: 'parent' }, { id: 'PRIVATE-PARENT-EVENT', at, childId: child, kind: 'configure_matching',
    rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
  const calls: string[] = []; const attached: Record<string, unknown>[] = [];
  let remaining = conflicts;
  const serviceClient = {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push(name);
      if (name === 'execute_privacy_job') return { data: { id: job, status: executedStatus, stagesExecuted: true, privateExtra: 'must-never-leave-worker' }, error: null };
      if (name === 'privacy_finance_sources') return { data: { childId: child, state, sourceHash: 'a'.repeat(64), actor: { role: 'child', childId: child }, serverAt: at }, error: null };
      assert.equal(name, 'attach_privacy_finance_projection'); attached.push(args);
      return { data: { status: remaining-- > 0 ? 'conflict' : 'ready', privateExtra: state }, error: null };
    },
    auth: { admin: { async signOut() { return { error: null }; } } },
  };
  return { service: createPrivacyService({ url, publicKey: 'synthetic-public-key', serviceClient }), calls, attached, state, at };
}

test('export worker uses existing child projector and returns no source/hidden metadata', async () => {
  const f = workerFixture(); const result = await f.service.executeAndProject(job, operator);
  assert.deepEqual(result, { id: job, status: 'ready', completed: true, journalIncluded: false });
  assert.deepEqual(f.attached[0].p_projection, financeView(f.state, { role: 'child', childId: child }, child, f.at));
  const childData = JSON.stringify(f.attached[0].p_projection);
  for (const key of ['matching', 'PRIVATE-PARENT-EVENT', 'events', 'sourceHash', 'revision']) assert.equal(childData.includes(key), false);
  assert.equal(JSON.stringify(result).includes('privateExtra'), false);
});

test('finance CAS conflict reloads/reprojects at most three times', async () => {
  const succeeds = workerFixture(2); await succeeds.service.executeAndProject(job, operator);
  assert.equal(succeeds.attached.length, 3);
  const exhausted = workerFixture(3);
  await assert.rejects(exhausted.service.executeAndProject(job, operator), error => error instanceof PrivacyServiceError && error.code === 'temporarily_unavailable');
  assert.equal(exhausted.attached.length, 3);
});

test('deletion and blocked jobs do not invoke finance source/projection or claim full completion', async () => {
  for (const status of ['access_revoked', 'blocked']) {
    const f = workerFixture(0, status); const result = await f.service.executeAndProject(job, operator);
    assert.equal(result.completed, false); assert.deepEqual(f.calls, ['execute_privacy_job']);
    assert.equal(JSON.stringify(result).includes('privateExtra'), false);
  }
});

function parentWorkerFixture(options: { conflicts?: number; status?: string; malformed?: boolean; sourceStatus?: string; denied?: boolean } = {}) {
  const at = '2026-11-16T12:00:00.000Z';
  const secondChild = '40000000-0000-0000-0000-000000000008';
  const family = '40000000-0000-0000-0000-000000000009', secondFamily = '40000000-0000-0000-0000-000000000010';
  let state = createFinanceState('UTC', [{ id: child, name: 'Fictional first child' }, { id: secondChild, name: 'Fictional second child' }]);
  state = applyFinanceCommand(state, { role: 'parent' }, { id: 'AUTHORIZED-PARENT-MATCH', at, childId: child, kind: 'configure_matching',
    rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
  const otherChild = '40000000-0000-0000-0000-000000000011';
  const otherState = createFinanceState('America/New_York', [{ id: otherChild, name: 'Other current family child' }]);
  const attached: Record<string, unknown>[] = [], calls: string[] = []; let remaining = options.conflicts ?? 0;
  const families = [{ familyId: family, childIds: [child, secondChild], state }, { familyId: secondFamily, childIds: [otherChild], state: otherState }];
  const serviceClient = {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push(name);
      if (name === 'execute_privacy_job') return { data: { status: 'partial_ready', projectionKind: 'parent' }, error: null };
      if (name === 'privacy_parent_finance_sources') {
        if (options.denied) return { data: null, error: { code: '42501', message: 'provider-private revoked guardian' } };
        return { data: options.sourceStatus ? { status: options.sourceStatus } : { status: 'partial_ready', actor: { role: 'parent' },
          families: options.malformed ? [...families, families[0]] : families, sourceHash: 'b'.repeat(64), serverAt: at }, error: null };
      }
      assert.equal(name, 'attach_privacy_parent_finance_projections'); attached.push(args);
      return { data: { status: remaining-- > 0 ? 'conflict' : options.status ?? 'ready', privateExtra: state }, error: null };
    },
    auth: { admin: { async signOut() { return { error: null }; } } },
  };
  return { service: createPrivacyService({ url, publicKey: 'synthetic-public-key', serviceClient }), calls, attached, families, at };
}

test('parent worker projects every child in every current authorized family using existing parent engine', async () => {
  const f = parentWorkerFixture(); const result = await f.service.executeAndProject(job, operator);
  const expected = f.families.flatMap(family => family.childIds.map(id => ({ familyId: family.familyId, childId: id,
    view: financeView(family.state, { role: 'parent' }, id, f.at) })));
  assert.deepEqual(f.attached[0].p_projections, expected);
  assert.ok(expected[0].view.matching, 'authorized parent matching must no longer be omitted');
  assert.deepEqual(result, { id: job, status: 'ready', completed: true, journalIncluded: false });
  assert.equal(JSON.stringify(result).includes('privateExtra'), false);
  assert.equal(JSON.stringify(result).includes('sourceHash'), false);
  assert.equal(f.calls.includes('privacy_finance_sources'), false, 'parent must not run child-only source RPC');
});

test('parent source conflicts re-read and recompute every view with a bounded three-attempt CAS', async () => {
  const eventual = parentWorkerFixture({ conflicts: 2 }); await eventual.service.executeAndProject(job, operator);
  assert.equal(eventual.attached.length, 3);
  const exhausted = parentWorkerFixture({ conflicts: 3 });
  await assert.rejects(exhausted.service.executeAndProject(job, operator), error => error instanceof PrivacyServiceError && error.code === 'temporarily_unavailable');
  assert.equal(exhausted.attached.length, 3);
});

test('parent held/former-scope/capacity partial results cannot become completed exports', async () => {
  for (const status of ['partial_ready', 'blocked']) {
    const f = parentWorkerFixture({ status }); const result = await f.service.executeAndProject(job, operator);
    assert.equal(result.status, status); assert.equal(result.completed, false);
  }
});

test('parent source capacity block stops before any projection attachment', async () => {
  const f = parentWorkerFixture({ sourceStatus: 'blocked' }); const result = await f.service.executeAndProject(job, operator);
  assert.equal(result.completed, false); assert.equal(f.attached.length, 0);
});

test('duplicate parent family scopes fail closed before attachment', async () => {
  const f = parentWorkerFixture({ malformed: true });
  await assert.rejects(f.service.executeAndProject(job, operator), error => error instanceof PrivacyServiceError && error.code === 'temporarily_unavailable');
  assert.equal(f.attached.length, 0);
});

test('revoked guardian source denial stays generic and never falls back to child or raw export', async () => {
  const f = parentWorkerFixture({ denied: true });
  await assert.rejects(f.service.executeAndProject(job, operator), unauthorized);
  assert.equal(f.attached.length, 0); assert.equal(f.calls.includes('privacy_finance_sources'), false);
});
