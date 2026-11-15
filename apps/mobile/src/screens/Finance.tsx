import { useState } from "react";
import { Linking, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useApp, type Screen } from "../state";
import { useFinance } from "../finance-state";
import {
  formatMoney as money,
  parseMoney,
  moneyInput,
  type FinancePlan,
  type PaymentMethod,
  type MatchingRule,
  type MatchView,
} from "../finance";
import {
  localDate,
  recurrenceDates,
  validDate,
} from "../finance/money-calendar";
import { newId } from "../model";
import { Body, Button, Divider, Eyebrow, Field, Heading, Paper } from "../ui";
import { useAppearance } from "../appearance";

function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>{label}</Eyebrow>
      {options.map((option) => (
        <Button
          key={option}
          label={option.replaceAll("_", " ")}
          selected={value === option}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  );
}
function Amount({ label, cents }: { label: string; cents: number }) {
  return (
    <Body>
      {label}: {money(cents)}
    </Body>
  );
}
function AdminOnly({ children }: { children: React.ReactNode }) {
  return useApp().role === "parent" ? (
    <>{children}</>
  ) : (
    <Body>
      Only the parent demo can manage these settings. Your own chores and goals
      are available from Home.
    </Body>
  );
}
const page = { gap: 20 };
const weekdays = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 0, label: "Sunday" },
];
export function FinanceOverview() {
  const app = useApp();
  const { view } = useFinance();
  const links: [Screen, string][] = [
    ["Chores", app.role === "parent" ? "Assign & review chores" : "My chores"],
    ["Goals", "Savings goals"],
    [
      "Payouts",
      app.role === "parent" ? "Payout workspace" : "My earnings & cash-out",
    ],
    ["FinanceHistory", "Financial history"],
  ];
  return (
    <View style={page}>
      <Eyebrow>FAMILY SAVINGS ENVELOPES</Eyebrow>
      <Heading large>Small steps.{"\n"}Your own plans.</Heading>
      <Body muted>
        A household planning ledger for Sam. The parent keeps the actual funds.
        These fictional amounts disappear on reload.
      </Body>
      <Paper>
        <Amount label="Approved earnings" cents={view.balances.earnedCents} />
        <Amount
          label="Available to plan"
          cents={view.balances.availableCents}
        />
        <Amount
          label="Earmarked for goals"
          cents={view.balances.earmarkedCents}
        />
      </Paper>
      {links.map(([screen, label], i) => (
        <Button
          key={screen}
          label={label}
          primary={i === 0}
          onPress={() => app.go(screen)}
        />
      ))}
      {app.role === "parent" && (
        <>
          <Divider />
          <Button
            label="Allowance budget & payout schedule"
            onPress={() => app.go("Budget")}
          />
          <Button label="Savings matching" onPress={() => app.go("Matching")} />
        </>
      )}
      <Body muted>
        No bank account, real transfer, payment API or provider balance is
        connected. Payment records are family-reported.
      </Body>
    </View>
  );
}
export function BudgetScreen() {
  const app = useApp();
  const { view, run } = useFinance();
  const initial = view.plan;
  const [budget, setBudget] = useState(
    moneyInput(initial?.budgetCents ?? 3000),
  );
  const [period, setPeriod] = useState<FinancePlan["period"]>(
    initial?.period ?? "weekly",
  );
  const [cadence, setCadence] = useState<FinancePlan["payoutCadence"]>(
    initial?.payoutCadence ?? "weekly",
  );
  const [anchor, setAnchor] = useState(
    initial?.anchorDate ?? localDate(new Date().toISOString(), view.timezone),
  );
  const [minimum, setMinimum] = useState(
    moneyInput(initial?.minimumPayoutCents ?? 0),
  );
  const [release, setRelease] = useState(initial?.allowGoalRelease ?? true);
  return (
    <AdminOnly>
      <View style={page}>
        <Heading large>Room to earn.</Heading>
        <Body muted>
          Sam’s allowance pool and payout reminders are separate. Payments
          always need a parent’s manual action.
        </Body>
        <Field
          label="Allowance pool (USD)"
          value={budget}
          onChangeText={setBudget}
        />
        <Choices
          label="Allowance period"
          value={period}
          options={["weekly", "biweekly", "monthly"]}
          onChange={setPeriod}
        />
        <Field
          label="Period starts (YYYY-MM-DD)"
          value={anchor}
          onChangeText={setAnchor}
        />
        <Body muted>
          Family calendar: {view.timezone}. Weekly and biweekly periods use this
          start date; monthly periods use calendar months.
        </Body>
        <Choices
          label="Payout reminder cadence"
          value={cadence}
          options={["per_task", "daily", "weekly", "biweekly", "monthly"]}
          onChange={setCadence}
        />
        <Field
          label="Minimum payout (USD)"
          value={minimum}
          onChangeText={setMinimum}
        />
        <Button
          label="Child may release goal earmarks"
          selected={release}
          onPress={() => setRelease(!release)}
        />
        <Button
          label="Review allowance settings"
          primary
          onPress={() => {
            try {
              const plan = {
                budgetCents: parseMoney(budget),
                period,
                anchorDate: anchor,
                payoutCadence: cadence,
                minimumPayoutCents: parseMoney(minimum),
                allowGoalRelease: release,
              };
              app.confirm(
                "Save allowance settings?",
                `${money(plan.budgetCents)} ${period} pool. ${cadence.replaceAll("_", " ")} reminders; no automatic transfers. Future changes do not rewrite earned rewards.`,
                () => run({ kind: "configure_plan", plan }),
              );
            } catch (e) {
              app.setNotice((e as Error).message);
            }
          }}
        />
      </View>
    </AdminOnly>
  );
}
export function ChoresScreen() {
  const app = useApp();
  const { view, run } = useFinance();
  const parent = app.role === "parent";
  const today = localDate(new Date().toISOString(), view.timezone);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [reward, setReward] = useState("5.00");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [recurrence, setRecurrence] = useState<"once" | "daily" | "weekly">(
    "once",
  );
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [editing, setEditing] = useState("");
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [note, setNote] = useState("");
  return (
    <View style={page}>
      <Eyebrow>CHORES & ALLOWANCES</Eyebrow>
      <Heading large>
        {parent ? "A little help,\na clear agreement." : "One thing at a time."}
      </Heading>
      <Body muted>
        {parent
          ? "Assign clear tasks, then review each completion. Only approval creates earnings."
          : "Mark a task done when you’re ready. Your parent reviews it before the reward is earned."}
      </Body>
      {parent && (
        <Button
          label={showForm ? "Close chore form" : "Assign a chore"}
          primary
          onPress={() => {
            setShowForm(!showForm);
            setEditing("");
          }}
        />
      )}
      {parent && showForm && (
        <Paper>
          <Heading>{editing ? "Future chore details" : "A new chore"}</Heading>
          <Field label="Chore title" value={title} onChangeText={setTitle} />
          <Field
            label="Instructions (optional)"
            value={instructions}
            onChangeText={setInstructions}
            multiline
          />
          <Field
            label="Reward per occurrence (USD)"
            value={reward}
            onChangeText={setReward}
          />
          {!editing && (
            <Button
              label="Require a written completion note"
              selected={evidenceRequired}
              onPress={() => setEvidenceRequired(!evidenceRequired)}
            />
          )}
          {!editing && (
            <>
              <Choices
                label="Repeat within these dates"
                value={recurrence}
                options={["once", "daily", "weekly"]}
                onChange={setRecurrence}
              />
              {recurrence === "weekly" && (
                <View style={{ gap: 10 }}>
                  <Eyebrow>Repeat on selected weekdays</Eyebrow>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {weekdays.map(({ day, label }) => (
                      <View key={day} style={{ flexBasis: 120, flexGrow: 1 }}>
                        <Button
                          label={`Repeat on ${label}`}
                          selected={repeatDays.includes(day)}
                          onPress={() =>
                            setRepeatDays((days) =>
                              days.includes(day)
                                ? days.filter((value) => value !== day)
                                : [...days, day],
                            )
                          }
                        />
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <Field
                label="First date (YYYY-MM-DD)"
                value={start}
                onChangeText={setStart}
              />
              <Field
                label="Last date (YYYY-MM-DD)"
                value={end}
                onChangeText={setEnd}
              />
              <Body muted>
                {recurrence === "weekly" && repeatDays.length
                  ? "Weekly repeats use your selected weekdays. "
                  : "With no weekdays selected, weekly repeats use the first date’s weekday. "}
                Each date has its own completion and reward. Only this date
                window is prepared, up to 366 days; the allowance pool limits
                each period.
              </Body>
            </>
          )}
          <Button
            label={editing ? "Save future chore changes" : "Save chore"}
            primary
            onPress={() => {
              const success = run(() =>
                editing
                  ? {
                      kind: "edit_chore",
                      choreId: editing,
                      title,
                      rewardCents: parseMoney(reward),
                      instructions,
                    }
                  : {
                      kind: "assign_chore",
                      choreId: newId(),
                      title,
                      instructions,
                      rewardCents: parseMoney(reward),
                      dates: recurrenceDates(
                        start,
                        end,
                        recurrence,
                        repeatDays,
                      ),
                      recurrence,
                      evidenceRequired,
                    },
              );
              if (success) {
                setShowForm(false);
                setTitle("");
                setEditing("");
              }
            }}
          />
        </Paper>
      )}
      <Field
        label={parent ? "Review note (optional)" : "Completion note (optional)"}
        value={note}
        onChangeText={setNote}
      />
      {!view.occurrences.length && (
        <Body>No chores yet. A parent can assign the first one.</Body>
      )}
      {view.occurrences.map((chore) => (
        <View key={chore.id} style={page}>
          <Divider />
          <Heading>{chore.title}</Heading>
          <Body>
            {money(chore.rewardCents)} · {chore.dueDate}
          </Body>
          <Body muted>
            {chore.status.replaceAll("_", " ")}
            {chore.reversed ? " · earning reversed" : ""}
          </Body>
          {!!chore.instructions && <Body>{chore.instructions}</Body>}
          {!!chore.note && <Body muted>Note: {chore.note}</Body>}
          {!parent && ["not_started", "needs_retry"].includes(chore.status) && (
            <Button
              label={`Mark done: ${chore.title}`}
              primary
              onPress={() =>
                run({ kind: "submit_chore", occurrenceId: chore.id, note })
              }
            />
          )}
          {parent && chore.status === "submitted_by_child" && (
            <>
              <Button
                label={`Approve: ${chore.title}`}
                primary
                onPress={() =>
                  app.confirm(
                    "Approve this completion?",
                    `Record ${money(chore.rewardCents)} of fictional earnings for Sam? This occurrence can earn only once.`,
                    () =>
                      run({
                        kind: "review_chore",
                        occurrenceId: chore.id,
                        decision: "approved",
                        note,
                      }),
                  )
                }
              />
              <Button
                label={`Request another attempt: ${chore.title}`}
                onPress={() =>
                  run({
                    kind: "review_chore",
                    occurrenceId: chore.id,
                    decision: "needs_retry",
                    note,
                  })
                }
              />
              <Button
                label={`Decline: ${chore.title}`}
                quiet
                onPress={() =>
                  app.confirm(
                    "Decline this completion?",
                    "No earnings will be recorded.",
                    () =>
                      run({
                        kind: "review_chore",
                        occurrenceId: chore.id,
                        decision: "declined",
                        note,
                      }),
                  )
                }
              />
            </>
          )}
          {parent &&
            !["approved", "cancelled", "expired"].includes(chore.status) && (
              <>
                <Button
                  label={`Edit future: ${chore.title}`}
                  quiet
                  onPress={() => {
                    setEditing(chore.choreId);
                    setTitle(chore.title);
                    setInstructions(chore.instructions);
                    setReward(moneyInput(chore.rewardCents));
                    setShowForm(true);
                  }}
                />
                <Button
                  label={`Cancel: ${chore.title}`}
                  quiet
                  onPress={() =>
                    app.confirm(
                      "Cancel this occurrence?",
                      "History remains in the ledger. No reward is earned.",
                      () =>
                        run({
                          kind: "close_chore",
                          occurrenceId: chore.id,
                          status: "cancelled",
                          note: note || "Parent cancelled occurrence",
                        }),
                    )
                  }
                />
              </>
            )}
          {parent && chore.status === "approved" && !chore.reversed && (
            <Button
              label={`Reverse earning: ${chore.title}`}
              quiet
              onPress={() =>
                app.confirm(
                  "Reverse this earning?",
                  "A compensating event preserves history. Release allocations and cancel unsettled payout holds first; settled money cannot be silently deleted.",
                  () =>
                    run({
                      kind: "reverse_earning",
                      occurrenceId: chore.id,
                      note: note || "Parent correction",
                    }),
                )
              }
            />
          )}
        </View>
      ))}
      <Body muted>In-app review queue only. No push notification is sent.</Body>
    </View>
  );
}
export function GoalsScreen() {
  const app = useApp();
  const {
    view,
    run,
    selectedGoalId: selected,
    setSelectedGoalId: setSelected,
  } = useFinance();
  const parent = app.role === "parent";
  const active = view.goals.filter((g) => g.status === "active");
  const goal =
    app.screen === "GoalDetail"
      ? active.find((g) => g.id === selected)
      : undefined;
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState(goal?.title ?? "");
  const [target, setTarget] = useState(moneyInput(goal?.targetCents ?? 7000));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [amount, setAmount] = useState("8.00");
  const [mode, setMode] = useState<"dollars" | "percent">("dollars");
  const [destination, setDestination] = useState("");
  const [location, setLocation] = useState("Parent-held envelope");
  const [currentPeriodOnly, setCurrentPeriodOnly] = useState(true);
  return (
    <View style={page}>
      <Eyebrow>FAMILY SAVINGS ENVELOPES</Eyebrow>
      <Heading large>{goal ? goal.title : "Something to save for."}</Heading>
      <Body muted>
        These are plans for parent-held money, not deposits or a provider
        account balance.
      </Body>
      <Amount
        label="Available approved earnings"
        cents={view.balances.availableCents}
      />
      {!goal && (
        <>
          {!parent && (
            <Button
              label={showNew ? "Close goal form" : "Create a savings goal"}
              primary
              onPress={() => setShowNew(!showNew)}
            />
          )}
          {showNew && (
            <Paper>
              <Field label="Goal name" value={title} onChangeText={setTitle} />
              <Field
                label="Goal target (USD)"
                value={target}
                onChangeText={setTarget}
              />
              <Field
                label="Target date (optional YYYY-MM-DD)"
                value={targetDate}
                onChangeText={setTargetDate}
              />
              <Button
                label="Save new goal"
                primary
                onPress={() => {
                  if (
                    run(() => ({
                      kind: "create_goal",
                      goalId: newId(),
                      title,
                      targetCents: parseMoney(target),
                      targetDate: targetDate || undefined,
                    }))
                  ) {
                    setShowNew(false);
                    setTitle("");
                  }
                }}
              />
            </Paper>
          )}
          {active.map((g) => (
            <View key={g.id} style={page}>
              <Divider />
              <Heading>{g.title}</Heading>
              <Body>
                {money(g.progressCents)} of {money(g.targetCents)} ·{" "}
                {g.progressPercent}%
              </Body>
              <Amount label="I saved" cents={g.ownCents} />
              {g.parentContributedCents > 0 && (
                <Amount
                  label="Parent reports contributing"
                  cents={g.parentContributedCents}
                />
              )}
              <Button
                label={`Open goal: ${g.title}`}
                onPress={() => {
                  setSelected(g.id);
                  app.go("GoalDetail");
                  setTitle(g.title);
                  setTarget(moneyInput(g.targetCents));
                  setTargetDate(g.targetDate || "");
                }}
              />
            </View>
          ))}
          {!active.length && (
            <Body>
              No active goals yet. Choose a name and an amount to begin.
            </Body>
          )}
        </>
      )}
      {goal && (
        <>
          <Button label="All savings goals" quiet onPress={app.back} />
          <Paper>
            <Body>
              {money(goal.progressCents)} of {money(goal.targetCents)} ·{" "}
              {goal.progressPercent}%
            </Body>
            <Amount label="I saved" cents={goal.ownCents} />
            <Amount
              label="Parent reports contributing"
              cents={goal.parentContributedCents}
            />
            {goal.parentPlannedCents > 0 && (
              <Body>
                Parent plans to contribute {money(goal.parentPlannedCents)}.
                This unpaid pledge is excluded from progress.
              </Body>
            )}
            {goal.parentHeldCents > 0 && (
              <Body>
                Parent says {money(goal.parentHeldCents)} is held ·{" "}
                {goal.locationLabel}. Not independently verified.
              </Body>
            )}
          </Paper>
          {!parent && (
            <>
              <Choices
                label="Allocation amount type"
                value={mode}
                options={["dollars", "percent"]}
                onChange={setMode}
              />
              <Field
                label={
                  mode === "dollars"
                    ? "Amount (USD)"
                    : "Percent of available earnings"
                }
                value={amount}
                onChangeText={setAmount}
              />
              {mode === "percent" && (
                <Button
                  label="Only this allowance period’s available earnings"
                  selected={currentPeriodOnly}
                  onPress={() => setCurrentPeriodOnly(!currentPeriodOnly)}
                />
              )}
              <Button
                label="Allocate to this goal"
                primary
                onPress={() =>
                  run(() => ({
                    kind: "allocate",
                    goalId: goal.id,
                    ...(mode === "dollars"
                      ? { amountCents: parseMoney(amount) }
                      : {
                          percent: Number(amount),
                          currentAllowancePeriodOnly: currentPeriodOnly,
                        }),
                  }))
                }
              />
              <Button
                label="Use this rule for future earnings"
                onPress={() =>
                  app.confirm(
                    "Set a savings rule?",
                    "Each new approved earning will allocate this amount or percentage when available, capped by the goal target. It does not move real money.",
                    () =>
                      run(() => ({
                        kind: "set_savings_rule",
                        rule: {
                          id: `rule-${goal.id}`,
                          goalId: goal.id,
                          enabled: true,
                          mode: mode === "dollars" ? "fixed" : "percent",
                          value:
                            mode === "dollars"
                              ? parseMoney(amount)
                              : Number(amount),
                        },
                      })),
                  )
                }
              />
              {view.savingsRules
                .filter((r) => r.goalId === goal.id && r.enabled)
                .map((rule) => (
                  <View key={rule.id} style={{ gap: 8 }}>
                    <Body>
                      Future earning rule:{" "}
                      {rule.mode === "fixed"
                        ? money(rule.value)
                        : `${rule.value}%`}
                    </Body>
                    <Button
                      label="Stop this savings rule"
                      quiet
                      onPress={() =>
                        run({
                          kind: "set_savings_rule",
                          rule: { ...rule, enabled: false },
                        })
                      }
                    />
                  </View>
                ))}
              <Divider />
              <Eyebrow>MOVE OR RELEASE EARMARKS</Eyebrow>
              <Field
                label="Move or release amount (USD)"
                value={amount}
                onChangeText={setAmount}
              />
              {active
                .filter((g) => g.id !== goal.id)
                .map((g) => (
                  <Button
                    key={g.id}
                    label={`Move to ${g.title}`}
                    selected={destination === g.id}
                    onPress={() => setDestination(g.id)}
                  />
                ))}
              <Button
                label="Transfer earmark"
                disabled={!destination}
                onPress={() =>
                  run(() => ({
                    kind: "transfer_goal",
                    fromGoalId: goal.id,
                    toGoalId: destination,
                    amountCents: parseMoney(amount),
                  }))
                }
              />
              <Button
                label="Release to available earnings"
                disabled={!parent && !view.plan?.allowGoalRelease}
                onPress={() =>
                  app.confirm(
                    "Release this earmark?",
                    "Released cents become available for a separate cash-out request. Transfers and released cents cannot earn a second match.",
                    () =>
                      run(() => ({
                        kind: "release_goal",
                        goalId: goal.id,
                        amountCents: parseMoney(amount),
                      })),
                  )
                }
              />
            </>
          )}
          {parent && (
            <>
              <Field
                label="Amount held by parent (USD)"
                value={amount}
                onChangeText={setAmount}
              />
              <Field
                label="Parent-held location label"
                value={location}
                onChangeText={setLocation}
              />
              <Button
                label="Record funds held by parent"
                onPress={() =>
                  run(() => ({
                    kind: "mark_held",
                    goalId: goal.id,
                    amountCents: parseMoney(amount),
                    locationLabel: location,
                  }))
                }
              />
            </>
          )}
          {!parent && (
            <>
              <Divider />
              <Eyebrow>GOAL DETAILS</Eyebrow>
              <Field label="Goal name" value={title} onChangeText={setTitle} />
              <Field
                label="Goal target (USD)"
                value={target}
                onChangeText={setTarget}
              />
              <Field
                label="Target date (optional YYYY-MM-DD)"
                value={targetDate}
                onChangeText={setTargetDate}
              />
              <Button
                label="Update goal details"
                onPress={() =>
                  run(() => ({
                    kind: "edit_goal",
                    goalId: goal.id,
                    title,
                    targetCents: parseMoney(target),
                    targetDate: targetDate || undefined,
                  }))
                }
              />
              <Button
                label="Cancel this goal"
                quiet
                onPress={() =>
                  app.confirm(
                    "Cancel this goal?",
                    "This releases its earmarks with an auditable event. Existing reported parent payments remain in history and may require correction.",
                    () => {
                      if (
                        run({
                          kind: "cancel_goal",
                          goalId: goal.id,
                          note: "Goal cancelled by its family",
                        })
                      )
                        app.back();
                    },
                  )
                }
              />
            </>
          )}
        </>
      )}
    </View>
  );
}
function MatchFundingControls({
  match,
  number,
}: {
  match: MatchView;
  number: number;
}) {
  const app = useApp();
  const { run } = useFinance();
  const [advanced, setAdvanced] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("manual");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const remaining = match.activeCents - match.fundedCents;
  function reviewFunding() {
    try {
      const amountCents =
        advanced && amount.trim() ? parseMoney(amount) : remaining;
      if (amountCents <= 0 || amountCents > remaining)
        throw new Error(
          "Enter a contribution amount within the remaining unpaid pledge.",
        );
      const now = new Date().toISOString();
      const chosenDate = advanced ? validDate(date) : now.slice(0, 10);
      const paidAt =
        chosenDate === now.slice(0, 10) ? now : `${chosenDate}T12:00:00.000Z`;
      if (Date.parse(paidAt) > Date.parse(now))
        throw new Error("A reported payment cannot be in the future.");
      if (advanced && note.length > 500)
        throw new Error("Keep the funding note within 500 characters.");
      const selectedMethod = advanced ? method : "manual";
      app.confirm(
        "Record a parent-reported contribution?",
        `Record ${money(amountCents)} as contributed outside Between Us using ${selectedMethod} on ${chosenDate}? This is a family report, not provider verification or a transfer.`,
        () => {
          if (
            run({
              kind: "fund_match",
              matchId: match.id,
              amountCents,
              method: selectedMethod,
              paidAt,
              note: advanced ? note : undefined,
            })
          )
            setAmount("");
        },
      );
    } catch (error) {
      app.setNotice((error as Error).message);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Button
        label={`Funding details for contribution ${number}`}
        quiet
        selected={advanced}
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced && (
        <View style={{ gap: 12 }}>
          <Field
            label={`Funding amount for contribution ${number} (USD, optional)`}
            value={amount}
            onChangeText={setAmount}
          />
          <Body muted>
            Leave the amount empty to record the remaining {money(remaining)}.
            You can report a partial contribution.
          </Body>
          <Choices
            label="Contribution method"
            value={method}
            options={["manual", "cash", "Cash App", "Venmo"]}
            onChange={setMethod}
          />
          <Field
            label={`Funding date for contribution ${number} (YYYY-MM-DD UTC)`}
            value={date}
            onChangeText={setDate}
          />
          <Field
            label={`Funding note for contribution ${number} (optional)`}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <Body muted>
            The parent completes any separate payment first. Between Us records
            your report without contacting a payment provider.
          </Body>
        </View>
      )}
      <Button
        label={`Record funding for contribution ${number}`}
        onPress={reviewFunding}
      />
    </View>
  );
}
export function MatchingScreen() {
  const app = useApp();
  const { view, run } = useFinance();
  const matching = view.matching;
  const initial = matching?.rule;
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [rate, setRate] = useState(String(initial?.percent ?? 100));
  const [cap, setCap] = useState(moneyInput(initial?.monthlyCapCents ?? 2000));
  const [budget, setBudget] = useState(
    moneyInput(initial?.parentBudgetCents ?? 2000),
  );
  const [surprise, setSurprise] = useState(initial?.surprise ?? true);
  const [allGoals, setAllGoals] = useState(
    initial?.eligibleGoalIds === undefined,
  );
  const [eligibleGoals, setEligibleGoals] = useState(
    initial?.eligibleGoalIds ?? [],
  );
  const activeGoals = view.goals.filter((goal) => goal.status === "active");
  return (
    <AdminOnly>
      <View style={page}>
        <Eyebrow>PARENT’S SEPARATE BUDGET</Eyebrow>
        <Heading large>A little extra,{"\n"}when you choose.</Heading>
        <Body muted>
          New eligible savings only. Pledges reserve the monthly cap; they do
          not move money or reduce Sam’s allowance pool.
        </Body>
        <Button
          label="Enable savings matching"
          selected={enabled}
          onPress={() => setEnabled(!enabled)}
        />
        <Field label="Match percentage" value={rate} onChangeText={setRate} />
        <Field
          label="Monthly cap per child (USD)"
          value={cap}
          onChangeText={setCap}
        />
        <Field
          label="Separate parent matching budget (USD)"
          value={budget}
          onChangeText={setBudget}
        />
        <Button
          label="Surprise until manual reveal"
          selected={surprise}
          onPress={() => setSurprise(!surprise)}
        />
        <View style={{ gap: 10 }}>
          <Eyebrow>Eligible goals for future matching</Eyebrow>
          <Button
            label="Match all active goals"
            selected={allGoals}
            onPress={() => {
              if (allGoals && !eligibleGoals.length)
                setEligibleGoals(activeGoals.map((goal) => goal.id));
              setAllGoals(!allGoals);
            }}
          />
          {!allGoals &&
            activeGoals.map((goal) => (
              <Button
                key={goal.id}
                label={`Match goal: ${goal.title}`}
                selected={eligibleGoals.includes(goal.id)}
                onPress={() =>
                  setEligibleGoals((goals) =>
                    goals.includes(goal.id)
                      ? goals.filter((id) => id !== goal.id)
                      : [...goals, goal.id],
                  )
                }
              />
            ))}
          <Body muted>
            Applies to future allocations only. Changing eligible goals leaves
            existing commitments and funding reports in history.
          </Body>
        </View>
        <Button
          label="Review matching settings"
          primary
          onPress={() => {
            try {
              const selectedGoals = eligibleGoals.filter((id) =>
                activeGoals.some((goal) => goal.id === id),
              );
              if (!allGoals && !selectedGoals.length)
                throw new Error(
                  "Choose at least one eligible goal or match all active goals.",
                );
              const rule: MatchingRule = {
                enabled,
                percent: Number(rate),
                monthlyCapCents: parseMoney(cap),
                parentBudgetCents: parseMoney(budget),
                surprise,
                eligibleGoalIds: allGoals ? undefined : selectedGoals,
              };
              app.confirm(
                "Save prospective matching rule?",
                `${enabled ? "Enable" : "Disable"} matching at ${rate}%, capped at ${money(rule.monthlyCapCents)} per child per calendar month. ${
                  allGoals
                    ? "All active goals."
                    : "Selected goals: " +
                      activeGoals
                        .filter((goal) => selectedGoals.includes(goal.id))
                        .map((goal) => goal.title)
                        .join(", ") +
                      "."
                } ${surprise ? "Hidden until you reveal." : "Visible pledges."} Applies to future allocations only. Past commitments stay auditable.`,
                () => run({ kind: "configure_matching", rule }),
              );
            } catch (e) {
              app.setNotice((e as Error).message);
            }
          }}
        />
        <Body muted>
          Surprise is inside Between Us only. External payment alerts may reveal
          a contribution.
        </Body>
        <Divider />
        <Heading>Parent match ledger</Heading>
        {matching && (
          <>
            <Body>
              {matching.month} · {view.timezone}
            </Body>
            <Amount label="Reserved this month" cents={matching.usedCents} />
            <Amount
              label="Monthly cap remaining"
              cents={matching.remainingCents}
            />
            <Amount
              label="Separate parent budget remaining"
              cents={matching.parentBudgetRemainingCents}
            />
            {!matching.commitments.length && (
              <Body>
                No commitments yet. Enable the rule, then Sam can allocate newly
                approved earnings.
              </Body>
            )}
            {matching.commitments.map((match, i) => (
              <Paper key={match.id}>
                <Heading>Contribution {i + 1}</Heading>
                <Body>
                  {view.goals.find((g) => g.id === match.goalId)?.title ??
                    "Goal"}{" "}
                  · {match.month}
                </Body>
                <Amount
                  label="Active parent pledge"
                  cents={match.activeCents}
                />
                <Amount
                  label="Parent-reported funded"
                  cents={match.fundedCents}
                />
                <Body>
                  {match.revealed ? "Revealed to Sam" : "Hidden from Sam"} ·{" "}
                  {match.status.replaceAll("_", " ")}
                </Body>
                {!match.revealed && match.activeCents > 0 && (
                  <Button
                    label={`Reveal contribution ${i + 1}`}
                    primary
                    onPress={() =>
                      app.confirm(
                        "Reveal this contribution?",
                        `Show Sam this ${money(match.activeCents)} parent contribution and its actual funding status? Revealing alone does not fund it.`,
                        () => run({ kind: "reveal_match", matchId: match.id }),
                      )
                    }
                  />
                )}
                {match.activeCents > match.fundedCents && (
                  <MatchFundingControls match={match} number={i + 1} />
                )}
                {match.activeCents > 0 && (
                  <Button
                    label={`Reverse contribution ${i + 1}`}
                    quiet
                    onPress={() =>
                      app.confirm(
                        "Reverse this commitment?",
                        "History and already reported funding remain auditable. Any paid amount needs manual correction; this does not reclaim money.",
                        () =>
                          run({
                            kind: "reverse_match",
                            matchId: match.id,
                            note: "Parent matching correction",
                          }),
                      )
                    }
                  />
                )}
                {match.correctionDueCents > 0 && (
                  <View style={{ gap: 10 }}>
                    <Amount
                      label="Manual correction needed"
                      cents={match.correctionDueCents}
                    />
                    <Button
                      label={`Record funding correction ${i + 1}`}
                      onPress={() =>
                        app.confirm(
                          "Record a funding correction?",
                          `Record ${money(match.correctionDueCents)} as a parent-reported ledger correction? The original payment remains in history. This does not reclaim or transfer any money.`,
                          () =>
                            run({
                              kind: "reconcile_match",
                              matchId: match.id,
                              amountCents: match.correctionDueCents,
                              resolution: "report_corrected",
                              paidAt: new Date().toISOString(),
                              note: "Parent-reported funding correction",
                            }),
                        )
                      }
                    />
                  </View>
                )}
              </Paper>
            ))}
          </>
        )}
      </View>
    </AdminOnly>
  );
}
export function PayoutsScreen() {
  const app = useApp();
  const { view, run } = useFinance();
  const parent = app.role === "parent";
  const { theme } = useAppearance();
  const [amount, setAmount] = useState("5.00");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [age, setAge] = useState("15");
  async function copy(text: string) {
    try {
      await Clipboard.setStringAsync(text, { android: { isSensitive: true } });
      app.setNotice(
        "Copied the fictional payout summary. No transfer was started.",
      );
    } catch {
      app.setNotice(
        "Clipboard unavailable. You can select and copy the displayed summary.",
      );
    }
  }
  function open(url: string) {
    void Linking.openURL(url).catch(() =>
      app.setNotice(
        "Could not open the provider site. Visit the displayed official address in your browser.",
      ),
    );
  }
  return (
    <View style={page}>
      <Eyebrow>FAMILY-REPORTED · NO PAYMENT API</Eyebrow>
      <Heading large>
        {parent ? "Ready when you are." : "What you’ve earned."}
      </Heading>
      <Paper>
        <Amount label="Approved earned" cents={view.balances.earnedCents} />
        <Amount
          label="Available, unallocated"
          cents={view.balances.availableCents}
        />
        <Amount label="Goal earmarks" cents={view.balances.earmarkedCents} />
        <Amount
          label="Reserved for payouts"
          cents={view.balances.heldPayoutCents}
        />
        <Amount label="Parent-reported paid" cents={view.balances.paidCents} />
        <Amount label="Still unpaid" cents={view.balances.unpaidCents} />
        {view.balances.correctionDueCents > 0 && (
          <Amount
            label="Manual reconciliation needed"
            cents={view.balances.correctionDueCents}
          />
        )}
      </Paper>
      <Body muted>
        {view.payout.label} In-app calculation only; reminder delivery is
        simulated. Goal earmarks are excluded from cash-out; release them
        separately when allowed.
      </Body>
      {parent && (
        <>
          <Amount
            label="Eligible for the scheduled batch"
            cents={view.payout.eligibleCents}
          />
          <Button
            label="Prepare scheduled payout batch"
            disabled={!view.payout.due}
            onPress={() => run({ kind: "prepare_payout" })}
          />
          <Body muted>
            The entered amount below is a manual payout override, independent of
            cadence.
          </Body>
        </>
      )}
      <Field
        label="Payout amount (USD)"
        value={amount}
        onChangeText={setAmount}
      />
      <Button
        label={parent ? "Prepare payout" : "Request cash-out"}
        primary
        onPress={() =>
          run(() => ({
            kind: parent ? "prepare_payout" : "request_payout",
            amountCents: parseMoney(amount),
          }))
        }
      />
      {!view.payouts.length && <Body>No payout requests yet.</Body>}
      {parent && (
        <>
          <Divider />
          <Choices
            label="Record an external payment method"
            value={method}
            options={["cash", "manual", "Cash App", "Venmo"]}
            onChange={setMethod}
          />
          <Field
            label="Payment date (YYYY-MM-DD UTC)"
            value={paidDate}
            onChangeText={setPaidDate}
          />
          <Field
            label="Payment note (optional)"
            value={note}
            onChangeText={setNote}
          />
          <Body muted>
            Complete payment separately, then record only what you actually did.
            Partial payments leave the remainder reserved.
          </Body>
        </>
      )}
      {view.payouts.map((payout, i) => (
        <Paper key={payout.id}>
          <Heading>Payout {i + 1}</Heading>
          <Body>{payout.status.replaceAll("_", " ")}</Body>
          <Amount label="Requested" cents={payout.amountCents} />
          <Amount label="Remaining reserved" cents={payout.remainingCents} />
          <Amount label="Parent-reported paid" cents={payout.paidCents} />
          {parent && payout.remainingCents > 0 && (
            <>
              <Text selectable style={{ fontSize: 17, color: theme.text }}>
                Sam · {money(payout.remainingCents)} remaining · allowance
                payout · not provider verified
              </Text>
              <Button
                label={`Copy amount for payout ${i + 1}`}
                onPress={() => void copy(moneyInput(payout.remainingCents))}
              />
              <Button
                label={`Copy note for payout ${i + 1}`}
                onPress={() =>
                  void copy(
                    `Fictional Sam allowance payout ${i + 1}: ${money(payout.remainingCents)}. Parent-managed, not provider verified.`,
                  )
                }
              />
              <Button
                label={`Record payment for payout ${i + 1}`}
                primary
                onPress={() =>
                  app.confirm(
                    "Record parent-reported payment?",
                    `Record ${amount} USD using ${method}, on ${paidDate}? No money moves in Between Us.`,
                    () =>
                      run(() => ({
                        kind: "report_payment",
                        payoutId: payout.id,
                        amountCents: parseMoney(amount),
                        method,
                        paidAt:
                          paidDate === new Date().toISOString().slice(0, 10)
                            ? new Date().toISOString()
                            : paidDate + "T12:00:00.000Z",
                        note,
                      })),
                  )
                }
              />
            </>
          )}
          {parent && payout.remainingCents > 0 && (
            <Button
              label={`Cancel payout ${i + 1}`}
              quiet
              onPress={() =>
                app.confirm(
                  "Cancel remaining payout?",
                  "Release only the unpaid reserved amount. Reported payments remain in history.",
                  () =>
                    run({
                      kind: "cancel_payout",
                      payoutId: payout.id,
                      note: "Remaining payout cancelled",
                    }),
                )
              }
            />
          )}
          {payout.payments.map((payment, j) => (
            <View key={payment.id} style={{ gap: 10 }}>
              <Body>
                {money(payment.amountCents)} · {payment.method} ·{" "}
                {payment.paidAt.slice(0, 10)} ·{" "}
                {payment.reversed
                  ? "reversed"
                  : payment.childAcknowledged
                    ? "child confirmed received; not provider verified"
                    : "parent-reported; transfer not verified"}
              </Body>
              {!!payment.note && <Body muted>{payment.note}</Body>}
              {!parent && !payment.childAcknowledged && !payment.reversed && (
                <Button
                  label={`Confirm receipt ${i + 1}.${j + 1}`}
                  onPress={() =>
                    app.confirm(
                      "Confirm you received this?",
                      `Record that you received ${money(payment.amountCents)}? This remains a family acknowledgment.`,
                      () =>
                        run({
                          kind: "acknowledge_payment",
                          paymentId: payment.id,
                        }),
                    )
                  }
                />
              )}
              {parent && !payment.reversed && (
                <Button
                  label={`Reverse payment record ${i + 1}.${j + 1}`}
                  quiet
                  onPress={() =>
                    app.confirm(
                      "Reverse this payment record?",
                      "A compensating entry corrects the ledger. This does not undo any external payment.",
                      () =>
                        run({
                          kind: "reverse_payment",
                          paymentId: payment.id,
                          note: "Parent reconciliation correction",
                        }),
                    )
                  }
                />
              )}
            </View>
          ))}
        </Paper>
      ))}
      {parent && (
        <>
          <Divider />
          <Heading>Pay outside Between Us.</Heading>
          <Body muted>
            Cash/manual works without a child financial account. Optional
            provider setup depends on age, location and provider rules; some
            actions have provider fees.
          </Body>
          <Field
            label="Fictional child age for provider guidance"
            value={age}
            onChangeText={setAge}
          />
          <Body>
            Cash App Families: managed accounts ages 6–12 operated by a parent;
            sponsored accounts ages 13–17. Venmo Teen accounts: ages 13–17 with
            an eligible parent. Between Us does not open accounts, access
            balances, lock savings or automate payments.
          </Body>
          <Text selectable style={{ color: theme.text }}>
            cash.app/families · venmo.com/about/teendebitcard
          </Text>
          <Button
            label="Open official Cash App Families guide"
            disabled={
              !Number.isInteger(Number(age)) ||
              Number(age) < 6 ||
              Number(age) > 17
            }
            onPress={() => open("https://cash.app/families")}
          />
          <Button
            label="Open official Venmo Teen guide"
            disabled={
              !Number.isInteger(Number(age)) ||
              Number(age) < 13 ||
              Number(age) > 17
            }
            onPress={() => open("https://venmo.com/about/teendebitcard")}
          />
          <Body muted>
            Opening a website never marks a payout paid. Check provider
            eligibility and fees before any separate real-world use.
          </Body>
        </>
      )}
    </View>
  );
}
export function FinanceHistory() {
  const { view } = useFinance();
  return (
    <View style={page}>
      <Eyebrow>AUDITABLE · MEMORY ONLY</Eyebrow>
      <Heading large>A clear record.</Heading>
      <Body muted>
        Financial events remain in session history, including corrections. This
        is not a bank statement. Private journal content is never included.
      </Body>
      {!view.activity.length && <Body>No financial activity yet.</Body>}
      {[...view.activity].reverse().map((item) => (
        <View key={item.id} style={{ gap: 8 }}>
          <Divider />
          <Body>{item.label}</Body>
          {item.amountCents !== undefined && (
            <Amount label="Recorded amount" cents={item.amountCents} />
          )}
          <Body muted>
            {item.actorRole === "parent" ? "Parent" : "Child"} ·{" "}
            {item.note || "Financial record"}
          </Body>
          <Body muted>Reference: {item.referenceId}</Body>
          <Body muted>{new Date(item.at).toLocaleString()}</Body>
        </View>
      ))}
    </View>
  );
}
