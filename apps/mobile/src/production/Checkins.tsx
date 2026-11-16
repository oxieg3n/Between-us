import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from "react-native";
import { Text } from "../adaptive-writing-text";
import { randomUUID } from 'expo-crypto';
import { useAppearance } from '../appearance';
import { Body, Button, Divider, Eyebrow, Field, Heading, Paper } from '../ui';
import { accountRpc, type AccountContext } from './client';

type ResponsePreference = 'listen' | 'reply' | 'talk';
export type PreparedCheckinConversation = { recipientId: string; text: string; response: ResponsePreference };
type Schedule = { id: string; familyId: string; childId: string; childName: string; question: string; weekdays: number[]; localTime: string; timezone: string; revision: number; canIssue: boolean };
type Invitation = { id: string; question: string; fromId: string; fromName: string; dueAt: string; disposition: 'open' | 'deferred' };
type Contact = { id: string; a: string; b: string; aName: string | null; bName: string | null; canExchange: boolean };
type Mutation = { rpc: string; args: Record<string, unknown>; success: string };
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const questions = ['What made you smile today?', 'If we could invent a family tradition, what would it be?', 'What is something you would like to learn together?'];

type Props = {
  context: AccountContext; onBack: () => void;
  onPrepareConversation?: (value: PreparedCheckinConversation) => void | Promise<void>;
};
export function ProductionCheckins(props: Props) { return <CheckinWorkspace key={props.context.user.id} {...props} />; }
function CheckinWorkspace({ context, onBack, onPrepareConversation }: Props) {
  const { theme } = useAppearance();
  const guardian = context.user.kind === 'parent' && context.memberships.some(m => m.role === 'guardian');
  const children = context.children.filter(child => context.user.kind === 'parent' && context.user.state === 'active' && child.state === 'active' && child.accountReady === true && context.memberships.some(m => m.familyId === child.familyId && m.role === 'guardian'));
  const [schedules, setSchedules] = useState<Schedule[]>([]), [invitations, setInvitations] = useState<Invitation[]>([]), [contacts, setContacts] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(true), [notice, setNotice] = useState(''), [showLater, setShowLater] = useState(false), [pending, setPending] = useState<Mutation | null>(null);
  const [form, setForm] = useState(false), [editing, setEditing] = useState<Schedule | null>(null), [childId, setChildId] = useState('');
  const [question, setQuestion] = useState(questions[0]), [days, setDays] = useState<number[]>([5]), [time, setTime] = useState('17:00'), [zone, setZone] = useState('UTC');
  const [remove, setRemove] = useState<Schedule | null>(null), [littleQuestion, setLittleQuestion] = useState(questions[0]), [littleWords, setLittleWords] = useState(''), [littlePeer, setLittlePeer] = useState(''), [littleResponse, setLittleResponse] = useState<ResponsePreference>('listen');
  const alive = useRef(true), epoch = useRef(0), readVersion = useRef(0), working = useRef(false), pendingRef = useRef<Mutation | null>(null);
  const locked = busy || pending !== null;
  const selectedChild = children.find(child => child.id === childId);
  const peers = contacts.filter(contact => contact.canExchange && [contact.a, contact.b].includes(context.user.id)).map(contact => ({
    id: contact.a === context.user.id ? contact.b : contact.a,
    name: (contact.a === context.user.id ? contact.bName : contact.aName) || 'Verified contact',
  }));

  const refresh = useCallback(async () => {
    const version = ++readVersion.current, generation = epoch.current;
    setBusy(true);
    try {
      if (context.user.kind === 'child') await accountRpc('refresh_checkin_invitations', {}, context.user.id);
      const [items, currentContacts] = await Promise.all([
        guardian ? accountRpc<Schedule[]>('list_checkin_schedules', {}, context.user.id) : accountRpc<Invitation[]>('list_checkin_invitations', { p_include_deferred: showLater }, context.user.id),
        accountRpc<Contact[]>('list_contacts', {}, context.user.id),
      ]);
      if (!alive.current || generation !== epoch.current || version !== readVersion.current) return;
      if (guardian) setSchedules(items as Schedule[]); else setInvitations(items as Invitation[]);
      setContacts(currentContacts);
    } catch (error) {
      if (alive.current && generation === epoch.current) setNotice(error instanceof Error ? error.message : 'The server could not load invitations.');
    } finally { if (alive.current && generation === epoch.current && version === readVersion.current) setBusy(false); }
  }, [context.user.id, context.user.kind, guardian, showLater]);

  useEffect(() => {
    alive.current = true; const generation = epoch.current + 1; epoch.current = generation;
    return () => { alive.current = false; epoch.current = generation + 1; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return refresh(); });
    return () => { cancelled = true; };
  }, [refresh]);

  async function mutate(next?: Mutation) {
    if (working.current) return false;
    const command = pendingRef.current ?? next;
    if (!command) return false;
    const generation = epoch.current;
    pendingRef.current = command; setPending(command); working.current = true; setBusy(true); setNotice('');
    try {
      await accountRpc(command.rpc, command.args, context.user.id);
      if (!alive.current || generation !== epoch.current) return false;
      pendingRef.current = null; setPending(null); setNotice(command.success);
      if (command.rpc === 'save_checkin_schedule') { setForm(false); setEditing(null); }
      setRemove(null); await refresh(); return true;
    } catch (error) {
      if (alive.current && generation === epoch.current) {
        const rejected = !!error && typeof error === 'object' && 'confirmedRejected' in error && error.confirmedRejected === true;
        if (rejected) { pendingRef.current = null; setPending(null); }
        setNotice(rejected && error instanceof Error ? error.message : 'The server has not confirmed this choice. Retry the same request before changing it.');
      }
      return false;
    } finally { working.current = false; if (alive.current && generation === epoch.current) setBusy(false); }
  }
  function openForm(schedule?: Schedule) {
    setEditing(schedule ?? null); setChildId(schedule?.childId ?? children[0]?.id ?? ''); setQuestion(schedule?.question ?? questions[0]);
    setDays(schedule?.weekdays ?? [5]); setTime(schedule?.localTime ?? '17:00');
    setZone(schedule?.timezone ?? context.families.find(f => f.id === children[0]?.familyId)?.timezone ?? 'UTC'); setForm(true); setRemove(null); setNotice('');
  }
  async function prepare(recipientId: string, text: string, response: ResponsePreference, invitationId?: string) {
    if (!onPrepareConversation || working.current || pendingRef.current || !text.trim() || text.length > 5000) return false;
    const generation = epoch.current; working.current = true; setBusy(true); setNotice('');
    try {
      const checked = await accountRpc<{ recipientId: string; requiresReview: boolean }>(invitationId ? 'prepare_checkin_response' : 'prepare_little_conversation',
        invitationId ? { p_invitation_id: invitationId } : { p_recipient_id: recipientId }, context.user.id);
      if (!alive.current || generation !== epoch.current) return false;
      if (checked.recipientId !== recipientId || checked.requiresReview !== true) throw new Error('This connection is not available for review.');
      await onPrepareConversation({ recipientId, text, response });
      return alive.current && generation === epoch.current;
    } catch (error) {
      if (alive.current && generation === epoch.current) setNotice(error instanceof Error ? error.message : 'The connection could not be confirmed. Nothing was sent.');
      return false;
    } finally { working.current = false; if (alive.current && generation === epoch.current) setBusy(false); }
  }
  const validForm = !!selectedChild && question.trim().length > 0 && question.length <= 500 && days.length > 0 && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && zone.trim().length > 0;
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Button label="Back to account" quiet disabled={locked} onPress={onBack} />
    <Eyebrow>OPEN THE DOOR</Eyebrow><Heading large>An open door.{ '\n' }No need to rush.</Heading>
    <Body>Reply, come back later, or skip. These invitations have no scores or penalties.</Body>
    <Body muted>Invitations are checked when the child opens this screen. Background delivery and scheduled push notifications are not operational.</Body>
    {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 17, lineHeight: 25 }}>{notice}</Text>}
    {pending && <Paper><Body>The pending choice keeps the same request identity.</Body><Button label="Retry pending request" primary disabled={busy} onPress={() => { void mutate(); }} /></Paper>}
    <Button label={busy ? 'Checking invitations…' : 'Refresh invitations'} disabled={locked} onPress={() => { void refresh(); }} />
    {guardian ? <>
      <Body muted>You can manage schedules. A child’s decision to skip or set one aside is private; no completion report is shown.</Body>
      {schedules.map(schedule => <Paper key={schedule.id}><Body>{schedule.question}</Body><Body muted>To {schedule.childName} · {schedule.weekdays.map(day => weekdays[day - 1]).join(', ')} at {schedule.localTime} · {schedule.timezone}</Body>
        {!schedule.canIssue && <Body>This invitation is paused while the required connection or consent is unavailable.</Body>}
        <Button label={`Edit schedule for ${schedule.childName}`} disabled={locked} onPress={() => openForm(schedule)} />
        <Button label={`Remove schedule for ${schedule.childName}`} quiet disabled={locked} onPress={() => setRemove(schedule)} />
      </Paper>)}
      {!schedules.length && !busy && <Body>No schedules are saved. There is no child completion history to catch up on.</Body>}
      <Button label="New check-in schedule" primary disabled={locked || !children.length} onPress={() => openForm()} />
      {remove && <Paper><Heading>Remove this schedule?</Heading><Body>Future invitations stop. This does not reveal how anyone responded.</Body>
        <Button label="Remove schedule" disabled={locked} onPress={() => { void mutate({ rpc: 'remove_checkin_schedule', args: { p_schedule_id: remove.id, p_client_id: randomUUID() }, success: 'Schedule removed.' }); }} />
        <Button label="Keep schedule" quiet disabled={locked} onPress={() => setRemove(null)} /></Paper>}
      {form && <Paper><Heading>A question, not an obligation.</Heading><Eyebrow>RECIPIENT</Eyebrow>
        {children.filter(child => !editing || child.id === editing.childId).map(child => <Button key={child.id} label={child.name} selected={child.id === childId} disabled={locked} onPress={() => {
          setChildId(child.id); setZone(context.families.find(f => f.id === child.familyId)?.timezone ?? 'UTC');
        }} />)}
        {!locked ? <><Field label="Check-in question (up to 500 characters)" value={question} onChangeText={setQuestion} multiline />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{weekdays.map((day, index) => <Button key={day} label={day} selected={days.includes(index + 1)} onPress={() => setDays(current => current.includes(index + 1) ? current.filter(value => value !== index + 1) : [...current, index + 1].sort((a, b) => a - b))} />)}</View>
          <Field label="Time (24-hour HH:MM)" value={time} onChangeText={setTime} /><Field label="Timezone (for example America/New_York)" value={zone} onChangeText={setZone} /></> : <Body>Confirming the exact saved question and schedule.</Body>}
        <Eyebrow>PREVIEW FOR {selectedChild?.name ?? 'THE CHILD'}</Eyebrow><Body>{question || 'Your question will appear here.'}</Body>
        <Body muted>{days.map(day => weekdays[day - 1]).join(', ') || 'Choose a day'} at {time} · {zone}</Body><Body muted>Write a response · Answer later · Skip. The recipient chooses whether to share.</Body>
        <Button label="Save invitation schedule" primary disabled={locked || !validForm} onPress={() => { if (selectedChild) void mutate({ rpc: 'save_checkin_schedule', args: {
          p_family_id: selectedChild.familyId, p_child_id: selectedChild.id, p_question: question, p_weekdays: [...days], p_local_time: time, p_timezone: zone,
          p_client_id: randomUUID(), p_schedule_id: editing?.id ?? null, p_expected_revision: editing?.revision ?? null,
        }, success: 'Schedule saved. Background notification delivery is not connected.' }); }} />
        <Button label="Cancel schedule edit" quiet disabled={locked} onPress={() => setForm(false)} /></Paper>}
    </> : <>
      <Button label={showLater ? 'Hide invitations I set aside' : 'Show invitations I set aside'} disabled={locked} onPress={() => setShowLater(value => !value)} />
      {invitations.map(invitation => <InvitationCard key={`${context.user.id}/${invitation.id}`} invitation={invitation} disabled={locked} canPrepare={!!onPrepareConversation}
        onPrepare={(text, response) => prepare(invitation.fromId, text, response, invitation.id)}
        onDisposition={choice => mutate({ rpc: 'set_checkin_disposition', args: { p_invitation_id: invitation.id, p_choice: choice }, success: choice === 'skip' ? 'Skipped. You do not owe an answer.' : 'Set aside. No reminder will be sent.' })} />)}
      {!invitations.length && !busy && <Body>You have no new invitations. There is nothing you need to catch up on.</Body>}
    </>}
    <Divider /><Eyebrow>LITTLE CONVERSATIONS</Eyebrow><Body>Choose a question and answer it in your own words. This works for both children and adults.</Body>
    {questions.map(prompt => <Button key={prompt} label={prompt} selected={littleQuestion === prompt} disabled={locked || (!!littleWords && littleQuestion !== prompt)} onPress={() => setLittleQuestion(prompt)} />)}
    <Body>{littleQuestion}</Body>{!locked && <Field label="My own answer — optional" value={littleWords} onChangeText={setLittleWords} multiline />}
    <Body muted>Unsent words stay on this screen and are cleared when you leave. No question or journal text is copied into your answer.</Body>
    <Eyebrow>CHOOSE SOMEONE TO TALK WITH</Eyebrow>{peers.map(peer => <Button key={peer.id} label={peer.name} selected={littlePeer === peer.id} disabled={locked} onPress={() => setLittlePeer(peer.id)} />)}
    {!peers.length && <Body>No currently permitted connection is available. You can still prepare words for a conversation outside the app.</Body>}
    <ResponseChoices value={littleResponse} disabled={locked} onChange={setLittleResponse} />
    <Button label="Prepare my answer for review" primary disabled={locked || !onPrepareConversation || !littleWords.trim() || !peers.some(peer => peer.id === littlePeer)} onPress={() => { void prepare(littlePeer, littleWords, littleResponse).then(prepared => { if (prepared && alive.current) setLittleWords(''); }); }} />
    {!onPrepareConversation && <Body muted>Conversation review is not connected here. Nothing can be sent from this screen.</Body>}
  </ScrollView>;
}

function ResponseChoices({ value, onChange, disabled }: { value: ResponsePreference; onChange: (value: ResponsePreference) => void; disabled: boolean }) {
  return <View style={{ gap: 8 }}><Eyebrow>WHAT WOULD HELP?</Eyebrow>{([['listen', 'Please listen'], ['reply', 'I would like a reply'], ['talk', 'Can we talk?']] as const).map(([key, label]) =>
    <Button key={key} label={label} selected={value === key} disabled={disabled} onPress={() => onChange(key)} />)}</View>;
}
function InvitationCard({ invitation, disabled, canPrepare, onPrepare, onDisposition }: {
  invitation: Invitation; disabled: boolean; canPrepare: boolean;
  onPrepare: (text: string, response: ResponsePreference) => Promise<boolean>;
  onDisposition: (choice: 'skip' | 'defer') => Promise<boolean>;
}) {
  const [writing, setWriting] = useState(false), [words, setWords] = useState(''), [response, setResponse] = useState<ResponsePreference>('listen');
  const [confirm, setConfirm] = useState<'skip' | 'defer' | null>(null);
  function choice(value: 'skip' | 'defer') { if (words.trim()) setConfirm(value); else void onDisposition(value); }
  return <Paper><Body>{invitation.question}</Body><Body muted>From {invitation.fromName} · an optional invitation</Body>
    <Button label="Write my response" primary disabled={disabled} onPress={() => setWriting(true)} />
    <Button label="Can we talk?" disabled={disabled} onPress={() => { setWords('Can we talk?'); setWriting(true); setResponse('talk'); }} />
    <Button label="A small good thing happened" disabled={disabled} onPress={() => { setWords('A small good thing happened today. Can I tell you about it?'); setWriting(true); }} />
    {writing && <><Body muted>Only the words you choose. Nothing is shared until the separate review and send steps.</Body>
      {!disabled && <Field label="My response" value={words} onChangeText={setWords} multiline />}
      <ResponseChoices value={response} disabled={disabled} onChange={setResponse} />
      <Button label="Prepare response for review" primary disabled={disabled || !canPrepare || !words.trim()} onPress={() => { void onPrepare(words, response).then(prepared => { if (prepared) setWords(''); }); }} /></>}
    <Button label="Answer later" quiet disabled={disabled} onPress={() => choice('defer')} /><Button label="Skip this check-in" quiet disabled={disabled} onPress={() => choice('skip')} />
    {confirm && <><Body>Discard these unsent words and {confirm === 'skip' ? 'skip' : 'set this invitation aside'}? Nothing will be shared.</Body>
      <Button label={confirm === 'skip' ? 'Discard words and skip' : 'Discard words and answer later'} disabled={disabled} onPress={() => { void onDisposition(confirm).then(saved => { if (saved) { setWords(''); setConfirm(null); } }); }} />
      <Button label="Keep writing" quiet disabled={disabled} onPress={() => setConfirm(null)} /></>}
  </Paper>;
}
