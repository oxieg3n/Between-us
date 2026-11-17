import { createClient } from '@supabase/supabase-js';
import { createFinanceService, FinanceServiceError, type FinanceAction } from './finance.ts';
import { createPrivacyService, PrivacyServiceError } from './privacy.ts';
export { mountEdgeApi } from './edge-mount.ts';

export type ApiConfig = { url: string; publicKey: string; serviceKey: string; syntheticLocal: boolean; allowedOrigins?: string[] };
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class RequestError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RequestError(415, 'Use JSON.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new RequestError(413, 'Request is too large.'); } chunks.push(item.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new RequestError(400, 'Invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, 'Use a JSON object.');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some(key => !fields.includes(key))) throw new RequestError(400, 'Unexpected request field.');
}
/** Local anonymous registration is intentionally unavailable outside loopback synthetic development.
 * Hosted parent enrollment needs a reviewed anti-abuse/notice delivery service before enabling it. */
export function createApi(config: ApiConfig) {
  const service = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'api' } });
  const attempts = new Map<string, { count: number; until: number }>();
  async function route(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url); const path = url.pathname.replace(/^\/functions\/v1\/api/, '');
      if (request.method === 'GET' && path === '/health') return json({ service: 'between-us', publicEnrollment: false, build: '1116-FinanceCheckpoints-r2' });
      if (request.method === 'POST' && path === '/v1/enrollment/parent') {
        if (!config.syntheticLocal || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return json({ error: 'Enrollment is unavailable.' }, 403);
        const data = await body(request); exact(data, ['email']);
        if (typeof data.email !== 'string' || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.test$/i.test(data.email)) throw new RequestError(400, 'Use a fictional .test account.');
        const now = Date.now();
        for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
        const key = 'local-enrollment'; const item = attempts.get(key) ?? { count: 0, until: now + 60_000 };
        if (++item.count > 10) throw new RequestError(429, 'Try again later.'); attempts.set(key, item);
        const result = await service.rpc('issue_parent_registration', { p_email: data.email });
        if (result.error) throw new RequestError(403, 'Enrollment is unavailable.');
        return json(result.data, 201);
      }
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) throw new RequestError(401, 'Sign in to continue.');
      const token = authorization.slice(7);
      const user = createClient(config.url, config.publicKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'api' } });
      const identity = await user.auth.getUser(token);
      if (identity.error || !identity.data.user) throw new RequestError(401, 'Sign in to continue.');
      if (request.method === 'POST' && path === '/v1/privacy/reauthenticate') {
        const data = await body(request); exact(data,['password','totp']);
        if (typeof data.password !== 'string' || (data.totp !== undefined && typeof data.totp !== 'string')) throw new RequestError(400,'Check your verification details.');
        const privacy = createPrivacyService({url:config.url,publicKey:config.publicKey,serviceClient:service});
        return json(await privacy.reauthenticate({authorization,password:data.password,totp:data.totp as string|undefined}));
      }
      // Every private route additionally reaches an RPC that checks the current managed session.
      if (request.method === 'GET' && path === '/v1/context') {
        const result = await user.rpc('get_context'); if (result.error) throw new RequestError(403, 'Access is unavailable.'); return json(result.data);
      }
      if (request.method === 'POST' && path === '/v1/enrollment/child') {
        const data = await body(request); exact(data, ['childId', 'password', 'email']);
        if (typeof data.childId !== 'string' || !uuid.test(data.childId) || typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128 || (data.email !== undefined && typeof data.email !== 'string')) throw new RequestError(400, 'Check the child account details.');
        // The RPC requires a current guardian AND independently verified consent, at EVERY age.
        const intent = await user.rpc('begin_child_enrollment', { p_child_id: data.childId, p_email: data.email ?? null });
        if (intent.error || !intent.data) throw new RequestError(403, 'Joint guardian onboarding or consent is incomplete.');
        const bound = intent.data as { token: string; email: string; authAlias: boolean };
        // The database trigger rechecks the guardian, policy and token under the family lock.
        // Technical alias confirmation is never presented as ownership or identity verification.
        const created = await service.auth.admin.createUser({ email: bound.email, password: data.password,
          email_confirm: bound.authAlias, user_metadata: { registration_token: bound.token } });
        if (created.error) throw new RequestError(400, 'The independent child account could not be created.');
        return json({ email: bound.email, acceptanceToken: bound.token, needsEmailVerification: !bound.authAlias,
          guardianManaged: true, instruction: 'The child signs in with their own credential and accepts this invitation.' }, 201);
      }
      const history = /^\/v1\/finance\/([^/]+)\/([^/]+)\/(history|parent-history|parent-open-history)$/.exec(path);
      if (history && request.method === 'GET') {
        if ([...url.searchParams.keys()].some(key => key !== 'after') || url.searchParams.getAll('after').length > 1) throw new RequestError(400, 'Invalid financial history request.');
        const handler = createFinanceService({ userClient: user, serviceClient: service });
        return json(await (history[3] === 'parent-open-history' ? handler.parentHotHistory : history[3] === 'parent-history' ? handler.parentHistory : handler.history)(history[1], history[2], url.searchParams.get('after')));
      }
      const finance = /^\/v1\/finance\/([^/]+)\/([^/]+)$/.exec(path);
      if (finance && (request.method === 'GET' || request.method === 'POST')) {
        const handler = createFinanceService({ userClient: user, serviceClient: service });
        if (request.method === 'GET') return json(await handler.read(finance[1], finance[2]));
        const data = await body(request); exact(data, ['id', 'action']);
        return json(await handler.command(finance[1], finance[2], data as { id: string; action: FinanceAction }));
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      if (error instanceof FinanceServiceError) return json({ error: error.message }, error.code === 'not_authorized' ? 403 : error.code === 'invalid_action' ? 400 : error.code === 'rate_limited' ? 429 : 503);
      if (error instanceof PrivacyServiceError) return json({error:error.message},error.code === 'not_authorized' ? 403 : error.code === 'invalid_request' ? 400 : 503);
      // Never echo backend exceptions, credentials, request content or private SQL details.
      return json({ error: 'Service is temporarily unavailable.' }, 503);
    }
  }
  return async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get('origin');
    const allowed = config.allowedOrigins ?? (config.syntheticLocal ? ['http://127.0.0.1:8081','http://localhost:8081'] : []);
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const response = request.method === 'OPTIONS' ? new Response(null, {status:204}) : await route(request);
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin); response.headers.set('Vary','Origin');
      response.headers.set('Access-Control-Allow-Headers','authorization,content-type,apikey');
      response.headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    }
    return response;
  };
}
