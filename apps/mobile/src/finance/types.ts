export type FinanceActor = { role: "parent" | "child"; childId?: string };
export type AllowancePeriod = "weekly" | "biweekly" | "monthly";
export type PayoutCadence = "per_task" | "daily" | AllowancePeriod;
export type PaymentMethod = "cash" | "manual" | "Cash App" | "Venmo";
export type FinancePlan = {
  budgetCents: number; period: AllowancePeriod; anchorDate: string;
  payoutCadence: PayoutCadence; minimumPayoutCents: number; allowGoalRelease: boolean;
};
export type MatchingRule = {
  enabled: boolean; percent: number; monthlyCapCents: number;
  parentBudgetCents: number; surprise: boolean; eligibleGoalIds?: string[];
};
export type SavingsRule = { id: string; goalId: string; mode: "fixed" | "percent"; value: number; enabled: boolean };
type Base = { id: string; at: string; childId: string };
export type FinanceCommand = Base & (
  | { kind: "configure_plan"; plan: FinancePlan }
  | { kind: "assign_chore"; choreId: string; title: string; instructions?: string; rewardCents: number; dates: string[]; recurrence?: "once" | "daily" | "weekly"; evidenceRequired?: boolean }
  | { kind: "edit_chore"; choreId: string; title: string; rewardCents: number; instructions?: string }
  | { kind: "submit_chore"; occurrenceId: string; note?: string }
  | { kind: "review_chore"; occurrenceId: string; decision: "approved" | "needs_retry" | "declined"; note?: string }
  | { kind: "close_chore"; occurrenceId: string; status: "cancelled" | "expired"; note: string }
  | { kind: "reverse_earning"; occurrenceId: string; note: string }
  | { kind: "create_goal"; goalId: string; title: string; targetCents: number; targetDate?: string }
  | { kind: "edit_goal"; goalId: string; title: string; targetCents: number; targetDate?: string }
  | { kind: "cancel_goal"; goalId: string; note: string }
  | { kind: "allocate"; goalId: string; amountCents?: number; percent?: number; currentAllowancePeriodOnly?: boolean }
  | { kind: "transfer_goal"; fromGoalId: string; toGoalId: string; amountCents: number }
  | { kind: "release_goal"; goalId: string; amountCents: number; note?: string }
  | { kind: "set_savings_rule"; rule: SavingsRule }
  | { kind: "mark_held"; goalId: string; amountCents: number; locationLabel: string }
  | { kind: "request_payout"; amountCents: number }
  | { kind: "prepare_payout"; amountCents?: number }
  | { kind: "cancel_payout"; payoutId: string; note: string }
  | { kind: "report_payment"; payoutId: string; amountCents: number; method: PaymentMethod; paidAt: string; note?: string }
  | { kind: "acknowledge_payment"; paymentId: string }
  | { kind: "reverse_payment"; paymentId: string; note: string }
  | { kind: "configure_matching"; rule: MatchingRule }
  | { kind: "reveal_match"; matchId: string }
  | { kind: "fund_match"; matchId: string; amountCents: number; method: PaymentMethod; paidAt: string; note?: string }
  | { kind: "reverse_match"; matchId: string; note: string }
  | { kind: "reconcile_match"; matchId: string; amountCents: number; resolution: "report_corrected" | "parent_reported_returned"; paidAt: string; note: string }
);
export type FinanceEffect = { kind: "match_committed" | "match_reversed" | "correction_due" | "automatic_allocation"; referenceId: string; cents: number };
export type FinanceEvent = FinanceCommand & { actor: FinanceActor; effects: FinanceEffect[] };
export type FinanceState = { timezone: string; children: { id: string; name: string }[]; events: FinanceEvent[]; checkpoint?: FinanceCheckpoint };
export type ChoreStatus = "not_started" | "submitted_by_child" | "approved" | "needs_retry" | "declined" | "cancelled" | "expired";
export type ChoreOccurrence = { id: string; choreId: string; title: string; instructions: string; dueDate: string; rewardCents: number; status: ChoreStatus; note: string; approvedAt?: string; reversed?: boolean; recurrence?: "once" | "daily" | "weekly"; evidenceRequired?: boolean };
export type FinancePayment = { id: string; amountCents: number; method: PaymentMethod; paidAt: string; note: string; childAcknowledged: boolean; reversed: boolean };
export type PayoutView = { id: string; amountCents: number; remainingCents: number; paidCents: number; status: "requested" | "prepared" | "partially_paid" | "parent_reported_paid" | "cancelled" | "corrected"; createdAt: string; payments: FinancePayment[] };
export type MatchView = { id: string; goalId: string; allocationId: string; cents: number; activeCents: number; fundedCents: number; parentReportedFundingCents: number; reconciledCents: number; reversedCents: number; correctionDueCents: number; month: string; revealed: boolean; createdAt: string; status: "pledged" | "partially_parent_reported" | "parent_reported_paid" | "reversed" };
export type GoalView = { id: string; title: string; targetCents: number; targetDate?: string; status: "active" | "cancelled"; ownCents: number; parentContributedCents: number; parentPlannedCents: number; progressCents: number; progressPercent: number; parentHeldCents: number; locationLabel: string };
export type BookLot = { earningId: string; cents: number; eligible: boolean; earnedAt: string; matchAllocationId?: string };
export type BookAllocation = { id: string; goalId: string; lots: BookLot[]; originalCents: number; releasedCents: number; sourceCents: Record<string, number> };
export type BookGoal = { id: string; title: string; targetCents: number; targetDate?: string; status: "active" | "cancelled"; heldCents: number; locationLabel: string };
export type BookPayout = { id: string; createdAt: string; amountCents: number; originalAmountCents: number; lots: BookLot[]; payments: (FinancePayment & { lots: BookLot[] })[]; cancelled: boolean; prepared: boolean };
export type BookMatch = MatchView & { sourceCents: Record<string, number>; invalidatedCents: Record<string, number>; eligibleBaseCents: number };
export type ArchivedBudgetBasis = { period: FinancePlan["period"]; anchorDate: string; maximumCents: number; byPeriod: Record<string, number>; excludedOccurrenceIds: string[] };
export type ArchivedMatchBasis = { month: string; usedCents: number; byGoal: Record<string, { activeCents: number; fundedCents: number; revealedFundedCents: number }> };
export type ChildBook = {
  plan?: FinancePlan; occurrences: ChoreOccurrence[]; goals: BookGoal[]; free: BookLot[]; allocations: BookAllocation[];
  payouts: BookPayout[]; matches: BookMatch[]; savingsRules: SavingsRule[]; matchingRule: MatchingRule;
  earnedCents: number; correctionDueCents: number; archivedPaidCents: number; archivedBudget?: ArchivedBudgetBasis; archivedMatches?: ArchivedMatchBasis;
};
export type FinanceCheckpoint = { version: 1; lastEventAt: string | null; books: Record<string, ChildBook>;
  activity: Record<string, { visible: FinanceView["activity"]; parent: FinanceView["activity"] }> };
/** Server-only immutable payload; storage identity/hash/CAS/current authorization are separate bindings. */
export type FinanceSettledCapsule = { version: 1; childId: string; occurrences: ChoreOccurrence[]; payouts: BookPayout[]; allocations: BookAllocation[]; paidCents: number };
export type FinancePrivateMatchCapsule = { version: 1; childId: string; match: BookMatch };
export type FinanceView = {
  childId: string; childName: string; timezone: string; plan?: FinancePlan;
  occurrences: ChoreOccurrence[]; goals: GoalView[]; savingsRules: SavingsRule[]; payouts: PayoutView[];
  balances: { plannedCents: number; pendingCents: number; earnedCents: number; availableCents: number; earmarkedCents: number; heldPayoutCents: number; paidCents: number; unpaidCents: number; correctionDueCents: number };
  payout: { due: boolean; eligibleCents: number; periodKey: string; label: string };
  activity: { id: string; at: string; label: string; actorRole: FinanceActor["role"]; referenceId: string; amountCents?: number; note?: string }[];
  matching?: { rule: MatchingRule; commitments: MatchView[]; month: string; usedCents: number; remainingCents: number; parentBudgetRemainingCents: number };
};
