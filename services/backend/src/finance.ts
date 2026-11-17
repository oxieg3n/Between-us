import { applyFinanceCommand, checkpointState, financeEventActivity, financeView, readFinanceBooks, sealFinanceState } from "../../../apps/mobile/src/finance/engine.ts";
import { compactBook, compactPrivateMatches, FinanceBudgetBasisError, FinanceCapacityError, FinanceCheckpointError, hydrateBook, hydratePrivateMatch, validateBook, validateCapsule, validatePrivateCapsule } from "../../../apps/mobile/src/finance/checkpoint.ts";
import type { ChildBook, FinanceActor, FinanceCommand, FinancePrivateMatchCapsule, FinanceSettledCapsule, FinanceState, FinanceView } from "../../../apps/mobile/src/finance/types.ts";
import { budgetKeys, canonicalFinance, databaseKeyOrder, exceedsHotCollections, financeDigest, needsTailCheckpoint, privateFinanceKinds, validateBudgetBasis } from './finance-checkpoints.ts';
import { financeHistoryProjection, parentMatchHistoryProjection } from './finance-history.ts';
import type { FinanceHistoryPage, ParentHotMatchHistoryPage, ParentMatchHistoryPage } from '../../../apps/mobile/src/production/finance-history-types.ts';

type Client = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> };
type Action<T> = T extends unknown ? Omit<T, "id" | "at" | "childId"> : never;
export type FinanceAction = Action<FinanceCommand>;
type Scope = { actorId: string; sessionId: string; expiresAt: number; familyId: string; childId: string; role: "parent" | "child" };
type Loaded = { state: FinanceState; revision: number; serverAt: string; replay: boolean; stateHash?: string; throughSequence?: number; legacyProjectionMissing?: boolean };
type Committed = { status: "committed" | "replayed" | "conflict"; state?: FinanceState; serverAt?: string };
export class FinanceServiceError extends Error {
  constructor(public readonly code: "not_authorized" | "invalid_action" | "temporarily_unavailable" | "rate_limited", message: string) { super(message); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(message = "Invalid financial request."): never { throw new FinanceServiceError("invalid_action", message); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function validateTree(value: unknown, depth = 0): void {
  if (depth > 5) invalid();
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) invalid("Financial values must be non-negative safe integers.");
  if (typeof value === "string" && value.length > 500) invalid("Keep financial text within 500 characters.");
  if (value === undefined || typeof value === "function" || typeof value === "bigint") invalid();
  if (Array.isArray(value)) { if (value.length > 31) invalid("Use at most 31 items per action."); value.forEach(v => validateTree(v, depth + 1)); }
  else if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) invalid();
    for (const [key, child] of Object.entries(value)) {
      if (["actor", "role", "at", "childId", "__proto__", "prototype", "constructor"].includes(key)) invalid("Identity and event time are assigned by the server.");
      validateTree(child, depth + 1);
    }
  }
}
async function fingerprint(familyId: string, childId: string, action: FinanceAction): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical({ familyId, childId, action })));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
async function rpc<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === 'PT429') throw new FinanceServiceError('rate_limited', 'Too many financial actions. Try again later.');
    if (error.code === "42501") throw new FinanceServiceError("not_authorized", "Financial access is unavailable.");
    if (error.code === "22023" || error.code === "23505" || error.code === "54000") invalid("This financial action cannot be completed.");
    throw new FinanceServiceError("temporarily_unavailable", "Financial service is temporarily unavailable.");
  }
  if (data === null || data === undefined) throw new FinanceServiceError("temporarily_unavailable", "Financial service is temporarily unavailable.");
  return data as T;
}
function actor(scope: Scope): FinanceActor { return scope.role === "parent" ? { role: "parent" } : { role: "child", childId: scope.childId }; }
function project(state: FinanceState, scope: Scope, at: string): FinanceView {
  try {
    const result = financeView(state, actor(scope), scope.childId, at);
    result.activity = result.activity.slice(-100);
    if (result.matching) result.matching.commitments = result.matching.commitments.slice(-100);
    return result;
  } catch { unavailable(); }
}
const capacityMessage = 'This active financial record requires an approved capacity review before more actions.';
function unavailable(): never { throw new FinanceServiceError('temporarily_unavailable', 'Financial service is temporarily unavailable.'); }
class SourceConflict extends Error {}
async function verifiedLoad(client: Client, args: Record<string, unknown>): Promise<Loaded> {
  const loaded = await rpc<Loaded>(client, 'finance_load', args);
  if (loaded.stateHash !== undefined && loaded.stateHash !== await financeDigest(loaded.state)) unavailable();
  if (loaded.state.checkpoint && !loaded.stateHash) unavailable();
  try { return { ...loaded, state: sealFinanceState(loaded.state) }; } catch { unavailable(); }
}
type ArchiveRead = { id: string; hash: string; revision: number; stateHash: string; capsule: FinanceSettledCapsule };
async function archiveLookup(client: Client, scope: Scope, kind: string, id: string): Promise<ArchiveRead | null> {
  const result = await client.rpc('finance_archive_lookup', { p_scope: scope, p_entity_kind: kind, p_entity_id: id });
  if (result.error) {
    if (result.error.code === '42501') throw new FinanceServiceError('not_authorized', 'Financial access is unavailable.');
    unavailable();
  }
  return result.data as ArchiveRead | null;
}
async function privateLookup(client: Client, scope: Scope, id: string): Promise<(Omit<ArchiveRead, 'capsule'> & { capsule: FinancePrivateMatchCapsule }) | null> {
  const result = await client.rpc('finance_private_match_lookup', { p_scope: scope, p_match_id: id });
  if (result.error) {
    if (result.error.code === '42501') throw new FinanceServiceError('not_authorized', 'Financial access is unavailable.');
    unavailable();
  }
  return result.data as (Omit<ArchiveRead, 'capsule'> & { capsule: FinancePrivateMatchCapsule }) | null;
}
function reference(action: FinanceAction, book: ChildBook): { kind: string; id: string } | null {
  if ('occurrenceId' in action && !book.occurrences.some(o => o.id === action.occurrenceId)) return { kind: 'occurrence', id: action.occurrenceId };
  if ('payoutId' in action && !book.payouts.some(p => p.id === action.payoutId)) return { kind: 'payout', id: action.payoutId };
  if ('paymentId' in action && !book.payouts.some(p => p.payments.some(payment => payment.id === action.paymentId))) return { kind: 'payment', id: action.paymentId };
  return null;
}

/** Both clients use the api schema; serviceClient must remain server-only. */
export function createFinanceService({ userClient, serviceClient }: { userClient: Client; serviceClient: Client }) {
  async function scopeFor(familyId: string, childId: string): Promise<Scope> {
    if (!uuid.test(familyId) || !uuid.test(childId)) invalid();
    return rpc<Scope>(userClient, "finance_scope", { p_family_id: familyId, p_child_id: childId });
  }
  async function budget(scope: Scope, loaded: Loaded, book: ChildBook, dates: string[] = []): Promise<ChildBook> {
    if (!book.plan || !loaded.stateHash) unavailable();
    const result = await rpc<unknown>(serviceClient, 'finance_archive_budget', {
      p_scope: scope, p_period: book.plan.period, p_anchor_date: book.plan.anchorDate,
      p_period_keys: budgetKeys(book, book.plan, dates), p_hot_occurrence_ids: book.occurrences.map(o => o.id),
    });
    if (result && typeof result === 'object' && 'revision' in result && 'stateHash' in result
      && (result.revision !== loaded.revision || result.stateHash !== loaded.stateHash)) throw new SourceConflict();
    try { return { ...book, archivedBudget: validateBudgetBasis(result, book, loaded.revision, loaded.stateHash) }; }
    catch { unavailable(); }
  }
  return {
    async parentHotHistory(familyId: string, childId: string, afterId: string | null = null): Promise<ParentHotMatchHistoryPage> {
      if (afterId !== null && (!afterId || afterId.length > 512)) invalid();
      const scope = await scopeFor(familyId, childId);
      if (scope.role !== 'parent') throw new FinanceServiceError('not_authorized', 'Financial access is unavailable.');
      const loaded = await verifiedLoad(serviceClient, { p_scope: scope });
      let matches: NonNullable<FinanceView['matching']>['commitments'];
      try { matches = financeView(loaded.state, { role: 'parent' }, childId, loaded.serverAt).matching!.commitments.sort((a, b) => databaseKeyOrder(a.id, b.id)); }
      catch { unavailable(); }
      const start = afterId === null ? 0 : matches.findIndex(item => item.id === afterId) + 1;
      if (afterId !== null && start === 0) invalid('Invalid parent matching history cursor.');
      const items = matches.slice(start, start + 20);
      return { items, nextAfterId: start + items.length < matches.length ? items.at(-1)!.id : null };
    },
    async parentHistory(familyId: string, childId: string, afterId: string | null = null): Promise<ParentMatchHistoryPage> {
      if (afterId !== null && !uuid.test(afterId)) invalid();
      const scope = await scopeFor(familyId, childId);
      if (scope.role !== 'parent') throw new FinanceServiceError('not_authorized', 'Financial access is unavailable.');
      const source = await rpc(serviceClient, 'finance_private_match_page', { p_scope: scope, p_after_id: afterId, p_limit: 20 });
      try { return parentMatchHistoryProjection(source, childId); } catch { unavailable(); }
    },
    async history(familyId: string, childId: string, afterId: string | null = null): Promise<FinanceHistoryPage> {
      if (afterId !== null && !uuid.test(afterId)) invalid();
      const scope = await scopeFor(familyId, childId);
      const source = await rpc(serviceClient, 'finance_archive_page', { p_scope: scope, p_after_id: afterId, p_limit: 20 });
      try { return financeHistoryProjection(source, childId); } catch { unavailable(); }
    },
    async read(familyId: string, childId: string): Promise<FinanceView> {
      const scope = await scopeFor(familyId, childId);
      const loaded = await verifiedLoad(serviceClient, { p_scope: scope });
      const view = project(loaded.state, scope, loaded.serverAt);
      if (loaded.legacyProjectionMissing === true && loaded.stateHash) {
        try {
          await rpc(serviceClient, 'finance_capture_legacy_snapshot', {
            p_scope: scope, p_expected_revision: loaded.revision, p_expected_state_hash: loaded.stateHash,
            p_child_projection: financeView(loaded.state, { role: 'child', childId }, childId, loaded.serverAt),
            p_parent_projection: financeView(loaded.state, { role: 'parent' }, childId, loaded.serverAt),
          });
        } catch (error) {
          // A denied cache write cannot suppress a financial read at a resource
          // ceiling. Newly known session revocation still denies this response.
          if (error instanceof FinanceServiceError && error.code === 'not_authorized') throw error;
        }
      }
      return view;
    },
    async command(familyId: string, childId: string, request: { id: string; action: FinanceAction }): Promise<FinanceView> {
      if (!request || Object.keys(request).some(k => !["id", "action"].includes(k)) || !uuid.test(request.id) || !request.action || typeof request.action !== "object" || Array.isArray(request.action) || "id" in request.action) invalid();
      validateTree(request.action);
      if (new TextEncoder().encode(JSON.stringify(request.action)).byteLength > 4096) invalid("Financial action is too large.");
      const scope = await scopeFor(familyId, childId);
      const hash = await fingerprint(familyId, childId, request.action);
      for (let attempt = 0; attempt < 4; attempt++) {
        const loaded = await verifiedLoad(serviceClient, { p_scope: scope, p_operation_id: request.id, p_fingerprint: hash });
        if (loaded.replay) return project(loaded.state, scope, loaded.serverAt);
        let next: FinanceState, event: FinanceState['events'][number], eventActivity: FinanceView['activity'][number] | undefined;
        const capsules: FinanceSettledCapsule[] = [], hydratedCapsules: { id: string; hash: string }[] = [];
        const privateCapsules: FinancePrivateMatchCapsule[] = [], hydratedPrivateCapsules: { id: string; hash: string }[] = [];
        try {
          if ("paidAt" in request.action && Date.parse(request.action.paidAt) > Date.parse(loaded.serverAt)) invalid("A reported payment cannot be in the future.");
          let working = loaded.state;
          const books = { ...readFinanceBooks(working) };
          let book = books[childId], changed = false;
          // The transactional permanent identity registry rejects reused chore
          // and goal IDs, including identities retired from this working book.
          const target = working.checkpoint ? reference(request.action, book) : null;
          if (target) {
            const archived = await archiveLookup(serviceClient, scope, target.kind, target.id);
            if (archived) {
              if (archived.revision !== loaded.revision || archived.stateHash !== loaded.stateHash) continue;
              validateCapsule(archived.capsule, childId);
              if (archived.hash !== await financeDigest(archived.capsule)) unavailable();
              book = hydrateBook(book, archived.capsule, childId);
              hydratedCapsules.push({ id: archived.id, hash: archived.hash }); changed = true;
            }
          }
          const oldMatchId = 'matchId' in request.action ? request.action.matchId : null;
          if (working.checkpoint && scope.role === 'parent' && oldMatchId && !book.matches.some(m => m.id === oldMatchId)) {
            const archived = await privateLookup(serviceClient, scope, oldMatchId);
            if (archived) {
              if (archived.revision !== loaded.revision || archived.stateHash !== loaded.stateHash) continue;
              validatePrivateCapsule(archived.capsule, childId);
              if (archived.hash !== await financeDigest(archived.capsule)) unavailable();
              book = hydratePrivateMatch(book, archived.capsule, childId, loaded.serverAt, working.timezone);
              hydratedPrivateCapsules.push({ id: archived.id, hash: archived.hash }); changed = true;
            }
          }
          if (book.archivedBudget && ['assign_chore', 'edit_chore', 'configure_plan'].includes(request.action.kind) || hydratedCapsules.length) {
            // A plan reindex must be complete before the new binding can be used.
            const priorBasis = canonicalFinance(book.archivedBudget);
            const prospective = request.action.kind === 'configure_plan' ? { ...book, plan: request.action.plan } : book;
            book = await budget(scope, loaded, prospective, request.action.kind === 'assign_chore' ? request.action.dates : []);
            if (request.action.kind === 'configure_plan') book = { ...book, plan: books[childId].plan };
            changed ||= priorBasis !== canonicalFinance(book.archivedBudget);
          }
          if (changed || needsTailCheckpoint(working, childId, request.action.kind)) {
            if (!loaded.stateHash) unavailable();
            const compacted = hydratedPrivateCapsules.length ? { book, capsules: [] } : compactPrivateMatches(book, childId, loaded.serverAt, working.timezone);
            privateCapsules.push(...compacted.capsules); books[childId] = compacted.book;
            working = checkpointState(working, books);
          }
          next = applyFinanceCommand(working, actor(scope), { ...request.action, id: `${scope.actorId}:${request.id}`, childId, at: loaded.serverAt } as FinanceCommand);
          event = next.events.at(-1)!;
          eventActivity = financeView(next, { role: 'parent' }, childId, loaded.serverAt).activity.find(item => item.id === event.id);
          if (!eventActivity) unavailable();
          let projected = financeView(next, actor(scope), childId, loaded.serverAt);
          // Visible collection thresholds alone cause retirement. Hidden-only rollovers
          // cannot change a child's visible lists, history, or command admission.
          if (!privateFinanceKinds.has(request.action.kind) && (projected.occurrences.length >= 100 || projected.payouts.length >= 32)) {
            const nextBooks = { ...readFinanceBooks(next) };
            const based = await budget(scope, loaded, nextBooks[childId]);
            const compacted = compactBook(based, childId);
            if (compacted.needsBudgetRefresh) unavailable();
            if (compacted.capsules.length) {
              capsules.push(...compacted.capsules);
              const privateCompacted = compactPrivateMatches(compacted.book, childId, loaded.serverAt, next.timezone);
              privateCapsules.push(...privateCompacted.capsules); nextBooks[childId] = privateCompacted.book;
              next = checkpointState(next, nextBooks); projected = financeView(next, actor(scope), childId, loaded.serverAt);
            }
          }
          if (exceedsHotCollections(projected)) invalid(capacityMessage);
          const checked = readFinanceBooks(next)[childId];
          const privateCompacted = compactPrivateMatches(checked, childId, loaded.serverAt, next.timezone);
          validateBook(privateCompacted.book);
          if (privateCompacted.capsules.length) {
            const finalBooks = { ...readFinanceBooks(next) }; finalBooks[childId] = privateCompacted.book;
            privateCapsules.push(...privateCompacted.capsules); next = checkpointState(next, finalBooks);
          }
        } catch (error) {
          if (error instanceof SourceConflict) continue;
          if (error instanceof FinanceServiceError) throw error;
          if (error instanceof FinanceCapacityError) invalid(capacityMessage);
          if (error instanceof FinanceCheckpointError || error instanceof FinanceBudgetBasisError) unavailable();
          invalid(error instanceof Error ? error.message : "Invalid financial action.");
        }
        const committed = await rpc<Committed>(serviceClient, "finance_commit", {
          p_scope: scope, p_operation_id: request.id, p_fingerprint: hash,
          p_expected_revision: loaded.revision,
          p_state: loaded.stateHash ? { state: next, event, previousStateHash: loaded.stateHash, capsules, hydratedCapsules, privateCapsules, hydratedPrivateCapsules,
            eventActivity,
            coveredActivity: financeEventActivity(loaded.state),
            childProjection: financeView(next, { role: 'child', childId }, childId, loaded.serverAt),
            parentProjection: financeView(next, { role: 'parent' }, childId, loaded.serverAt),
          } : next,
          p_server_at: loaded.serverAt,
        });
        if (committed.status === 'committed') {
          if (committed.serverAt !== loaded.serverAt) unavailable();
          return project(next, scope, committed.serverAt);
        }
        if (committed.status === 'replayed' && committed.state && committed.serverAt) return project(committed.state, scope, committed.serverAt);
      }
      throw new FinanceServiceError("temporarily_unavailable", "Financial service is temporarily unavailable.");
    },
  };
}
