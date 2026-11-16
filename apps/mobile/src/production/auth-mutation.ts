export class AuthMutationBusyError extends Error {
  constructor() { super("Another account action is still finishing. Wait for it to finish, then try again."); this.name = "AuthMutationBusyError"; }
}
let pending = false;
const listeners = new Set<() => void>();

/** Stable primitive snapshot for useSyncExternalStore; exposes no account or credential state. */
export const getAuthMutationPending = () => pending;
export function subscribeAuthMutation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function notify() {
  // An observer cannot prevent admission, strand the gate, or skip another observer.
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* UI observers have no authority over the gate. */ }
  }
}

/** One managed-client mutation at a time; never queue a different account's intent. */
export async function runAuthMutation<T>(work: () => Promise<T>): Promise<T> {
  if (pending) throw new AuthMutationBusyError();
  pending = true;
  notify();
  try { return await work(); }
  finally { pending = false; notify(); }
}
