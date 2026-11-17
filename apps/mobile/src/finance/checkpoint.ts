import { cents, localDate, periodKey, sum, validDate, validInstant } from "./money-calendar";
import type { ArchivedBudgetBasis, BookAllocation, BookLot, BookPayout, ChildBook, FinanceCheckpoint, FinancePrivateMatchCapsule, FinanceSettledCapsule, FinanceView } from "./types";
export type { ArchivedBudgetBasis, ArchivedMatchBasis, BookLot, BookPayout, ChildBook, FinanceCheckpoint, FinancePrivateMatchCapsule, FinanceSettledCapsule } from "./types";

export const CHECKPOINT_LIMITS = Object.freeze({ bytes: 67_108_864, bookBytes: 1_048_576, sourceRows: 4096, allocations: 512, matches: 2048 });
export class FinanceCheckpointError extends Error { readonly code = "invalid_checkpoint"; constructor() { super("Financial checkpoint could not be verified."); } }
export class FinanceCapacityError extends Error { readonly code = "capacity_review"; constructor() { super("This active financial record requires a capacity review before more actions."); } }
export class FinanceBudgetBasisError extends Error { readonly code = "budget_basis_required"; constructor() { super("Historical allowance budget must be verified."); } }
const fail = (): never => { throw new FinanceCheckpointError(); };
const check: (condition: unknown) => asserts condition = condition => { if (!condition) fail(); };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const text = (v: unknown, max = 512, empty = false): v is string => typeof v === "string" && v.length <= max && (empty || v.length > 0)
  && !/[\u0000]/.test(v) && !["__proto__", "constructor", "prototype"].includes(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const choice = (v: unknown, values: readonly unknown[]) => values.includes(v);
const date = (v: unknown) => { try { return typeof v === "string" && validDate(v) === v; } catch { return false; } };
const instant = (v: unknown) => { try { return typeof v === "string" && validInstant(v) === v; } catch { return false; } };
function shape(v: unknown, required: string[], optional: string[] = []): asserts v is Record<string, unknown> {
  check(object(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k)));
}
function rows(v: unknown, limit: number): asserts v is unknown[] { check(Array.isArray(v) && v.length <= limit); }
function unique(v: readonly { id: string }[]) { check(new Set(v.map(r => r.id)).size === v.length); }
function numericMap(v: unknown, limit: number): asserts v is Record<string, number> {
  check(object(v) && Object.keys(v).length <= limit && Object.entries(v).every(([k, n]) => text(k) && integer(n)));
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const cloneBook = (book: ChildBook): ChildBook => clone(book);
const deeplyFrozen = new WeakSet<object>();
const bookProofs = new WeakMap<object, { actualBytes: number; potentialBytes: number }>();
const checkpointProofs = new WeakMap<object, string[]>();
/** Only this traversal establishes deep immutability; a caller's shallow freeze proves nothing. */
export function freezeFinanceValue<T>(value: T): T {
  const active = new Set<object>();
  const visit = (item: unknown) => {
    if (item === null || item === undefined || typeof item === "boolean" || typeof item === "string") return;
    if (typeof item === "number") { check(integer(item)); return; }
    check(item && typeof item === "object" && (Array.isArray(item) || object(item)) && !active.has(item));
    if (deeplyFrozen.has(item)) return;
    active.add(item);
    for (const key of Reflect.ownKeys(item)) {
      check(typeof key === "string"); const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      check(Object.hasOwn(descriptor, "value") && (descriptor.enumerable || Array.isArray(item) && key === "length")); visit(descriptor.value);
    }
    Object.freeze(item); active.delete(item); deeplyFrozen.add(item);
  };
  visit(value); return value;
}
export function sealFinanceBook(book: ChildBook): ChildBook { freezeFinanceValue(book); validateBook(book); return book; }
export function sealFinanceCheckpoint(checkpoint: FinanceCheckpoint, childIds: readonly string[]): FinanceCheckpoint {
  freezeFinanceValue(checkpoint); validateCheckpoint(checkpoint, childIds); return checkpoint;
}
function serialized(v: unknown, limit: number) {
  let nodes = 0; const seen = new Set<object>();
  const visit = (item: unknown, depth: number) => {
    // Every serialized JSON value/container needs at least one byte; a tighter
    // private record-count threshold could reject only the matching-on world.
    check(++nodes <= limit && depth <= 14);
    if (item === null || typeof item === "boolean" || typeof item === "string") { if (typeof item === "string") check(item.length <= 2048); return; }
    if (typeof item === "number") { check(integer(item)); return; }
    check(item && typeof item === "object" && !seen.has(item)); seen.add(item);
    check(Array.isArray(item) || object(item));
    for (const [key, value] of Object.entries(item)) { check(text(key)); if (value !== undefined) visit(value, depth + 1); }
    seen.delete(item);
  };
  visit(v, 0); check(new TextEncoder().encode(JSON.stringify(v)).byteLength <= limit);
}
function lot(v: unknown): asserts v is BookLot {
  shape(v, ["earningId", "cents", "eligible", "earnedAt"], ["matchAllocationId"]);
  check(text(v.earningId) && integer(v.cents) && bool(v.eligible) && instant(v.earnedAt)
    && (v.matchAllocationId === undefined || text(v.matchAllocationId)));
}
function occurrence(v: unknown) {
  shape(v, ["id", "choreId", "title", "instructions", "dueDate", "rewardCents", "status", "note"], ["approvedAt", "reversed", "recurrence", "evidenceRequired"]);
  check(text(v.id) && text(v.choreId) && text(v.title, 160) && text(v.instructions, 500, true) && date(v.dueDate) && integer(v.rewardCents)
    && choice(v.status, ["not_started", "submitted_by_child", "approved", "needs_retry", "declined", "cancelled", "expired"])
    && text(v.note, 500, true) && (v.approvedAt === undefined || instant(v.approvedAt)) && (v.reversed === undefined || bool(v.reversed))
    && (v.recurrence === undefined || choice(v.recurrence, ["once", "daily", "weekly"])) && (v.evidenceRequired === undefined || bool(v.evidenceRequired)));
}
function payout(v: unknown): asserts v is BookPayout {
  shape(v, ["id", "createdAt", "amountCents", "originalAmountCents", "lots", "payments", "cancelled", "prepared"]);
  check(text(v.id) && instant(v.createdAt) && integer(v.amountCents) && integer(v.originalAmountCents) && bool(v.cancelled) && bool(v.prepared));
  rows(v.lots, 512); v.lots.forEach(lot); rows(v.payments, 32);
  for (const p of v.payments) {
    shape(p, ["id", "amountCents", "method", "paidAt", "note", "childAcknowledged", "reversed", "lots"]);
    check(text(p.id) && integer(p.amountCents) && choice(p.method, ["cash", "manual", "Cash App", "Venmo"]) && instant(p.paidAt)
      && text(p.note, 500, true) && bool(p.childAcknowledged) && bool(p.reversed)); rows(p.lots, 512); p.lots.forEach(lot);
    check(sum((p.lots as BookLot[]).map(l => l.cents)) === p.amountCents);
  }
  unique(v.payments as BookPayout["payments"]);
  check(sum((v.lots as BookLot[]).map(l => l.cents)) + paid(v as unknown as BookPayout) <= v.originalAmountCents);
}
function allocation(v: unknown): asserts v is BookAllocation {
  shape(v, ["id", "goalId", "lots", "originalCents", "releasedCents", "sourceCents"]);
  check(text(v.id) && text(v.goalId) && integer(v.originalCents) && integer(v.releasedCents)); rows(v.lots, 512); v.lots.forEach(lot);
  check(sum((v.lots as BookLot[]).map(l => l.cents)) + v.releasedCents <= v.originalCents);
  numericMap(v.sourceCents, 512); check(sum(Object.values(v.sourceCents)) === v.originalCents);
}
function budget(v: unknown): asserts v is ArchivedBudgetBasis {
  shape(v, ["period", "anchorDate", "maximumCents", "byPeriod", "excludedOccurrenceIds"]);
  check(choice(v.period, ["weekly", "biweekly", "monthly"]) && date(v.anchorDate) && integer(v.maximumCents));
  numericMap(v.byPeriod, 131); check(Object.values(v.byPeriod).every(n => n <= Number(v.maximumCents)));
  rows(v.excludedOccurrenceIds, 100); check(v.excludedOccurrenceIds.every(id => text(id)) && new Set(v.excludedOccurrenceIds).size === v.excludedOccurrenceIds.length);
}
function plan(v: unknown) {
  shape(v, ["budgetCents", "period", "anchorDate", "payoutCadence", "minimumPayoutCents", "allowGoalRelease"]);
  check(integer(v.budgetCents) && choice(v.period, ["weekly", "biweekly", "monthly"]) && date(v.anchorDate)
    && choice(v.payoutCadence, ["per_task", "daily", "weekly", "biweekly", "monthly"]) && integer(v.minimumPayoutCents) && bool(v.allowGoalRelease));
}
function matchingRule(v: unknown) {
  shape(v, ["enabled", "percent", "monthlyCapCents", "parentBudgetCents", "surprise"], ["eligibleGoalIds"]);
  check(bool(v.enabled) && integer(v.percent) && v.percent <= 10000 && integer(v.monthlyCapCents) && integer(v.parentBudgetCents) && bool(v.surprise));
  if (v.eligibleGoalIds !== undefined) { rows(v.eligibleGoalIds, 32); check(v.eligibleGoalIds.every(id => text(id)) && new Set(v.eligibleGoalIds).size === v.eligibleGoalIds.length); }
}
const encodedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const worstText = (length: number) => "\u0001".repeat(length);
function privateHydrationReserve(): FinancePrivateMatchCapsule["match"] {
  const max = Number.MAX_SAFE_INTEGER;
  const sources = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [worstText(168) + String(i).padStart(3, "0"), max]));
  return { id: worstText(512), goalId: worstText(512), allocationId: worstText(512), cents: max, activeCents: max, fundedCents: max,
    parentReportedFundingCents: max, reconciledCents: max, reversedCents: max, correctionDueCents: max,
    month: "9999-12", revealed: false, createdAt: "9999-12-31T23:59:59.999Z", status: "partially_parent_reported",
    sourceCents: sources, invalidatedCents: { ...sources }, eligibleBaseCents: max };
}
const hydrationReserve = privateHydrationReserve();
const hydrationReserveBytes = encodedBytes(hydrationReserve);
/** The estimate uses only visible provenance and fixed maximum private envelopes, never actual matching settings. */
function publicPotentialBook(book: ChildBook): ChildBook {
  const positive = [...book.free, ...book.allocations.flatMap(a => a.lots), ...book.payouts.flatMap(allPayoutLots)]
    .filter(l => l.cents > 0 && l.matchAllocationId).map(l => l.matchAllocationId!);
  const refs = new Set(positive); check(refs.size <= CHECKPOINT_LIMITS.matches);
  const max = Number.MAX_SAFE_INTEGER;
  const matches = [...refs].sort().map(id => {
    const a = book.allocations.find(row => row.id === id); check(a);
    const sourceCents = Object.fromEntries(Object.keys(a.sourceCents).map(key => [key, max]));
    return { id: `${a.id}:match`, goalId: a.goalId, allocationId: a.id, cents: max, activeCents: max, fundedCents: max,
      parentReportedFundingCents: max, reconciledCents: max, reversedCents: max, correctionDueCents: max,
      month: "9999-12", revealed: false, createdAt: "9999-12-31T23:59:59.999Z", status: "partially_parent_reported" as const,
      sourceCents, invalidatedCents: { ...sourceCents }, eligibleBaseCents: max };
  });
  return { ...book, matches, matchingRule: { enabled: false, percent: 10000, monthlyCapCents: max, parentBudgetCents: max, surprise: false, eligibleGoalIds: book.goals.map(g => g.id) },
    archivedMatches: { month: "9999-12", usedCents: max, byGoal: Object.fromEntries(book.goals.map(g => [g.id, { activeCents: max, fundedCents: max, revealedFundedCents: max }])) } };
}
export function potentialBook(book: ChildBook): ChildBook {
  const potential = publicPotentialBook(book);
  potential.matches.push({ ...hydrationReserve, sourceCents: { ...hydrationReserve.sourceCents }, invalidatedCents: { ...hydrationReserve.invalidatedCents } });
  return potential;
}
export const potentialBookBytes = (book: ChildBook) => {
  const proof = bookProofs.get(book); if (proof) return proof.potentialBytes;
  const potential = publicPotentialBook(book);
  return encodedBytes(potential) + hydrationReserveBytes + (potential.matches.length ? 1 : 0);
};
function worstParentActivity() {
  // JSON escaping costs six bytes per code unit, conservatively above UTF-8.
  const worstActivity = Array.from({ length: 100 }, (_, i) => ({ id: worstText(509) + String(i).padStart(3, "0"), at: "9999-12-31T23:59:59.999Z",
    label: worstText(160), actorRole: "parent" as const, referenceId: worstText(512), amountCents: Number.MAX_SAFE_INTEGER, note: worstText(500) }));
  return worstActivity;
}
const parentActivityBytes = encodedBytes(worstParentActivity());
export const potentialCheckpointBytes = (value: FinanceCheckpoint) => {
  const base = { ...value, books: {}, activity: Object.fromEntries(Object.entries(value.activity).map(([id, activity]) => [id, { visible: activity.visible, parent: [] }])) };
  const books = Object.entries(value.books);
  return encodedBytes(base) + books.reduce((total, [id, book]) => total + encodedBytes(id) + 1 + potentialBookBytes(book), 0)
    + Math.max(0, books.length - 1) + Object.keys(value.activity).length * (parentActivityBytes - 2);
};
const paid = (p: BookPayout) => sum(p.payments.filter(pay => !pay.reversed).map(pay => pay.amountCents));
const allPayoutLots = (p: BookPayout) => [...p.lots, ...p.payments.flatMap(pay => pay.lots)];
export function validateBook(value: unknown, options: { candidate?: boolean; privateCandidate?: boolean } = {}): asserts value is ChildBook {
  if (value && typeof value === "object" && bookProofs.has(value)) return;
  serialized(value, options.candidate || options.privateCandidate ? CHECKPOINT_LIMITS.bookBytes * 2 : CHECKPOINT_LIMITS.bookBytes);
  shape(value, ["occurrences", "goals", "free", "allocations", "payouts", "matches", "savingsRules", "matchingRule", "earnedCents", "correctionDueCents", "archivedPaidCents"], ["plan", "archivedBudget", "archivedMatches"]);
  if (value.plan !== undefined) plan(value.plan); if (value.archivedBudget !== undefined) budget(value.archivedBudget);
  check(integer(value.earnedCents) && integer(value.correctionDueCents) && integer(value.archivedPaidCents));
  rows(value.occurrences, options.candidate ? 131 : 100); value.occurrences.forEach(occurrence);
  rows(value.goals, 32); for (const g of value.goals) {
    shape(g, ["id", "title", "targetCents", "status", "heldCents", "locationLabel"], ["targetDate"]);
    check(text(g.id) && text(g.title, 160) && integer(g.targetCents) && g.targetCents > 0 && choice(g.status, ["active", "cancelled"])
      && integer(g.heldCents) && text(g.locationLabel, 160, true) && (g.targetDate === undefined || date(g.targetDate)));
  }
  rows(value.free, 512); value.free.forEach(lot); rows(value.allocations, CHECKPOINT_LIMITS.allocations);
  value.allocations.forEach(allocation);
  rows(value.payouts, options.candidate ? 33 : 32); value.payouts.forEach(payout); rows(value.savingsRules, 8);
  for (const r of value.savingsRules) {
    shape(r, ["id", "goalId", "mode", "value", "enabled"]);
    check(text(r.id) && text(r.goalId) && choice(r.mode, ["fixed", "percent"]) && integer(r.value) && r.value > 0
      && (r.mode !== "percent" || r.value <= 100) && bool(r.enabled));
  }
  matchingRule(value.matchingRule); rows(value.matches, CHECKPOINT_LIMITS.matches + (options.candidate || options.privateCandidate ? 8 : 0));
  for (const m of value.matches) {
    shape(m, ["id", "goalId", "allocationId", "cents", "activeCents", "fundedCents", "parentReportedFundingCents", "reconciledCents", "reversedCents", "correctionDueCents", "month", "revealed", "createdAt", "status", "sourceCents", "invalidatedCents", "eligibleBaseCents"]);
    check(["id", "goalId", "allocationId"].every(k => text(m[k])) && ["cents", "activeCents", "fundedCents", "parentReportedFundingCents", "reconciledCents", "reversedCents", "correctionDueCents", "eligibleBaseCents"].every(k => integer(m[k]))
      && typeof m.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) && bool(m.revealed) && instant(m.createdAt)
      && choice(m.status, ["pledged", "partially_parent_reported", "parent_reported_paid", "reversed"]));
    numericMap(m.sourceCents, 512); numericMap(m.invalidatedCents, 512);
    check(Object.entries(m.invalidatedCents).every(([key, n]) => Object.hasOwn(m.sourceCents as Record<string, number>, key) && n <= (m.sourceCents as Record<string, number>)[key]));
    check(sum(Object.values(m.sourceCents)) === m.eligibleBaseCents && Number(m.eligibleBaseCents) > 0
      && Number(m.cents) - Number(m.reversedCents) === m.activeCents && Number(m.correctionDueCents) <= Number(m.fundedCents));
  }
  const book = value as unknown as ChildBook;
  const visibleBudget = publicPotentialBook(book);
  const visibleBytes = encodedBytes(visibleBudget) + hydrationReserveBytes + (visibleBudget.matches.length ? 1 : 0);
  check(visibleBytes <= CHECKPOINT_LIMITS.bookBytes);
  if (book.archivedMatches !== undefined) {
    const basis = book.archivedMatches; shape(basis, ["month", "usedCents", "byGoal"]);
    check(typeof basis.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(basis.month) && integer(basis.usedCents) && object(basis.byGoal) && Object.keys(basis.byGoal).length <= 32);
    for (const [goalId, totals] of Object.entries(basis.byGoal)) {
      shape(totals, ["activeCents", "fundedCents", "revealedFundedCents"]);
      check(text(goalId) && integer(totals.activeCents) && integer(totals.fundedCents) && integer(totals.revealedFundedCents)
        && totals.activeCents === totals.fundedCents && totals.revealedFundedCents <= totals.fundedCents);
    }
    check(basis.usedCents <= sum(Object.values(basis.byGoal).map(g => g.activeCents)));
  }
  for (const list of [book.occurrences, book.goals, book.allocations, book.payouts, book.matches, book.savingsRules]) unique(list);
  const goals = new Set(book.goals.map(g => g.id)), sources = new Set(book.occurrences.map(o => o.id));
  check(book.allocations.every(a => goals.has(a.goalId)) && book.savingsRules.every(r => goals.has(r.goalId)) && book.matches.every(m => goals.has(m.goalId))
    && Object.keys(book.archivedMatches?.byGoal ?? {}).every(id => goals.has(id)));
  check(!book.matchingRule.eligibleGoalIds || book.matchingRule.eligibleGoalIds.every(id => goals.has(id)));
  if (!options.candidate && !options.privateCandidate) {
    const refIds = new Set(visibleBudget.matches.map(m => m.allocationId)); let orphanCount = 0;
    for (const match of book.matches) {
      if (!refIds.has(match.allocationId)) {
        check(++orphanCount <= 1 && match.activeCents === match.fundedCents && match.correctionDueCents === match.fundedCents
          && sum(Object.values(match.invalidatedCents)) === match.eligibleBaseCents && Object.keys(match.sourceCents).length <= 100
          && Object.keys(match.sourceCents).every(key => key.length <= 171));
        continue;
      }
      const a = book.allocations.find(row => row.id === match.allocationId)!;
      check(match.id === `${a.id}:match` && match.goalId === a.goalId
        && Object.entries(match.sourceCents).every(([key, n]) => Object.hasOwn(a.sourceCents, key) && n <= a.sourceCents[key]));
    }
  }
  const sourceRows = [...book.free, ...book.allocations.flatMap(a => a.lots), ...book.payouts.flatMap(allPayoutLots)];
  check(sourceRows.length <= CHECKPOINT_LIMITS.sourceRows && sourceRows.every(l => sources.has(l.earningId)));
  check(!book.archivedBudget || book.archivedBudget.excludedOccurrenceIds.every(id => sources.has(id)));
  const own = sum(book.free.map(l => l.cents)) + sum(book.allocations.flatMap(a => a.lots).map(l => l.cents))
    + sum(book.payouts.flatMap(p => p.lots).map(l => l.cents)) + sum(book.payouts.map(paid)) + book.archivedPaidCents;
  check(cents(book.earnedCents + book.correctionDueCents) === cents(own));
  if (!options.candidate && !options.privateCandidate) {
    const actualBytes = encodedBytes(book); check(actualBytes <= visibleBytes);
    if (deeplyFrozen.has(book)) bookProofs.set(book, { actualBytes, potentialBytes: visibleBytes });
  }
}

function cachedActivity(value: unknown, visible: boolean) {
  rows(value, 100);
  const hiddenLabels = new Set(["Prospective matching rule updated", "Parent contribution revealed", "Parent reported contribution — transfer not verified", "Parent match corrected", "Parent reported funding reconciliation — transfer not verified"]);
  for (const entry of value) {
    shape(entry, ["id", "at", "label", "actorRole", "referenceId"], ["amountCents", "note"]);
    check(text(entry.id) && instant(entry.at) && text(entry.label, 160) && choice(entry.actorRole, ["parent", "child"]) && text(entry.referenceId)
      && (entry.amountCents === undefined || integer(entry.amountCents)) && (entry.note === undefined || text(entry.note, 500, true))
      && (!visible || !hiddenLabels.has(String(entry.label))));
  }
  unique(value as FinanceView["activity"]);
}
export function validateCheckpoint(value: unknown, childIds: readonly string[]): asserts value is FinanceCheckpoint {
  const proof = value && typeof value === "object" ? checkpointProofs.get(value) : undefined;
  if (proof) {
    check(childIds.length > 0 && childIds.length <= 12 && new Set(childIds).size === childIds.length
      && childIds.every(id => text(id)) && proof.every(id => childIds.includes(id))); return;
  }
  shape(value, ["version", "lastEventAt", "books", "activity"]);
  check(value.version === 1 && (value.lastEventAt === null || instant(value.lastEventAt)) && childIds.length > 0 && childIds.length <= 12
    && new Set(childIds).size === childIds.length && childIds.every(id => text(id)) && object(value.books) && object(value.activity));
  // A server-authorized roster may grow after an immutable checkpoint was stored.
  // Existing checkpoint keys must still be an exact, nonforeign books/cache pair.
  const storedIds = Object.keys(value.books);
  check(storedIds.length > 0 && storedIds.length <= childIds.length && Object.keys(value.activity).length === storedIds.length
    && storedIds.every(id => childIds.includes(id)));
  for (const id of storedIds) {
    check(Object.hasOwn(value.books, id) && Object.hasOwn(value.activity, id)); validateBook(value.books[id]);
    const activity = value.activity[id]; shape(activity, ["visible", "parent"]); cachedActivity(activity.visible, true); cachedActivity(activity.parent, false);
    if (value.lastEventAt !== null) check([...(activity.visible as FinanceView["activity"]), ...(activity.parent as FinanceView["activity"])].every(a => a.at <= String(value.lastEventAt)));
  }
  const potential = potentialCheckpointBytes(value as unknown as FinanceCheckpoint);
  // Static outer shape and validated books/cache rows bound depth and JSON types.
  // Sum exact book bytes instead of serializing every unchanged sibling again.
  const books = value.books as Record<string, ChildBook>;
  const actual = encodedBytes({ ...value, books: {} }) + storedIds.reduce((total, id) => total + encodedBytes(id) + 1
    + (bookProofs.get(books[id])?.actualBytes ?? encodedBytes(books[id])), 0) + Math.max(0, storedIds.length - 1);
  check(potential <= CHECKPOINT_LIMITS.bytes && actual <= potential);
  if (deeplyFrozen.has(value)) checkpointProofs.set(value, storedIds);
}
export function validateCapsule(value: unknown, expectedChildId: string): asserts value is FinanceSettledCapsule {
  serialized(value, CHECKPOINT_LIMITS.bookBytes); shape(value, ["version", "childId", "occurrences", "payouts", "allocations", "paidCents"]);
  check(value.version === 1 && text(expectedChildId) && value.childId === expectedChildId && integer(value.paidCents));
  rows(value.occurrences, 100); rows(value.payouts, 32); check(value.occurrences.length > 0);
  value.occurrences.forEach(occurrence); value.payouts.forEach(payout); rows(value.allocations, CHECKPOINT_LIMITS.allocations); value.allocations.forEach(allocation);
  const capsule = value as unknown as FinanceSettledCapsule;
  unique(capsule.occurrences); unique(capsule.payouts); unique(capsule.allocations);
  const ids = new Set(capsule.occurrences.map(o => o.id));
  check(capsule.occurrences.every(o => ["approved", "cancelled", "expired", "declined"].includes(o.status))
    && capsule.payouts.every(p => p.lots.every(l => l.cents === 0) && allPayoutLots(p).every(l => ids.has(l.earningId)))
    && capsule.allocations.every(a => a.lots.every(l => l.cents === 0) && Object.keys(a.sourceCents).every(id => ids.has(id)))
    && capsule.payouts.flatMap(allPayoutLots).every(l => !l.matchAllocationId || capsule.allocations.some(a => a.id === l.matchAllocationId))
    && sum(capsule.payouts.map(paid)) === capsule.paidCents);
}

function retirementBudget(book: ChildBook, retiring: Set<string>): ArchivedBudgetBasis | null {
  if (!book.plan) return null;
  const old = book.archivedBudget;
  if (old && (old.period !== book.plan.period || old.anchorDate !== book.plan.anchorDate)) return null;
  const totals = { ...(old?.byPeriod ?? {}) };
  const counted = book.occurrences.filter(o => !["cancelled", "expired", "declined"].includes(o.status));
  if (old && counted.some(o => !Object.hasOwn(old.byPeriod, periodKey(o.dueDate, book.plan!.period, book.plan!.anchorDate)))) return null;
  for (const o of counted.filter(o => retiring.has(o.id) && !old?.excludedOccurrenceIds.includes(o.id))) {
    const key = periodKey(o.dueDate, book.plan.period, book.plan.anchorDate); totals[key] = cents((totals[key] ?? 0) + o.rewardCents);
  }
  const retainedKeys = new Set(counted.filter(o => !retiring.has(o.id)).map(o => periodKey(o.dueDate, book.plan!.period, book.plan!.anchorDate)));
  return { period: book.plan.period, anchorDate: book.plan.anchorDate, maximumCents: Math.max(old?.maximumCents ?? 0, ...Object.values(totals)),
    byPeriod: Object.fromEntries([...retainedKeys].sort().map(key => [key, totals[key] ?? 0])),
    excludedOccurrenceIds: (old?.excludedOccurrenceIds ?? []).filter(id => !retiring.has(id)) };
}

export function compactBook(input: ChildBook, childId: string): { book: ChildBook; capsules: FinanceSettledCapsule[]; needsBudgetRefresh: boolean } {
  validateBook(input, { candidate: true }); check(text(childId)); const book = cloneBook(input), visited = new Set<string>(), capsules: FinanceSettledCapsule[] = [];
  const liveSources = new Set([...book.free, ...book.allocations.flatMap(a => a.lots), ...book.payouts.flatMap(p => p.lots)].filter(l => l.cents > 0).map(l => l.earningId));
  for (const seed of book.occurrences) {
    if (visited.has(seed.id)) continue;
    const ids = new Set([seed.id]), payouts = new Set<string>(); let changed = true;
    while (changed) {
      changed = false;
      for (const a of book.allocations) {
        const sources = Object.keys(a.sourceCents);
        if (!sources.some(id => ids.has(id))) continue;
        for (const id of sources) if (!ids.has(id)) { ids.add(id); changed = true; }
      }
      for (const p of book.payouts) {
        const sources = allPayoutLots(p).map(l => l.earningId);
        if (!sources.some(id => ids.has(id))) continue;
        if (!payouts.has(p.id)) { payouts.add(p.id); changed = true; }
        for (const id of sources) if (!ids.has(id)) { ids.add(id); changed = true; }
      }
    }
    ids.forEach(id => visited.add(id));
    const occurrences = book.occurrences.filter(o => ids.has(o.id)), connected = book.payouts.filter(p => payouts.has(p.id));
    // Never inspect private matching here: it must not decide visible archive eligibility/capacity.
    if (occurrences.length !== ids.size || occurrences.some(o => !["approved", "cancelled", "expired", "declined"].includes(o.status))
      || [...ids].some(id => liveSources.has(id)) || connected.some(p => p.lots.some(l => l.cents > 0))) continue;
    // A bounded transient request may connect more rows than one immutable
    // capsule can hold. Retain it and reject final hot capacity explicitly.
    if (occurrences.length > 100 || connected.length > 32) continue;
    const allocations = book.allocations.filter(a => Object.keys(a.sourceCents).some(id => ids.has(id)));
    const capsule: FinanceSettledCapsule = { version: 1, childId, occurrences, payouts: connected, allocations, paidCents: sum(connected.map(paid)) };
    validateCapsule(capsule, childId); capsules.push(capsule);
  }
  const retiring = new Set(capsules.flatMap(c => c.occurrences.map(o => o.id)));
  const basis = retiring.size ? retirementBudget(book, retiring) : book.archivedBudget;
  if (retiring.size && !basis) return { book, capsules: [], needsBudgetRefresh: true };
  const retiringPayouts = new Set(capsules.flatMap(c => c.payouts.map(p => p.id)));
  const retiringAllocations = new Set(capsules.flatMap(c => c.allocations.map(a => a.id)));
  book.occurrences = book.occurrences.filter(o => !retiring.has(o.id)); book.payouts = book.payouts.filter(p => !retiringPayouts.has(p.id));
  book.free = book.free.filter(l => l.cents > 0);
  const referencedAllocations = new Set([...book.free, ...book.allocations.flatMap(a => a.lots), ...book.payouts.flatMap(allPayoutLots)]
    .filter(l => l.cents > 0).map(l => l.matchAllocationId));
  book.allocations = book.allocations.filter(a => !retiringAllocations.has(a.id)).map(a => ({ ...a, lots: a.lots.filter(l => l.cents > 0) })).filter(a => a.lots.length > 0 || referencedAllocations.has(a.id));
  book.archivedPaidCents = cents(book.archivedPaidCents + sum(capsules.map(c => c.paidCents)));
  if (basis) book.archivedBudget = basis;
  // V1 retires occurrence/payout components only. Visible goal retention cannot depend on private matches.
  if (book.occurrences.length > 100 || book.payouts.length > 32) throw new FinanceCapacityError();
  validateBook(book, { privateCandidate: true }); return { book, capsules: clone(capsules), needsBudgetRefresh: false };
}

export function hydrateBook(input: ChildBook, capsule: FinanceSettledCapsule, expectedChildId: string): ChildBook {
  validateBook(input); validateCapsule(capsule, expectedChildId); const book = cloneBook(input), restored = clone(capsule);
  check(book.archivedPaidCents >= restored.paidCents
    && restored.occurrences.every(o => !book.occurrences.some(hot => hot.id === o.id)) && restored.payouts.every(p => !book.payouts.some(hot => hot.id === p.id)));
  check(restored.allocations.every(a => !book.allocations.some(hot => hot.id === a.id)));
  if (book.occurrences.length + restored.occurrences.length > 100 || book.payouts.length + restored.payouts.length > 32) throw new FinanceCapacityError();
  book.archivedPaidCents -= restored.paidCents; book.occurrences.push(...restored.occurrences); book.payouts.push(...restored.payouts); book.allocations.push(...restored.allocations);
  if (!book.archivedBudget) throw new FinanceBudgetBasisError();
  const indexed = restored.occurrences.filter(o => !["cancelled", "expired", "declined"].includes(o.status)).map(o => o.id);
  book.archivedBudget.excludedOccurrenceIds = [...new Set([...book.archivedBudget.excludedOccurrenceIds, ...indexed])];
  validateBook(book); return book;
}

function matchMonth(book: ChildBook, at: string, timezone: string) {
  check(typeof timezone === "string" && timezone.length > 0);
  const month = localDate(at, timezone).slice(0, 7);
  if (book.archivedMatches && month < book.archivedMatches.month) fail();
  if (!book.archivedMatches) book.archivedMatches = { month, usedCents: 0, byGoal: {} };
  if (book.archivedMatches.month !== month) { book.archivedMatches.month = month; book.archivedMatches.usedCents = 0; }
  return book.archivedMatches;
}
export function validatePrivateCapsule(value: unknown, expectedChildId: string): asserts value is FinancePrivateMatchCapsule {
  serialized(value, CHECKPOINT_LIMITS.bookBytes); shape(value, ["version", "childId", "match"]);
  check(value.version === 1 && value.childId === expectedChildId && text(expectedChildId) && object(value.match));
  // Reuse the full book match validator with a zero-own-money validation shell.
  const match = value.match as unknown as FinancePrivateMatchCapsule["match"];
  const shell: ChildBook = { occurrences: [], goals: [{ id: match.goalId, title: "Archived match goal", targetCents: 1, status: "active", heldCents: 0, locationLabel: "" }],
    free: [], allocations: [], payouts: [], savingsRules: [], matches: [match], matchingRule: { enabled: false, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true },
    earnedCents: 0, correctionDueCents: 0, archivedPaidCents: 0 };
  validateBook(shell, { privateCandidate: true });
  check(match.activeCents === match.fundedCents && match.correctionDueCents === match.fundedCents && sum(Object.values(match.invalidatedCents)) === match.eligibleBaseCents);
  check(Object.keys(match.sourceCents).length <= 100 && Object.keys(match.sourceCents).every(key => key.length <= 171));
}
export function compactPrivateMatches(input: ChildBook, childId: string, at: string, timezone: string): { book: ChildBook; capsules: FinancePrivateMatchCapsule[] } {
  validateBook(input, { candidate: true }); check(text(childId)); const book = cloneBook(input), basis = matchMonth(book, at, timezone);
  const live = new Set([...book.free, ...book.allocations.flatMap(a => a.lots), ...book.payouts.flatMap(allPayoutLots)]
    .filter(l => l.cents > 0 && l.matchAllocationId).map(l => l.matchAllocationId));
  const capsules: FinancePrivateMatchCapsule[] = [];
  book.matches = book.matches.filter(match => {
    if (live.has(match.allocationId) || sum(Object.values(match.invalidatedCents)) !== match.eligibleBaseCents
      || match.activeCents !== match.fundedCents || match.correctionDueCents !== match.fundedCents) return true;
    const capsule: FinancePrivateMatchCapsule = { version: 1, childId, match }; validatePrivateCapsule(capsule, childId);
    const totals = basis.byGoal[match.goalId] ?? { activeCents: 0, fundedCents: 0, revealedFundedCents: 0 };
    totals.activeCents = cents(totals.activeCents + match.activeCents); totals.fundedCents = cents(totals.fundedCents + match.fundedCents);
    totals.revealedFundedCents = cents(totals.revealedFundedCents + (match.revealed ? match.fundedCents : 0));
    // Zero summaries need no per-history key and cannot make a visible goal count grow.
    if (totals.activeCents || totals.fundedCents || totals.revealedFundedCents) basis.byGoal[match.goalId] = totals;
    if (match.month === basis.month) basis.usedCents = cents(basis.usedCents + match.activeCents);
    capsules.push(capsule); return false;
  });
  validateBook(book); return { book, capsules: clone(capsules) };
}
export function hydratePrivateMatch(input: ChildBook, capsule: FinancePrivateMatchCapsule, childId: string, at: string, timezone: string): ChildBook {
  validateBook(input); validatePrivateCapsule(capsule, childId); const book = cloneBook(input), basis = matchMonth(book, at, timezone), match = clone(capsule.match);
  check(!book.matches.some(m => m.id === match.id));
  const totals = basis.byGoal[match.goalId] ?? { activeCents: 0, fundedCents: 0, revealedFundedCents: 0 };
  const revealed = match.revealed ? match.fundedCents : 0;
  check(totals.activeCents >= match.activeCents && totals.fundedCents >= match.fundedCents && totals.revealedFundedCents >= revealed
    && (match.month !== basis.month || basis.usedCents >= match.activeCents));
  totals.activeCents -= match.activeCents; totals.fundedCents -= match.fundedCents; totals.revealedFundedCents -= revealed;
  if (totals.activeCents || totals.fundedCents || totals.revealedFundedCents) basis.byGoal[match.goalId] = totals; else delete basis.byGoal[match.goalId];
  if (match.month === basis.month) basis.usedCents -= match.activeCents;
  book.matches.push(match); validateBook(book); return book;
}
