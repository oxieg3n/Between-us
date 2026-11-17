import type { FinanceView } from '../finance/types';

/** Shared visible DTO. Internal source lots, checkpoint bindings and matching are absent. */
export type FinanceHistoryPage = {
  items: { id: string; occurrences: FinanceView['occurrences']; payouts: FinanceView['payouts'] }[];
  nextAfterId: string | null;
};
export type ParentMatchHistoryPage = {
  items: { id: string; match: NonNullable<FinanceView['matching']>['commitments'][number] }[];
  nextAfterId: string | null;
};
export type ParentHotMatchHistoryPage = {
  items: NonNullable<FinanceView['matching']>['commitments'];
  nextAfterId: string | null;
};
