import type { FinanceActor, FinanceState, FinanceView } from '../../../apps/mobile/src/finance/types.ts';
import { financeView } from '../../../apps/mobile/src/finance/engine.ts';
import { canonicalFinance, databaseKeyOrder } from './finance-checkpoints.ts';

const publicFields = ['childId', 'childName', 'timezone', 'plan', 'occurrences', 'goals', 'savingsRules', 'payouts', 'balances', 'payout', 'activity'];
const rawFields = new Set(['state', 'checkpoint', 'events', 'effects', 'lots', 'sourceCents', 'invalidatedCents', 'eligibleBaseCents', 'revision', 'sequence', 'stateHash', 'sourceHash', 'fingerprint', 'actorId', 'sessionId']);
const childPrivate = new Set(['matching', 'commitments', 'monthlyCapCents', 'parentBudgetCents', 'parentBudgetRemainingCents', 'usedCents', 'rule']);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function safe(value: unknown, parent: boolean, depth = 0): void {
  if (depth > 12) throw Error('Unverified finance export.');
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw Error('Unverified finance export.');
  if (Array.isArray(value)) { if (value.length > 131073) throw Error('Finance export requires capacity review.'); for (const v of value) safe(v, parent, depth + 1); }
  else if (record(value)) for (const [key, v] of Object.entries(value)) {
    if (rawFields.has(key) || !parent && childPrivate.has(key)) throw Error('Unverified finance export.');
    safe(v, parent, depth + 1);
  }
}
function mergeRows<T extends { id: string }>(hot: T[], archive: unknown): T[] {
  if (!Array.isArray(archive) || !Array.isArray(hot)) throw Error('Unverified finance export.');
  const rows = [...hot, ...archive] as T[], ids = new Set<string>();
  for (const row of rows) {
    if (!record(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw Error('Duplicate finance export source.');
    ids.add(row.id);
  }
  return rows.sort((a, b) => databaseKeyOrder(a.id, b.id));
}
/** Only temporal fields are refreshed; a changed financial position requires a new source stamp. */
function positions(view: FinanceView): unknown {
  const { payout, matching, ...rest } = view;
  const { due: _due, eligibleCents: _eligible, periodKey: _period, ...staticPayout } = payout;
  if (!matching) return { ...rest, payout: staticPayout };
  const { month: _month, usedCents: _used, remainingCents: _remaining, parentBudgetRemainingCents: _budget, ...staticMatching } = matching;
  return { ...rest, payout: staticPayout, matching: staticMatching };
}
export function mergeFinancePrivacy(source: Record<string, unknown>, state: FinanceState, actor: FinanceActor, childId: string, at: string): FinanceView {
  if (!record(source.projection) || source.projection.childId !== childId
    || Object.keys(source.projection).some(k => ![...publicFields, ...(actor.role === 'parent' ? ['matching'] : [])].includes(k))) throw Error('Unverified finance export.');
  const captured = source.projection as unknown as FinanceView;
  safe(captured, actor.role === 'parent');
  const current = financeView(state, actor, childId, at);
  if (canonicalFinance(positions(captured)) !== canonicalFinance(positions(current))) throw Error('Finance export source changed.');
  const result: FinanceView = { ...current,
    occurrences: mergeRows(current.occurrences, source.archivedOccurrences),
    payouts: mergeRows(current.payouts, source.archivedPayouts),
    activity: (() => {
      if (!Array.isArray(source.activity)) throw Error('Unverified finance export.');
      mergeRows([], source.activity); // Validate identities without replacing accepted chronology.
      return source.activity as FinanceView['activity'];
    })(),
  };
  if (actor.role === 'parent') {
    if (!result.matching) throw Error('Unverified parent finance export.');
    result.matching = { ...result.matching, commitments: mergeRows(result.matching.commitments, source.archivedMatching) };
  }
  safe(result, actor.role === 'parent');
  const earned = result.occurrences.filter(o => o.status === 'approved' && !o.reversed).reduce((n, o) => n + BigInt(o.rewardCents), 0n);
  const paid = result.payouts.reduce((n, p) => n + BigInt(p.paidCents), 0n);
  if (earned !== BigInt(result.balances.earnedCents) || paid !== BigInt(result.balances.paidCents)) throw Error('Incomplete finance export.');
  return result;
}
