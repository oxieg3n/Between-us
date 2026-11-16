export type DeploymentEnvironment = 'local' | 'hosted-staging' | 'production' | 'unconfigured';
export type ApprovedStagingTarget = Readonly<{ projectRef: string; supabaseUrl: string; apiUrl: string }>;
// A hosted target requires an explicit owner-reviewed source change; environment variables cannot approve it.
export const APPROVED_STAGING_TARGETS: readonly ApprovedStagingTarget[] = Object.freeze([]);
export type DeploymentTargetInput = Readonly<{
  development: boolean;
  environment?: unknown;
  projectRef?: unknown;
  supabaseUrl?: unknown;
  apiUrl?: unknown;
  publishableKey?: unknown;
  syntheticMode?: unknown;
}>;
type Reason = 'ready' | 'invalid_configuration' | 'invalid_environment' | 'explicit_environment_required'
  | 'production_disabled' | 'development_required' | 'synthetic_release_denied' | 'invalid_target'
  | 'unapproved_staging_target' | 'public_key_required' | 'public_key_rejected';
export type DeploymentTarget = Readonly<{
  ready: boolean;
  environment: DeploymentEnvironment;
  statusLabel: string;
  reason: Reason;
  backendUrl: string | null;
  apiUrl: string | null;
}>;
const localBackend = 'http://127.0.0.1:54321';
const localApi = 'http://127.0.0.1:8787';
const reference = /^[a-z]{20}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = ['development', 'environment', 'projectRef', 'supabaseUrl', 'apiUrl', 'publishableKey', 'syntheticMode'];
const matches = (value: unknown, canonical: string) => value === canonical || value === `${canonical}/`;
const labels: Record<DeploymentEnvironment, string> = {
  local: 'Local synthetic services', 'hosted-staging': 'Hosted staging · fictional data',
  production: 'Production unavailable', unconfigured: 'Account services unavailable',
};
function result(environment: DeploymentEnvironment, reason: Reason, backendUrl: string | null = null, apiUrl: string | null = null): DeploymentTarget {
  return Object.freeze({ ready: reason === 'ready', environment, statusLabel: labels[environment], reason, backendUrl, apiUrl });
}
// Decode only to reject privileged/user JWTs. This neither verifies a signature nor grants account authority.
function jwtPart(value: string): Record<string, unknown> | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let bits = 0, accumulator = 0, bytes = '';
  for (const character of value) {
    accumulator = (accumulator << 6) | alphabet.indexOf(character); bits += 6;
    if (bits >= 8) { bits -= 8; bytes += String.fromCharCode((accumulator >>> bits) & 255); }
  }
  if (bits && (accumulator & ((1 << bits) - 1))) return null;
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(Array.from(bytes, character => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
    return object(decoded) ? decoded : null;
  } catch { return null; }
}
function publicKeyAllowed(value: unknown, projectRef?: string): boolean {
  if (typeof value !== 'string' || value.length > 4096) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(value)) return true;
  const parts = value.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return false;
  const header = jwtPart(parts[0]), payload = jwtPart(parts[1]);
  return header?.alg === 'HS256' && payload?.role === 'anon' && !Object.hasOwn(payload, 'sub')
    && (projectRef === undefined || payload.ref === projectRef);
}
function approvedTarget(value: unknown): value is ApprovedStagingTarget {
  if (!object(value) || Reflect.ownKeys(value).length !== 3
    || Object.keys(value).some(key => !['projectRef', 'supabaseUrl', 'apiUrl'].includes(key))
    || typeof value.projectRef !== 'string' || !reference.test(value.projectRef)) return false;
  const origin = `https://${value.projectRef}.supabase.co`;
  return value.supabaseUrl === origin && value.apiUrl === `${origin}/functions/v1/api`;
}

/** Pure routing/configuration admission. Managed Auth/RLS still authorize every actual request. */
export function resolveDeploymentTarget(input: unknown, approvedTargets: unknown = APPROVED_STAGING_TARGETS): DeploymentTarget {
  if (!object(input) || Reflect.ownKeys(input).some(key => typeof key !== 'string' || !keys.includes(key))
    || typeof input.development !== 'boolean' || (input.syntheticMode !== undefined && typeof input.syntheticMode !== 'boolean')) {
    return result('unconfigured', 'invalid_configuration');
  }
  const requested = input.environment;
  if (requested !== undefined && requested !== '' && requested !== 'local' && requested !== 'hosted-staging' && requested !== 'production') {
    return result('unconfigured', 'invalid_environment');
  }
  let environment: DeploymentEnvironment = requested === undefined || requested === '' ? 'unconfigured' : requested;
  if (environment === 'production') return result(environment, 'production_disabled');
  if (!input.development && input.syntheticMode === true) return result(environment, 'synthetic_release_denied');
  if (environment === 'unconfigured') {
    if (input.development && matches(input.supabaseUrl, localBackend) && matches(input.apiUrl, localApi)) environment = 'local';
    else return result(environment, 'explicit_environment_required');
  }
  if (environment === 'local') {
    if (!input.development) return result(environment, 'development_required');
    if ((input.projectRef !== undefined && input.projectRef !== '')
      || !matches(input.supabaseUrl, localBackend) || !matches(input.apiUrl, localApi)) return result(environment, 'invalid_target');
    if (!input.publishableKey) return result(environment, 'public_key_required');
    return publicKeyAllowed(input.publishableKey) ? result(environment, 'ready', localBackend, localApi) : result(environment, 'public_key_rejected');
  }
  if (typeof input.projectRef !== 'string' || !reference.test(input.projectRef)) return result(environment, 'invalid_target');
  const origin = `https://${input.projectRef}.supabase.co`, api = `${origin}/functions/v1/api`;
  if (!matches(input.supabaseUrl, origin) || !matches(input.apiUrl, api)) return result(environment, 'invalid_target');
  if (!Array.isArray(approvedTargets) || approvedTargets.length !== 1 || !approvedTargets.every(approvedTarget)
    || approvedTargets[0].projectRef !== input.projectRef) return result(environment, 'unapproved_staging_target');
  if (!input.publishableKey) return result(environment, 'public_key_required');
  return publicKeyAllowed(input.publishableKey, input.projectRef) ? result(environment, 'ready', origin, api) : result(environment, 'public_key_rejected');
}
