import { applyFinanceCommand, financeView } from "../../../apps/mobile/src/finance/engine.ts";
import type { FinanceActor, FinanceCommand, FinanceState, FinanceView } from "../../../apps/mobile/src/finance/types.ts";

type Client = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> };
type Action<T> = T extends unknown ? Omit<T, "id" | "at" | "childId"> : never;
export type FinanceAction = Action<FinanceCommand>;
type Scope = { actorId: string; sessionId: string; expiresAt: number; familyId: string; childId: string; role: "parent" | "child" };
type Loaded = { state: FinanceState; revision: number; serverAt: string; replay: boolean };
type Committed = { status: "committed" | "replayed" | "conflict"; state?: FinanceState; serverAt?: string };
export class FinanceServiceError extends Error {
  constructor(public readonly code: "not_authorized" | "invalid_action" | "temporarily_unavailable", message: string) { super(message); }
}
const hiddenKinds = new Set(["configure_matching", "reveal_match", "fund_match", "reverse_match", "reconcile_match"]);
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
    if (error.code === "42501") throw new FinanceServiceError("not_authorized", "Financial access is unavailable.");
    if (error.code === "22023" || error.code === "23505" || error.code === "54000") invalid("This financial action cannot be completed.");
    throw new FinanceServiceError("temporarily_unavailable", "Financial service is temporarily unavailable.");
  }
  if (data === null || data === undefined) throw new FinanceServiceError("temporarily_unavailable", "Financial service is temporarily unavailable.");
  return data as T;
}
function actor(scope: Scope): FinanceActor { return scope.role === "parent" ? { role: "parent" } : { role: "child", childId: scope.childId }; }
function project(state: FinanceState, scope: Scope, at: string): FinanceView {
  const result = financeView(state, actor(scope), scope.childId, at);
  result.activity = result.activity.slice(-100);
  if (result.matching) result.matching.commitments = result.matching.commitments.slice(-100);
  return result;
}
function capacity(state: FinanceState, scope: Scope, action: FinanceAction, at: string): void {
  const hidden = hiddenKinds.has(action.kind);
  const count = state.events.filter(e => e.childId === scope.childId && hiddenKinds.has(e.kind) === hidden).length;
  if (count >= (hidden ? 32 : 128)) invalid("This financial record requires an approved capacity review before more actions.");
  const view = financeView(state, actor(scope), scope.childId, at);
  if (view.occurrences.length > 100 || view.goals.length > 32 || view.savingsRules.length > 8 || view.payouts.length > 32 || view.payouts.some(p => p.payments.length > 32)) {
    invalid("This financial record requires an approved capacity review before more actions.");
  }
}

/** Both clients use the api schema; serviceClient must remain server-only. */
export function createFinanceService({ userClient, serviceClient }: { userClient: Client; serviceClient: Client }) {
  async function scopeFor(familyId: string, childId: string): Promise<Scope> {
    if (!uuid.test(familyId) || !uuid.test(childId)) invalid();
    return rpc<Scope>(userClient, "finance_scope", { p_family_id: familyId, p_child_id: childId });
  }
  return {
    async read(familyId: string, childId: string): Promise<FinanceView> {
      const scope = await scopeFor(familyId, childId);
      const loaded = await rpc<Loaded>(serviceClient, "finance_load", { p_scope: scope });
      return project(loaded.state, scope, loaded.serverAt);
    },
    async command(familyId: string, childId: string, request: { id: string; action: FinanceAction }): Promise<FinanceView> {
      if (!request || Object.keys(request).some(k => !["id", "action"].includes(k)) || !uuid.test(request.id) || !request.action || typeof request.action !== "object" || Array.isArray(request.action) || "id" in request.action) invalid();
      validateTree(request.action);
      if (new TextEncoder().encode(JSON.stringify(request.action)).byteLength > 4096) invalid("Financial action is too large.");
      const scope = await scopeFor(familyId, childId);
      const hash = await fingerprint(familyId, childId, request.action);
      for (let attempt = 0; attempt < 4; attempt++) {
        const loaded = await rpc<Loaded>(serviceClient, "finance_load", { p_scope: scope, p_operation_id: request.id, p_fingerprint: hash });
        if (loaded.replay) return project(loaded.state, scope, loaded.serverAt);
        let next: FinanceState;
        try {
          if ("paidAt" in request.action && Date.parse(request.action.paidAt) > Date.parse(loaded.serverAt)) invalid("A reported payment cannot be in the future.");
          capacity(loaded.state, scope, request.action, loaded.serverAt);
          next = applyFinanceCommand(loaded.state, actor(scope), { ...request.action, id: `${scope.actorId}:${request.id}`, childId, at: loaded.serverAt } as FinanceCommand);
          const projected = financeView(next, actor(scope), childId, loaded.serverAt);
          if (projected.occurrences.length > 100 || projected.goals.length > 32 || projected.savingsRules.length > 8 || projected.payouts.length > 32 || projected.payouts.some(p => p.payments.length > 32)) invalid("This financial record requires an approved capacity review before more actions.");
        } catch (error) {
          if (error instanceof FinanceServiceError) throw error;
          invalid(error instanceof Error ? error.message : "Invalid financial action.");
        }
        const committed = await rpc<Committed>(serviceClient, "finance_commit", {
          p_scope: scope, p_operation_id: request.id, p_fingerprint: hash,
          p_expected_revision: loaded.revision, p_state: next, p_server_at: loaded.serverAt,
        });
        if (committed.status !== "conflict" && committed.state && committed.serverAt) return project(committed.state, scope, committed.serverAt);
      }
      throw new FinanceServiceError("temporarily_unavailable", "Financial service is temporarily unavailable.");
    },
  };
}
