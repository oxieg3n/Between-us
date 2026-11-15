import { applyFinanceCommand, createFinanceState } from "./engine";
import { localDate, recurrenceDates } from "./money-calendar";
import type { FinanceCommand } from "./types";

/** Fictional, memory-only fixtures. Matching is deliberately OFF until a parent enables it. */
export function seedFinanceState(at = new Date().toISOString()) {
  let state = createFinanceState();
  const today = localDate(at, state.timezone);
  const dates = recurrenceDates(today, new Date(Date.parse(today + "T12:00:00Z") + 2 * 86400000).toISOString().slice(0, 10), "daily");
  const base = { at, childId: "sam" };
  const commands: FinanceCommand[] = [
    { ...base, id: "seed:plan", kind: "configure_plan", plan: { budgetCents: 3000, period: "weekly", anchorDate: today, payoutCadence: "weekly", minimumPayoutCents: 0, allowGoalRelease: true } },
    { ...base, id: "seed:trash", kind: "assign_chore", choreId: "trash", title: "Take out the recycling", instructions: "Empty the kitchen recycling bin.", rewardCents: 800, dates: [dates[0]], recurrence: "once" },
    { ...base, id: "seed:room", kind: "assign_chore", choreId: "room", title: "Tidy my room", instructions: "Put away clothes and clear the floor.", rewardCents: 1500, dates: [dates[1]], recurrence: "once" },
    { ...base, id: "seed:plants", kind: "assign_chore", choreId: "plants", title: "Water the plants", rewardCents: 500, dates: [dates[2]], recurrence: "once" },
    { ...base, id: "seed:game", kind: "create_goal", goalId: "game", title: "A new video game", targetCents: 7000 },
    { ...base, id: "seed:bike", kind: "create_goal", goalId: "bike", title: "A bicycle", targetCents: 25000 },
    { ...base, id: "seed:gift", kind: "create_goal", goalId: "gift", title: "A gift for someone", targetCents: 4000 },
  ];
  for (const command of commands) state = applyFinanceCommand(state, { role: command.kind === "create_goal" ? "child" : "parent", childId: "sam" }, command);
  return state;
}
