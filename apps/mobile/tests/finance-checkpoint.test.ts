import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFinanceCommand, checkpointState, createFinanceState, exportBooks, financeEventActivity, financeView } from "../src/finance/engine";
import { compactBook, compactPrivateMatches, hydrateBook, hydratePrivateMatch, potentialBook, potentialBookBytes, potentialCheckpointBytes, validateBook, validateCheckpoint, validateCapsule, validatePrivateCapsule, FinanceBudgetBasisError } from "../src/finance/checkpoint";
import type { ChildBook, FinanceActor, FinanceCommand, FinanceState } from "../src/finance/types";

const child = { role: "child", childId: "child" } as const, parent = { role: "parent" } as const;
const date = "2026-01-01T12:00:00.000Z";
const plan = { budgetCents: 10000, period: "monthly", anchorDate: "2026-01-01", payoutCadence: "per_task", minimumPayoutCents: 0, allowGoalRelease: true } as const;
function fixture(matching = false, funded = false) {
  let state = createFinanceState("UTC", [{ id: "child", name: "Fictional child" }]); let sequence = 0;
  const send = (action: Record<string, unknown>, actor: FinanceActor = parent) => {
    const id = `command-${++sequence}`;
    state = applyFinanceCommand(state, actor, { ...action, id, childId: "child", at: date } as FinanceCommand);return id;
  };
  send({ kind: "configure_plan", plan });
  send({ kind: "create_goal", goalId: "goal", title: "Fictional goal", targetCents: 10000 }, child);
  if (matching) send({ kind: "configure_matching", rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
  send({ kind: "assign_chore", choreId: "chore", title: "Fictional task", rewardCents: 100, dates: ["2026-01-01"] });
  send({ kind: "submit_chore", occurrenceId: "chore:2026-01-01" }, child);
  send({ kind: "review_chore", occurrenceId: "chore:2026-01-01", decision: "approved" });
  if (matching) {
    send({ kind: "allocate", goalId: "goal", amountCents: 100 }, child);
    if (funded) send({ kind: "fund_match", matchId: `command-7:match`, amountCents: 50, method: "manual", paidAt: date });
    send({ kind: "release_goal", goalId: "goal", amountCents: 100 }, child);
  }
  const payoutId = send({ kind: "request_payout", amountCents: 100 }, child);
  const paymentId = send({ kind: "report_payment", payoutId, amountCents: 100, method: "manual", paidAt: date });
  return { state, payoutId, paymentId };
}
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const next = (state: FinanceState, action: Record<string, unknown>, actor: FinanceActor = parent) => applyFinanceCommand(state, actor, { ...action, id: "next-command", childId: "child", at: date } as FinanceCommand);
function view(state: FinanceState, actor: FinanceActor = child) { return financeView(state, actor, "child", date); }

test("checkpoint JSON roundtrip and subsequent replay exactly preserve both role projections", () => {
  const { state } = fixture(true), checkpoint = json(checkpointState(state));
  assert.equal(checkpoint.events.length, 0);
  for (const actor of [parent, child]) assert.deepEqual(view(checkpoint, actor), view(state, actor));
  const action = { kind: "configure_plan", plan: { ...plan, budgetCents: 20000 } };
  for (const actor of [parent, child]) assert.deepEqual(view(next(checkpoint, action), actor), view(next(state, action), actor));
  assert.deepEqual(json(exportBooks(checkpoint)), json(exportBooks(state)));
});

test("settled visible capsule folds paid once, preserves budget, and hydrates exact old correction", () => {
  const { state, paymentId } = fixture(); const original = exportBooks(state).child;
  const compacted = compactBook(original, "child");
  assert.equal(compacted.needsBudgetRefresh, false); assert.equal(compacted.capsules.length, 1);
  assert.equal(compacted.book.occurrences.length, 0); assert.equal(compacted.book.payouts.length, 0);
  assert.equal(compacted.book.archivedPaidCents, 100); assert.equal(compacted.book.earnedCents, 100);
  const hot = checkpointState(state, { child: compacted.book });
  assert.deepEqual(view(hot).balances, view(state).balances);
  assert.deepEqual(view(hot).activity, view(state).activity);
  const restored = hydrateBook(compacted.book, json(compacted.capsules[0]), "child");
  assert.equal(restored.archivedPaidCents, 0);
  const rehydrated = checkpointState(state, { child: restored });
  const correction = { kind: "reverse_payment", paymentId, note: "Fictional correction" };
  assert.deepEqual(view(next(rehydrated, correction)), view(next(state, correction)));
  const earningCorrection = { kind: "reverse_earning", occurrenceId: "chore:2026-01-01", note: "Fictional earning correction" };
  assert.deepEqual(view(next(rehydrated, earningCorrection), parent), view(next(state, earningCorrection), parent));
  assert.throws(() => hydrateBook(restored, compacted.capsules[0], "child"));
  assert.throws(() => hydrateBook(compacted.book, compacted.capsules[0], "other-child"));
});

test("private matches never decide visible retirement; retained matches still receive old earning corrections", () => {
  const no = fixture(), yes = fixture(true);
  const a = compactBook(exportBooks(no.state).child, "child"), b = compactBook(exportBooks(yes.state).child, "child");
  assert.equal(a.capsules.length, 1); assert.equal(b.capsules.length, 1);
  assert.equal(b.book.matches.length, 1); assert.equal(a.book.matches.length, 0);
  assert.equal(a.book.archivedPaidCents, b.book.archivedPaidCents);
  const restored = hydrateBook(b.book, b.capsules[0], "child");
  const after = next(checkpointState(yes.state, { child: restored }), { kind: "reverse_earning", occurrenceId: "chore:2026-01-01", note: "Fictional correction" });
  assert.deepEqual(view(after, parent).matching, view(next(yes.state, { kind: "reverse_earning", occurrenceId: "chore:2026-01-01", note: "Fictional correction" }), parent).matching);
});

test("live source lots and unpaid held payouts remain active without losing money", () => {
  const { state, paymentId } = fixture();
  const reversed = next(state, { kind: "reverse_payment", paymentId, note: "Fictional correction" });
  const original = exportBooks(reversed).child, compacted = compactBook(original, "child");
  assert.equal(compacted.capsules.length, 0); assert.equal(compacted.book.payouts.length, 1);
  assert.equal(compacted.book.payouts[0].lots.reduce((n, lot) => n + lot.cents, 0), 100);
  assert.deepEqual(view(checkpointState(reversed, { child: compacted.book })).balances, view(reversed).balances);
});

test("archived budget is exact, new missing periods and mismatched prospective anchors fail closed", () => {
  const { state } = fixture(), compacted = compactBook(exportBooks(state).child, "child");
  assert.equal(compacted.book.archivedBudget!.maximumCents, 100);
  const hot = checkpointState(state, { child: compacted.book });
  assert.throws(() => next(hot, { kind: "configure_plan", plan: { ...plan, budgetCents: 50 } }), /Planned rewards/);
  assert.throws(() => next(hot, { kind: "assign_chore", choreId: "new", title: "New task", rewardCents: 1, dates: ["2026-01-02"] }), FinanceBudgetBasisError);
  assert.throws(() => next(hot, { kind: "configure_plan", plan: { ...plan, period: "weekly" } }), FinanceBudgetBasisError);
  const loaded = json(compacted.book); loaded.archivedBudget!.byPeriod["2026-01"] = 100;
  assert.doesNotThrow(() => next(checkpointState(state, { child: loaded }), { kind: "assign_chore", choreId: "new", title: "New task", rewardCents: 1, dates: ["2026-01-02"] }));
  const restored = hydrateBook(compacted.book, compacted.capsules[0], "child");
  assert.deepEqual(restored.archivedBudget!.excludedOccurrenceIds, ["chore:2026-01-01"]);
  restored.archivedBudget!.byPeriod["2026-01"] = 100;
  const second = compactBook(restored, "child");
  assert.equal(second.book.archivedBudget!.maximumCents, 100, "re-retirement cannot double-count indexed budget");
});

test("strict book/checkpoint/capsule validation rejects version, child, integer, reference and balance corruption", () => {
  const { state } = fixture(), checkpoint = checkpointState(state), book = exportBooks(state).child;
  assert.doesNotThrow(() => validateBook(json(book)));
  for (const mutate of [(b: ChildBook) => { b.earnedCents = 101; }, (b: ChildBook) => { b.archivedPaidCents = -1; },
    (b: ChildBook) => { b.payouts[0].payments[0].lots[0].earningId = "unrelated"; }, (b: ChildBook) => { b.payouts[0].payments[0].amountCents = 0.5; }]) {
    const invalid = json(book); mutate(invalid); assert.throws(() => validateBook(invalid));
  }
  assert.throws(() => validateCheckpoint({ ...checkpoint.checkpoint, version: 2 }, ["child"]));
  assert.throws(() => validateCheckpoint(checkpoint.checkpoint, ["other-child"]));
  const capsule = compactBook(book, "child").capsules[0];
  assert.throws(() => validateCapsule({ ...capsule, paidCents: 101 }, "child"));
  assert.throws(() => validateCapsule({ ...capsule, childId: "other-child" }, "child"));
});

test("hidden-only rollover retains visible lists and independently bounded visible activity", () => {
  const { state } = fixture(); let hot = checkpointState(state);
  const original = view(hot);
  for (let i = 0; i < 120; i++) {
    hot = applyFinanceCommand(hot, parent, { id: `private-${i}`, childId: "child", at: date, kind: "configure_matching",
      rule: { enabled: false, percent: 100, monthlyCapCents: 2000, parentBudgetCents: i, surprise: true } });
    if (i % 24 === 23) hot = checkpointState(hot);
  }
  assert.deepEqual(view(hot), original);
  assert.ok(view(hot, parent).activity.length <= 100);
});

test("private settled capsules preserve funded progress, exact old reveal/reconciliation and monotonic month usage", () => {
  const { state } = fixture(true, true);
  const visible = compactBook(exportBooks(state).child, "child");
  const archived = compactPrivateMatches(visible.book, "child", date, "UTC");
  assert.equal(archived.capsules.length, 1); assert.equal(archived.book.matches.length, 0);
  const capsule = archived.capsules[0];
  assert.equal(capsule.match.fundedCents, 50); assert.equal(capsule.match.correctionDueCents, 50);
  assert.deepEqual(archived.book.archivedMatches, { month: "2026-01", usedCents: 50,
    byGoal: { goal: { activeCents: 50, fundedCents: 50, revealedFundedCents: 0 } } });
  const corrupt = json(capsule); corrupt.match.correctionDueCents--;
  assert.throws(() => validatePrivateCapsule(corrupt, "child"));
  const restored = hydratePrivateMatch(archived.book, capsule, "child", date, "UTC");
  assert.equal(restored.archivedMatches!.usedCents, 0);
  assert.throws(() => hydratePrivateMatch(restored, capsule, "child", date, "UTC"));
  let actual = checkpointState(state, { child: hydrateBook(restored, visible.capsules[0], "child") });
  let golden = state;
  for (const [index, action] of [{ kind: "reveal_match", matchId: capsule.match.id },
    { kind: "reconcile_match", matchId: capsule.match.id, amountCents: 20, resolution: "report_corrected", paidAt: date, note: "Fictional correction" }].entries()) {
    const command = { ...action, id: `old-private-${index}`, childId: "child", at: date } as FinanceCommand;
    actual = applyFinanceCommand(actual, parent, command); golden = applyFinanceCommand(golden, parent, command);
    assert.deepEqual(view(actual, parent), view(golden, parent)); assert.deepEqual(view(actual), view(golden));
  }
  const again = compactPrivateMatches(exportBooks(actual).child, "child", date, "UTC");
  assert.equal(again.capsules.length, 0, "positive paid-source references keep the exact match hot until visible retirement");
  const february = "2026-02-01T12:00:00.000Z";
  const rolled = compactPrivateMatches(archived.book, "child", february, "UTC").book;
  assert.equal(rolled.archivedMatches!.usedCents, 0);
  assert.equal(hydratePrivateMatch(rolled, capsule, "child", february, "UTC").archivedMatches!.usedCents, 0);
  assert.throws(() => compactPrivateMatches(rolled, "child", date, "UTC"));
});

test("original public source closure retains a partly live component in both matching worlds", () => {
  for (const matching of [false, true]) {
    let state = createFinanceState("UTC", [{ id: "child", name: "Fictional child" }]); let sequence = 0;
    const send = (action: Record<string, unknown>, actor: FinanceActor = parent) => {
      const id = `closure-${++sequence}`;
      state = applyFinanceCommand(state, actor, { ...action, id, childId: "child", at: date } as FinanceCommand); return id;
    };
    send({ kind: "configure_plan", plan }); send({ kind: "create_goal", goalId: "goal", title: "Fictional goal", targetCents: 10000 }, child);
    if (matching) send({ kind: "configure_matching", rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } });
    for (const id of ["a", "b"]) {
      send({ kind: "assign_chore", choreId: id, title: "Fictional task", rewardCents: 50, dates: ["2026-01-01"] });
      send({ kind: "submit_chore", occurrenceId: `${id}:2026-01-01` }, child);
      send({ kind: "review_chore", occurrenceId: `${id}:2026-01-01`, decision: "approved" });
    }
    const allocationId = send({ kind: "allocate", goalId: "goal", amountCents: 100 }, child);
    send({ kind: "release_goal", goalId: "goal", amountCents: 50 }, child);
    const payoutId = send({ kind: "request_payout", amountCents: 50 }, child);
    send({ kind: "report_payment", payoutId, amountCents: 50, method: "manual", paidAt: date });
    const partial = compactBook(exportBooks(state).child, "child");
    assert.equal(partial.capsules.length, 0); assert.equal(partial.book.occurrences.length, 2);
    send({ kind: "release_goal", goalId: "goal", amountCents: 50 }, child);
    const lastPayout = send({ kind: "request_payout", amountCents: 50 }, child);
    send({ kind: "report_payment", payoutId: lastPayout, amountCents: 50, method: "manual", paidAt: date });
    const settled = compactBook(exportBooks(state).child, "child");
    assert.equal(settled.capsules.length, 1); assert.equal(settled.capsules[0].occurrences.length, 2);
    assert.equal(settled.capsules[0].allocations[0].id, allocationId);
    const restored = hydrateBook(settled.book, settled.capsules[0], "child");
    assert.deepEqual(restored.allocations[0].sourceCents, { "a:2026-01-01": 50, "b:2026-01-01": 50 });
  }
});

test("transient request candidates compact before serialization without raising persistent collection limits", () => {
  const book = exportBooks(fixture().state).child;
  const empty = compactBook(book, "child").book;
  empty.occurrences = Array.from({ length: 131 }, (_, i) => ({ id: `cancelled-${i}`, choreId: `cancelled-${i}`,
    title: "Fictional closed task", instructions: "", dueDate: "2026-01-01", rewardCents: 0, status: "cancelled", note: "" }));
  assert.throws(() => validateBook(empty));
  const compacted = compactBook(empty, "child");
  assert.equal(compacted.book.occurrences.length, 0); assert.equal(compacted.capsules.length, 131);
  validateBook(compacted.book);
});

test("public potential bytes exactly match the inspectable envelope and tail activity excludes caches", () => {
  const { state } = fixture(true), book = exportBooks(state).child;
  assert.equal(potentialBookBytes(book), Buffer.byteLength(JSON.stringify(potentialBook(book))));
  const checkpoint = checkpointState(state);
  assert.ok(potentialCheckpointBytes(checkpoint.checkpoint!) >= Buffer.byteLength(JSON.stringify(checkpoint.checkpoint)));
  const rows = financeEventActivity(state);
  assert.equal(rows.length, state.events.length); assert.deepEqual(rows.map(row => row.id), state.events.map(row => row.id));
  assert.ok(rows.some(row => row.label === "Prospective matching rule updated"));
  assert.deepEqual(financeEventActivity(checkpoint), []);
});

test("a server-added roster child starts empty without invalidating an older immutable family checkpoint", () => {
  const original = checkpointState(fixture(true).state);
  const expanded: FinanceState = { ...original, children: [...original.children, { id: "new-child", name: "New fictional child" }] };
  assert.deepEqual(view(expanded), view(original));
  const fresh = financeView(expanded, { role: "child", childId: "new-child" }, "new-child", date);
  assert.equal(fresh.balances.earnedCents, 0); assert.equal(fresh.balances.paidCents, 0);
  assert.deepEqual(fresh.activity, []); assert.deepEqual(fresh.occurrences, []);
  const next = applyFinanceCommand(expanded, parent, { kind: "configure_plan", plan, id: "new-child-plan", childId: "new-child", at: date });
  assert.deepEqual(view(next), view(original));
  const published = checkpointState(next);
  assert.deepEqual(Object.keys(published.checkpoint!.books).sort(), ["child", "new-child"]);
  assert.equal(published.checkpoint!.activity["new-child"].visible.length, 1);
  assert.throws(() => checkpointState(expanded, original.checkpoint!.books), "new checkpoints must include the entire current roster");
  const foreign = json(original.checkpoint!); foreign.books.foreign = json(foreign.books.child); foreign.activity.foreign = { visible: [], parent: [] };
  assert.throws(() => validateCheckpoint(foreign, ["child", "new-child"]));
  const missingCache = json(original.checkpoint!); delete (missingCache.activity as Record<string, unknown>).child;
  assert.throws(() => validateCheckpoint(missingCache, ["child", "new-child"]));
});
