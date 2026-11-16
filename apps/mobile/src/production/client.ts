import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { sessionStorage } from "./session-storage";
import { withSessionBoundary } from "./session-boundary";
import {fetchWithTimeout} from './transport';
import {AccountApiError,AccountRpcError,AccountProtocolError} from './account-failures';
import {installAuthCrypto} from './auth-crypto';
import {runAuthMutation} from './auth-mutation';
import {createRecoveryProofState, type RecoveryProof} from './recovery-proof';
export {AccountApiError,AccountRpcError,isTransientAccountFailure} from './account-failures';

export type AccountContext = {
  user: {
    id: string;
    displayName: string;
    kind: "pending" | "parent" | "child";
    state: string;
  };
  families: { id: string; name: string; timezone: string }[];
  memberships: {
    familyId: string;
    role: "guardian" | "child";
    childId: string | null;
  }[];
  children: { id: string; familyId: string; name: string; state?: string; accountReady?: boolean }[];
  policy: {
    guardianManagedChildren: true;
    noticeVersion: string | null;
    consentPolicyVersion: string | null;
  };
};
function endpoint(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    if (
      url.protocol !== "https:" &&
      !(
        __DEV__ &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )
    )
      return null;
    return value.replace(/\/$/, "");
  } catch {
    return null;
  }
}
export const backendUrl = endpoint(process.env.EXPO_PUBLIC_SUPABASE_URL);
export const apiUrl = endpoint(process.env.EXPO_PUBLIC_API_URL);
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const sessionKey = "betweenus.production.session";
const authCryptoReady = installAuthCrypto();
export const accountClient =
  !(__DEV__ && process.env.EXPO_PUBLIC_APP_MODE === 'demo') && backendUrl && apiUrl && publicKey && authCryptoReady
    ? createClient(backendUrl, publicKey, {
      db: { schema: "api" }, global:{fetch:fetchWithTimeout},
        auth: {
          storage: sessionStorage,
          storageKey: sessionKey,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : null;
let accountEpoch = 0;
let activeToken: string | null = null;
let activeUserId: string | null = null;
const recovery = createRecoveryProofState();
/** Cancellation boundary only; a cached UID is never an authentication proof. */
export const readAccountBoundary=()=>Object.freeze({epoch:accountEpoch,userId:activeUserId});
/** Unverified candidate for full online proof only; never use this snapshot to unlock storage. */
export const getAccountProofCandidate=()=>activeToken&&activeUserId?Object.freeze({accessToken:activeToken,userId:activeUserId}):null;
accountClient?.auth.onAuthStateChange((event, session) => {
  activeToken = session?.access_token ?? null;
  activeUserId = session?.user.id ?? null;
  recovery.update(event, session);
  if (event !== "TOKEN_REFRESHED" && event !== "INITIAL_SESSION")
    accountEpoch++;
});
export function verifiedRecoveryProof() { return recovery.read(); }
export function hasVerifiedRecovery() { return recovery.read() !== null; }
export function requireRecoveryProof(proof: RecoveryProof) { recovery.require(proof); }
export function finishRecovery() { recovery.clear(); }
export async function requireSignedOut() {
  if (!accountClient) throw new Error('Account services are not configured.');
  const current = await accountClient.auth.getSession();
  if (current.error || current.data.session) throw new Error('An account is already signed in. Deliberately sign out before starting a different account action.');
}
export async function signOutOtherSessions(expectedUserId: string) {
  return runAuthMutation(async () => {
    if (!accountClient || !activeToken || activeUserId !== expectedUserId) throw new Error('Sign in again to this account.');
    const token = activeToken;
    const result = await accountClient.auth.admin.signOut(token, 'others');
    if (result.error || activeUserId !== expectedUserId) throw new Error('Other-session revocation could not be confirmed. Retry online.');
  });
}
export async function signOutAccount(
  scope: "local" | "global",
  expectedUserId?: string,
  conceal?: () => void,
): Promise<{ localCleared: boolean; serverRevoked: boolean }> {
  return runAuthMutation(async () => {
  if (!accountClient) return { localCleared: true, serverRevoked: true };
  if (expectedUserId && activeUserId !== expectedUserId) throw new Error('The account changed. Sign out from the current account screen.');
  conceal?.();
  const token = activeToken;
  activeToken = null;
  activeUserId = null;
  recovery.clear();
  accountEpoch++;
  accountClient.auth.stopAutoRefresh();
  // Local credential removal must not wait for a successful network revocation.
  try {
    await sessionStorage.removeItem(sessionKey);
    await sessionStorage.removeItem(`${sessionKey}-code-verifier`);
    if ((await sessionStorage.getItem(sessionKey)) !== null)
      return { localCleared: false, serverRevoked: false };
    const local = await accountClient.auth.signOut({ scope: "local" });
    if (local.error) return { localCleared: false, serverRevoked: false };
  } catch {
    return { localCleared: false, serverRevoked: false };
  }
  if (!token) return { localCleared: true, serverRevoked: false };
  try {
    const remote = await accountClient.auth.admin.signOut(token, scope);
    return { localCleared: true, serverRevoked: !remote.error };
  } catch {
    return { localCleared: true, serverRevoked: false };
  }
  });
}
async function rpcResponse(response:Response):Promise<unknown> {
  let data:unknown;
  try {data=await response.json();}
  catch {if(!response.ok)throw new AccountRpcError('The account service could not confirm this request.',undefined,response.status);throw new AccountProtocolError('malformed-json');}
  if(!response.ok) {
    const code=data&&typeof data==='object'&&'code' in data&&typeof data.code==='string'?data.code:undefined;
    throw new AccountRpcError(code==='42501'?'This action is not authorized. Sign in again or check the required approvals.':code==='22023'?'Check the information and try again.':'The server could not confirm this action. Retry the same request.',code,response.status);
  }
  return data;
}
async function exactSessionRpc(name:string,token:string,expectedUserId:string):Promise<unknown> {
  const epoch=accountEpoch;
  if(!backendUrl||!publicKey||!expectedUserId||activeUserId!==expectedUserId||activeToken!==token||!/^[-A-Za-z0-9._]+$/.test(token))throw new AccountRpcError('Current account verification is required.','42501',403);
  try {
  const response=await fetchWithTimeout(`${backendUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:publicKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Profile':'api','Accept-Profile':'api'},body:'{}'});
  const data=await rpcResponse(response);
  if(epoch!==accountEpoch||activeToken!==token||activeUserId!==expectedUserId)throw new AccountRpcError('The account changed during verification.','42501',403);
  return data;
  } finally {if(epoch!==accountEpoch||activeToken!==token||activeUserId!==expectedUserId)throw new AccountRpcError('The account changed during verification.','42501',403);}
}
/** Exact managed Auth endpoint, with protocol failures distinct from a transport outage. */
export async function getVerifiedAccountUser(token:string,expectedUserId:string):Promise<{id:string}> {
  const epoch=accountEpoch;
  if(!backendUrl||!publicKey||activeUserId!==expectedUserId||activeToken!==token||!/^[-A-Za-z0-9._]+$/.test(token))throw new AccountRpcError('Current account verification is required.','42501',403);
  try {
  const response=await fetchWithTimeout(`${backendUrl}/auth/v1/user`,{headers:{apikey:publicKey,Authorization:`Bearer ${token}`}});
  const value=await rpcResponse(response);
  if(epoch!==accountEpoch||activeUserId!==expectedUserId||activeToken!==token)throw new AccountRpcError('The account changed during verification.','42501',403);
  if(!value||typeof value!=='object'||Array.isArray(value)||!('id' in value)||value.id!==expectedUserId)throw new AccountProtocolError('malformed-proof');
  return {id:expectedUserId};
  } finally {if(epoch!==accountEpoch||activeToken!==token||activeUserId!==expectedUserId)throw new AccountRpcError('The account changed during verification.','42501',403);}
}
export async function getVerifiedAccountContext(token:string,expectedUserId:string):Promise<AccountContext> {
  const value=await exactSessionRpc('get_context',token,expectedUserId);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new AccountProtocolError('malformed-proof');
  const row=value as AccountContext;
  if(!row.user||row.user.id!==expectedUserId||!['pending','parent','child'].includes(row.user.kind)||!['pending','onboarding','active','suspended','closed'].includes(row.user.state)||typeof row.user.displayName!=='string'
    ||!Array.isArray(row.families)||!Array.isArray(row.memberships)||!Array.isArray(row.children)||row.policy?.guardianManagedChildren!==true
    ||row.families.some(f=>!f||typeof f.id!=='string'||typeof f.name!=='string'||typeof f.timezone!=='string')
    ||row.memberships.some(m=>!m||typeof m.familyId!=='string'||!['guardian','child'].includes(m.role)||(m.childId!==null&&typeof m.childId!=='string'))
    ||row.children.some(c=>!c||typeof c.id!=='string'||typeof c.familyId!=='string'||typeof c.name!=='string'))throw new AccountProtocolError('malformed-proof');
  return row;
}
/** Signature/session validation remains at PostgREST/Auth, including native PKCE-only crypto. */
export async function verifiedSessionClaims(token:string,expectedUserId:string):Promise<{data:{claims:Record<string,unknown>}|null;error:Error|null}> {
  try {
    const value=await exactSessionRpc('get_verified_session',token,expectedUserId);
    if(!value||typeof value!=='object'||Array.isArray(value))throw new AccountProtocolError('malformed-proof');
    const claims=value as Record<string,unknown>;
    if(claims.sub!==expectedUserId||claims.iss!==`${backendUrl}/auth/v1`||claims.role!=='authenticated'||typeof claims.session_id!=='string'||typeof claims.exp!=='number'||!Number.isFinite(claims.exp))throw new AccountProtocolError('malformed-proof');
    return {data:{claims},error:null};
  }catch(error){return {data:null,error:error instanceof Error?error:new AccountProtocolError('malformed-proof')};}
}
export async function getJournalSessionLease(token:string,expectedUserId:string):Promise<{issuer:string;subject:string;sessionId:string;remainingMs:number}> {
  const value=await exactSessionRpc('get_journal_session_lease',token,expectedUserId);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new AccountProtocolError('malformed-proof');
  const row=value as Record<string,unknown>;
  if(Object.keys(row).length!==4||row.issuer!==`${backendUrl}/auth/v1`||row.subject!==expectedUserId||typeof row.sessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.sessionId)||!Number.isSafeInteger(row.remainingMs)||Number(row.remainingMs)<1||Number(row.remainingMs)>900000)throw new AccountProtocolError('malformed-proof');
  return {issuer:row.issuer as string,subject:row.subject as string,sessionId:row.sessionId,remainingMs:row.remainingMs as number};
}
async function sendBound<T>(
  send: (token: string | null) => Promise<T>,
  allowAnonymous = false,
  expectedUserId?: string,
): Promise<T> {
  if (!accountClient) throw new Error("Account services are not configured.");
  return withSessionBoundary({
    epoch: () => accountEpoch,
    readSession: async () => {
      const result = await accountClient.auth.getSession();
      if (result.error) throw new Error("Sign in again.");
      return result.data.session;
    },
    send: (session) => send(session?.access_token ?? null),
    allowAnonymous,
    expectedUserId,
  });
}
export async function accountRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
  expectedUserId?: string,
): Promise<T> {
  if (!backendUrl || !publicKey || !/^[a-z_]+$/.test(name))
    throw new Error("Account services are not configured.");
  return sendBound(
    async (token) => {
    const response = await fetchWithTimeout(`${backendUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: publicKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Profile": "api",
          "Accept-Profile": "api",
        },
        body: JSON.stringify(args),
      });
      const data=await rpcResponse(response);
      return data as T;
    },
    false,
    expectedUserId,
  );
}
export async function accountApi<T>(
  path: string,
  value?: unknown,
  expectedUserId?: string,
): Promise<T> {
  if (!accountClient || !apiUrl)
    throw new Error("Account services are not configured.");
  return sendBound(
    async (token) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(`${apiUrl}${path}`, {
          method: value === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(publicKey ? { apikey: publicKey } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(value === undefined ? {} : { body: JSON.stringify(value) }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new AccountApiError(
            typeof body.error === "string"
              ? body.error
              : "The server could not confirm this action.",
            response.status,
          );
        return body as T;
      } finally {
        clearTimeout(timeout);
      }
    },
    path === "/v1/enrollment/parent",
    expectedUserId,
  );
}
