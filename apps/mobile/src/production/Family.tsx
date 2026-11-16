import { useEffect, useRef, useState } from "react";
import { AppState, Modal, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../adaptive-writing-text";
import { useAppearance } from "../appearance";
import { Body, Button, Eyebrow, Heading, Paper } from "../ui";
import { accountClient, accountRpc, type AccountContext } from "./client";

type Member = { userId: string; displayName: string; kind: "parent" | "child"; role: "guardian" | "child"; childId: string | null; currentOwn: boolean };
type ShownMember = Member & { version: number };
type MemberPage = { members: Member[]; hasMore: boolean; nextBeforeUserId: string | null };
type Props = { context: AccountContext; onBack: () => void; onInvitations: (familyId?:string) => void; onChanged?: () => void | Promise<void> };
const familiesFor = (value: AccountContext) => value.user.kind === "parent" && value.user.state === "active"
  ? value.families.filter(family => value.memberships.some(member => member.familyId === family.id && member.role === "guardian")) : [];

export function ProductionFamily(props: Props) { return <FamilySession key={props.context.user.id} {...props} />; }

function FamilySession({ context, onBack, onInvitations, onChanged }: Props) {
  const { theme } = useAppearance(), ownId = context.user.id;
  const [fresh, setFresh] = useState<AccountContext | null>(null), [familyId, setFamilyId] = useState("");
  const [members, setMembers] = useState<ShownMember[]>([]), [hasMore, setHasMore] = useState(false), [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true), [covered, setCovered] = useState(false), [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<{ familyId: string; familyName: string; member: Member; version: number } | null>(null);
  const alive = useRef(false), generation = useRef(0), gate = useRef(false);
  const current = (version: number) => alive.current && generation.current === version && AppState.currentState === "active";
  const families = fresh ? familiesFor(fresh) : [], family = families.find(value => value.id === familyId);

  async function page(selectedFamily: string, before: string | null, version: number) {
    const result = await accountRpc<MemberPage>("list_family_members", { p_family_id: selectedFamily, p_limit: 50, p_before_user_id: before }, ownId);
    if (!current(version)) return;
    if (!result || !Array.isArray(result.members) || typeof result.hasMore !== "boolean" || result.hasMore && !result.nextBeforeUserId) throw new Error();
    const shown = result.members.map(member => ({ ...member, version }));
    setMembers(values => before ? [...values, ...shown.filter(member => !values.some(existing => existing.userId === member.userId))] : shown);
    setHasMore(result.hasMore); setCursor(result.nextBeforeUserId);
  }
  async function refresh(version: number, preferredFamily?: string) {
    const value = await accountRpc<AccountContext>("get_context", {}, ownId);
    if (!current(version)) return;
    if (value.user.id !== ownId || value.user.kind !== "parent" || value.user.state !== "active") throw new Error();
    const available = familiesFor(value), selected = available.find(item => item.id === preferredFamily) ?? available[0];
    setFresh(value); setFamilyId(selected?.id ?? ""); setMembers([]); setHasMore(false); setCursor(null); setConfirmation(null);
    if (selected) await page(selected.id, null, version);
    if (current(version)) setCovered(false);
  }
  useEffect(() => {
    let disposed = false; alive.current = true; const version = ++generation.current;
    void refresh(version).catch(() => { if (current(version)) { setFresh(null); setNotice("Family administration could not be verified. Refresh your current account access."); } }).finally(() => { if (current(version)) setBusy(false); });
    const conceal = () => {
      if (disposed || !alive.current) return;
      generation.current++; gate.current = false;
      setFresh(null); setMembers([]); setConfirmation(null); setHasMore(false); setCursor(null); setBusy(false); setCovered(true);
      setNotice("Family details are covered. Refresh current guardian access to continue.");
    };
    const appState = AppState.addEventListener("change", state => { if (state !== "active") conceal(); });
    const auth = accountClient?.auth.onAuthStateChange(event => { if (event !== "INITIAL_SESSION") conceal(); });
    return () => { disposed = true; alive.current = false; appState.remove(); auth?.data.subscription.unsubscribe(); };
    // This keyed account workspace retires every result on visibility/Auth boundaries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownId]);

  function perform(work: (version: number) => Promise<void>) {
    if (gate.current || AppState.currentState !== "active") return;
    const version = generation.current; gate.current = true; setBusy(true); setNotice("");
    void work(version).catch(() => {
      if (current(version)) { setMembers([]); setConfirmation(null); setHasMore(false); setCursor(null); setCovered(true); setNotice("This action could not be confirmed. Refresh to check current membership before trying again. The final active guardian cannot be removed here."); }
    }).finally(() => { if (current(version)) { gate.current = false; setBusy(false); } });
  }
  function selectFamily(selected: string) {
    if (gate.current) return;
    generation.current++; setMembers([]); setConfirmation(null);
    perform(version => refresh(version, selected));
  }
  function remove() {
    const selected = confirmation; if (!selected || covered || selected.familyId !== familyId || !current(selected.version)) return;
    setConfirmation(null);
    perform(async version => {
      // Re-read current guardian scope before dispatch; the removal RPC independently locks/rechecks it.
      const value = await accountRpc<AccountContext>("get_context", {}, ownId);
      if (!current(version)) return;
      if (value.user.id !== ownId || !familiesFor(value).some(item => item.id === selected.familyId)) throw new Error();
      await accountRpc("revoke_membership", { p_family_id: selected.familyId, p_user_id: selected.member.userId }, ownId);
      if (!current(version)) return;
      await refresh(version, selected.familyId);
      if (current(version)) { setNotice("Family membership removed. Current access has been refreshed. The person's own privacy tools remain separate."); void Promise.resolve().then(() => { if (current(version)) return onChanged?.(); }).catch(() => undefined); }
    });
  }

  return <ScrollView contentContainerStyle={styles.page}>
    <Button label="Back" quiet disabled={busy} onPress={onBack} />
    <Eyebrow>YOUR FAMILY</Eyebrow><Heading large>Family members</Heading>
    <Body muted>Active guardians manage membership. This never opens another person&apos;s account, journal, drafts or privacy cases.</Body>
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 17, lineHeight: 26 }}>{notice}</Text>}
    {busy && <Body muted>Checking current family access…</Body>}
    <Button label="Refresh family access" disabled={busy} onPress={() => perform(version => refresh(version, familyId))} />
    {!covered && fresh?.user.kind === "parent" && <>
      <Button label="Guardian invitation workflows" disabled={busy} onPress={()=>onInvitations(familyId||undefined)} />
      <Body muted>Use invitations to invite another guardian or join with a one-use invitation. Child setup and required consent remain separate.</Body>
      {!families.length && <Paper><Heading>No guardian family selected</Heading><Body>You can create or join a family through invitations and setup. No family directory is available until your own guardian membership is approved.</Body></Paper>}
      {families.length > 1 && <View style={styles.section}><Eyebrow>CHOOSE YOUR FAMILY</Eyebrow>{families.map(value => <Button key={value.id} label={value.name} selected={value.id === familyId} disabled={busy} onPress={() => selectFamily(value.id)} />)}</View>}
      {family && <>
        <Heading>{family.name}</Heading>
        <Body muted>Only active, currently approved members appear. Pending child setup and consent are available through invitations and setup. Removal ends that person&apos;s family permissions; it does not delete their independent account or private writing.</Body>
        <Body muted>The final active guardian cannot be removed through this screen. A reviewed dispute procedure is required; a parent checkbox cannot replace it.</Body>
        {!busy && !members.length && <Body muted>No currently approved members are available.</Body>}
        {members.map(member => <Paper key={member.userId}><Heading>{member.displayName || "Family member"}{member.currentOwn ? " (you)" : ""}</Heading><Body muted>{member.role === "guardian" ? "Guardian" : "Child / teen"}</Body><Button label={member.currentOwn ? "Remove my family membership" : `Remove ${member.displayName || "this member"} from this family`} disabled={busy} quiet onPress={() => { if (current(member.version) && !gate.current) setConfirmation({ familyId: family.id, familyName: family.name, member, version: member.version }); }} /></Paper>)}
        {hasMore && <Button label="Load more family members" disabled={busy || !cursor} onPress={() => perform(version => page(family.id, cursor, version))} />}
      </>}
    </>}
    {!fresh && !busy && !covered && <Body muted>Only an active, server-verified parent guardian can open family administration.</Body>}
    <Modal visible={!!confirmation && !covered} transparent animationType="none" onRequestClose={() => setConfirmation(null)}>
      <View style={[styles.modal, { backgroundColor: theme.background }]} accessibilityViewIsModal>
        {confirmation && <Paper><Heading>Remove {confirmation.member.displayName || "this member"}?</Heading><Body>Remove {confirmation.member.displayName || "this member"} from {confirmation.familyName}? Their family permissions end. Related guardian invitations and consent may be revoked. Their independent account, own privacy access and device journal are separate.</Body>{confirmation.member.currentOwn && <Body>You will lose your own access to this family&apos;s administration. The last active guardian cannot leave here.</Body>}<Button label="Keep membership" disabled={busy} onPress={() => setConfirmation(null)} /><Button label="Confirm family membership removal" disabled={busy} onPress={remove} /></Paper>}
      </View>
    </Modal>
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 24, paddingBottom: 48, gap: 18 }, section: { gap: 12 }, modal: { flex: 1, padding: 24, justifyContent: "center" } });
