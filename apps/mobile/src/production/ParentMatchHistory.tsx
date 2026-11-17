import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../adaptive-writing-text';
import { Body, Button, Divider, Field, Heading, Paper } from '../ui';
import { formatMoney, parseMoney, validDate } from '../finance/money-calendar';
import type { ParentHotMatchHistoryPage, ParentMatchHistoryPage } from './finance-history-types';
import type { ProductionFinanceAction } from './pending-finance-policy';
import { accountApi } from './client';

type Review = (action: ProductionFinanceAction, title: string, detail: string) => void;
export function ParentMatchHistory({ path, authorId, review }: { path: string; authorId: string; review: Review }) {
  const [page, setPage] = useState<ParentMatchHistoryPage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [openPage, setOpenPage] = useState<ParentHotMatchHistoryPage | null>(null);
  const [amount, setAmount] = useState(''), [date, setDate] = useState(''), [note, setNote] = useState('');
  const [resolution, setResolution] = useState<'report_corrected' | 'parent_reported_returned'>('report_corrected');
  const lifetime = useRef({ active: false, version: 0 });
  useEffect(() => { const current = lifetime.current; current.active = true; return () => { current.active = false; current.version++; }; }, []);
  async function load(after: string | null, open = false) {
    const current = lifetime.current; if (busy || !current.active) return;
    const version = ++current.version; setBusy(true); setError('');
    try {
      const suffix = after ? `?after=${encodeURIComponent(after)}` : '';
      if (open) {
        const result = await accountApi<ParentHotMatchHistoryPage>(`${path}/parent-open-history${suffix}`, undefined, authorId);
        if (current.active && current.version === version) setOpenPage(result);
      } else {
        const result = await accountApi<ParentMatchHistoryPage>(`${path}/parent-history${suffix}`, undefined, authorId);
        if (current.active && current.version === version) setPage(result);
      }
    } catch { if (current.active && current.version === version) setError('Older parent matching records could not be loaded. Try again.'); }
    finally { if (current.active && current.version === version) setBusy(false); }
  }
  function reconcile(matchId: string) {
    try {
      validDate(date); const cents = parseMoney(amount);
      if (!cents || !note.trim() || note.length > 500) throw Error('Enter a positive amount and a reason of up to 500 characters.');
      review({ kind: 'reconcile_match', matchId, amountCents: cents, resolution, paidAt: `${date}T00:00:00.000Z`, note },
        'Reconcile this retained contribution?', `${formatMoney(cents)} reported as ${resolution.replaceAll('_', ' ')}. The server checks the retained obligation. No money is moved.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Check the reconciliation details.'); }
  }
  function fund(match: ParentHotMatchHistoryPage['items'][number]) {
    try {
      validDate(date); const cents = parseMoney(amount);
      if (!cents || cents > match.activeCents - match.fundedCents || !note.trim() || note.length > 500)
        throw Error('Enter an amount within the unfunded commitment and a reason of up to 500 characters.');
      review({ kind: 'fund_match', matchId: match.id, amountCents: cents, method: 'manual', paidAt: `${date}T00:00:00.000Z`, note },
        'Record parent-reported funding?', `${formatMoney(cents)} manually reported on ${date}. Record only what you actually did; no payment is executed or provider transfer verified.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Check the funding report.'); }
  }
  function correct(matchId: string) {
    if (!note.trim() || note.length > 500) { setError('Enter a correction reason of up to 500 characters.'); return; }
    review({ kind: 'reverse_match', matchId, note }, 'Correct this open commitment?',
      'The original record remains. No real funds are reclaimed; parent-reported funding may require a separate reconciliation.');
  }
  function record(match: ParentHotMatchHistoryPage['items'][number], key: string, open: boolean) {
    return <Paper key={key}><Heading>{match.month} contribution</Heading><Body>{formatMoney(match.cents)} originally committed · {match.revealed ? 'revealed' : 'surprise'}</Body><Body>Parent-reported funding: {formatMoney(match.fundedCents)}. Unresolved correction: {formatMoney(match.correctionDueCents)}.</Body>
      {!match.revealed && <Button label="Review revealing this retained contribution" onPress={() => review({ kind: 'reveal_match', matchId: match.id }, 'Reveal this retained contribution?', 'This makes its current contribution visible to the child. Revealing a commitment does not make a payment.')}/>}
      {open && match.activeCents > match.fundedCents && <Button label="Review funding this open commitment" disabled={busy} onPress={() => fund(match)}/>}
      {open && match.activeCents > 0 && <Button label="Review correcting this open commitment" disabled={busy} onPress={() => correct(match.id)}/>}
      {match.correctionDueCents > 0 && <Button label="Review retained contribution reconciliation" onPress={() => reconcile(match.id)}/>}
    </Paper>;
  }
  return <View style={{ gap: 16 }}><Divider/><Heading>Retained parent matching</Heading>
    <Body muted>These parent records include surprise commitments. A child sees a contribution only after you reveal it. Historical corrections keep the original audit trail.</Body>
    {(page?.items.some(item => item.match.correctionDueCents > 0) || openPage?.items.some(match => match.activeCents > 0 || match.correctionDueCents > 0)) && <><Field label="Funding or reconciliation amount (USD)" value={amount} onChangeText={setAmount}/><Field label="Actual funding or reconciliation date (YYYY-MM-DD UTC)" value={date} onChangeText={setDate}/><Field label="Funding or correction reason" value={note} onChangeText={setNote}/>
      <Body muted>Funding reports use the manual method and actual dates at UTC midnight. No provider payment is started; the server checks current amounts and rejects future dates.</Body>
      <Button label="Correct the family report" selected={resolution === 'report_corrected'} onPress={() => setResolution('report_corrected')}/><Button label="Parent reports money returned" selected={resolution === 'parent_reported_returned'} onPress={() => setResolution('parent_reported_returned')}/></>}
    <Heading>Open matching records</Heading><Body muted>Review current commitments beyond the latest summary, twenty records per page.</Body>
    <Button label={busy ? 'Loading matching records' : openPage ? 'Refresh open matching records' : 'Load open matching records'} disabled={busy} onPress={() => void load(null, true)}/>
    {openPage && !openPage.items.length && <Body>No open matching records are available in this page.</Body>}
    {openPage?.items.map(match => record(match, `open:${match.id}`, true))}
    {openPage?.nextAfterId && <Button label="Next page of open matching records" disabled={busy} onPress={() => void load(openPage.nextAfterId, true)}/>}
    <Heading>Older settled matching records</Heading>
    <Button label={busy ? 'Loading parent matching history' : page ? 'Refresh parent matching history' : 'Load older parent matching records'} disabled={busy} onPress={() => void load(null)}/>
    {!!error && <Body><Text accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text></Body>}
    {page && !page.items.length && <Body>No older matching records are available in this page.</Body>}
    {page?.items.map(({ id, match }) => record(match, `archive:${id}`, false))}
    {page?.nextAfterId && <Button label="Next page of parent matching" disabled={busy} onPress={() => void load(page.nextAfterId)}/>}
  </View>;
}
