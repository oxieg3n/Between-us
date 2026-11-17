import { periodKey } from '../../../apps/mobile/src/finance/money-calendar.ts';
import type { ArchivedBudgetBasis, ChildBook, FinanceCommand, FinanceState, FinanceView } from '../../../apps/mobile/src/finance/types.ts';

export const privateFinanceKinds = new Set<FinanceCommand['kind']>(['configure_matching', 'reveal_match', 'fund_match', 'reverse_match', 'reconcile_match']);
/** PostgreSQL COLLATE "C" compares UTF-8 code points, not JavaScript UTF-16 units. */
export function databaseKeyOrder(a: string, b: string): number {
  if (!/[\ud800-\udfff]/.test(a) && !/[\ud800-\udfff]/.test(b)) return a < b ? -1 : a > b ? 1 : 0;
  const left = Array.from(a), right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}
export function canonicalFinance(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalFinance).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => databaseKeyOrder(a, b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalFinance(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function financeDigest(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalFinance(value)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
/** These are unchanged hot-work limits. Historical rows remain in the immutable database. */
export function exceedsHotCollections(view: FinanceView): boolean {
  return view.occurrences.length > 100 || view.goals.length > 32 || view.savingsRules.length > 8 || view.payouts.length > 32
    || view.payouts.some(p => p.payments.length > 32);
}
export function needsTailCheckpoint(state: FinanceState, childId: string, kind: FinanceCommand['kind']): boolean {
  const hidden = privateFinanceKinds.has(kind);
  return state.events.filter(e => e.childId === childId && privateFinanceKinds.has(e.kind) === hidden).length >= (hidden ? 32 : 128);
}
/** Query only periods touched by bounded hot chores or the prospective assignment. */
export function budgetKeys(book: ChildBook, plan = book.plan, newDates: string[] = []): string[] {
  if (!plan) return [];
  return [...new Set([...book.occurrences.map(o => o.dueDate), ...newDates].map(date => periodKey(date, plan.period, plan.anchorDate)))].sort();
}
export function validateBudgetBasis(value: unknown, book: ChildBook, revision: number, stateHash: string): ArchivedBudgetBasis {
  const v = value as ArchivedBudgetBasis & { revision: number; stateHash: string };
  if (!v || !book.plan || v.revision !== revision || v.stateHash !== stateHash || v.period !== book.plan.period || v.anchorDate !== book.plan.anchorDate
    || !Number.isSafeInteger(v.maximumCents) || v.maximumCents < 0 || !v.byPeriod || typeof v.byPeriod !== 'object' || Array.isArray(v.byPeriod)
    || Object.keys(v.byPeriod).length > 131 || Object.values(v.byPeriod).some(n => !Number.isSafeInteger(n) || n < 0)
    || !Array.isArray(v.excludedOccurrenceIds) || v.excludedOccurrenceIds.length > 100
    || v.excludedOccurrenceIds.some(id => !book.occurrences.some(o => o.id === id))) throw Error('Unverified financial budget basis.');
  return { period: v.period, anchorDate: v.anchorDate, maximumCents: v.maximumCents,
    byPeriod: { ...v.byPeriod }, excludedOccurrenceIds: [...v.excludedOccurrenceIds].sort(databaseKeyOrder) };
}
