import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../adaptive-writing-text';
import { Body, Button, Divider, Field, Heading, Paper } from '../ui';
import { formatMoney } from '../finance/money-calendar';
import type { FinanceHistoryPage } from './finance-history-types';
import type { ProductionFinanceAction } from './pending-finance-policy';
import { accountApi } from './client';

type Review = (action: ProductionFinanceAction, title: string, detail: string) => void;
/** One bounded page and one expanded record, rather than an ever-growing native scroll tree. */
export function ArchivedFinanceHistory({ path, authorId, parent, review }: { path: string; authorId: string; parent: boolean; review: Review }) {
  const [page, setPage] = useState<FinanceHistoryPage | null>(null), [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const lifetime = useRef({ active: false, read: 0 });
  useEffect(() => { const current = lifetime.current; current.active = true; return () => { current.active = false; current.read++; }; }, []);
  async function load(after: string | null) {
    const current = lifetime.current; if (!current.active || busy) return;
    const read = ++current.read; setBusy(true); setError('');
    try {
      const result = await accountApi<FinanceHistoryPage>(`${path}/history${after ? `?after=${encodeURIComponent(after)}` : ''}`, undefined, authorId);
      if (current.active && read === current.read) { setPage(result); setSelected(''); }
    } catch { if (current.active && read === current.read) setError('Older records could not be loaded. Check your connection and try again.'); }
    finally { if (current.active && read === current.read) setBusy(false); }
  }
  const record = page?.items.find(item => item.id === selected);
  return <View style={{ gap: 16 }}><Divider/><Heading>Older settled records</Heading>
    <Body muted>Settled chores and payout reports stay in the financial history. Corrections add a new event; they never remove the original record or move money.</Body>
    <Button label={busy ? 'Loading older financial records' : page ? 'Refresh older records' : 'Load older settled records'} disabled={busy} onPress={() => void load(null)}/>
    {!!error && <Body><Text accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text></Body>}
    {page && !page.items.length && <Body>No older settled records are available in this page. Current chores and payouts are in their sections.</Body>}
    {page?.items.map(item => <Button key={item.id} label={`Open settled record: ${item.occurrences[0]?.title ?? 'Manual payout'} · ${item.occurrences[0]?.dueDate ?? ''}`} selected={selected === item.id} disabled={busy} onPress={() => setSelected(item.id)}/>)}
    {page?.nextAfterId && <Button label="Next page of settled records" disabled={busy} onPress={() => void load(page.nextAfterId)}/>}
    {record && <><Heading>Retained record</Heading>{parent && <Field label="Reason for a historical correction" value={note} onChangeText={setNote}/>}
      {record.occurrences.map(o => <Paper key={o.id}><Heading>{o.title}</Heading><Body>{o.dueDate} · {formatMoney(o.rewardCents)} · {o.status.replaceAll('_', ' ')}{o.reversed ? ' · corrected' : ''}</Body>
        {!!o.note && <Body>{o.note}</Body>}{parent && o.status === 'approved' && !o.reversed && <Button label={`Review historical earning correction: ${o.title}`} disabled={!note.trim()} onPress={() => review({ kind: 'reverse_earning', occurrenceId: o.id, note }, 'Correct this historical earning?', 'The server restores the retained sources and checks all current balances. A compensating event preserves the original approval and payment reports.')}/>}</Paper>)}
      {record.payouts.map(payout => <Paper key={payout.id}><Heading>Retained payout</Heading><Body>Parent-reported paid: {formatMoney(payout.paidCents)}. No provider transfer is verified.</Body>
        {payout.payments.map(payment => <View key={payment.id} style={{ gap: 10 }}><Divider/><Body>{formatMoney(payment.amountCents)} · {payment.method} · {payment.paidAt.slice(0, 10)}</Body><Body muted>{payment.reversed ? 'Corrected report' : payment.childAcknowledged ? 'Receipt acknowledged by the child' : 'Parent-reported payment'}</Body>
          {parent && !payment.reversed && <Button label="Review historical payment correction" disabled={!note.trim()} onPress={() => review({ kind: 'reverse_payment', paymentId: payment.id, note }, 'Correct this retained payment report?', 'The original report remains. This changes the family ledger; it does not reverse a payment outside Between Us.')}/>}
          {!parent && !payment.reversed && !payment.childAcknowledged && <Button label="Review historical receipt acknowledgment" onPress={() => review({ kind: 'acknowledge_payment', paymentId: payment.id }, 'Did you receive this amount?', `Acknowledge personally receiving ${formatMoney(payment.amountCents)}. This is a family report, not provider verification.`)}/>}</View>)}
      </Paper>)}
    </>}
  </View>;
}
