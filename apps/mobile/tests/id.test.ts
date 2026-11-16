import assert from "node:assert/strict";
import test from "node:test";
import { newId } from "../src/model";
import { applyFinanceCommand, financeView, seedFinanceState, type FinanceCommand } from "../src/finance";

const localUuid = /^local-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const at = "2026-11-15T12:00:00.000Z";
const child = { role: "child", childId: "sam" } as const;
const parent = { role: "parent" } as const;

function withCrypto(value: unknown, work: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  assert.ok(descriptor);
  Object.defineProperty(globalThis, "crypto", { configurable: true, value });
  try { work(); } finally { Object.defineProperty(globalThis, "crypto", descriptor); }
}

test("record IDs use independent UUIDv4 entropy and preserve the local prefix", () => {
  const ids = Array.from({ length: 64 }, () => newId());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, localUuid);
  const fixed = "7baeb086-6f5f-4419-b145-d6c35bbc556c";
  let calls = 0;
  withCrypto({ randomUUID: () => { calls += 1; return fixed; } }, () => {
    assert.equal(newId(), `local-${fixed}`);
    assert.equal(calls, 1);
  });
});

test("missing secure Web/Node UUID generation fails closed without a counter or weak fallback", () => {
  withCrypto(undefined, () => assert.throws(newId, /Secure identifier generation is unavailable/));
  withCrypto({}, () => assert.throws(newId, /Secure identifier generation is unavailable/));
});

test("interleaving hidden matching and private journal IDs cannot encode counts in child-visible references", () => {
  let state = seedFinanceState(at);
  type Input = FinanceCommand extends infer T ? T extends FinanceCommand ? Omit<T, "id" | "at" | "childId"> : never : never;
  function run(input: Input, actor: typeof child | typeof parent) {
    const command = { ...input, id: newId(), at, childId: "sam" } as FinanceCommand;
    state = applyFinanceCommand(state, actor, command);
    return command.id;
  }
  const firstGoalId = newId();
  run({ kind: "create_goal", goalId: firstGoalId, title: "Fictional first goal", targetCents: 7000 }, child);
  const hiddenRuleId = run({ kind: "configure_matching", rule: { enabled: true, percent: 100, monthlyCapCents: 2000, parentBudgetCents: 2000, surprise: true } }, parent);
  const occurrenceId = financeView(state, child, "sam", at).occurrences[0].id;
  run({ kind: "submit_chore", occurrenceId }, child);
  run({ kind: "review_chore", occurrenceId, decision: "approved" }, parent);
  run({ kind: "allocate", goalId: firstGoalId, amountCents: 800 }, child);
  const matchId = financeView(state, parent, "sam", at).matching!.commitments[0].id;
  const beforeHiddenFunding = financeView(state, child, "sam", at);
  const hiddenFundingId = run({ kind: "fund_match", matchId, amountCents: 300, method: "cash", paidAt: at }, parent);
  assert.deepEqual(financeView(state, child, "sam", at), beforeHiddenFunding);
  // The same factory is used by saveJournal; that private creation stays outside finance.
  const privateJournalId = newId();
  const secondGoalId = newId();
  run({ kind: "create_goal", goalId: secondGoalId, title: "Fictional second goal", targetCents: 4000 }, child);
  const view = financeView(state, child, "sam", at);
  assert.equal(view.matching, undefined);
  assert.equal(view.goals.find(goal => goal.id === firstGoalId)?.parentContributedCents, 0);
  assert.equal(view.goals.find(goal => goal.id === firstGoalId)?.progressCents, 800);
  for (const id of [firstGoalId, secondGoalId]) {
    assert.match(id, localUuid);
    assert.ok(view.activity.some(event => event.referenceId === id));
  }
  for (const event of view.activity.filter(event => event.id.startsWith("local-"))) assert.match(event.id, localUuid);
  const payload = JSON.stringify(view);
  for (const secret of [privateJournalId, hiddenRuleId, hiddenFundingId, matchId]) assert.equal(payload.includes(secret), false);
});
