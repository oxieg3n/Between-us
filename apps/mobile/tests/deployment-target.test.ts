import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_STAGING_TARGETS, resolveDeploymentTarget } from '../src/production/deployment-target';

// Deliberately unsigned fictional strings: this resolver classifies configuration, never authenticates a JWT.
const jwt = (payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }) =>
  `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.ZmljdGlvbmFs`;
const publicKey = 'sb_publishable_fictional_public_config_only';
const local = { development: true, supabaseUrl: 'http://127.0.0.1:54321', apiUrl: 'http://127.0.0.1:8787', publishableKey: jwt({ role: 'anon' }) };
const projectRef = 'abcdefghijklmnopqrst', otherRef = 'tsrqponmlkjihgfedcba';
const target = { projectRef, supabaseUrl: `https://${projectRef}.supabase.co`, apiUrl: `https://${projectRef}.supabase.co/functions/v1/api` };
const staging = { development: false, environment: 'hosted-staging', ...target, publishableKey: publicKey };
function denied(input: unknown, allowlist?: unknown) {
  const result = resolveDeploymentTarget(input, allowlist);
  assert.equal(result.ready, false); assert.equal(result.backendUrl, null); assert.equal(result.apiUrl, null);
  return result;
}

test('existing dev loopback configuration implicitly resolves LOCAL without returning a key', () => {
  assert.deepEqual(resolveDeploymentTarget(local), { ready: true, environment: 'local', statusLabel: 'Local synthetic services',
    reason: 'ready', backendUrl: local.supabaseUrl, apiUrl: local.apiUrl });
  assert.equal(JSON.stringify(resolveDeploymentTarget(local)).includes(local.publishableKey), false);
  assert.equal(resolveDeploymentTarget({ ...local, environment: 'local', supabaseUrl: `${local.supabaseUrl}/`, apiUrl: `${local.apiUrl}/` }).ready, true);
  assert.equal(resolveDeploymentTarget({ ...local, publishableKey: publicKey }).ready, true);
});

test('release builds reject LOCAL, implicit local configuration and synthetic overrides; production stays disabled', () => {
  assert.equal(denied({ ...local, development: false, environment: 'local' }).reason, 'development_required');
  assert.equal(denied({ ...local, development: false }).reason, 'explicit_environment_required');
  assert.equal(denied({ ...staging, syntheticMode: true }, [target]).reason, 'synthetic_release_denied');
  for (const development of [false, true]) assert.equal(denied({ ...staging, development, environment: 'production' }, [target]).reason, 'production_disabled');
});

test('hosted staging requires explicit environment, canonical reference, paired endpoints and committed approval', () => {
  assert.deepEqual(APPROVED_STAGING_TARGETS, []);
  assert.equal(denied(staging).reason, 'unapproved_staging_target');
  assert.equal(denied({ ...staging, environment: undefined }, [target]).reason, 'explicit_environment_required');
  assert.equal(resolveDeploymentTarget(staging, [target]).ready, true);
  assert.equal(resolveDeploymentTarget({ ...staging, publishableKey: jwt({ role: 'anon', ref: projectRef }) }, [target]).ready, true);
  for (const ref of ['', otherRef, projectRef.toUpperCase(), `${projectRef}x`, '../fixture']) denied({ ...staging, projectRef: ref }, [target]);
  denied(staging, [{ ...target, projectRef: otherRef }]);
  denied(staging, [{ ...target, apiUrl: local.apiUrl }]);
  denied(staging, [target, target]);
});

test('cross-environment routes, credentials, HTTP, ports, query, fragment and path substitutions fail closed', () => {
  for (const value of [
    { ...local, supabaseUrl: target.supabaseUrl }, { ...local, apiUrl: target.apiUrl },
    { ...local, supabaseUrl: 'http://localhost:54321' }, { ...local, apiUrl: 'http://127.0.0.1:8787/path' },
    { ...staging, supabaseUrl: local.supabaseUrl }, { ...staging, apiUrl: local.apiUrl },
    { ...staging, apiUrl: `https://${otherRef}.supabase.co/functions/v1/api` },
    { ...staging, apiUrl: `${target.supabaseUrl}/functions/v1/betweenus-api` },
    { ...staging, apiUrl: `${target.supabaseUrl}/functions/v1/api/v1` },
  ]) denied(value, [target]);
  for (const field of ['supabaseUrl', 'apiUrl'] as const) {
    for (const value of [staging[field].replace('https:', 'http:'), staging[field].replace('https://', 'https://user:password@'),
      staging[field].replace('.co', '.co:443'), `${staging[field]}?key=fictional`, `${staging[field]}#fragment`,
      staging[field].replace('.co', '.co.evil.invalid'), `${staging[field]}\\`, staging[field].replace('https:', 'HTTPS:')]) {
      denied({ ...staging, [field]: value }, [target]);
    }
  }
});

test('service keys, user bearers and malformed JWTs never become public client configuration', () => {
  for (const key of ['sb_secret_fictional_private_config_only', `Bearer ${local.publishableKey}`, jwt({ role: 'service_role' }),
    jwt({ role: 'authenticated', sub: 'fictional-user' }), jwt({ role: 'anon', sub: 'fictional-user' }),
    jwt({ role: 'anon' }, { alg: 'none' }), 'not-a-key', 'a.b.c', local.publishableKey + '.extra', 'x'.repeat(4097)]) {
    assert.equal(denied({ ...local, publishableKey: key }).reason, 'public_key_rejected');
  }
  assert.equal(denied({ ...staging, publishableKey: jwt({ role: 'anon', ref: otherRef }) }, [target]).reason, 'public_key_rejected');
  assert.equal(denied({ ...staging, publishableKey: jwt({ role: 'anon' }) }, [target]).reason, 'public_key_rejected');
  assert.equal(denied({ ...local, publishableKey: undefined }).reason, 'public_key_required');
  const secret = 'sb_secret_do_not_echo_this_fictional_sentinel';
  assert.equal(JSON.stringify(denied({ ...local, publishableKey: secret })).includes(secret), false);
});

test('malformed environment/config/approval inputs reject without echoing unknown values or mutating callers', () => {
  for (const value of [null, [], 'fixture', { ...local, development: 'true' }, { ...local, syntheticMode: 'false' },
    { ...local, extraSecret: 'fictional' }, { ...local, environment: 'unexpected-private-value' }, { ...local, projectRef }]) denied(value);
  denied(staging, { targets: [target] });
  denied(staging, [{ ...target, extra: 'unreviewed' }]);
  const input = Object.freeze({ ...staging });
  const approved = Object.freeze([Object.freeze({ ...target })]);
  const output = resolveDeploymentTarget(input, approved);
  assert.equal(output.ready, true); assert.equal(Object.isFrozen(output), true);
  assert.deepEqual(input, staging); assert.equal(JSON.stringify(output).includes('publishableKey'), false);
});
