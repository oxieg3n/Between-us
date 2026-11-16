import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { AppState, Keyboard, ScrollView, View } from "react-native";
import { Text } from "../adaptive-writing-text";
import { useAppearance } from "../appearance";
import { Body, Button, Divider, Eyebrow, Field, Heading, Paper } from "../ui";
import type { RecipientCategory } from "../journal-intelligence";
import { accountClient, accountRpc, type AccountContext } from "./client";
import { safePreparedContacts, type AuthorizedJournalContact } from "./journal-contacts";

export type CirclePreparation = {
  text: string;
  excludedContactIds: readonly string[];
  excludedCategories: readonly RecipientCategory[];
};
export type CircleProps = {
  context: AccountContext;
  onBack: () => void;
  onOpenConversation: (id: string, peerId: string) => void;
  preparation?: CirclePreparation;
  onPrepare?: (value: { conversationId: string; peerId: string; text: string }) => void;
};
type RequestRow = {
  id: string; familyId: string; subjectUserId: string; subjectChildId: string | null;
  subjectName: string; recipientEmail: string; sourceAccepted: boolean;
  status: "approvalRequired" | "pending" | "connected" | "expired" | "revoked";
  expiresAt: string | null;
};
type Invitation = { invitationId: string; token: string; expiresAt: string; status: "readyToShare"; delivery: "notSent" };
type SharedInvitation = Invitation & { subject: string; recipient: string };
type Section = "contacts" | "add" | "requests" | "redeem";
type Confirmation = { title: string; detail: string; label: string; work: (version: number) => Promise<void> };
type Rpc = <T>(name: string, args?: Record<string, unknown>, expectedUserId?: string) => Promise<T>;
type BoundRpc = <T>(name: string, args?: Record<string, unknown>) => Promise<T>;

export function circleGateway(expectedUserId: string, send: Rpc) {
  return <T,>(name: string, args: Record<string, unknown> = {}) => send<T>(name, args, expectedUserId);
}
export function circlePeer(contact: AuthorizedJournalContact, ownId: string): { id: string; name: string } | null {
  if (!contact.bothAccepted || (contact.a !== ownId && contact.b !== ownId)) return null;
  const id = contact.a === ownId ? contact.b : contact.a;
  const name = contact.a === ownId ? contact.bName : contact.aName;
  return id && id !== ownId && name?.trim() ? { id, name: name.trim() } : null;
}
export function circlePermittedContacts(rows: readonly AuthorizedJournalContact[], ownId: string): AuthorizedJournalContact[] {
  return rows.filter(row => row.bothAccepted && row.verified && row.canExchange && !row.revoked && !!circlePeer(row, ownId));
}
export function externalCircleToken(value: string): string {
  const token = value.trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Enter the complete one-use invitation token supplied by the known person.");
  return token;
}
export function circleGuardian(context: AccountContext, familyId: string | null): boolean {
  return context.user.kind === "parent" && context.user.state === "active" && !!familyId &&
    context.memberships.some(m => m.familyId === familyId && m.role === "guardian");
}
export async function openCircleConversation({ rpc, ownId, contactId, preparation, stillCurrent }: {
  rpc: BoundRpc; ownId: string; contactId: string; preparation?: CirclePreparation; stillCurrent: () => boolean;
}): Promise<{ conversationId: string; peerId: string; text?: string }> {
  const allowed = (rows: AuthorizedJournalContact[]) => preparation ? safePreparedContacts(rows, ownId, preparation) : circlePermittedContacts(rows, ownId);
  const fresh = await rpc<AuthorizedJournalContact[]>("list_contacts");
  if (!stillCurrent()) throw new Error("The account or screen changed. Choose a recipient again.");
  const selected = allowed(fresh).find(row => row.id === contactId), peer = selected && circlePeer(selected, ownId);
  if (!selected || !peer) throw new Error("This person is no longer available within the current permissions and recipient boundaries. Choose another permitted person or keep your words private.");
  const conversation = await rpc<{ id: string }>("create_conversation", { p_contact_id: selected.id });
  const after = await rpc<AuthorizedJournalContact[]>("list_contacts");
  if (!stillCurrent()) throw new Error("The account or screen changed. No prepared words were shared.");
  if (!allowed(after).some(row => row.id === selected.id && circlePeer(row, ownId)?.id === peer.id)) {
    throw new Error("Contact permissions changed. No prepared words were shared; refresh and choose another permitted person.");
  }
  return { conversationId: conversation.id, peerId: peer.id, ...(preparation ? { text: preparation.text } : {}) };
}

export function ProductionCircle(props: CircleProps) {
  return <CircleSession key={props.context.user.id} {...props}/>;
}

function CircleSession({ context, onBack, onOpenConversation, preparation, onPrepare }: CircleProps) {
  const { theme } = useAppearance();
  const ownId = context.user.id;
  const rpc = useMemo(() => circleGateway(ownId, accountRpc), [ownId]);
  const [contacts, setContacts] = useState<AuthorizedJournalContact[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [section, setSection] = useState<Section>("contacts");
  const [busy, setBusy] = useState(true), [notice, setNotice] = useState("");
  const [concealed, setConcealed] = useState(false);
  const [email, setEmail] = useState(""), [token, setToken] = useState("");
  const [familyChoice, setFamilyChoice] = useState(""), [childChoice, setChildChoice] = useState("");
  const [issued, setIssued] = useState<SharedInvitation | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [page, setPage] = useState(0);
  const alive = useRef(false), epoch = useRef(0), gate = useRef(false), scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const families = context.families.filter(f => context.memberships.some(m => m.familyId === f.id &&
    ((m.role === "guardian" && context.user.kind === "parent") || (m.role === "child" && context.user.kind === "child"))));
  const family = families.find(f => f.id === familyChoice) ?? families[0];
  const guardian = circleGuardian(context, family?.id ?? null);
  const managedChildren = context.children.filter(c => c.familyId === family?.id && guardian);
  const child = managedChildren.find(c => c.id === childChoice);
  const eligible = preparation ? safePreparedContacts(contacts, ownId, preparation) : contacts;
  const lastPage = Math.max(0, Math.ceil(eligible.length / 10) - 1);
  const currentPage = Math.min(page, lastPage);
  const visibleContacts = eligible.slice(currentPage * 10, currentPage * 10 + 10);
  const current = (version: number) => alive.current && epoch.current === version && AppState.currentState !== "background" && AppState.currentState !== "inactive";

  async function load(version: number) {
    const [rows, pending] = await Promise.all([
      rpc<AuthorizedJournalContact[]>("list_contacts"), rpc<RequestRow[]>("list_external_contact_requests"),
    ]);
    if (current(version)) { setContacts(rows); setRequests(pending); setConcealed(false); }
  }
  useEffect(() => {
    alive.current = true; const version = ++epoch.current;
    void Promise.all([rpc<AuthorizedJournalContact[]>("list_contacts"), rpc<RequestRow[]>("list_external_contact_requests")])
      .then(([rows, pending]) => { if (alive.current && epoch.current === version) { setContacts(rows); setRequests(pending); } })
      .catch(error => { if (alive.current && epoch.current === version) setNotice(error instanceof Error ? error.message : "Circle could not be loaded. Refresh before choosing a person."); })
      .finally(() => { if (alive.current && epoch.current === version) setBusy(false); });
    const conceal = () => {
      if (!alive.current) return;
      epoch.current++; gate.current = false; Keyboard.dismiss();
      setContacts([]); setRequests([]); setIssued(null); setToken(""); setConfirmation(null); setBusy(false); setConcealed(true);
      setNotice("Circle was concealed. Refresh current permissions before continuing. Hidden invitation tokens cannot be shown again; cancel an unrecoverable invitation before issuing a new one.");
    };
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") conceal();
    });
    const auth = accountClient?.auth.onAuthStateChange(event => {
      if (event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED") conceal();
    });
    return () => { alive.current = false; subscription.remove(); auth?.data.subscription.unsubscribe(); };
  }, [rpc]);

  function perform(work: (version: number) => Promise<void>) {
    if (gate.current) return;
    const version = epoch.current; gate.current = true; setBusy(true); setNotice("");
    void work(version).catch(error => {
      if (current(version)) { setContacts([]); setNotice(error instanceof Error ? error.message : "This action could not be confirmed. Refresh to check its current state."); }
    }).finally(() => { if (alive.current && epoch.current === version) { gate.current = false; setBusy(false); } });
  }
  function confirm(title: string, detail: string, label: string, work: Confirmation["work"]) {
    Keyboard.dismiss(); setConfirmation({ title, detail, label, work }); setNotice(""); scroll.current?.scrollTo({ y: 0, animated: false });
  }
  async function refresh(version: number) {
    await load(version);
    if (current(version)) setNotice("Current contact permissions loaded. Acceptance, approval and independent verification remain separate.");
  }
  async function open(row: AuthorizedJournalContact, version: number) {
    if (preparation && !onPrepare) throw new Error("This build cannot place prepared words into a conversation. Your words have not been sent.");
    const result = await openCircleConversation({ rpc, ownId, contactId: row.id, preparation, stillCurrent: () => current(version) });
    if (!current(version)) return;
    if (preparation && onPrepare) onPrepare({ conversationId: result.conversationId, peerId: result.peerId, text: preparation.text });
    else onOpenConversation(result.conversationId, result.peerId);
  }
  function mutation(name: string, args: Record<string, unknown>, success: string) {
    return async (version: number) => { await rpc(name, args); await load(version); if (current(version)) setNotice(success); };
  }
  function issue(args: Record<string, unknown>, subject: string, recipient: string, approvalId?: string) {
    return async (version: number) => {
      const result = approvalId
        ? await rpc<Invitation>("approve_external_contact_request", { p_invitation_id: approvalId })
        : await rpc<Invitation>("invite_external_contact", args);
      if (!current(version)) return;
      setIssued({ ...result, subject, recipient }); setEmail(""); setSection("requests"); scroll.current?.scrollTo({ y: 0, animated: false });
      await load(version);
      if (current(version)) setNotice("One-use invitation issued. No email, message or notification was sent. Share only through an already known person.");
    };
  }
  const controlsDisabled = busy || !!confirmation;
  if (context.user.state !== "active") return <View style={{ gap: 18, padding: 20 }}><Heading>My Circle</Heading><Body>Complete your own account setup and required approvals before using Circle.</Body><Button label="Back to account" onPress={onBack}/></View>;
  if (concealed) return <View style={{ gap: 18, padding: 20, backgroundColor: theme.background }}><Heading>Circle concealed</Heading><Body>{notice}</Body><Button label={busy ? "Checking current account…" : "Refresh current account permissions"} disabled={busy} onPress={() => perform(refresh)}/><Button label="Back without sharing" disabled={busy} onPress={onBack}/></View>;

  return <ScrollView ref={scroll} style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 56 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Button label={preparation ? "Back without sharing" : "Back to account"} quiet disabled={busy} onPress={onBack}/>
    <Eyebrow>MY CIRCLE</Eyebrow><Heading large>{preparation ? "Choose a permitted person" : "People you choose"}</Heading>
    <Body muted>Acceptance, guardian approval, consent and independent relationship verification are separate. A technical permission does not establish that a relationship is safe.</Body>
    {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 17, lineHeight: 25 }}>{notice}</Text>}
    {confirmation && <Paper><Heading>{confirmation.title}</Heading><Body>{confirmation.detail}</Body><Button label={confirmation.label} primary disabled={busy} onPress={() => { const work = confirmation.work; setConfirmation(null); perform(work); }}/><Button label="Cancel" disabled={busy} onPress={() => setConfirmation(null)}/></Paper>}
    {preparation && <Paper><Heading>Your separately prepared words</Heading><Text selectable style={{ color: theme.text, fontSize: 18, lineHeight: 27 }}>{preparation.text}</Text><Body muted>Choosing a person only opens a separately composed message for review. Nothing is sent from this screen. Contacts outside your recipient boundaries are omitted.</Body></Paper>}
    <Button label={busy ? "Checking current permissions…" : "Refresh Circle"} disabled={controlsDisabled} onPress={() => perform(refresh)}/>
    {!preparation && <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{([ ["contacts", "My contacts"], ["add", "Add or request a person"], ["requests", "Introductions and review"], ["redeem", "Accept outside invitation"] ] as const).map(([value, label]) => <View key={value} style={{ width: 180 }}><Button label={label} selected={section === value} disabled={controlsDisabled} onPress={() => { Keyboard.dismiss(); setSection(value); setNotice(""); setPage(0); scroll.current?.scrollTo({ y: 0, animated: false }); }}/></View>)}</ScrollView>}

    {(section === "contacts" || !!preparation) && <>
      {!eligible.length && <Body>{preparation ? "No currently permitted in-app recipient matches these boundaries. You can keep your words private and speak with another safe adult in person. Safety information does not require contact approval." : "No contact is ready here yet. Unknown recipient requests do not reveal whether an account exists; outside invitations must be shared through a known person."}</Body>}
      {visibleContacts.map(row => {
        const own = row.a === ownId || row.b === ownId, peer = circlePeer(row, ownId);
        const managed = !!row.managedChildId && circleGuardian(context, row.familyId);
        const title = peer?.name ?? (managed && row.managedChildName ? `${row.managedChildName}’s pending connection` : "Pending invitation");
        return <Paper key={row.id}><Heading>{title}</Heading>
          <Body>{row.revoked ? "Removed" : row.canExchange ? "Currently permitted connection" : row.bothAccepted ? "Acceptance recorded; messaging permissions are not complete or are unavailable" : "Independent acceptance is pending"}</Body>
          {!preparation && <Body muted>{row.verified ? "Relationship verification is recorded. Current consent, permissions and private blocks still apply." : "Independent relationship verification is required. This screen cannot mark a person verified."}</Body>}
          {own && row.canExchange && peer && <Button label={`${preparation ? "Choose for message review" : "Open conversation"}: ${peer.name}`} primary disabled={controlsDisabled || (!!preparation && !onPrepare)} onPress={() => perform(version => open(row, version))}/>}
          {!preparation && own && row.acceptedByMe === false && !row.revoked && <Button label="Review this invitation" disabled={controlsDisabled} onPress={() => confirm("Accept this introduction?", "This records only your own acceptance. Guardian approval and independent verification still apply; no message will be sent.", "Accept my invitation", mutation("accept_contact", { p_contact_id: row.id }, "Your acceptance was recorded. This alone does not permit messaging."))}/>}
          {!preparation && managed && !row.revoked && <Button label={`Review guardian approval for ${row.managedChildName ?? "your child"}`} disabled={controlsDisabled} onPress={() => confirm("Approve your child’s connection?", "Approve only the child you currently administer. Another child’s family must approve its own side. This cannot erase a private block or replace independent verification.", "Record guardian approval", mutation("approve_contact", { p_contact_id: row.id }, "Your approval was recorded. Verification, other-family approval and private blocks remain separate."))}/>}
          {!preparation && own && peer && <Button label={`Block ${peer.name}`} quiet disabled={controlsDisabled} onPress={() => confirm("Block this person?", "New messages in both directions and queued delivery will be prevented. Previously received history may remain for your own reporting. Guardian approval cannot undo your block.", "Block this person", mutation("block_user", { p_user_id: peer.id }, "Blocked. New in-app exchange is unavailable; this did not send a message."))}/>}
          {!preparation && (own || managed) && !row.revoked && <Button label={peer ? `Remove ${peer.name}` : "Decline or remove this connection"} quiet disabled={controlsDisabled} onPress={() => confirm("Remove this connection?", "Acceptance and verification will not revive this removed relationship. Queued delivery is suppressed. Shared history is handled separately.", "Remove connection", mutation("revoke_contact", { p_contact_id: row.id }, "Connection removed. No new messages are permitted."))}/>
          }
        </Paper>;
      })}
      {eligible.length > 10 && <View style={{ gap: 8 }}><Body muted>Contact page {currentPage + 1} of {lastPage + 1}</Body><Button label="Previous contacts" disabled={controlsDisabled || currentPage === 0} onPress={() => setPage(currentPage - 1)}/><Button label="Next contacts" disabled={controlsDisabled || currentPage === lastPage} onPress={() => setPage(currentPage + 1)}/></View>}
    </>}

    {!preparation && section === "add" && <>
      <Heading>A known person, deliberately</Heading>
      <Body muted>Use an identifier the person or their guardian has already shared with you. There is no person search or child directory. Fictional local accounts use .test addresses.</Body>
      {families.map(f => <Button key={f.id} label={`Family: ${f.name}`} selected={f.id === family?.id} disabled={controlsDisabled} onPress={() => { setFamilyChoice(f.id); setChildChoice(""); }}/>) }
      {!family && <Body>You can accept a received invitation without joining the other person’s family. Issuing a new family introduction requires your own current family authority.</Body>}
      {guardian && <Paper><Heading>Whose introduction?</Heading><Button label="My own account" selected={!child} disabled={controlsDisabled} onPress={() => setChildChoice("")}/>{managedChildren.map(c => <Button key={c.id} label={`Manage introduction for ${c.name}`} selected={child?.id === c.id} disabled={controlsDisabled} onPress={() => setChildChoice(c.id)}/>)}<Body muted>Managing your child’s contacts does not accept as the child, grant the other adult membership, or open anyone’s journal.</Body></Paper>}
      <Field label="Known person’s login email or child account alias" value={email} onChangeText={setEmail}/>
      {!!family && (guardian ? <Button label={child ? `Review outside introduction for ${child.name}` : "Review my outside introduction"} primary disabled={controlsDisabled || !email.trim()} onPress={() => confirm("Issue a one-use outside invitation?", `${child?.name ?? context.user.displayName} → ${email.trim()}. No account lookup or email delivery occurs. Share the token outside the app through an already known person; child acceptance and independent verification remain required.`, "Issue invitation; send nothing", issue({ p_family_id: family.id, p_child_id: child?.id ?? null, p_recipient_email: email.trim() }, child?.name ?? context.user.displayName, email.trim()))}/> : <Button label="Request an outside addition from my guardian" primary disabled={controlsDisabled || !email.trim()} onPress={() => confirm("Ask for this contact addition?", `${email.trim()}. Your guardian receives the addition request. This does not contact the person, disclose whether an account exists, or permit messaging.`, "Record my addition request", async version => { await rpc("request_external_contact", { p_family_id: family.id, p_recipient_email: email.trim() }); await load(version); if (current(version)) { setEmail(""); setSection("requests"); setNotice("Addition requested. No person was contacted and no account existence was confirmed."); } })}/>)}
      {!!family && !child && <><Divider/><Heading>Someone already in your family</Heading><Body muted>This request is for your own account. A child independently accepts their own invitation; guardian approval and verification still follow.</Body><Button label="Review my same-family request" disabled={controlsDisabled || !email.trim()} onPress={() => confirm("Request your own family connection?", `${email.trim()}. The result does not reveal whether the person has an account and never claims verification.`, "Record family request", mutation("request_contact", { p_family_id: family.id, p_recipient_email: email.trim() }, "Request recorded. Acceptance, approval and independent verification are still separate."))}/></>}
    </>}

    {!preparation && section === "requests" && <>
      <Heading>Introductions and review</Heading><Body muted>Latest 50 own or guardian-managed requests. Pending status does not reveal whether a recipient has an account or redeemed anything.</Body>
      {issued && <Paper><Heading>Ready to share outside the app</Heading><Body>{issued.subject} → {issued.recipient}</Body><Body>No email, in-app message or notification was sent.</Body><Text selectable accessibilityLabel="One-use outside contact invitation token" style={{ color: theme.text, fontSize: 17, lineHeight: 25 }}>{issued.token}</Text><Body muted>Expires: {issued.expiresAt}. Shown once and kept only in memory. Share only with the intended known recipient, never publicly. If lost, cancel this invitation before issuing another.</Body><Button label="Hide invitation token" disabled={controlsDisabled} onPress={() => setIssued(null)}/></Paper>}
      {!requests.length && <Body>No outgoing introductions are available.</Body>}
      {requests.map(row => <Paper key={row.id}><Heading>{row.subjectName}’s introduction</Heading><Body>Requested identifier: {row.recipientEmail}</Body><Body muted>{row.status === "approvalRequired" ? "Guardian review is required; nothing was sent" : row.status === "pending" ? "Pending independent steps; recipient status is private" : row.status}</Body>
        {row.status === "approvalRequired" && circleGuardian(context, row.familyId) && <Button label="Review this child contact request" disabled={controlsDisabled} onPress={() => confirm("Approve and issue this introduction?", `${row.subjectName} requested ${row.recipientEmail}. This issues a one-use token without contacting a recipient. Their independent identity, acceptance and relationship verification remain required.`, "Approve and issue token", issue({}, row.subjectName, row.recipientEmail, row.id))}/>}
        {row.status === "pending" && row.subjectUserId === ownId && !row.sourceAccepted && <Button label="Review my own acceptance" disabled={controlsDisabled} onPress={() => confirm("Accept this guardian-managed introduction?", `The intended identifier is ${row.recipientEmail}. This records your own choice and reveals no recipient account result. You may decline by cancelling the invitation.`, "Record my acceptance", mutation("accept_external_contact_source", { p_invitation_id: row.id }, "Your own acceptance was recorded. Other required permissions remain separate."))}/>}
        {!["revoked", "expired"].includes(row.status) && <Button label="Cancel or remove this introduction" quiet disabled={controlsDisabled} onPress={() => confirm("Cancel this introduction?", "The one-use invitation becomes unavailable. If already connected, the relationship and queued delivery are revoked. No new invitation overrides a private block.", "Cancel introduction", async version => { await rpc("revoke_external_contact_invite", { p_invitation_id: row.id }); if (issued?.invitationId === row.id && current(version)) setIssued(null); await load(version); if (current(version)) setNotice("Introduction cancelled. No new exchange is permitted through it."); })}/>}
      </Paper>)}
    </>}

    {!preparation && section === "redeem" && <>
      <Heading>An invitation from a known person</Heading><Body muted>Use the intended recipient’s own account. A parent cannot redeem as a child. Receiving a token does not establish safety, grant family membership, or bypass either family’s child approvals.</Body><Field label="One-use outside contact invitation token" value={token} onChangeText={setToken}/><Button label="Review invitation acceptance" primary disabled={controlsDisabled || !token.trim()} onPress={() => {
        try { const value = externalCircleToken(token); confirm("Accept this outside introduction?", "Confirm only your own acceptance. No message will be sent. Any child guardian approvals, current consent and independent verification are checked separately.", "Accept as my own account", async version => { await rpc("accept_external_contact_invite", { p_token: value }); if (current(version)) setToken(""); await load(version); if (current(version)) { setSection("contacts"); setNotice("Acceptance recorded. No family membership or financial authority was granted; messaging still requires every permission."); } }); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Check the invitation token."); }
      }}/>
    </>}
    <Body muted>No person is diagnosed, scored or required to disclose private writing. Safety information and seeking another safe adult never require Circle approval.</Body>
  </ScrollView>;
}
