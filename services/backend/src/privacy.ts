import { createClient, type User } from '@supabase/supabase-js';
import { financeView } from '../../../apps/mobile/src/finance/engine.ts';
import type { FinanceState } from '../../../apps/mobile/src/finance/types.ts';
import { mergeFinancePrivacy } from './finance-privacy.ts';

type ServiceClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
  auth: { admin: { signOut(token: string, scope: 'local'): PromiseLike<{ error: unknown }> } };
};
type PrivacyResult = { id: string; status: string; completed: boolean; journalIncluded: false; stagesExecuted?: boolean };
type FinanceSource = { childId: string; state: FinanceState; sourceHash: string; actor: { role: 'child'; childId: string }; serverAt: string };
export class PrivacyServiceError extends Error {
  constructor(public readonly code: 'not_authorized' | 'invalid_request' | 'temporarily_unavailable') {
    super(code === 'not_authorized' ? 'Privacy access or verification is unavailable.' : code === 'invalid_request'
      ? 'Check the privacy request details.' : 'Privacy service is temporarily unavailable.');
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function denied(): never { throw new PrivacyServiceError('not_authorized'); }
function unavailable(): never { throw new PrivacyServiceError('temporarily_unavailable'); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function sessionClaims(value: unknown, userId: string) {
  if (!record(value) || value.sub !== userId || value.role !== 'authenticated' || typeof value.session_id !== 'string'
    || !uuid.test(value.session_id) || typeof value.exp !== 'number' || !Number.isFinite(value.exp) || value.exp * 1000 <= Date.now()) denied();
  return value as Record<string, unknown> & { session_id: string };
}
async function rpc(client: ServiceClient, name: string, args: Record<string, unknown>) {
  let result;
  try { result = await client.rpc(name, args); } catch { unavailable(); }
  if (result.error) {
    if (result.error.code === '42501') denied();
    if (result.error.code === '22023' || result.error.code === '54000') throw new PrivacyServiceError('invalid_request');
    unavailable();
  }
  if (!record(result.data)) unavailable();
  return result.data;
}
function verifiedFactors(user: User) { return (user.factors ?? []).filter(factor => factor.status === 'verified'); }

/** Server-only: serviceClient and transient Auth tokens must never enter client bundles or logs. */
export function createPrivacyService({ url, publicKey, serviceClient }: { url: string; publicKey: string; serviceClient: ServiceClient }) {
  const authClient = () => createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    async reauthenticate({ authorization, password, totp }: { authorization: string; password: string; totp?: string }): Promise<{ expiresAt: string }> {
      if (typeof authorization !== 'string' || authorization.length > 8192 || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)
        || typeof password !== 'string' || password.length < 1 || password.length > 128 || (totp !== undefined && (typeof totp !== 'string' || !/^\d{6}$/.test(totp)))) {
        throw new PrivacyServiceError('invalid_request');
      }
      const originalToken = authorization.slice(7);
      const verifier = authClient();
      const isolated = authClient();
      const ephemeralTokens = new Map<string, string>();
      let proof: { userId: string; oldSession: string; method: string; event: string } | undefined;
      try {
        const original = await verifier.auth.getUser(originalToken);
        if (original.error || !original.data.user?.email || !uuid.test(original.data.user.id)) denied();
        const oldUser = original.data.user;
        const claims = await verifier.auth.getClaims(originalToken);
        if (claims.error || !claims.data) denied();
        const oldClaims = sessionClaims(claims.data.claims, oldUser.id);
        const signedIn = await isolated.auth.signInWithPassword({ email: oldUser.email!, password });
        // Capture a returned token before inspecting errors so partial responses still get retired.
        let newToken = signedIn.data.session?.access_token;
        if (newToken && newToken !== originalToken) ephemeralTokens.set(newToken, newToken);
        if (signedIn.error || !newToken || !signedIn.data.user || signedIn.data.user.id !== oldUser.id
          || signedIn.data.user.email?.toLowerCase() !== oldUser.email!.toLowerCase()) denied();
        const signedClaims = await isolated.auth.getClaims(newToken);
        if (signedClaims.error || !signedClaims.data) denied();
        let newClaims = sessionClaims(signedClaims.data.claims, oldUser.id);
        if (newClaims.session_id === oldClaims.session_id) { ephemeralTokens.delete(newToken); denied(); }
        ephemeralTokens.delete(newToken); ephemeralTokens.set(newClaims.session_id, newToken);
        const factors = await isolated.auth.mfa.listFactors();
        if (factors.error || !factors.data) denied();
        const existing = verifiedFactors(oldUser);
        const current = factors.data.all.filter(factor => factor.status === 'verified');
        const verified = new Map([...existing, ...current].map(factor => [factor.id, factor]));
        const requiredTotp = [...verified.values()].filter(factor => factor.factor_type === 'totp').sort((a, b) => a.id.localeCompare(b.id));
        let method = 'managed_password';
        if (verified.size > 0) {
          // A verified phone/WebAuthn-only account must not fall back to password in this TOTP adapter.
          if (!requiredTotp.length || !totp) denied();
          const checked = await isolated.auth.mfa.challengeAndVerify({ factorId: requiredTotp[0].id, code: totp });
          if (checked.data?.access_token && checked.data.access_token !== originalToken) ephemeralTokens.set(checked.data.access_token, checked.data.access_token);
          if (checked.error || !checked.data?.access_token || checked.data.user.id !== oldUser.id) denied();
          newToken = checked.data.access_token;
          const mfaClaims = await isolated.auth.getClaims(newToken);
          if (mfaClaims.error || !mfaClaims.data) denied();
          newClaims = sessionClaims(mfaClaims.data.claims, oldUser.id);
          if (newClaims.session_id === oldClaims.session_id) { ephemeralTokens.delete(newToken); denied(); }
          ephemeralTokens.delete(newToken); ephemeralTokens.set(newClaims.session_id, newToken);
          if (newClaims.aal !== 'aal2') denied();
          method = 'managed_password_totp';
        } else if (totp) denied();
        proof = { userId: oldUser.id, oldSession: oldClaims.session_id, method, event: `managed-auth-session:${newClaims.session_id}` };
      } catch (error) {
        if (error instanceof PrivacyServiceError) throw error;
        unavailable();
      } finally {
        let cleanupFailed = false;
        for (const token of new Set(ephemeralTokens.values())) {
          try { if ((await serviceClient.auth.admin.signOut(token, 'local')).error) cleanupFailed = true; }
          catch { cleanupFailed = true; }
        }
        // No attestation is written unless retirement of every temporary token succeeds.
        if (cleanupFailed) unavailable();
      }
      if (!proof) unavailable();
      let stillCurrent;
      try { stillCurrent = await verifier.auth.getUser(originalToken); } catch { unavailable(); }
      if (stillCurrent.error || stillCurrent.data.user?.id !== proof.userId
        || (proof.method === 'managed_password' && verifiedFactors(stillCurrent.data.user).length > 0)) denied();
      const attestation = await rpc(serviceClient, 'record_privacy_reauthentication', {
        p_user_id: proof.userId, p_session_id: proof.oldSession, p_method: proof.method, p_auth_event_ref: proof.event,
      });
      if (typeof attestation.expiresAt !== 'string' || !Number.isFinite(Date.parse(attestation.expiresAt))) unavailable();
      return { expiresAt: attestation.expiresAt };
    },

    async executeAndProject(jobId: string, operatorId: string): Promise<PrivacyResult> {
      if (!uuid.test(jobId) || !uuid.test(operatorId)) throw new PrivacyServiceError('invalid_request');
      const executed = await rpc(serviceClient, 'execute_privacy_job', { p_job_id: jobId, p_operator_id: operatorId });
      if (executed.status !== 'partial_ready') {
        if (!['ready', 'blocked', 'access_revoked'].includes(String(executed.status))) unavailable();
        return { id: jobId, status: String(executed.status), completed: executed.status === 'ready', journalIncluded: false,
          ...(executed.stagesExecuted === true ? { stagesExecuted: true } : {}) };
      }
      if (executed.projectionKind === 'parent') {
        for (let attempt = 0; attempt < 3; attempt++) {
          const source = await rpc(serviceClient, 'privacy_parent_finance_sources', { p_job_id: jobId, p_operator_id: operatorId });
          if (source.status === 'blocked' || source.status === 'ready') {
            return { id: jobId, status: source.status, completed: source.status === 'ready', journalIncluded: false };
          }
          if (Array.isArray(source.scopes)) {
            if (!Array.isArray(source.families) || source.families.length > 4 || source.scopes.length > 48
              || typeof source.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.sourceHash) || typeof source.serverAt !== 'string') unavailable();
            const familyStates = new Map<string, FinanceState>();
            for (const family of source.families) {
              if (!record(family) || typeof family.familyId !== 'string' || !uuid.test(family.familyId) || familyStates.has(family.familyId) || !record(family.state)) unavailable();
              familyStates.set(family.familyId, family.state as unknown as FinanceState);
            }
            const projections: { familyId: string; childId: string; view: ReturnType<typeof financeView> }[] = [], seen = new Set<string>();
            for (const scope of source.scopes) {
              if (!record(scope) || typeof scope.familyId !== 'string' || typeof scope.childId !== 'string' || !uuid.test(scope.childId)
                || seen.has(scope.childId) || !familyStates.has(scope.familyId)) unavailable();
              seen.add(scope.childId);
              try { projections.push({ familyId: scope.familyId, childId: scope.childId,
                view: mergeFinancePrivacy(scope, familyStates.get(scope.familyId)!, { role: 'parent' }, scope.childId, source.serverAt) }); }
              catch { unavailable(); }
            }
            const attached = await rpc(serviceClient, 'attach_privacy_parent_finance_projections', {
              p_job_id: jobId, p_operator_id: operatorId, p_source_hash: source.sourceHash, p_projections: projections,
            });
            if (['ready', 'partial_ready', 'blocked'].includes(String(attached.status))) return { id: jobId, status: String(attached.status), completed: attached.status === 'ready', journalIncluded: false };
            if (attached.status === 'conflict') continue;
            unavailable();
          }
          if (source.status !== 'partial_ready' || !record(source.actor) || source.actor.role !== 'parent'
            || !Array.isArray(source.families) || source.families.length > 4 || typeof source.sourceHash !== 'string'
            || !/^[a-f0-9]{64}$/.test(source.sourceHash) || typeof source.serverAt !== 'string' || !Number.isFinite(Date.parse(source.serverAt))) unavailable();
          const projections: { familyId: string; childId: string; view: ReturnType<typeof financeView> }[] = [];
          const familyIds = new Set<string>(), childIds = new Set<string>();
          for (const family of source.families) {
            if (!record(family) || typeof family.familyId !== 'string' || !uuid.test(family.familyId) || familyIds.has(family.familyId)
              || !Array.isArray(family.childIds) || family.childIds.length > 12 || !record(family.state)
              || !Array.isArray(family.state.children) || !Array.isArray(family.state.events)) unavailable();
            familyIds.add(family.familyId);
            for (const id of family.childIds) {
              if (typeof id !== 'string' || !uuid.test(id) || childIds.has(id) || projections.length >= 48) unavailable();
              childIds.add(id);
              let view;
              try { view = financeView(family.state as unknown as FinanceState, { role: 'parent' }, id, source.serverAt); }
              catch { unavailable(); }
              if (view.childId !== id) unavailable();
              projections.push({ familyId: family.familyId, childId: id, view });
            }
          }
          const attached = await rpc(serviceClient, 'attach_privacy_parent_finance_projections', {
            p_job_id: jobId, p_operator_id: operatorId, p_source_hash: source.sourceHash, p_projections: projections,
          });
          if (['ready', 'partial_ready', 'blocked'].includes(String(attached.status))) {
            return { id: jobId, status: String(attached.status), completed: attached.status === 'ready', journalIncluded: false };
          }
          if (attached.status !== 'conflict') unavailable();
        }
        unavailable();
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const source = await rpc(serviceClient, 'privacy_finance_sources', { p_job_id: jobId, p_operator_id: operatorId });
        if (source.status === 'blocked' || source.status === 'ready') return { id: jobId, status: source.status, completed: source.status === 'ready', journalIncluded: false };
        if (record(source.projection)) {
          if (typeof source.childId !== 'string' || !uuid.test(source.childId) || !record(source.actor) || source.actor.role !== 'child'
            || source.actor.childId !== source.childId || !record(source.state) || typeof source.serverAt !== 'string'
            || typeof source.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.sourceHash)) unavailable();
          let projection;
          try { projection = mergeFinancePrivacy(source, source.state as unknown as FinanceState, { role: 'child', childId: source.childId }, source.childId, source.serverAt); }
          catch { unavailable(); }
          const attached = await rpc(serviceClient, 'attach_privacy_finance_projection', {
            p_job_id: jobId, p_operator_id: operatorId, p_source_hash: source.sourceHash, p_projection: projection,
          });
          if (attached.status === 'ready' || attached.status === 'blocked') return { id: jobId, status: attached.status, completed: attached.status === 'ready', journalIncluded: false };
          if (attached.status === 'conflict') continue;
          unavailable();
        }
        if (typeof source.childId !== 'string' || !uuid.test(source.childId) || !record(source.actor) || source.actor.role !== 'child'
          || source.actor.childId !== source.childId || !record(source.state) || !Array.isArray(source.state.children) || !Array.isArray(source.state.events)
          || typeof source.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.sourceHash) || typeof source.serverAt !== 'string') unavailable();
        const bound = source as unknown as FinanceSource;
        let projection;
        try { projection = financeView(bound.state, { role: 'child', childId: bound.childId }, bound.childId, bound.serverAt); }
        catch { unavailable(); }
        if (projection.matching !== undefined) unavailable();
        const attached = await rpc(serviceClient, 'attach_privacy_finance_projection', {
          p_job_id: jobId, p_operator_id: operatorId, p_source_hash: bound.sourceHash, p_projection: projection,
        });
        if (attached.status === 'ready') return { id: jobId, status: 'ready', completed: true, journalIncluded: false };
        if (attached.status !== 'conflict') unavailable();
      }
      unavailable();
    },
  };
}
