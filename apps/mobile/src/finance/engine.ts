import { cents, localDate, percentage, periodKey, payoutPeriod, sum, validDate, validInstant } from "./money-calendar";
import type { BookLot as Lot, BookGoal as Goal, BookPayout as Payout, BookMatch as MatchRecord, ChildBook, ChoreOccurrence, FinanceActor, FinanceCommand, FinanceEffect, FinanceEvent, FinanceState, FinanceView, MatchingRule, MatchView, PaymentMethod, PayoutView } from "./types";
import { cloneBook, validateCheckpoint, FinanceBudgetBasisError, FinanceCheckpointError } from "./checkpoint";

const defaultMatching: MatchingRule = { enabled: false, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true };
const commandFields: Record<FinanceCommand["kind"], string[]> = {
  configure_plan: ["plan"], assign_chore: ["choreId", "title", "instructions", "rewardCents", "dates", "recurrence", "evidenceRequired"], edit_chore: ["choreId", "title", "rewardCents", "instructions"], submit_chore: ["occurrenceId", "note"], review_chore: ["occurrenceId", "decision", "note"], close_chore: ["occurrenceId", "status", "note"], reverse_earning: ["occurrenceId", "note"],
  create_goal: ["goalId", "title", "targetCents", "targetDate"], edit_goal: ["goalId", "title", "targetCents", "targetDate"], cancel_goal: ["goalId", "note"], allocate: ["goalId", "amountCents", "percent", "currentAllowancePeriodOnly"], transfer_goal: ["fromGoalId", "toGoalId", "amountCents"], release_goal: ["goalId", "amountCents", "note"], set_savings_rule: ["rule"], mark_held: ["goalId", "amountCents", "locationLabel"], request_payout: ["amountCents"], prepare_payout: ["amountCents"], cancel_payout: ["payoutId", "note"], report_payment: ["payoutId", "amountCents", "method", "paidAt", "note"], acknowledge_payment: ["paymentId"], reverse_payment: ["paymentId", "note"], configure_matching: ["rule"], reveal_match: ["matchId"], fund_match: ["matchId", "amountCents", "method", "paidAt", "note"], reverse_match: ["matchId", "note"],
  reconcile_match: ["matchId", "amountCents", "resolution", "paidAt", "note"],
};
const emptyBook = (): ChildBook => ({ occurrences: [], goals: [], free: [], allocations: [], payouts: [], matches: [], savingsRules: [], matchingRule: { ...defaultMatching }, earnedCents: 0, correctionDueCents: 0, archivedPaidCents: 0 });
const totalLots = (lots: Lot[]) => sum(lots.map(l => l.cents));
const own = (book: ChildBook, goalId: string) => sum(book.allocations.filter(a => a.goalId === goalId).map(a => totalLots(a.lots)));
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function text(value: string, label: string, max = 160): string { check(typeof value === "string" && value.trim().length > 0 && value.length <= max, `Enter ${label} (up to ${max} characters).`); return value.trim(); }
function onlyFields(value: object, allowed: string[]) { check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key)), "Unexpected financial input fields."); }
function validateCommand(command: FinanceCommand) {
  check(command && typeof command === "object" && Object.hasOwn(commandFields, command.kind), "Unknown financial action.");
  onlyFields(command, ["id", "at", "childId", "kind", ...commandFields[command.kind]]);
  for (const [key, value] of Object.entries(command)) {
    if (["note", "instructions"].includes(key) && value !== undefined) check(typeof value === "string" && value.length <= 500, "Keep notes and instructions within 500 characters.");
  }
  if (command.kind === "configure_plan") onlyFields(command.plan, ["budgetCents", "period", "anchorDate", "payoutCadence", "minimumPayoutCents", "allowGoalRelease"]);
  if (command.kind === "configure_matching") onlyFields(command.rule, ["enabled", "percent", "monthlyCapCents", "parentBudgetCents", "surprise", "eligibleGoalIds"]);
  if (command.kind === "set_savings_rule") onlyFields(command.rule, ["id", "goalId", "mode", "value", "enabled"]);
}
function authorize(state: FinanceState, actor: FinanceActor, childId: string) {
  check(state.children.some(c => c.id === childId), "Unknown child.");
  check(actor.role === "parent" || (actor.role === "child" && actor.childId === childId), "This financial record belongs to another child.");
}
function parent(actor: FinanceActor) { check(actor.role === "parent", "Only a parent administrator can do this."); }
function child(actor: FinanceActor) { check(actor.role === "child", "The child chooses their own savings and completion requests."); }
function goal(book: ChildBook, id: string, active = true): Goal { const found = book.goals.find(g => g.id === id); check(found && (!active || found.status === "active"), "Choose an active savings goal."); return found; }
function occurrence(book: ChildBook, id: string): ChoreOccurrence { const found = book.occurrences.find(o => o.id === id); check(found, "Chore occurrence not found."); return found; }
function take(lots: Lot[], amount: number): Lot[] {
  cents(amount, false); check(totalLots(lots) >= amount, "Not enough available, unpaid earnings.");
  const taken: Lot[] = []; let remaining = amount;
  for (const lot of lots) { const part = Math.min(remaining, lot.cents); if (part) taken.push({ ...lot, cents: part }); lot.cents -= part; remaining -= part; if (!remaining) break; }
  return taken;
}
function checkBudget(book: ChildBook) {
  check(book.plan, "Set an allowance budget first.");
  const basis = book.archivedBudget;
  if (basis && (basis.period !== book.plan.period || basis.anchorDate !== book.plan.anchorDate)) throw new FinanceBudgetBasisError();
  const amounts = new Map<string, number>(Object.entries(basis?.byPeriod ?? {}));
  for (const o of book.occurrences) {
    if (["cancelled", "expired", "declined"].includes(o.status)) continue;
    const key = periodKey(o.dueDate, book.plan.period, book.plan.anchorDate);
    if (basis && !Object.hasOwn(basis.byPeriod, key)) throw new FinanceBudgetBasisError();
    if (basis?.excludedOccurrenceIds.includes(o.id)) continue;
    amounts.set(key, cents((amounts.get(key) ?? 0) + o.rewardCents));
  }
  check((basis?.maximumCents ?? 0) <= book.plan.budgetCents, "Planned rewards exceed the allowance budget. Increase the budget or reduce future rewards.");
  check([...amounts.values()].every(v => v <= book.plan!.budgetCents), "Planned rewards exceed the allowance budget. Increase the budget or reduce future rewards.");
}
function matchStatus(match: MatchView) {
  match.activeCents = match.cents - match.reversedCents;
  match.status = match.activeCents === 0 ? "reversed" : match.fundedCents >= match.activeCents ? "parent_reported_paid" : match.fundedCents ? "partially_parent_reported" : "pledged";
}
function reverseMatch(book: ChildBook, match: MatchView, amount: number, effects: FinanceEffect[]) {
  const reversible = Math.min(amount, match.activeCents - match.fundedCents);
  if (reversible > 0) { match.reversedCents += reversible; effects.push({ kind: "match_reversed", referenceId: match.id, cents: reversible }); }
  matchStatus(match);
}
function invalidateMatchSource(book: ChildBook, match: MatchRecord, earningId: string, amount: number, effects: FinanceEffect[]) {
  const remaining = (match.sourceCents[earningId] ?? 0) - (match.invalidatedCents[earningId] ?? 0);
  match.invalidatedCents[earningId] = (match.invalidatedCents[earningId] ?? 0) + Math.min(remaining, amount);
  const invalidatedBase = sum(Object.values(match.invalidatedCents));
  const target = Number(BigInt(match.cents) * BigInt(invalidatedBase) / BigInt(match.eligibleBaseCents));
  const adjustment = Math.max(0, target - match.reversedCents - match.correctionDueCents);
  const previous = match.reversedCents; reverseMatch(book, match, adjustment, effects);
  const paidCorrection = Math.min(match.fundedCents - match.correctionDueCents, adjustment - (match.reversedCents - previous));
  if (paidCorrection > 0) { match.correctionDueCents += paidCorrection; effects.push({ kind: "correction_due", referenceId: match.id, cents: paidCorrection }); }
}
function fitPromises(book: ChildBook, goalId: string, effects: FinanceEffect[]) {
  const g = goal(book, goalId, false);
  const matches = book.matches.filter(m => m.goalId === goalId);
  let excess = Math.max(0, sum(matches.map(m => m.activeCents)) + (book.archivedMatches?.byGoal[goalId]?.activeCents ?? 0) + own(book, goalId) - g.targetCents);
  for (const m of [...matches].reverse()) { const previous = m.activeCents; reverseMatch(book, m, excess, effects); excess -= previous - m.activeCents; }
}
function trimHeld(book: ChildBook, goalId: string) { const g = goal(book, goalId, false); g.heldCents = Math.min(g.heldCents, own(book, goalId)); }
function release(book: ChildBook, goalId: string, amount: number, effects: FinanceEffect[]) {
  const g = goal(book, goalId, false); cents(amount, false); check(own(book, goalId) >= amount, "Amount exceeds this goal's own savings.");
  let left = amount;
  for (const allocation of book.allocations.filter(a => a.goalId === goalId).reverse()) {
    const moved = Math.min(left, totalLots(allocation.lots)); if (!moved) continue;
    const taken = take(allocation.lots, moved);
    book.free.push(...taken.map(l => ({ ...l, eligible: false })));
    allocation.releasedCents += moved;
    for (const lot of taken.filter(l => l.eligible)) { const match = book.matches.find(m => m.allocationId === lot.matchAllocationId); if (match) invalidateMatchSource(book, match, lot.earningId, lot.cents, effects); }
    left -= moved; if (!left) break;
  }
  g.heldCents = Math.min(g.heldCents, own(book, goalId));
}
function currentPeriodLots(book: ChildBook, at: string, zone: string): Lot[] {
  check(book.plan, "Set an allowance plan first.");
  const current = periodKey(localDate(at, zone), book.plan.period, book.plan.anchorDate);
  return book.free.filter(l => periodKey(localDate(l.earnedAt, zone), book.plan!.period, book.plan!.anchorDate) === current);
}
function allocate(book: ChildBook, command: { id: string; at: string; goalId: string; amountCents: number; earningId?: string; currentAllowancePeriodOnly?: boolean }, zone: string, effects: FinanceEffect[]) {
  const g = goal(book, command.goalId); cents(command.amountCents, false);
  check(cents(own(book, g.id) + command.amountCents) <= g.targetCents, "Amount exceeds this goal's remaining own-savings target.");
  const source = command.earningId ? book.free.filter(l => l.earningId === command.earningId) : command.currentAllowancePeriodOnly ? currentPeriodLots(book, command.at, zone) : book.free;
  const lots = take(source, command.amountCents);
  const originalSources: Record<string, number> = {};
  for (const lot of lots) originalSources[lot.earningId] = cents((originalSources[lot.earningId] ?? 0) + lot.cents);
  const eligible = totalLots(lots.filter(l => l.eligible));
  check(!book.allocations.some(a => a.id === command.id), "Allocation ID already exists.");
  book.allocations.push({ id: command.id, goalId: g.id, lots: lots.map(l => ({ ...l, matchAllocationId: command.id })), originalCents: command.amountCents, releasedCents: 0, sourceCents: originalSources });
  fitPromises(book, g.id, effects);
  const rule = book.matchingRule, month = localDate(command.at, zone).slice(0, 7);
  if (!eligible || !rule.enabled || (rule.eligibleGoalIds && !rule.eligibleGoalIds.includes(g.id))) return;
  const used = sum(book.matches.filter(m => m.month === month).map(m => m.activeCents)) + (book.archivedMatches?.month === month ? book.archivedMatches.usedCents : 0);
  const promised = sum(book.matches.filter(m => m.goalId === g.id).map(m => m.activeCents)) + (book.archivedMatches?.byGoal[g.id]?.activeCents ?? 0);
  const limit = Math.min(Math.max(0, rule.monthlyCapCents - used), Math.max(0, rule.parentBudgetCents - used), Math.max(0, g.targetCents - own(book, g.id) - promised));
  const desired = BigInt(eligible) * BigInt(rule.percent) / 100n;
  const amount = Number(desired < BigInt(limit) ? desired : BigInt(limit));
  if (!amount) return;
  const sourceCents: Record<string, number> = {};
  for (const lot of lots.filter(l => l.eligible)) sourceCents[lot.earningId] = cents((sourceCents[lot.earningId] ?? 0) + lot.cents);
  const match: MatchRecord = { id: command.id + ":match", goalId: g.id, allocationId: command.id, cents: amount, activeCents: amount, fundedCents: 0, parentReportedFundingCents: 0, reconciledCents: 0, reversedCents: 0, correctionDueCents: 0, month, revealed: !rule.surprise, createdAt: command.at, status: "pledged", sourceCents, invalidatedCents: {}, eligibleBaseCents: eligible };
  book.matches.push(match); effects.push({ kind: "match_committed", referenceId: match.id, cents: amount });
}
function validateMethod(method: PaymentMethod) { check(["cash", "manual", "Cash App", "Venmo"].includes(method), "Choose a manual payment method."); }
function apply(book: ChildBook, command: FinanceCommand, actor: FinanceActor, zone: string, effects: FinanceEffect[]) {
  const c = command;
  switch (c.kind) {
    case "configure_plan": {
      parent(actor); cents(c.plan.budgetCents); cents(c.plan.minimumPayoutCents); validDate(c.plan.anchorDate);
      check(["weekly", "biweekly", "monthly"].includes(c.plan.period), "Choose a valid allowance period.");
      check(["per_task", "daily", "weekly", "biweekly", "monthly"].includes(c.plan.payoutCadence), "Choose a valid payout cadence.");
      check(typeof c.plan.allowGoalRelease === "boolean", "Choose whether savings can be released.");
      book.plan = { ...c.plan }; checkBudget(book); break;
    }
    case "assign_chore": {
      parent(actor); text(c.choreId, "a chore ID"); text(c.title, "a chore title"); cents(c.rewardCents, false);
      check(!book.occurrences.some(o => o.choreId === c.choreId), "Chore ID already exists.");
      check(c.dates.length > 0 && c.dates.length <= 367 && new Set(c.dates).size === c.dates.length, "Choose distinct occurrence dates (up to 367).");
      if (c.instructions) text(c.instructions, "instructions", 500);
      check(c.recurrence === undefined || ["once", "daily", "weekly"].includes(c.recurrence), "Choose a valid recurrence.");
      check(c.evidenceRequired === undefined || typeof c.evidenceRequired === "boolean", "Choose whether a completion note is required.");
      const today = localDate(c.at, zone);
      for (const date of c.dates) {
        validDate(date); check(date >= today, "Assign chores today or later.");
        book.occurrences.push({ id: c.choreId + ":" + date, choreId: c.choreId, title: c.title.trim(), instructions: c.instructions?.trim() ?? "", dueDate: date, rewardCents: c.rewardCents, status: "not_started", note: "", recurrence: c.recurrence ?? "once", evidenceRequired: c.evidenceRequired ?? false });
      }
      checkBudget(book); break;
    }
    case "edit_chore": {
      parent(actor); text(c.title, "a chore title"); cents(c.rewardCents, false);
      const today = localDate(c.at, zone);
      const future = book.occurrences.filter(o => o.choreId === c.choreId && o.dueDate >= today && o.status === "not_started");
      check(future.length, "Only unstarted future occurrences can change.");
      for (const o of future) { o.title = c.title.trim(); o.rewardCents = c.rewardCents; o.instructions = c.instructions?.trim() ?? o.instructions; }
      checkBudget(book); break;
    }
    case "submit_chore": {
      child(actor); const o = occurrence(book, c.occurrenceId); check(["not_started", "needs_retry"].includes(o.status), "This chore cannot be submitted again.");
      if (o.evidenceRequired) text(c.note ?? "", "a completion note", 500);
      o.status = "submitted_by_child"; o.note = c.note?.trim().slice(0, 500) ?? ""; break;
    }
    case "review_chore": {
      parent(actor); const o = occurrence(book, c.occurrenceId);
      check(o.status === "submitted_by_child", "Only a submitted chore can be reviewed once.");
      check(["approved", "needs_retry", "declined"].includes(c.decision), "Choose a review decision.");
      o.status = c.decision; o.note = c.note?.trim().slice(0, 500) ?? "";
      if (c.decision === "approved") {
        o.approvedAt = c.at; book.earnedCents = cents(book.earnedCents + o.rewardCents);
        book.free.push({ earningId: o.id, cents: o.rewardCents, eligible: true, earnedAt: c.at });
        const originalReward = o.rewardCents; let remainingReward = originalReward;
        for (const rule of book.savingsRules.filter(r => r.enabled)) {
          const g = book.goals.find(g => g.id === rule.goalId && g.status === "active"); if (!g) continue;
          const amount = Math.min(rule.mode === "fixed" ? rule.value : percentage(originalReward, rule.value), remainingReward, g.targetCents - own(book, g.id));
          if (amount > 0) { const id = c.id + ":rule:" + rule.id; allocate(book, { id, at: c.at, goalId: g.id, amountCents: amount, earningId: o.id }, zone, effects); remainingReward -= amount; effects.push({ kind: "automatic_allocation", referenceId: id, cents: amount }); }
        }
      }
      break;
    }
    case "close_chore": {
      parent(actor); text(c.note, "a reason", 500); const o = occurrence(book, c.occurrenceId);
      check(["not_started", "needs_retry", "submitted_by_child"].includes(o.status), "A settled chore cannot be cancelled or expired.");
      check(c.status === "cancelled" || c.status === "expired", "Choose cancelled or expired."); o.status = c.status; o.note = c.note.trim(); break;
    }
    case "reverse_earning": {
      parent(actor); text(c.note, "a correction reason", 500); const o = occurrence(book, c.occurrenceId);
      check(o.status === "approved" && !o.reversed, "Only an unreversed approved earning can be corrected.");
      o.reversed = true; book.earnedCents -= o.rewardCents;
      for (const lot of book.free.filter(l => l.earningId === o.id)) lot.cents = 0;
      for (const a of book.allocations) {
        const removed = sum(a.lots.filter(l => l.earningId === o.id).map(l => l.cents));
        for (const l of a.lots.filter(l => l.earningId === o.id)) l.cents = 0;
        if (removed) trimHeld(book, a.goalId);
      }
      for (const match of book.matches) if (match.sourceCents[o.id]) invalidateMatchSource(book, match, o.id, match.sourceCents[o.id], effects);
      let paidCorrection = 0;
      for (const p of book.payouts) {
        const held = sum(p.lots.filter(l => l.earningId === o.id).map(l => l.cents));
        for (const l of p.lots.filter(l => l.earningId === o.id)) l.cents = 0;
        p.amountCents -= held;
        paidCorrection = cents(paidCorrection + sum(p.payments.filter(pay => !pay.reversed).flatMap(pay => pay.lots.filter(l => l.earningId === o.id).map(l => l.cents))));
      }
      if (paidCorrection) { book.correctionDueCents = cents(book.correctionDueCents + paidCorrection); effects.push({ kind: "correction_due", referenceId: o.id, cents: paidCorrection }); }
      break;
    }
    case "create_goal": {
      child(actor); text(c.goalId, "a goal ID"); text(c.title, "a goal title"); cents(c.targetCents, false); if (c.targetDate) validDate(c.targetDate);
      check(!book.goals.some(g => g.id === c.goalId), "Goal ID already exists.");
      book.goals.push({ id: c.goalId, title: c.title.trim(), targetCents: c.targetCents, targetDate: c.targetDate, status: "active", heldCents: 0, locationLabel: "" }); break;
    }
    case "edit_goal": {
      child(actor); const g = goal(book, c.goalId); text(c.title, "a goal title"); cents(c.targetCents, false); if (c.targetDate) validDate(c.targetDate);
      check(c.targetCents >= own(book, g.id), "Release own savings before reducing this target below them.");
      g.title = c.title.trim(); g.targetCents = c.targetCents; g.targetDate = c.targetDate; fitPromises(book, g.id, effects); break;
    }
    case "cancel_goal": {
      child(actor); const g = goal(book, c.goalId); text(c.note, "a reason", 500);
      const amount = own(book, g.id);
      check(!amount || book.plan?.allowGoalRelease, "Ask a parent to allow releases before cancelling an earmarked goal.");
      if (amount) release(book, g.id, amount, effects);
      for (const match of book.matches.filter(m => m.goalId === g.id)) for (const [earningId, amount] of Object.entries(match.sourceCents)) invalidateMatchSource(book, match, earningId, amount, effects);
      g.status = "cancelled"; for (const r of book.savingsRules.filter(r => r.goalId === g.id)) r.enabled = false; break;
    }
    case "allocate": {
      child(actor); check((c.amountCents !== undefined) !== (c.percent !== undefined), "Choose an amount or percentage.");
      if (c.percent !== undefined) check(Number.isInteger(c.percent) && c.percent > 0 && c.percent <= 100, "Choose 1 to 100 percent.");
      if (c.currentAllowancePeriodOnly !== undefined) check(c.percent !== undefined && typeof c.currentAllowancePeriodOnly === "boolean", "Allowance period selection applies to percentage allocations.");
      const pool = c.currentAllowancePeriodOnly ? currentPeriodLots(book, c.at, zone) : book.free;
      if (c.percent !== undefined) check(totalLots(pool) > 0, "No available earnings in the selected allowance period or balance.");
      const amount = c.amountCents ?? percentage(totalLots(pool), c.percent!);
      allocate(book, { id: c.id, at: c.at, goalId: c.goalId, amountCents: amount, currentAllowancePeriodOnly: c.currentAllowancePeriodOnly }, zone, effects); break;
    }
    case "transfer_goal": {
      child(actor); check(c.fromGoalId !== c.toGoalId, "Choose two different goals."); const to = goal(book, c.toGoalId); goal(book, c.fromGoalId); cents(c.amountCents, false);
      check(own(book, c.fromGoalId) >= c.amountCents, "Amount exceeds this goal's own savings.");
      check(own(book, to.id) + c.amountCents <= to.targetCents, "Amount exceeds the destination target.");
      let left = c.amountCents; const moved: Lot[] = [];
      for (const a of book.allocations.filter(a => a.goalId === c.fromGoalId)) { const amount = Math.min(left, totalLots(a.lots)); if (amount) moved.push(...take(a.lots, amount)); left -= amount; if (!left) break; }
      const sourceCents: Record<string, number> = {};
      for (const lot of moved) sourceCents[lot.earningId] = cents((sourceCents[lot.earningId] ?? 0) + lot.cents);
      book.allocations.push({ id: c.id, goalId: to.id, lots: moved.map(l => ({ ...l })), originalCents: c.amountCents, releasedCents: 0, sourceCents });
      // Existing pledges stay with their original goal; moving money never earns a second match.
      trimHeld(book, c.fromGoalId); fitPromises(book, to.id, effects); break;
    }
    case "release_goal": {
      child(actor); check(book.plan?.allowGoalRelease, "Ask a parent to allow savings releases first."); goal(book, c.goalId); release(book, c.goalId, c.amountCents, effects); break;
    }
    case "set_savings_rule": {
      child(actor); goal(book, c.rule.goalId); text(c.rule.id, "a savings rule ID");
      if (c.rule.mode === "fixed") cents(c.rule.value, false); else check(c.rule.mode === "percent" && Number.isInteger(c.rule.value) && c.rule.value > 0 && c.rule.value <= 100, "Choose 1 to 100 percent.");
      check(typeof c.rule.enabled === "boolean", "Choose a rule state.");
      book.savingsRules = [...book.savingsRules.filter(r => r.id !== c.rule.id), { ...c.rule }]; break;
    }
    case "mark_held": {
      parent(actor); const g = goal(book, c.goalId); cents(c.amountCents); check(c.amountCents <= own(book, g.id), "Cannot report more held than earmarked.");
      g.heldCents = c.amountCents; g.locationLabel = text(c.locationLabel, "a parent-held location label"); break;
    }
    case "request_payout": case "prepare_payout": {
      if (c.kind === "request_payout") child(actor); else parent(actor);
      const currentPeriod = book.plan ? payoutPeriod(c.at, zone, book.plan.payoutCadence, book.plan.anchorDate) : "";
      const dueLots = book.free.filter(l => book.plan?.payoutCadence === "per_task" || (book.plan && payoutPeriod(l.earnedAt, zone, book.plan.payoutCadence, book.plan.anchorDate) !== currentPeriod));
      const amount = c.amountCents ?? totalLots(dueLots); cents(amount, false);
      check(book.plan && amount >= book.plan.minimumPayoutCents, "Amount is below the configured minimum payout.");
      book.payouts.push({ id: c.id, createdAt: c.at, amountCents: amount, originalAmountCents: amount, lots: take(c.amountCents === undefined ? dueLots : book.free, amount), payments: [], cancelled: false, prepared: c.kind === "prepare_payout" }); break;
    }
    case "cancel_payout": {
      parent(actor); text(c.note, "a reason", 500); const p = book.payouts.find(p => p.id === c.payoutId); check(p && !p.cancelled && totalLots(p.lots) > 0, "Choose an open payout.");
      book.free.push(...p.lots.filter(l => l.cents > 0).map(l => ({ ...l }))); p.lots = []; p.cancelled = true; break;
    }
    case "report_payment": {
      parent(actor); cents(c.amountCents, false); validateMethod(c.method); validInstant(c.paidAt); check(Date.parse(c.paidAt) <= Date.parse(c.at), "A reported payment cannot be in the future.");
      const p = book.payouts.find(p => p.id === c.payoutId); check(p && !p.cancelled, "Choose an open payout.");
      p.payments.push({ id: c.id, amountCents: c.amountCents, method: c.method, paidAt: c.paidAt, note: c.note?.trim().slice(0, 500) ?? "", childAcknowledged: false, reversed: false, lots: take(p.lots, c.amountCents) }); break;
    }
    case "acknowledge_payment": {
      child(actor); const payment = book.payouts.flatMap(p => p.payments).find(p => p.id === c.paymentId); check(payment && !payment.reversed && !payment.childAcknowledged, "Choose an unacknowledged payment."); payment.childAcknowledged = true; break;
    }
    case "reverse_payment": {
      parent(actor); text(c.note, "a reason", 500); const p = book.payouts.find(p => p.payments.some(pay => pay.id === c.paymentId)); const payment = p?.payments.find(pay => pay.id === c.paymentId);
      check(p && payment && !payment.reversed, "Choose an unreversed payment."); payment.reversed = true;
      for (const lot of payment.lots) {
        if (book.occurrences.find(o => o.id === lot.earningId)?.reversed) book.correctionDueCents = Math.max(0, book.correctionDueCents - lot.cents);
        else if (p.cancelled) book.free.push({ ...lot, eligible: false }); else p.lots.push({ ...lot, eligible: false });
      }
      break;
    }
    case "configure_matching": {
      parent(actor); check(typeof c.rule.enabled === "boolean" && typeof c.rule.surprise === "boolean", "Choose matching state and visibility.");
      cents(c.rule.monthlyCapCents); cents(c.rule.parentBudgetCents); percentage(0, c.rule.percent);
      if (c.rule.eligibleGoalIds) { check(new Set(c.rule.eligibleGoalIds).size === c.rule.eligibleGoalIds.length, "Choose distinct eligible goals."); for (const id of c.rule.eligibleGoalIds) goal(book, id); }
      book.matchingRule = { ...c.rule, eligibleGoalIds: c.rule.eligibleGoalIds ? [...c.rule.eligibleGoalIds] : undefined }; break;
    }
    case "reveal_match": {
      parent(actor); const match = book.matches.find(m => m.id === c.matchId); check(match && !match.revealed, "Choose an unrevealed commitment."); match.revealed = true; break;
    }
    case "fund_match": {
      parent(actor); cents(c.amountCents, false); validateMethod(c.method); validInstant(c.paidAt); check(Date.parse(c.paidAt) <= Date.parse(c.at), "A reported payment cannot be in the future.");
      const match = book.matches.find(m => m.id === c.matchId); check(match && c.amountCents <= match.activeCents - match.fundedCents, "Amount exceeds the unpaid parent commitment.");
      match.fundedCents = cents(match.fundedCents + c.amountCents); match.parentReportedFundingCents = cents(match.parentReportedFundingCents + c.amountCents); matchStatus(match); break;
    }
    case "reverse_match": {
      parent(actor); text(c.note, "a reason", 500); const match = book.matches.find(m => m.id === c.matchId); check(match && match.activeCents > 0, "Choose an active match.");
      reverseMatch(book, match, match.activeCents, effects);
      if (match.fundedCents > match.correctionDueCents) { const correction = match.fundedCents - match.correctionDueCents; match.correctionDueCents += correction; effects.push({ kind: "correction_due", referenceId: match.id, cents: correction }); }
      break;
    }
    case "reconcile_match": {
      parent(actor); cents(c.amountCents, false); text(c.note, "a reconciliation reason", 500); validInstant(c.paidAt);
      check(Date.parse(c.paidAt) <= Date.parse(c.at), "A reported correction cannot be in the future.");
      check(c.resolution === "report_corrected" || c.resolution === "parent_reported_returned", "Choose a parent-reported reconciliation method.");
      const match = book.matches.find(m => m.id === c.matchId);
      check(match && c.amountCents <= match.correctionDueCents && c.amountCents <= match.fundedCents, "Amount exceeds the unresolved parent funding correction.");
      match.correctionDueCents -= c.amountCents; match.fundedCents -= c.amountCents; match.reconciledCents += c.amountCents; match.reversedCents += c.amountCents;
      effects.push({ kind: "match_reversed", referenceId: match.id, cents: c.amountCents }); matchStatus(match); break;
    }
    default: throw new Error("Unknown financial action.");
  }
}
function replay(state: FinanceState): Map<string, ChildBook> {
  if (state.checkpoint) validateCheckpoint(state.checkpoint, state.children.map(c => c.id));
  const books = new Map(state.children.map(c => [c.id, state.checkpoint?.books[c.id] ? cloneBook(state.checkpoint.books[c.id]) : emptyBook()]));
  if (state.checkpoint?.lastEventAt && state.events.some(e => Date.parse(e.at) < Date.parse(state.checkpoint!.lastEventAt!))) throw new Error("Invalid finance checkpoint tail.");
  for (const e of state.events) apply(books.get(e.childId)!, e, e.actor, state.timezone, []);
  return books;
}
/** Server-only derivation: these books include private matching and are never client projections. */
export function exportBooks(state: FinanceState): Record<string, ChildBook> { return Object.fromEntries(replay(state)); }
export const replayBooks = exportBooks;
/** Server-only exact tail activity; includes private actions and never returns cached rows. */
export function financeEventActivity(state: FinanceState): FinanceView["activity"] {
  const books = exportBooks(state);
  return state.events.map(event => activity(books[event.childId], event));
}
/** Caller atomically publishes the matching immutable tail/archive before using this state. */
export function checkpointState(state: FinanceState, books?: Record<string, ChildBook>): FinanceState {
  const sourceBooks = exportBooks(state);
  const checkpointBooks = books ?? sourceBooks;
  if (Object.keys(checkpointBooks).length !== state.children.length || state.children.some(child => !Object.hasOwn(checkpointBooks, child.id))) throw new FinanceCheckpointError();
  const activityCache = Object.fromEntries(state.children.map(c => [c.id, {
    visible: [...(state.checkpoint?.activity[c.id]?.visible ?? []), ...state.events.filter(e => e.childId === c.id && !["configure_matching", "reveal_match", "fund_match", "reverse_match", "reconcile_match"].includes(e.kind)).map(e => activity(sourceBooks[c.id], e))].slice(-100),
    parent: [...(state.checkpoint?.activity[c.id]?.parent ?? []), ...state.events.filter(e => e.childId === c.id).map(e => activity(sourceBooks[c.id], e))].slice(-100),
  }]));
  const checkpoint = { version: 1 as const, lastEventAt: state.events.at(-1)?.at ?? state.checkpoint?.lastEventAt ?? null, books: checkpointBooks, activity: activityCache };
  validateCheckpoint(checkpoint, state.children.map(c => c.id));
  return freeze({ timezone: state.timezone, children: state.children.map(c => ({ ...c })), events: [], checkpoint: JSON.parse(JSON.stringify(checkpoint)) });
}
export const stateCheckpoint = checkpointState;
export function createFinanceState(timezone = "America/New_York", children = [{ id: "sam", name: "Sam" }, { id: "robin", name: "Robin" }]): FinanceState {
  new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  check(children.length > 0 && new Set(children.map(c => c.id)).size === children.length && children.every(c => c.id && c.name), "Choose distinct child records.");
  return freeze({ timezone, children: children.map(c => ({ ...c })), events: [] });
}
export function applyFinanceCommand(state: FinanceState, actor: FinanceActor, command: FinanceCommand): FinanceState {
  validateCommand(command);
  authorize(state, actor, command.childId); text(command.id, "an operation ID"); validInstant(command.at);
  const existing = state.events.find(e => e.id === command.id);
  if (existing) {
    const { actor: oldActor, effects: _effects, ...oldCommand } = existing;
    check(canonical(oldCommand) === canonical(command) && canonical(oldActor) === canonical(actor), "This operation ID was already used for a different action.");
    return state;
  }
  const lastAt = state.events.at(-1)?.at ?? state.checkpoint?.lastEventAt;
  check(!lastAt || Date.parse(command.at) >= Date.parse(lastAt), "Use chronological event timestamps; retroactive edits require a correction.");
  const book = replay(state).get(command.childId)!; const effects: FinanceEffect[] = [];
  apply(book, command, actor, state.timezone, effects);
  const event = JSON.parse(JSON.stringify({ ...command, actor: { ...actor }, effects })) as FinanceEvent;
  return freeze({ ...state, events: [...state.events, event] });
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value); }
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
function payoutView(p: Payout): PayoutView {
  const paid = sum(p.payments.filter(p => !p.reversed).map(p => p.amountCents)); const remaining = totalLots(p.lots);
  return { id: p.id, amountCents: p.amountCents, remainingCents: remaining, paidCents: paid, createdAt: p.createdAt, status: p.cancelled ? "cancelled" : paid && remaining ? "partially_paid" : paid && !remaining ? "parent_reported_paid" : !paid && !remaining ? "corrected" : p.prepared ? "prepared" : "requested", payments: p.payments.map(({ lots: _lots, ...payment }) => ({ ...payment })) };
}
const activityLabel: Record<FinanceCommand["kind"], string> = {
  configure_plan: "Allowance plan updated", assign_chore: "Chore assigned", edit_chore: "Future chore updated", submit_chore: "Chore submitted for review", review_chore: "Chore reviewed", close_chore: "Chore closed", reverse_earning: "Earning corrected", create_goal: "Savings goal created", edit_goal: "Savings goal updated", cancel_goal: "Savings goal cancelled", allocate: "Own earnings earmarked", transfer_goal: "Own savings moved between goals", release_goal: "Own savings released", set_savings_rule: "Savings rule updated", mark_held: "Parent reports savings held", request_payout: "Cash-out requested", prepare_payout: "Manual payout prepared", cancel_payout: "Unpaid payout remainder cancelled", report_payment: "Parent reported payment — transfer not verified", acknowledge_payment: "Child confirmed receipt — transfer not verified", reverse_payment: "Parent payment report corrected", configure_matching: "Prospective matching rule updated", reveal_match: "Parent contribution revealed", fund_match: "Parent reported contribution — transfer not verified", reverse_match: "Parent match corrected", reconcile_match: "Parent reported funding reconciliation — transfer not verified",
};
function activity(book: ChildBook, event: FinanceEvent): FinanceView["activity"][number] {
  const referenceId = "occurrenceId" in event ? event.occurrenceId : "goalId" in event ? event.goalId : "matchId" in event ? event.matchId : "payoutId" in event ? event.payoutId : "paymentId" in event ? event.paymentId : "choreId" in event ? event.choreId : "fromGoalId" in event ? event.fromGoalId : event.childId;
  let amountCents: number | undefined;
  if ("amountCents" in event && event.amountCents !== undefined) amountCents = event.amountCents;
  else if (event.kind === "allocate") amountCents = book.allocations.find(a => a.id === event.id)?.originalCents;
  else if (event.kind === "review_chore" && event.decision === "approved" || event.kind === "reverse_earning") amountCents = book.occurrences.find(o => o.id === event.occurrenceId)?.rewardCents;
  else if (event.kind === "assign_chore" || event.kind === "edit_chore") amountCents = event.rewardCents;
  else if (event.kind === "create_goal" || event.kind === "edit_goal") amountCents = event.targetCents;
  else if (event.kind === "configure_plan") amountCents = event.plan.budgetCents;
  else if (event.kind === "prepare_payout") amountCents = book.payouts.find(p => p.id === event.id)?.originalAmountCents;
  return { id: event.id, at: event.at, label: activityLabel[event.kind], actorRole: event.actor.role, referenceId, amountCents, note: "note" in event ? event.note : undefined };
}
export function financeView(state: FinanceState, actor: FinanceActor, childId: string, at = new Date().toISOString()): FinanceView {
  authorize(state, actor, childId); validInstant(at); const book = replay(state).get(childId)!;
  const visibleMatches = actor.role === "parent" ? book.matches : book.matches.filter(m => m.revealed);
  const available = totalLots(book.free), earmarked = sum(book.goals.map(g => own(book, g.id))), held = sum(book.payouts.map(p => totalLots(p.lots))), paid = cents(book.archivedPaidCents + sum(book.payouts.map(p => payoutView(p).paidCents)));
  const date = localDate(at, state.timezone), period = book.plan ? payoutPeriod(at, state.timezone, book.plan.payoutCadence, book.plan.anchorDate) : "";
  const eligible = sum(book.free.filter(l => !book.plan || book.plan.payoutCadence === "per_task" || payoutPeriod(l.earnedAt, state.timezone, book.plan.payoutCadence, book.plan.anchorDate) !== period).map(l => l.cents));
  const month = date.slice(0, 7), used = sum(book.matches.filter(m => m.month === month).map(m => m.activeCents)) + (book.archivedMatches?.month === month ? book.archivedMatches.usedCents : 0);
  const hiddenKinds: FinanceCommand["kind"][] = ["configure_matching", "reveal_match", "fund_match", "reverse_match", "reconcile_match"];
  const view: FinanceView = {
    childId, childName: state.children.find(c => c.id === childId)!.name, timezone: state.timezone,
    plan: book.plan ? { ...book.plan } : undefined, occurrences: book.occurrences.map(o => ({ ...o })),
    goals: book.goals.map(g => {
      const matches = visibleMatches.filter(m => m.goalId === g.id && m.revealed);
      const ownCents = own(book, g.id), contributed = sum(matches.map(m => m.fundedCents)) + (book.archivedMatches?.byGoal[g.id]?.revealedFundedCents ?? 0), planned = sum(matches.map(m => Math.max(0, m.activeCents - m.fundedCents)));
      // Progress is capped at the target; the two independent source totals remain exact.
      const combined = BigInt(ownCents) + BigInt(contributed);
      const progress = Number(combined < BigInt(g.targetCents) ? combined : BigInt(g.targetCents));
      return { id: g.id, title: g.title, targetCents: g.targetCents, targetDate: g.targetDate, status: g.status, ownCents, parentContributedCents: contributed, parentPlannedCents: planned, progressCents: progress, progressPercent: Math.min(100, Number(BigInt(progress) * 100n / BigInt(g.targetCents))), parentHeldCents: g.heldCents, locationLabel: g.locationLabel };
    }), savingsRules: book.savingsRules.map(r => ({ ...r })), payouts: book.payouts.map(payoutView),
    balances: { plannedCents: sum(book.occurrences.filter(o => ["not_started", "needs_retry"].includes(o.status)).map(o => o.rewardCents)), pendingCents: sum(book.occurrences.filter(o => o.status === "submitted_by_child").map(o => o.rewardCents)), earnedCents: book.earnedCents, availableCents: available, earmarkedCents: earmarked, heldPayoutCents: held, paidCents: paid, unpaidCents: sum([available, earmarked, held]), correctionDueCents: book.correctionDueCents },
    payout: { due: eligible > 0 && eligible >= (book.plan?.minimumPayoutCents ?? 0), eligibleCents: eligible, periodKey: period, label: "Manual execution only; schedules are payment reminders." },
    activity: [...(state.checkpoint?.activity[childId]?.[actor.role === "parent" ? "parent" : "visible"] ?? []).map(a => ({ ...a, amountCents: a.amountCents, note: a.note })),
      ...state.events.filter(e => e.childId === childId && (actor.role === "parent" || !hiddenKinds.includes(e.kind))).map(e => activity(book, e))].slice(state.checkpoint ? -100 : 0),
  };
  if (actor.role === "parent") view.matching = { rule: { ...book.matchingRule, eligibleGoalIds: book.matchingRule.eligibleGoalIds ? [...book.matchingRule.eligibleGoalIds] : undefined }, commitments: book.matches.map(({ sourceCents: _source, invalidatedCents: _invalidated, eligibleBaseCents: _base, ...match }) => ({ ...match })), month, usedCents: used, remainingCents: Math.max(0, book.matchingRule.monthlyCapCents - used), parentBudgetRemainingCents: Math.max(0, book.matchingRule.parentBudgetCents - used) };
  return view;
}
