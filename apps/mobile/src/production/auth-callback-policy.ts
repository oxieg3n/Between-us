import { runAuthMutation } from "./auth-mutation";

export const NATIVE_AUTH_CALLBACK = "between-us://auth/callback";
export const LOCAL_WEB_AUTH_CALLBACK = "http://127.0.0.1:8081/auth/callback";
const callbackError = () => new Error("This account link cannot be completed. Return to account access and request a new link or enter its eight-digit code.");

/** A URL is untrusted input. The SDK's locally stored PKCE verifier supplies flow binding. */
export function authCallbackCode(value: string, expected: string): string {
  try {
    if (value.length > 2048 || ![NATIVE_AUTH_CALLBACK, LOCAL_WEB_AUTH_CALLBACK].includes(expected)) throw callbackError();
    const url = new URL(value), target = new URL(expected);
    if (url.protocol !== target.protocol || url.host !== target.host || url.pathname !== target.pathname || url.username || url.password || url.hash) throw callbackError();
    for (const key of url.searchParams.keys()) {
      if (!["code", "type"].includes(key) || url.searchParams.getAll(key).length !== 1) throw callbackError();
    }
    const hint = url.searchParams.get("type");
    if (hint !== null && !["signup", "recovery"].includes(hint)) throw callbackError();
    const code = url.searchParams.get("code");
    if (!code || !/^[A-Za-z0-9._~-]{16,512}$/.test(code)) throw callbackError();
    return code;
  } catch { throw callbackError(); }
}

type ExchangeResult = { error: unknown; data: { session: { user: { id: string } } | null; user: { id: string } | null; redirectType: string | null } };
export class AuthCallbackActiveSessionError extends Error {
  constructor() { super("An account is already signed in. Return to account access and sign out deliberately, then request a new link or code. Use account settings to change the signed-in account's password."); this.name = "AuthCallbackActiveSessionError"; }
}
/** Deduplicates React effect replays; a second simultaneous flow cannot replace the first. */
export function createAuthCallbackExchange(exchange: (code: string) => Promise<ExchangeResult>, readSession: () => Promise<{ session: unknown | null; error: unknown }>) {
  let active: { code: string; result: Promise<"/accounts" | "/accounts?recovery=1"> } | undefined;
  return (code: string) => {
    if (!/^[A-Za-z0-9._~-]{16,512}$/.test(code)) return Promise.reject(callbackError());
    if (active) return active.code === code ? active.result : Promise.reject(callbackError());
    const result = runAuthMutation(async () => {
      try {
        const before = await readSession();
        if (before.error) throw callbackError();
        if (before.session !== null) throw new AuthCallbackActiveSessionError();
        const { data, error } = await exchange(code);
        if (error || !data.session || !data.user || !data.user.id || data.session.user.id !== data.user.id || ![null, "recovery"].includes(data.redirectType)) throw callbackError();
        // redirectType derives from the SDK-held verifier; never from the URL's type hint.
        return data.redirectType === "recovery" ? "/accounts?recovery=1" as const : "/accounts" as const;
      } catch (error) { if (error instanceof AuthCallbackActiveSessionError) throw error; throw callbackError(); }
    }).finally(() => { if (active?.result === result) active = undefined; });
    active = { code, result };
    return result;
  };
}
