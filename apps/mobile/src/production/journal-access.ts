import type { VaultActor } from "./vault/types";
import {MAX_JOURNAL_LEASE_MS,type AccountBoundary,type JournalServerLease,type JournalLeaseTiming} from './journal-offline-lease';

type ManagedSession = { accessToken: string; userId: string };
type VerifiedContext = { user: { id: string; kind: string; state: string } };
export type JournalAccessPorts = {
  getSession(): Promise<ManagedSession | null>;
  getUser(token: string): Promise<{ id: string } | null>;
  getClaims(token: string): Promise<Record<string, unknown> | null>;
  getContext(token:string): Promise<VerifiedContext>;
  getLease?(token:string):Promise<JournalServerLease>;
  readAccountBoundary?():AccountBoundary;
  monotonicNow?():number;
};
export class JournalAccessError extends Error {
  constructor(readonly code: "denied" | "unavailable" = "denied") { super(code === "unavailable" ? "Connect to verify current account access. Only an already unlocked, still-authorized local journal can continue without this check." : "Sign in again and connect to verify your own account before unlocking."); this.name = "JournalAccessError"; }
}

/** No offline fallback: cached UI context/user metadata cannot mint a vault actor. */
export async function verifyJournalAccess(ports: JournalAccessPorts, expected: { issuer: string; subject: string }, signal?: AbortSignal) {
  function deny(): never { throw new JournalAccessError(); }
  const boundary=ports.readAccountBoundary?.(),startedAt=ports.monotonicNow?.();
  let proofClock=startedAt;
  const current = () => {
    if (signal?.aborted) deny();
    if (boundary) { const observed=ports.readAccountBoundary?.();if(!observed||observed.epoch!==boundary.epoch||observed.userId!==expected.subject)deny(); }
    if(ports.getLease){const observed=ports.monotonicNow?.();if(typeof observed!=='number'||!Number.isFinite(observed)||typeof proofClock!=='number'||observed<proofClock)deny();proofClock=observed;}
  };
  current();
  try {
    if (ports.getLease&&(!boundary||!Number.isSafeInteger(boundary.epoch)||boundary.epoch<0||boundary.userId!==expected.subject||typeof startedAt!=='number'||!Number.isFinite(startedAt)||startedAt<0))deny();
    const session = await ports.getSession(); current();
    if (!session || !session.accessToken || session.userId !== expected.subject) deny();
    const user = await ports.getUser(session.accessToken); current();
    if (!user || user.id !== session.userId) deny();
    const claims = await ports.getClaims(session.accessToken); current();
    if (!claims || claims.iss !== expected.issuer || claims.sub !== user.id || typeof claims.session_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)) deny();
    const serverLease=ports.getLease?await ports.getLease(session.accessToken):undefined;current();
    if(ports.getLease&&(!serverLease||serverLease.issuer!==expected.issuer||serverLease.subject!==user.id||serverLease.sessionId!==claims.session_id||!Number.isSafeInteger(serverLease.remainingMs)||serverLease.remainingMs<=0||serverLease.remainingMs>MAX_JOURNAL_LEASE_MS
      ||claims.role!=='authenticated'||typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||claims.exp<=0))deny();
    const context = await ports.getContext(session.accessToken); current();
    if (context.user.id !== user.id || context.user.state !== "active" || !["parent", "child"].includes(context.user.kind)) deny();
    const after = await ports.getSession(); current();
    if (!after || after.accessToken !== session.accessToken || after.userId !== user.id) deny();
    const actor: VaultActor = { issuer: expected.issuer, subject: user.id, sessionId: claims.session_id };
    let lease:JournalLeaseTiming|undefined;
    if(serverLease&&boundary&&typeof startedAt==='number') {
      const completedAt=ports.monotonicNow?.(),deadline=startedAt+serverLease.remainingMs;
      if(typeof completedAt!=='number'||!Number.isFinite(completedAt)||completedAt<startedAt||completedAt>=deadline)deny();
      lease={epoch:boundary.epoch,startedAt,deadline};
    }
    return { actor, token: session.accessToken, role: context.user.kind as "parent" | "child",...(lease?{lease}:{}) };
  } catch (error) { if (error instanceof JournalAccessError) throw error; throw new JournalAccessError(ports.getLease?'denied':"unavailable"); }
}

export type VerifiedJournalAccess = Awaited<ReturnType<typeof verifyJournalAccess>>;
export function sameJournalAuthorSession(previous: VerifiedJournalAccess, next: VerifiedJournalAccess) {
  return previous.actor.issuer === next.actor.issuer && previous.actor.subject === next.actor.subject && previous.actor.sessionId === next.actor.sessionId && previous.role === next.role;
}

/** Latest verified same-session token refresh preserves writing; failures never downgrade to cached identity. */
export function createJournalRefreshCoordinator(ports: {
  current(): VerifiedJournalAccess | undefined;
  verify(previous: VerifiedJournalAccess, signal: AbortSignal): Promise<VerifiedJournalAccess>;
  commit(next: VerifiedJournalAccess): void;
  conceal(value: boolean): void;
  beforeVerification(): void;
  invalidate(): void;
  unavailable?(): void;
  continuation?():boolean;
}) {
  let generation = 0, abort: AbortController | undefined, pending: Promise<void> | undefined;
  let wake!: () => void;
  let changed = new Promise<void>(resolve => { wake = resolve; });
  function notify() { wake(); changed = new Promise<void>(resolve => { wake = resolve; }); }
  function cancel() { generation++; abort?.abort(); abort = undefined; pending = undefined; notify(); ports.conceal(false); }
  function refresh() {
    const previous = ports.current(); if (!previous) return Promise.resolve();
    const selected = ++generation; abort?.abort(); const controller = new AbortController(); abort = controller;
    ports.conceal(!(ports.continuation?.()??false)); ports.beforeVerification();
    const work = (async () => {
      let unavailable = false;
      try {
        const next = await ports.verify(previous, controller.signal);
        if (controller.signal.aborted || selected !== generation) return;
        const current = ports.current();
        if (!current || !sameJournalAuthorSession(previous, current) || !sameJournalAuthorSession(previous, next)) throw new JournalAccessError();
        if(ports.continuation&&!ports.continuation()){ports.invalidate();return;}
        ports.commit(next);
      } catch (error) {
        if (!controller.signal.aborted && selected === generation) {
          if (error instanceof JournalAccessError && error.code === "unavailable") {
            if(ports.continuation&&!ports.continuation())ports.invalidate();
            else {unavailable=true;ports.unavailable?.();}
          }
          else ports.invalidate();
        }
      } finally {
        if (selected === generation) { pending = undefined; abort = undefined; notify(); if (!unavailable||ports.continuation?.()) ports.conceal(false); }
      }
    })();
    pending = work; notify(); return work;
  }
  return {
    refresh, cancel,
    async wait() { for (;;) { const current = pending; if (!current) return; await Promise.race([current, changed]); if (!pending || pending === current) return; } },
  };
}
