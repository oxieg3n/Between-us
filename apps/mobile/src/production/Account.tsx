import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, View } from "react-native";
import { Text, TextInput } from "../adaptive-writing-text";
import { randomUUID } from 'expo-crypto';
import { useAppearance } from '../appearance';
import { Body, Button, Divider, Eyebrow, Heading, Paper } from '../ui';
import { accountApi, accountRpc, type AccountContext } from './client';

export type PrivacyIdentity = { userId: string; kind: 'parent' | 'child'; state: string };
type Session = { id: string; createdAt: string | null; current: boolean; deviceLabel: string };
type CaseStatus = { id: string; kind: 'report' | 'privacy' | 'job'; status: string; response: string | null; createdAt: string };
type Consent = { id: string; childId: string; status: string; noticeVersion: string; policyVersion: string; expiresAt: string | null; current: boolean };
type Job = { id: string; kind: string; status: string; stages?: string[]; blockers?: string[]; exportComplete?: boolean; deletionComplete?: boolean; journalIncluded?: boolean };
type Export = { id: string; status: string; data: unknown; completed: boolean; blockers?: string[]; journalIncluded?: boolean };
type Command = { kind: 'export' | 'deletion'; clientId: string };
type Props = {
  context?: AccountContext; identity?: PrivacyIdentity; onBack: () => void;
  onSignOut?: (expectedUserId?: string) => void | Promise<void>;
  onSignOutOthers?: (expectedUserId: string) => Promise<void>;
  onAccessChanged?: () => Promise<void>;
};

export function ProductionAccount(props: Props) {
  const id = props.context?.user.id ?? props.identity?.userId;
  if (!id) return <View style={{ padding: 20, gap: 16 }}><Heading>Sign in to your account.</Heading><Button label="Back" onPress={props.onBack} /></View>;
  return <AccountWorkspace key={id} {...props} userId={id} />;
}

function AccountWorkspace({ context, identity, userId, onBack, onSignOut, onSignOutOthers, onAccessChanged }: Props & { userId: string }) {
  const { theme } = useAppearance();
  const [profile, setProfile] = useState<PrivacyIdentity | null>(identity ?? null);
  const [sessions, setSessions] = useState<Session[]>([]), [cases, setCases] = useState<CaseStatus[]>([]), [consents, setConsents] = useState<Consent[]>([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [password, setPassword] = useState(''), [totp, setTotp] = useState('');
  const [purpose, setPurpose] = useState<'export' | 'deletion' | 'retrieve'>('export'), [reauthUntil, setReauthUntil] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null), [artifact, setArtifact] = useState<Export | null>(null), [confirmDelete, setConfirmDelete] = useState(false);
  const [withdraw, setWithdraw] = useState<{ childId: string; label: string } | null>(null), [confirmOthers, setConfirmOthers] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const alive = useRef(true), epoch = useRef(0), working = useRef(false), commandRef = useRef<Command | null>(null);
  const locked = busy || pending !== null;
  const current = (generation: number) => alive.current && epoch.current === generation;

  const refresh = useCallback(async () => {
    const [own, devices, statuses, permissions] = await Promise.all([
      accountRpc<PrivacyIdentity>('get_privacy_context', {}, userId), accountRpc<Session[]>('list_own_sessions', {}, userId),
      accountRpc<CaseStatus[]>('list_own_case_statuses', {}, userId), accountRpc<Consent[]>('list_own_consent_statuses', {}, userId),
    ]);
    if (own.userId !== userId) throw new Error('Sign in again to this account.');
    return { own, devices, statuses, permissions };
  }, [userId]);
  const apply = useCallback((data: Awaited<ReturnType<typeof refresh>>) => {
    setProfile(data.own); setSessions(data.devices); setCases(data.statuses); setConsents(data.permissions);
  }, []);
  useEffect(() => {
    alive.current = true; const generation = ++epoch.current;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { epoch.current++; working.current = false; setBusy(false); setPassword(''); setTotp(''); setArtifact(null); setReauthUntil(null); }
    });
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return; working.current = true; setBusy(true);
      try { const data = await refresh(); if (!cancelled && alive.current && epoch.current === generation) apply(data); }
      catch (error) { if (!cancelled && alive.current && epoch.current === generation) setNotice(error instanceof Error ? error.message : 'Account details are unavailable.'); }
      finally { if (!cancelled && alive.current && epoch.current === generation) { working.current = false; setBusy(false); } }
    });
    return () => { cancelled = true; alive.current = false; epoch.current = generation + 1; subscription.remove(); };
  }, [apply, refresh]);

  async function run(action: () => Promise<void>) {
    if (working.current) return;
    const generation = epoch.current; working.current = true; setBusy(true); setNotice('');
    try { await action(); }
    catch (error) { if (current(generation)) setNotice(error instanceof Error ? error.message : 'The server could not confirm this action.'); }
    finally { if (current(generation)) { working.current = false; setBusy(false); } }
  }
  async function reload() {
    const generation = epoch.current;
    await run(async () => { const data = await refresh(); if (current(generation)) apply(data); });
  }
  async function reauthenticate() {
    if (!password || pending) return;
    const generation = epoch.current, secret = password, code = totp.trim();
    setPassword(''); setTotp(''); setArtifact(null); setReauthUntil(null);
    await run(async () => {
      const result = await accountApi<{ expiresAt: string }>('/v1/privacy/reauthenticate', { password: secret, ...(code ? { totp: code } : {}) }, userId);
      if (!current(generation)) return;
      setReauthUntil(result.expiresAt); setNotice('Account check confirmed for a short time. Choose the separate action below.');
    });
  }
  async function request(kind?: Command['kind']) {
    if (working.current) return;
    const command = commandRef.current ?? (kind ? { kind, clientId: randomUUID() } : null);
    if (!command) return;
    const generation = epoch.current; commandRef.current = command; setPending(command); setArtifact(null);
    await run(async () => {
      try {
        const result = await accountRpc<Omit<Job, 'kind'>>(command.kind === 'export' ? 'request_own_export' : 'request_own_deletion', { p_client_id: command.clientId }, userId);
        if (!current(generation)) return;
        commandRef.current = null; setPending(null); setJob({ ...result, kind: command.kind }); setConfirmDelete(false);
        setNotice('Request recorded. Independent review and execution are separate; no completion is promised.');
        const data = await refresh(); if (current(generation)) apply(data);
      } catch (error) {
        if (current(generation)) {
          const rejected = !!error && typeof error === 'object' && 'confirmedRejected' in error && error.confirmedRejected === true;
          if (rejected) { commandRef.current = null; setPending(null); }
          else setNotice('The request is not confirmed. Retry the same request before starting another.');
        }
        throw error;
      }
    });
  }
  async function loadJob(id: string) {
    const generation = epoch.current; setArtifact(null);
    await run(async () => { const result = await accountRpc<Job>('get_own_privacy_job', { p_job_id: id }, userId); if (current(generation)) setJob(result); });
  }
  async function retrieve(allowPartial: boolean) {
    if (!job || job.kind !== 'export') return;
    const generation = epoch.current; setArtifact(null);
    await run(async () => {
      const result = await accountRpc<Export>('get_own_export', { p_job_id: job.id, p_allow_partial: allowPartial }, userId);
      if (current(generation)) { setArtifact(result); setNotice(result.completed ? 'The available own-data export is shown below. It contains no local journal.' : 'This export is incomplete or expired. Review its status and blockers.'); }
    });
  }
  async function withdrawConsent() {
    if (!withdraw) return;
    const generation = epoch.current, childId = withdraw.childId;
    await run(async () => {
      await accountRpc('withdraw_consent', { p_child_id: childId }, userId);
      if (!current(generation)) return;
      setWithdraw(null); setArtifact(null); setNotice('Consent withdrawn. Family communication and finance access stops; this is not data deletion.');
      const data = await refresh(); if (current(generation)) apply(data);
      await onAccessChanged?.();
    });
  }
  const ownChild = context?.memberships.find(m => m.role === 'child')?.childId;
  const guardianChildren = context?.children.filter(c => context.memberships.some(m => m.familyId === c.familyId && m.role === 'guardian')) ?? [];
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Button label="Back" quiet disabled={locked} onPress={onBack} /><Eyebrow>YOUR ACCOUNT</Eyebrow><Heading large>Your access.{ '\n' }Your choices.</Heading>
    <Body>{profile ? `${profile.kind === 'child' ? 'Child / teen' : 'Guardian'} account · ${profile.state}` : 'Checking your own account…'}</Body>
    {!context && <Body>Only your account and privacy information is available here. This screen does not restore family, message or money access.</Body>}
    {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 17, lineHeight: 25 }}>{notice}</Text>}
    <Button label="Refresh own account information" disabled={locked} onPress={() => { void reload(); }} />
    <Paper><Heading>Signed-in sessions</Heading><Body muted>These are account sessions, not verified device identities. No location or IP address is shown. At most 50 are listed.</Body>
      {sessions.map(session => <View key={session.id}><Body>{session.deviceLabel}{session.current ? ' · this session' : ''}</Body><Body muted>{session.createdAt ?? 'Creation time unavailable'}</Body></View>)}
      {!!onSignOutOthers && <Button label="Sign out other sessions" disabled={locked} onPress={() => setConfirmOthers(true)} />}
      {confirmOthers && <><Body>End the other managed sign-in sessions for this account? Your current session stays signed in.</Body><Button label="Confirm sign out of other sessions" disabled={locked} onPress={() => {
        const generation = epoch.current; void run(async () => { await onSignOutOthers?.(userId); if (!current(generation)) return; setConfirmOthers(false); const data = await refresh(); if (current(generation)) { apply(data); setNotice('Other sessions were signed out.'); } });
      }} /><Button label="Keep other sessions" quiet disabled={locked} onPress={() => setConfirmOthers(false)} /></>}
      {!!onSignOut && <Button label="Sign out" quiet disabled={locked} onPress={() => { void onSignOut(userId); }} />}
    </Paper>
    <Paper><Heading>Own case status</Heading><Body muted>Only your own submitted case and job statuses appear, latest 50. Evidence is not shown here. Public report intake and staffed-response promises are not operational.</Body>
      {cases.map(item => <View key={`${item.kind}/${item.id}`} style={{ gap: 6, marginBottom: 12 }}><Body>{item.kind} · {item.status}</Body><Text selectable style={{ color: theme.muted }}>{item.id}</Text>{!!item.response && <Body>{item.response}</Body>}
        {item.kind === 'job' && <Button label="View this job status" disabled={locked} onPress={() => { void loadJob(item.id); }} />}</View>)}
      {!cases.length && <Body>No own cases are listed.</Body>}
    </Paper>
    <Divider /><Eyebrow>OWN DATA REQUESTS</Eyebrow><Body>These actions concern server records for your own identity. They do not include this device&apos;s journal, another author&apos;s writing or a child&apos;s private report through a guardian account.</Body>
    <Body>Fresh managed-account authentication is required to request or retrieve an export and to request deletion. A reviewed privacy policy/operator is still required; current public gates remain closed.</Body>
    {!pending && <Paper><Heading>Confirm your own account</Heading><Body>Purpose: {purpose === 'retrieve' ? 'retrieve an available own-data export' : purpose === 'deletion' ? 'request deletion of your own server data' : 'request an own-data export'}.</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['export', 'deletion', 'retrieve'] as const).map(value => <Button key={value} label={value === 'retrieve' ? 'Retrieve export' : value === 'deletion' ? 'Request deletion' : 'Request export'} selected={purpose === value} disabled={busy} onPress={() => { setPurpose(value); setConfirmDelete(false); setPassword(''); setTotp(''); setArtifact(null); }} />)}</View>
      <Body muted>Enter this account&apos;s password. If it has a verified authenticator factor, its current code is also required. These values are cleared after this attempt or when the app backgrounds.</Body>
      <TextInput accessibilityLabel="Current account password" placeholder="Current account password" placeholderTextColor={theme.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} style={{ color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 17 }} />
      <TextInput accessibilityLabel="Authenticator code if required" placeholder="Authenticator code if required" placeholderTextColor={theme.muted} value={totp} onChangeText={setTotp} keyboardType="number-pad" autoCapitalize="none" autoCorrect={false} maxLength={8} editable={!busy} style={{ color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 17 }} />
      <Button label="Confirm my account for this action" primary disabled={busy || !password} onPress={() => { void reauthenticate(); }} />
      {!!reauthUntil && <Body muted>Server confirmation expires at {reauthUntil}. The server checks freshness again for each action.</Body>}
      {purpose === 'export' && <Button label="Request my own export" disabled={busy || !reauthUntil} onPress={() => { void request('export'); }} />}
      {purpose === 'deletion' && <><Button label="Review deletion request" disabled={busy || !reauthUntil} onPress={() => setConfirmDelete(true)} />{confirmDelete && <>
        <Body>Request review and staged deletion of your own server data? Access may be revoked when executed. Shared records, legal holds, managed Auth/provider records and backups can remain blocked. This does not erase your local journal or another person&apos;s copies.</Body>
        <Button label="Confirm my deletion request" disabled={busy || !reauthUntil} onPress={() => { void request('deletion'); }} /><Button label="Cancel deletion request" quiet disabled={busy} onPress={() => setConfirmDelete(false)} /></>}</>}
    </Paper>}
    {pending && <Paper><Body>A {pending.kind} request has not been confirmed. Retrying keeps its original request identity.</Body><Button label="Retry the same privacy request" disabled={busy} onPress={() => { void request(); }} /></Paper>}
    {job && <Paper><Heading>Own {job.kind} job</Heading><Text selectable style={{ color: theme.text }}>{job.id}</Text><Body>Status: {job.status}</Body><Body muted>Export complete: {job.exportComplete === true ? 'yes' : 'no'}. Full deletion complete: no. Local journal included: no.</Body>
      {!!job.stages?.length && <Body>Executed stages: {job.stages.join(', ')}</Body>}{!!job.blockers?.length && <Body>Remaining blockers: {job.blockers.join(', ')}</Body>}
      <Button label="Refresh this job status" disabled={locked} onPress={() => { void loadJob(job.id); }} />
      {job.kind === 'export' && <><Body>After a fresh account check, choose whether to display a complete or explicitly incomplete export here. Nothing is downloaded, copied or shared automatically.</Body>
        <Button label="Show complete own export JSON" disabled={locked || !reauthUntil} onPress={() => { void retrieve(false); }} />
        <Button label="Show available partial own export JSON" disabled={locked || !reauthUntil} onPress={() => { void retrieve(true); }} /></>}
    </Paper>}
    {artifact && <Paper><Heading>{artifact.completed ? 'Available own-data export' : 'Incomplete / expired export'}</Heading><Body>Server status: {artifact.status}. Keep this screen private. Selecting text is your choice; no public Downloads file or share action was created.</Body>
      <Text selectable style={{ color: theme.text, fontSize: 13 }}>{JSON.stringify(artifact, null, 2)}</Text><Button label="Hide export from screen" quiet onPress={() => setArtifact(null)} /></Paper>}
    <Divider /><Heading>Consent versions and access</Heading><Body muted>These are only permitted own/guardian version records, not verification evidence, journal access or reports. Every child and teen is set up together with a guardian; this does not replace their own acceptance or legally required teen consent.</Body>
    {consents.map(consent => <View key={consent.id}><Body>{consent.status} · notice {consent.noticeVersion} · policy {consent.policyVersion}</Body><Body muted>{consent.current ? 'Verified and unexpired record' : 'Not a current verified record'}{consent.expiresAt ? ` · expiry ${consent.expiresAt}` : ''}</Body></View>)}
    {!!ownChild && <Button label="Withdraw my own consent" disabled={locked} onPress={() => setWithdraw({ childId: ownChild, label: 'your own child / teen account' })} />}
    {guardianChildren.map(child => <Button key={child.id} label={`Review consent withdrawal for ${child.name}`} disabled={locked} onPress={() => setWithdraw({ childId: child.id, label: child.name })} />)}
    {withdraw && <Paper><Heading>Withdraw consent for {withdraw.label}?</Heading><Body>This stops family communication and money access for this child account. It does not delete data, expose private reports or unlock journals. A child can withdraw their own consent without a guardian&apos;s permission. Safety information and seeking another safe adult remain available.</Body>
      <Button label="Confirm consent withdrawal" disabled={locked} onPress={() => { void withdrawConsent(); }} /><Button label="Keep consent unchanged" quiet disabled={locked} onPress={() => setWithdraw(null)} /></Paper>}
    <Body muted>Disputed guardianship and another person&apos;s data request require independent review. This screen offers no guardian impersonation or private-journal export.</Body>
  </ScrollView>;
}
