import { validateCapsule, validatePrivateCapsule } from '../../../apps/mobile/src/finance/checkpoint.ts';
import type { FinancePrivateMatchCapsule, FinanceSettledCapsule } from '../../../apps/mobile/src/finance/types.ts';
import type { FinanceHistoryPage, ParentMatchHistoryPage } from '../../../apps/mobile/src/production/finance-history-types.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Deliberate allowlist: never spread a raw archive, payment, or financial event. */
export function financeHistoryProjection(source: unknown, childId: string): FinanceHistoryPage {
  const page = source as { items: { id: string; capsule: FinanceSettledCapsule }[]; nextAfterId: string | null };
  if (!page || !Array.isArray(page.items) || page.items.length > 20 || page.nextAfterId !== null && !uuid.test(page.nextAfterId)) throw Error('Unverified financial history.');
  const ids = new Set<string>();
  const items = page.items.map(item => {
    if (!uuid.test(item.id) || ids.has(item.id)) throw Error('Unverified financial history.');
    ids.add(item.id); validateCapsule(item.capsule, childId);
    return { id: item.id,
      occurrences: item.capsule.occurrences.map(o => ({ id: o.id, choreId: o.choreId, title: o.title,
        instructions: o.instructions, dueDate: o.dueDate, rewardCents: o.rewardCents, status: o.status,
        note: o.note, approvedAt: o.approvedAt, reversed: o.reversed, recurrence: o.recurrence, evidenceRequired: o.evidenceRequired })),
      payouts: item.capsule.payouts.map(p => {
        const paid = p.payments.filter(pay => !pay.reversed).reduce((total, pay) => total + pay.amountCents, 0);
        const remaining = p.lots.reduce((total, lot) => total + lot.cents, 0);
        return { id: p.id, amountCents: p.amountCents, remainingCents: remaining, paidCents: paid, createdAt: p.createdAt,
          status: p.cancelled ? 'cancelled' as const : paid ? 'parent_reported_paid' as const : 'corrected' as const,
          payments: p.payments.map(pay => ({ id: pay.id, amountCents: pay.amountCents, method: pay.method,
            paidAt: pay.paidAt, note: pay.note, childAcknowledged: pay.childAcknowledged, reversed: pay.reversed })) };
      }),
    };
  });
  return { items, nextAfterId: page.nextAfterId };
}
export function parentMatchHistoryProjection(source: unknown, childId: string): ParentMatchHistoryPage {
  const page = source as { items: { id: string; capsule: FinancePrivateMatchCapsule }[]; nextAfterId: string | null };
  if (!page || !Array.isArray(page.items) || page.items.length > 20 || page.nextAfterId !== null && !uuid.test(page.nextAfterId)) throw Error('Unverified parent history.');
  const seen = new Set<string>();
  return { items: page.items.map(item => {
    if (!uuid.test(item.id) || seen.has(item.id)) throw Error('Unverified parent history.');
    seen.add(item.id); validatePrivateCapsule(item.capsule, childId);
    const m = item.capsule.match;
    return { id: item.id, match: { id: m.id, goalId: m.goalId, allocationId: m.allocationId, cents: m.cents,
      activeCents: m.activeCents, fundedCents: m.fundedCents, parentReportedFundingCents: m.parentReportedFundingCents,
      reconciledCents: m.reconciledCents, reversedCents: m.reversedCents, correctionDueCents: m.correctionDueCents,
      month: m.month, revealed: m.revealed, createdAt: m.createdAt, status: m.status } };
  }), nextAfterId: page.nextAfterId };
}
