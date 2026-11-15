import assert from "node:assert/strict";
import test from "node:test";
import { applyFinanceCommand, createFinanceState, financeView, formatMoney, localDate, moneyInput, parseMoney, percentage, periodKey, recurrenceDates, seedFinanceState, validInstant, type FinanceActor, type FinanceCommand, type FinanceState } from "../src/finance";

const AT = "2026-11-15T12:00:00.000Z";
const P: FinanceActor = { role: "parent" };
const C: FinanceActor = { role: "child", childId: "sam" };
type Input = FinanceCommand extends infer T ? T extends FinanceCommand ? Omit<T, "id" | "at" | "childId"> & Partial<Pick<T, "id" | "at" | "childId">> : never : never;
function harness(initial: FinanceState = seedFinanceState(AT)) {
  let state = initial, seq = 0;
  const run = (input: Input, actor: FinanceActor = P) => { const command = { id: `op${++seq}`, at: AT, childId: "sam", ...input } as FinanceCommand; state = applyFinanceCommand(state, actor, command); return command; };
  const view = (actor: FinanceActor = P, childId = "sam", at = AT) => financeView(state, actor, childId, at);
  const approve = (id: string) => { run({ kind: "submit_chore", occurrenceId: id }, C); run({ kind: "review_chore", occurrenceId: id, decision: "approved" }); };
  const earnAll = () => { for (const o of view().occurrences) approve(o.id); };
  const matching = (overrides = {}) => run({ kind: "configure_matching", rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true, ...overrides } });
  return { run, view, approve, earnAll, matching, state: () => state };
}

test("money uses exact integer cents, floor percentages and rejects malformed/overflow input", () => {
  assert.equal(parseMoney("12.03"), 1203); assert.equal(parseMoney("0.1"), 10); assert.equal(percentage(101, 50), 50); assert.equal(formatMoney(2300), "$23.00");
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER), "$90,071,992,547,409.91");
  assert.equal(moneyInput(Number.MAX_SAFE_INTEGER), "90071992547409.91"); assert.equal(parseMoney(moneyInput(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER); assert.equal(moneyInput(1), "0.01");
  for (const input of ["1.001", "-2", "1e3", "", "NaN", "01", "90071992547410.00"]) assert.throws(() => parseMoney(input));
  assert.throws(() => percentage(Number.MAX_SAFE_INTEGER, 10000));
  assert.throws(() => percentage(1.5, 100));
});

test("seed has unapproved chores, three separate goals, $30 weekly budget and matching OFF", () => {
  const h = harness(), v = h.view(); assert.equal(v.plan?.budgetCents, 3000); assert.equal(v.balances.earnedCents, 0); assert.equal(v.goals.length, 3); assert.equal(v.matching?.rule.enabled, false); assert.ok(v.occurrences.every(o => o.status === "not_started"));
});

test("recurrence creates independent due dates across leap day and DST, with bounded windows", () => {
  assert.deepEqual(recurrenceDates("2028-02-28", "2028-03-01", "daily"), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.deepEqual(recurrenceDates("2026-03-07", "2026-03-16", "weekly", [1, 3, 5]), ["2026-03-09", "2026-03-11", "2026-03-13", "2026-03-16"]);
  assert.throws(() => recurrenceDates("2026-01-01", "2028-01-01", "daily"));
  const h = harness(); h.run({ kind: "assign_chore", choreId: "recurring", title: "Set the table", rewardCents: 50, dates: ["2026-11-15", "2026-11-16"], recurrence: "daily" });
  const occurrences = h.view().occurrences.filter(o => o.choreId === "recurring"); assert.equal(new Set(occurrences.map(o => o.id)).size, 2); h.approve(occurrences[0].id); assert.equal(h.view().occurrences.find(o => o.id === occurrences[1].id)?.status, "not_started");
});

test("budget oversubscription is rejected atomically and explicit parent budget increase allows it", () => {
  const h = harness(), before = h.state();
  assert.throws(() => h.run({ kind: "assign_chore", choreId: "extra", title: "Extra", rewardCents: 300, dates: ["2026-11-15"] }), /budget/);
  assert.equal(h.state(), before);
  h.run({ kind: "configure_plan", plan: { ...h.view().plan!, budgetCents: 4000 } });
  h.run({ kind: "assign_chore", choreId: "extra", title: "Extra", rewardCents: 300, dates: ["2026-11-15"] });
  assert.equal(h.view().balances.plannedCents, 3100);
});

test("submitting never earns; retry and decline never earn; approval credits exactly once", () => {
  const h = harness(), id = h.view().occurrences[0].id;
  h.run({ kind: "submit_chore", occurrenceId: id }, C); assert.equal(h.view().balances.earnedCents, 0); assert.equal(h.view().balances.pendingCents, 800);
  h.run({ kind: "review_chore", occurrenceId: id, decision: "needs_retry", note: "Please empty the second bin." }); assert.equal(h.view().balances.earnedCents, 0);
  h.run({ kind: "submit_chore", occurrenceId: id }, C); const command = h.run({ kind: "review_chore", occurrenceId: id, decision: "approved" });
  assert.equal(h.view().balances.earnedCents, 800); const state = h.state(); assert.equal(applyFinanceCommand(state, P, command), state);
  assert.throws(() => h.run({ kind: "review_chore", occurrenceId: id, decision: "approved" }), /once/);
  const next = h.view().occurrences[1].id; h.run({ kind: "submit_chore", occurrenceId: next }, C); h.run({ kind: "review_chore", occurrenceId: next, decision: "declined" }); assert.equal(h.view().balances.earnedCents, 800);
});

test("duplicate operation IDs are idempotent despite object-key order and reject changed payload/actor", () => {
  const h = harness(), command = h.run({ kind: "submit_chore", occurrenceId: h.view().occurrences[0].id }, C), state = h.state();
  assert.ok(command.kind === "submit_chore");
  assert.equal(applyFinanceCommand(state, { childId: "sam", role: "child" }, { ...command, id: command.id }), state);
  assert.throws(() => applyFinanceCommand(state, C, { ...command, note: "changed" }));
  assert.throws(() => applyFinanceCommand(state, P, command));
});

test("future reward edits preserve submitted/approved snapshots and calendar budget checks", () => {
  const h = harness(), id = h.view().occurrences[0].id; h.approve(id);
  assert.throws(() => h.run({ kind: "edit_chore", choreId: "trash", title: "Changed", rewardCents: 1 }), /unstarted/);
  h.run({ kind: "edit_chore", choreId: "room", title: "Tidy room carefully", rewardCents: 1200 });
  assert.equal(h.view().occurrences[0].rewardCents, 800); assert.equal(h.view().balances.earnedCents, 800); assert.equal(h.view().occurrences[1].rewardCents, 1200);
  h.run({ kind: "close_chore", occurrenceId: h.view().occurrences[2].id, status: "cancelled", note: "Not needed." }); assert.equal(h.view().balances.plannedCents, 1200);
});

test("100% match caps $8 + $15 allocations at $8 + $12 across goals; third gets zero", () => {
  const h = harness(); h.earnAll(); h.matching();
  h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C); h.run({ kind: "allocate", goalId: "bike", amountCents: 1500 }, C);
  let v = h.view(); assert.deepEqual(v.matching?.commitments.map(m => m.cents), [800, 1200]); assert.equal(v.matching?.usedCents, 2000); assert.equal(v.matching?.remainingCents, 0);
  const child = h.view(C); assert.equal(child.balances.earmarkedCents, 2300); assert.equal(child.matching, undefined); assert.equal(child.goals.reduce((n, g) => n + g.progressCents, 0), 2300);
  h.run({ kind: "allocate", goalId: "gift", amountCents: 500 }, C); v = h.view(); assert.equal(v.matching?.commitments.length, 2); assert.equal(v.balances.earnedCents, 2800);
});

test("revealed unpaid pledge is separate from progress; only revealed parent-reported funding contributes", () => {
  const h = harness(); h.earnAll(); h.matching(); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C); const matchId = h.view().matching!.commitments[0].id;
  h.run({ kind: "fund_match", matchId, amountCents: 300, method: "cash", paidAt: AT });
  assert.equal(h.view(C).goals[0].progressCents, 800); assert.equal(h.view(C).goals[0].parentContributedCents, 0);
  h.run({ kind: "reveal_match", matchId }); let g = h.view(C).goals[0]; assert.equal(g.parentPlannedCents, 500); assert.equal(g.parentContributedCents, 300); assert.equal(g.progressCents, 1100);
  h.run({ kind: "fund_match", matchId, amountCents: 500, method: "manual", paidAt: AT }); g = h.view(C).goals[0]; assert.equal(g.parentPlannedCents, 0); assert.equal(g.progressCents, 1600); assert.equal(h.view().matching!.commitments[0].status, "parent_reported_paid");
  assert.throws(() => h.run({ kind: "fund_match", matchId, amountCents: 1, method: "cash", paidAt: AT }));
});

test("equivalent child projections and operation outcomes reveal no hidden match configuration or compensation", () => {
  const a = harness(), b = harness(); a.earnAll(); b.earnAll(); a.matching(); b.matching({ enabled: false });
  for (const h of [a, b]) { h.run({ kind: "edit_goal", id: "target", goalId: "game", title: "Game", targetCents: 1000 }, C); h.run({ kind: "allocate", id: "allocation1", goalId: "game", amountCents: 500 }, C); }
  assert.deepEqual(a.view(C), b.view(C));
  for (const h of [a, b]) h.run({ kind: "allocate", id: "allocation2", goalId: "game", amountCents: 500 }, C);
  assert.deepEqual(a.view(C), b.view(C)); assert.equal(a.view().matching?.commitments[0].activeCents, 0); assert.ok(a.state().events.at(-1)?.effects.some(e => e.kind === "match_reversed"));
  for (const h of [a, b]) assert.throws(() => h.run({ kind: "allocate", id: "over", goalId: "game", amountCents: 1 }, C), /own-savings target/);
  assert.ok(!JSON.stringify(a.view(C)).includes("allocation1:match"));
});

test("matching prospective edits retain commitments and separate parent budget is enforced", () => {
  const h = harness(); h.earnAll(); h.run({ kind: "allocate", goalId: "game", amountCents: 100 }, C); h.matching({ parentBudgetCents: 1000 });
  assert.equal(h.view().matching!.commitments.length, 0);
  h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C); h.matching({ percent: 50, parentBudgetCents: 1000 });
  h.run({ kind: "allocate", goalId: "bike", amountCents: 1000 }, C); assert.deepEqual(h.view().matching!.commitments.map(m => m.cents), [800, 200]); assert.equal(h.view().matching!.parentBudgetRemainingCents, 0); assert.equal(h.view().plan!.budgetCents, 3000);
});

test("near-target matching caps pledges to remaining room without blocking the child's own savings", () => {
  const h = harness(); h.earnAll(); h.matching(); h.run({ kind: "edit_goal", goalId: "game", title: "Game", targetCents: 1000 }, C); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C);
  assert.equal(h.view().matching!.commitments[0].cents, 200);
});

test("reallocation, release and re-earnmark never create a second match for the same earnings", () => {
  const h = harness(); h.earnAll(); h.matching(); h.run({ kind: "allocate", goalId: "game", amountCents: 2800 }, C); const count = h.view().matching!.commitments.length;
  h.run({ kind: "transfer_goal", fromGoalId: "game", toGoalId: "bike", amountCents: 800 }, C); assert.equal(h.view().matching!.commitments.length, count);
  h.run({ kind: "release_goal", goalId: "game", amountCents: 2000 }, C); h.run({ kind: "allocate", goalId: "gift", amountCents: 2000 }, C); assert.equal(h.view().matching!.commitments.length, count);
  assert.equal(h.view(C).balances.earmarkedCents, 2800);
});

test("cancel goal appends a release and match compensation while retaining funded history", () => {
  const h = harness(); h.earnAll(); h.matching(); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C); const matchId = h.view().matching!.commitments[0].id;
  h.run({ kind: "fund_match", matchId, amountCents: 300, method: "cash", paidAt: AT }); const before = h.state().events.length;
  h.run({ kind: "cancel_goal", goalId: "game", note: "Changed my plan." }, C);
  assert.equal(h.state().events.length, before + 1); assert.equal(h.view().goals[0].status, "cancelled"); assert.equal(h.view().matching!.commitments[0].fundedCents, 300); assert.equal(h.view().matching!.commitments[0].reversedCents, 500); assert.equal(h.view(C).balances.availableCents, 2800);
});

test("parent match reversal keeps paid source of truth and records correction rather than deleting history", () => {
  const h = harness(); h.earnAll(); h.matching(); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C); const matchId = h.view().matching!.commitments[0].id;
  h.run({ kind: "fund_match", matchId, amountCents: 800, method: "cash", paidAt: AT }); h.run({ kind: "reverse_match", matchId, note: "Resolve a mistaken payment report." });
  const m = h.view().matching!.commitments[0]; assert.equal(m.fundedCents, 800); assert.equal(m.status, "parent_reported_paid"); assert.equal(m.correctionDueCents, 800); assert.ok(h.state().events.at(-1)!.effects.some(e => e.kind === "correction_due"));
});

test("month cap resets at family-local midnight including December/January boundary", () => {
  const first = "2026-12-31T12:00:00.000Z"; let state = seedFinanceState(first); let seq = 0;
  const run = (input: Input, actor = P) => { state = applyFinanceCommand(state, actor, { id: `year${++seq}`, childId: "sam", at: first, ...input } as FinanceCommand); };
  for (const o of financeView(state, P, "sam", first).occurrences) { run({ kind: "submit_chore", occurrenceId: o.id }, C); run({ kind: "review_chore", occurrenceId: o.id, decision: "approved" }); }
  run({ kind: "configure_matching", rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
  run({ kind: "allocate", goalId: "game", amountCents: 800, at: "2027-01-01T04:59:59.000Z" }, C);
  run({ kind: "allocate", goalId: "bike", amountCents: 1500, at: "2027-01-01T05:00:00.000Z" }, C);
  const v = financeView(state, P, "sam", "2027-01-01T05:00:00.000Z"); assert.deepEqual(v.matching!.commitments.map(m => [m.month, m.cents]), [["2026-12", 800], ["2027-01", 1500]]); assert.equal(v.matching!.remainingCents, 500);
});

test("per-child caps and direct domain permissions isolate siblings", () => {
  const h = harness(); h.earnAll(); h.matching(); h.run({ kind: "allocate", goalId: "game", amountCents: 2300 }, C);
  const robin: FinanceActor = { role: "child", childId: "robin" };
  h.run({ kind: "configure_plan", childId: "robin", plan: { ...h.view().plan!, budgetCents: 3000 } });
  h.run({ kind: "assign_chore", childId: "robin", choreId: "r", title: "Table", rewardCents: 800, dates: ["2026-11-15"] });
  h.run({ kind: "submit_chore", childId: "robin", occurrenceId: "r:2026-11-15" }, robin); h.run({ kind: "review_chore", childId: "robin", occurrenceId: "r:2026-11-15", decision: "approved" });
  h.run({ kind: "create_goal", childId: "robin", goalId: "rg", title: "Book", targetCents: 4000 }, robin); h.run({ kind: "configure_matching", childId: "robin", rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
  h.run({ kind: "allocate", childId: "robin", goalId: "rg", amountCents: 800 }, robin); assert.equal(h.view(P, "robin").matching!.remainingCents, 1200); assert.equal(h.view().matching!.remainingCents, 0);
  assert.throws(() => h.view(C, "robin")); assert.throws(() => h.run({ kind: "allocate", childId: "robin", goalId: "rg", amountCents: 1 }, C));
});

test("children cannot approve, assign, budget, pay, reveal, configure or reverse parent funds", () => {
  const h = harness(); h.earnAll(); h.matching(); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C); const matchId = h.view().matching!.commitments[0].id;
  const parentCommands: Input[] = [
    { kind: "review_chore", occurrenceId: h.view().occurrences[0].id, decision: "approved" }, { kind: "configure_plan", plan: h.view().plan! },
    { kind: "assign_chore", choreId: "bad", title: "Bad", rewardCents: 1, dates: ["2026-11-15"] }, { kind: "prepare_payout", amountCents: 1 },
    { kind: "configure_matching", rule: h.view().matching!.rule }, { kind: "reveal_match", matchId }, { kind: "fund_match", matchId, amountCents: 1, method: "cash", paidAt: AT }, { kind: "reverse_match", matchId, note: "No" }, { kind: "mark_held", goalId: "game", amountCents: 800, locationLabel: "Cash" },
  ]; for (const command of parentCommands) assert.throws(() => h.run(command, C), /parent administrator/);
});

test("fixed and percent rules consume only each new approval with exact remainder and deterministic priority", () => {
  const h = harness(); h.run({ kind: "set_savings_rule", rule: { id: "half", goalId: "game", mode: "percent", value: 50, enabled: true } }, C); h.run({ kind: "set_savings_rule", rule: { id: "fixed", goalId: "gift", mode: "fixed", value: 500, enabled: true } }, C);
  h.approve(h.view().occurrences[0].id); let v = h.view(C); assert.equal(v.goals[0].ownCents, 400); assert.equal(v.goals[2].ownCents, 400); assert.equal(v.balances.availableCents, 0);
  h.approve(h.view().occurrences[1].id); v = h.view(C); assert.equal(v.goals[0].ownCents, 1150); assert.equal(v.goals[2].ownCents, 900); assert.equal(v.balances.availableCents, 250);
});

test("percentage scoped to this allowance period calculates and consumes only matching earned-at lots", () => {
  const h = harness(), first = h.view().occurrences[0].id, second = h.view().occurrences[1].id; h.approve(first);
  const next = "2026-11-22T12:00:00.000Z";
  assert.throws(() => h.run({ kind: "allocate", goalId: "game", percent: 50, currentAllowancePeriodOnly: true, at: next }, C), /No available earnings/);
  h.run({ kind: "submit_chore", occurrenceId: second, at: next }, C); h.run({ kind: "review_chore", occurrenceId: second, decision: "approved", at: next });
  h.run({ kind: "allocate", goalId: "game", percent: 33, currentAllowancePeriodOnly: true, at: next }, C);
  assert.equal(h.view(C).goals[0].ownCents, 495); assert.equal(h.view(C).balances.availableCents, 1805);
  h.run({ kind: "reverse_earning", occurrenceId: first, note: "Correct only old-period earning.", at: next });
  assert.equal(h.view(C).goals[0].ownCents, 495); assert.equal(h.view(C).balances.availableCents, 1005);
  assert.throws(() => h.run({ kind: "allocate", goalId: "game", amountCents: 1, currentAllowancePeriodOnly: true, at: next }, C), /percentage allocations/);
});

test("payout hold prevents double spending and partial manual payment/child acknowledgment stay unverified", () => {
  const h = harness(); h.earnAll(); h.run({ kind: "allocate", goalId: "game", percent: 50 }, C); const request = h.run({ kind: "request_payout", amountCents: 1000 }, C);
  assert.equal(h.view(C).balances.availableCents, 400); assert.throws(() => h.run({ kind: "request_payout", amountCents: 500 }, C)); assert.throws(() => h.run({ kind: "allocate", goalId: "bike", amountCents: 500 }, C));
  const pay = h.run({ kind: "report_payment", payoutId: request.id, amountCents: 600, method: "cash", paidAt: AT, note: "Fictional handoff." }); assert.equal(h.view().payouts[0].status, "partially_paid");
  h.run({ kind: "acknowledge_payment", paymentId: pay.id }, C); assert.equal(h.view(C).payouts[0].payments[0].childAcknowledged, true); assert.ok(!JSON.stringify(h.view(C)).includes("provider_confirmed"));
  h.run({ kind: "cancel_payout", payoutId: request.id, note: "Return unpaid remainder." }); assert.equal(h.view(C).balances.availableCents, 800); assert.equal(h.view(C).balances.paidCents, 600);
  h.run({ kind: "reverse_payment", paymentId: pay.id, note: "Fictional report corrected." }); assert.equal(h.view(C).balances.availableCents, 1400); assert.equal(h.view(C).balances.paidCents, 0);
});

test("already-paid reversed earnings retain payment history and require explicit correction", () => {
  const h = harness(), occurrenceId = h.view().occurrences[0].id; h.approve(occurrenceId); const payout = h.run({ kind: "request_payout", amountCents: 800 }, C); const pay = h.run({ kind: "report_payment", payoutId: payout.id, amountCents: 800, method: "manual", paidAt: AT });
  h.run({ kind: "reverse_earning", occurrenceId, note: "Mistaken approval." }); let v = h.view(); assert.equal(v.balances.earnedCents, 0); assert.equal(v.balances.paidCents, 800); assert.equal(v.balances.correctionDueCents, 800); assert.equal(v.payouts[0].status, "parent_reported_paid");
  h.run({ kind: "reverse_payment", paymentId: pay.id, note: "Report corrected after checking." }); v = h.view(); assert.equal(v.balances.correctionDueCents, 0); assert.equal(v.balances.availableCents, 0);
});

test("unpaid reversed earnings remove free, earmarked and held portions without deleting events", () => {
  const h = harness(), occurrenceId = h.view().occurrences[0].id; h.approve(occurrenceId); h.matching(); h.run({ kind: "allocate", goalId: "game", amountCents: 300 }, C); h.run({ kind: "request_payout", amountCents: 200 }, C); const before = h.state().events.length;
  h.run({ kind: "reverse_earning", occurrenceId, note: "Mistaken approval." }); const v = h.view(); assert.equal(v.balances.unpaidCents, 0); assert.equal(v.balances.earnedCents, 0); assert.equal(v.matching!.commitments[0].activeCents, 0); assert.equal(h.state().events.length, before + 1);
});

test("calendar period keys avoid DST millisecond errors and honor weekly/biweekly anchors", () => {
  assert.equal(localDate("2026-03-08T06:59:59.000Z", "America/New_York"), "2026-03-08"); assert.equal(localDate("2026-03-08T07:00:00.000Z", "America/New_York"), "2026-03-08");
  assert.equal(periodKey("2026-03-08", "weekly", "2026-03-02"), "2026-03-02/7/0"); assert.equal(periodKey("2026-03-09", "weekly", "2026-03-02"), "2026-03-02/7/1");
  assert.equal(periodKey("2028-02-29", "monthly", "2028-02-01"), "2028-02"); assert.equal(periodKey("2026-03-15", "biweekly", "2026-03-02"), "2026-03-02/14/0"); assert.equal(periodKey("2026-03-16", "biweekly", "2026-03-02"), "2026-03-02/14/1");
  assert.throws(() => createFinanceState("Invalid/Zone"));
  for (const invalid of ["2026-02-30T12:00:00.000Z", "2026-11-31T12:00:00.000Z", "2026-11-15T24:00:00.000Z"]) assert.throws(() => validInstant(invalid), /valid UTC/);
  assert.equal(validInstant("2026-11-15T12:00:00.1Z"), "2026-11-15T12:00:00.1Z");
});

for (const funded of [false, true]) test(`200% match source reversal ${funded ? "preserves paid status with full correction" : "reverses the full unpaid promise"}`, () => {
  const h = harness(), occurrenceId = h.view().occurrences[0].id; h.approve(occurrenceId); h.matching({ percent: 200, monthlyCapCents: 5000, parentBudgetCents: 5000 }); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C);
  const matchId = h.view().matching!.commitments[0].id;
  if (funded) h.run({ kind: "fund_match", matchId, amountCents: 1600, method: "cash", paidAt: AT });
  h.run({ kind: "reverse_earning", occurrenceId, note: "Correction." }); const match = h.view().matching!.commitments[0];
  assert.equal(match.activeCents, funded ? 1600 : 0); assert.equal(match.fundedCents, funded ? 1600 : 0); assert.equal(match.correctionDueCents, funded ? 1600 : 0);
  assert.equal(h.state().events.at(-1)!.effects[0].cents, 1600);
});

test("partial releases compensate proportionally and moved savings retain original match source attribution", () => {
  const h = harness(), occurrenceId = h.view().occurrences[0].id; h.approve(occurrenceId); h.matching({ percent: 200, monthlyCapCents: 5000, parentBudgetCents: 5000 }); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C);
  const matchId = h.view().matching!.commitments[0].id; h.run({ kind: "fund_match", matchId, amountCents: 1600, method: "cash", paidAt: AT });
  h.run({ kind: "transfer_goal", fromGoalId: "game", toGoalId: "bike", amountCents: 800 }, C); h.run({ kind: "release_goal", goalId: "bike", amountCents: 400 }, C);
  assert.equal(h.view().matching!.commitments[0].correctionDueCents, 800);
  h.run({ kind: "reverse_earning", occurrenceId, note: "Correction." }); assert.equal(h.view().matching!.commitments[0].correctionDueCents, 1600);
});

test("cancelling an empty source goal after transfer flags funded match correction and explicit reconciliation resolves it", () => {
  const h = harness(), occurrenceId = h.view().occurrences[0].id; h.approve(occurrenceId); h.matching({ percent: 200, monthlyCapCents: 5000, parentBudgetCents: 5000 }); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C);
  const matchId = h.view().matching!.commitments[0].id; h.run({ kind: "fund_match", matchId, amountCents: 1600, method: "cash", paidAt: AT }); h.run({ kind: "transfer_goal", fromGoalId: "game", toGoalId: "bike", amountCents: 800 }, C); h.run({ kind: "cancel_goal", goalId: "game", note: "Changed plans." }, C);
  assert.equal(h.view().matching!.commitments[0].correctionDueCents, 1600);
  const before = h.view(C); assert.throws(() => h.run({ kind: "reconcile_match", matchId, amountCents: 1600, resolution: "report_corrected", paidAt: AT, note: "Checked the report." }, C), /parent administrator/);
  h.run({ kind: "reconcile_match", matchId, amountCents: 600, resolution: "report_corrected", paidAt: AT, note: "Checked the report." });
  assert.deepEqual(h.view(C), before); let m = h.view().matching!.commitments[0]; assert.equal(m.fundedCents, 1000); assert.equal(m.correctionDueCents, 1000); assert.equal(m.parentReportedFundingCents, 1600); assert.equal(m.reconciledCents, 600);
  h.run({ kind: "reconcile_match", matchId, amountCents: 1000, resolution: "parent_reported_returned", paidAt: AT, note: "Fictional return recorded." }); m = h.view().matching!.commitments[0]; assert.equal(m.fundedCents, 0); assert.equal(m.correctionDueCents, 0); assert.equal(m.status, "reversed"); assert.ok(h.state().events.some(e => e.kind === "fund_match" && e.amountCents === 1600));
  assert.throws(() => h.run({ kind: "reconcile_match", matchId, amountCents: 1, resolution: "report_corrected", paidAt: AT, note: "Extra" }));
});

test("financial activity has own monetary amount, actor and reference without hidden effect contents", () => {
  const h = harness(); h.approve(h.view().occurrences[0].id); h.matching(); const allocation = h.run({ kind: "allocate", goalId: "game", percent: 50 }, C);
  const row = h.view(C).activity.find(a => a.id === allocation.id)!; assert.equal(row.amountCents, 400); assert.equal(row.actorRole, "child"); assert.equal(row.referenceId, "game"); assert.ok(!JSON.stringify(h.view(C).activity).includes("match"));
});

test("multiple sources and rounding preserve match compensation instead of reversing unrelated earnings", () => {
  const h = harness(); h.earnAll(); h.matching({ percent: 200, monthlyCapCents: 5000, parentBudgetCents: 5000 }); h.run({ kind: "allocate", goalId: "game", amountCents: 1000 }, C);
  h.run({ kind: "reverse_earning", occurrenceId: h.view().occurrences[0].id, note: "Only this earning was wrong." }); assert.equal(h.view().matching!.commitments[0].activeCents, 400); assert.equal(h.view(C).goals[0].ownCents, 200);
});

for (const cadence of ["per_task", "daily", "weekly", "biweekly", "monthly"] as const) test(`${cadence} payout reminder only batches eligible unallocated earnings, with no automatic transfer`, () => {
  const h = harness(); h.run({ kind: "configure_plan", plan: { ...h.view().plan!, payoutCadence: cadence } }); h.approve(h.view().occurrences[0].id); h.run({ kind: "allocate", goalId: "game", amountCents: 300 }, C);
  const dueNow = h.view(P, "sam", AT).payout; assert.equal(dueNow.eligibleCents, cadence === "per_task" ? 500 : 0);
  const at = cadence === "monthly" ? "2026-12-01T12:00:00.000Z" : cadence === "biweekly" ? "2026-11-29T12:00:00.000Z" : cadence === "weekly" ? "2026-11-22T12:00:00.000Z" : "2026-11-16T12:00:00.000Z";
  assert.equal(h.view(P, "sam", at).payout.eligibleCents, 500); h.run({ kind: "prepare_payout", at }); const v = h.view(); assert.equal(v.payouts[0].amountCents, 500); assert.equal(v.payouts[0].paidCents, 0); assert.equal(v.balances.availableCents, 0); assert.equal(v.balances.earmarkedCents, 300);
});

test("parent-held labels are declarations, releases follow explicit parent rule, unknown actions reject", () => {
  const h = harness(); h.earnAll(); h.run({ kind: "allocate", goalId: "game", amountCents: 800 }, C); h.run({ kind: "mark_held", goalId: "game", amountCents: 800, locationLabel: "Fictional cash envelope" }); assert.equal(h.view(C).goals[0].parentHeldCents, 800);
  h.run({ kind: "configure_plan", plan: { ...h.view().plan!, allowGoalRelease: false } }); assert.throws(() => h.run({ kind: "release_goal", goalId: "game", amountCents: 1 }, C));
  assert.throws(() => h.run({ kind: "unknown" } as unknown as Input), /Unknown financial action/);
  h.run({ kind: "cancel_goal", goalId: "gift", note: "An empty goal can be cancelled." }, C); assert.equal(h.view(C).goals[2].status, "cancelled");
});

test("ledger inputs are copied/frozen and child projections cannot mutate the authoritative state", () => {
  const h = harness(); const command = h.run({ kind: "submit_chore", occurrenceId: h.view().occurrences[0].id }, C);
  command.at = "2027-01-01T00:00:00.000Z"; assert.equal(h.state().events.at(-1)!.at, AT);
  assert.ok(Object.isFrozen(h.state())); assert.ok(Object.isFrozen(h.state().events)); assert.ok(Object.isFrozen(h.state().events.at(-1)!));
  const v = h.view(C); v.occurrences[0].rewardCents = 9999; assert.equal(h.view(C).occurrences[0].rewardCents, 800);
  assert.throws(() => h.run({ kind: "submit_chore", occurrenceId: h.view().occurrences[1].id, journal: "Unexpected content" } as unknown as Input, C), /Unexpected financial input/);
});
