import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AppState, BackHandler, Keyboard, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { WritingKeyboardView } from "../writing-keyboard-view";
import * as ScreenCapture from "expo-screen-capture";
import { useAppearance } from "../appearance";
import { Text, TextInput } from "../adaptive-writing-text";
import { Body, Button, Eyebrow, Heading, Paper } from "../ui";
import { type RecipientCategory, type SuggestionResult } from "../journal-intelligence";
import { LOCAL_MODEL, downloadAndLoadModel, getLocalModelAdapter, getLocalModelStatus, loadDownloadedModel, unloadLocalModel } from "../local-model";
import { accountClient, accountRpc, AccountRpcError, backendUrl, verifiedSessionClaims, readAccountBoundary, getJournalSessionLease, isTransientAccountFailure, getAccountProofCandidate, getVerifiedAccountUser, getVerifiedAccountContext, type AccountContext } from "./client";
import { createJournalRefreshCoordinator, verifyJournalAccess, JournalAccessError } from "./journal-access";
import {createJournalOfflineLease,type JournalLocalAvailability} from './journal-offline-lease';
import { journalContacts, safePreparedContacts, type AuthorizedJournalContact } from "./journal-contacts";
import { createJournalModelController, type JournalModelController } from "./journal-model";
import { createJournalDraftProtection, type JournalDraftProtection, type JournalDraftStatus } from "./journal-draft";
import { createJournalExportReview, eraseOwnJournalStorage, MAX_JOURNAL_REVIEW_PAGES, type JournalStorageScope } from "./journal-storage-controls";
import { createProtectedNativeVaultController } from "./vault/platform";
import {createPrivateScreenCaptureLease} from './private-screen-capture-lease';
import { VaultError, type EntrySummary, type PrivateDraft, type VaultController, type VaultEntry } from "./vault";

export type PreparedJournalConversation = {
  text: string;
  excludedContactIds: string[];
  excludedCategories: RecipientCategory[];
};
type Editor = { id?: string; revision: number | null; title: string; body: string; originalTitle: string; originalBody: string; protectedDraft?: PrivateDraft };
type DraftSummary = EntrySummary & { kind: PrivateDraft["kind"] };
type Confirmation = { title: string; description: string; label: string; requiredText?: string; action: () => void };
const emptyEditor = (): Editor => ({ title: "", body: "", originalTitle: "", originalBody: "", revision: null });
const dirty = (editor: Editor | undefined) => !!editor && (editor.title !== editor.originalTitle || editor.body !== editor.originalBody);
const savedEditor = (entry: VaultEntry): Editor => ({ id: entry.id, revision: entry.revision, title: entry.title, body: entry.body, originalTitle: entry.title, originalBody: entry.body });
const allRecipientCategories: RecipientCategory[] = ["trusted-person", "trusted-adult", "parent", "teacher", "sibling", "friend", "child", "co-parent"];
function accountAccessFailure(error: unknown) {
  if(error instanceof JournalAccessError)return error;
  return new JournalAccessError(isTransientAccountFailure(error)?'unavailable':'denied');
}
async function verifyManagedAccess(subject: string, signal?: AbortSignal) {
  if (!accountClient || !backendUrl) throw new JournalAccessError();
  async function checked<T>(work:()=>Promise<T>) {try{return await work();}catch(error){throw accountAccessFailure(error);}}
  return verifyJournalAccess({
    getSession:async()=>getAccountProofCandidate(),
    getUser:token=>checked(()=>getVerifiedAccountUser(token,subject)),
    getClaims:token=>checked(async()=>{const {data,error}=await verifiedSessionClaims(token,subject);if(error)throw error;return data?.claims??null;}),
    getContext:token=>checked(()=>getVerifiedAccountContext(token,subject)),
    getLease:token=>checked(()=>getJournalSessionLease(token,subject)),
    readAccountBoundary,monotonicNow:()=>performance.now(),
  }, { issuer: `${backendUrl}/auth/v1`, subject }, signal);
}
function errorMessage(error: unknown) {
  if (error instanceof JournalAccessError) return error.message;
  if (!(error instanceof VaultError)) return "This action could not finish. Your writing was not sent anywhere. Unlock again to check the saved page.";
  switch (error.code) {
    case "unsupported": return "Private device storage is unavailable. Use a compatible native build with SQLCipher, device protection and verified backup exclusions. No plaintext fallback is used.";
    case "identity-mismatch": return "This installation belongs to another enrolled author. A family administrator cannot unlock or replace their pages.";
    case "key-unavailable": return "The device key is unavailable, or no journal has been enrolled. An existing vault is never reset automatically. Device-key loss can be permanent.";
    case "recovery-required": return "Local setup or deletion was interrupted, or a vault file is unavailable. Your existing files have not been replaced. Recovery requires a reviewed own-author process.";
    case "already-enrolled": return "A journal already exists on this installation. Use Unlock saved pages; creating another one cannot replace it.";
    case "conflict": return "This page changed. Your current words remain here. Reopen the saved page only after protecting or copying your edits yourself.";
    case "quota": return "The device journal is full. Remove a page you no longer need before saving more writing.";
    case "invalid-input": return "Check the writing length and add a few words before saving.";
    case "locked": case "cancelled": return "The journal is locked. Unlock your own pages again when you are ready.";
    default: return "Private storage could not finish. No vault was reset. Unlock again to check whether the last save completed.";
  }
}

/** Native device journal only. The caller must also own global session, capture and privacy barriers. */
export function ProductionJournal({ context, onBack, onPrepareConversation, onOpenSafety, onLocalAccessChange }: {
  context: AccountContext;
  onBack: () => void;
  onPrepareConversation?: (value: PreparedJournalConversation) => void;
  onOpenSafety?: () => void;
  onLocalAccessChange?: (value:JournalLocalAvailability|null)=>void;
}) {
  const { theme } = useAppearance();
  const captureId = useId(), captureGeneration = useRef(0), busyGate = useRef(false);
  const vault = useRef<VaultController | undefined>(undefined);
  const lifetime = useRef(0), mounted = useRef(false), sessionAbort = useRef<AbortController | undefined>(undefined);
  const verified = useRef<Awaited<ReturnType<typeof verifyJournalAccess>> | undefined>(undefined);
  const refreshGuard = useRef<ReturnType<typeof createJournalRefreshCoordinator> | undefined>(undefined);
  const model = useRef<JournalModelController | undefined>(undefined), journalOpen = useRef(false), refreshing = useRef(false);
  const modelOperation = useRef(0), modelPending = useRef(false);
  const draftProtection = useRef<JournalDraftProtection | undefined>(undefined), draftStamp = useRef<string | undefined>(undefined), draftSerial = useRef(0), draftCovered = useRef(false);
  const exportReview = useRef<ReturnType<typeof createJournalExportReview> | undefined>(undefined), erasing = useRef(false);
  const offlineLease=useRef<ReturnType<typeof createJournalOfflineLease>|undefined>(undefined),proofRevision=useRef(0);
  const localAccessChanged=useRef(onLocalAccessChange);
  const contactCache = useRef<{ subject: string; rows: AuthorizedJournalContact[]; known: boolean } | undefined>(undefined);
  const latestContactRefresh=useRef<((subject:string,version:number)=>Promise<void>)|undefined>(undefined);
  const ideaOperation = useRef(0), latestFind = useRef<((automatic?: boolean) => void) | undefined>(undefined), autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<"starting" | "locked" | "open" | "unsupported">("starting");
  const [concealed, setConcealed] = useState(false), [captureReady, setCaptureReady] = useState(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [entries, setEntries] = useState<EntrySummary[]>([]), [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [editor, setEditor] = useState<Editor | undefined>(undefined), [ideas, setIdeas] = useState<SuggestionResult | undefined>(undefined);
  const [prepared, setPrepared] = useState<PreparedJournalConversation | undefined>(undefined);
  const [confirmation, setConfirmation] = useState<Confirmation | undefined>(undefined);
  const [acknowledged, setAcknowledged] = useState(false);
  const [unlockedAuthor, setUnlockedAuthor] = useState<string | undefined>(undefined);
  const [refreshConcealed, setRefreshConcealed] = useState(false), [modelBusy, setModelBusy] = useState(false);
  const [modelView, setModelView] = useState(() => ({ ...getLocalModelStatus(), enabled: false }));
  const [ideasWhileWriting, setIdeasWhileWriting] = useState(false), [finding, setFinding] = useState(false);
  const [draftStatus, setDraftStatus] = useState<JournalDraftStatus>("clean");
  const [storageShown, setStorageShown] = useState(false), [selectedExport, setSelectedExport] = useState<string[]>([]), [exportText, setExportText] = useState<string | undefined>(undefined);
  const [confirmationWords, setConfirmationWords] = useState("");
  const [localOnly,setLocalOnly]=useState(false);
  const [localAccess,setLocalAccess]=useState<JournalLocalAvailability|null>(null);
  const leaseSubscribe=useCallback((listener:()=>void)=>localAccess?offlineLease.current?.subscribe(listener)??(()=>{}):(()=>{}),[localAccess]);
  const leaseSnapshot=useCallback(()=>localAccess?offlineLease.current?.snapshot()??false:false,[localAccess]);
  const leaseVisible=useSyncExternalStore(leaseSubscribe,leaseSnapshot,()=>false);
  const retireIdeas = useCallback(() => { ideaOperation.current++; clearTimeout(autoTimer.current); model.current?.cancelSuggestion(); }, []);
  const cancelIdeas = useCallback(() => { retireIdeas(); setFinding(false); setIdeas(undefined); }, [retireIdeas]);
  const storageScope = useCallback((): JournalStorageScope | undefined => {
    const access = verified.current;
    return mounted.current && journalOpen.current && !refreshing.current && !draftCovered.current && AppState.currentState === "active" && access?.actor.subject === context.user.id && offlineLease.current?.allowed()
      ? { stamp: String(lifetime.current), actor: access.actor } : undefined;
  }, [context.user.id]);

  const clearPrivate = useCallback(() => {
    lifetime.current += 1; verified.current = undefined; sessionAbort.current?.abort(); sessionAbort.current = undefined;
    offlineLease.current?.clear();proofRevision.current++;
    journalOpen.current = false; refreshGuard.current?.cancel(); refreshing.current = false;
    draftProtection.current?.cancel(); draftStamp.current = undefined;
    exportReview.current?.clear();
    modelOperation.current++; modelPending.current = false; void model.current?.invalidate().catch(() => undefined);
    ideaOperation.current++; clearTimeout(autoTimer.current); contactCache.current = undefined;
    busyGate.current = erasing.current;
    Keyboard.dismiss();
    if (!mounted.current) return;
    setEntries([]); setDrafts([]); setEditor(undefined); setIdeas(undefined); setPrepared(undefined); setConfirmation(undefined); setConfirmationWords(""); setAcknowledged(false); setUnlockedAuthor(undefined); setBusy(erasing.current); setStatus("locked"); setRefreshConcealed(false); setModelBusy(false); setModelView({ ...getLocalModelStatus(), enabled: false }); setIdeasWhileWriting(false); setFinding(false);
    setStorageShown(false); setSelectedExport([]); setExportText(undefined);setLocalOnly(false);
    setDraftStatus("clean"); setNotice(erasing.current ? "Private storage deletion is in progress. Wait for confirmation before leaving or sharing this device." : "Journal locked. Saved pages and confirmed protected drafts stay on this device. Edits still waiting to be protected were cleared.");
  }, []);

  useEffect(()=>{localAccessChanged.current=onLocalAccessChange;},[onLocalAccessChange]);

  useEffect(() => {
    mounted.current = true; let disposed = false;
    let capture:ReturnType<typeof createPrivateScreenCaptureLease>|undefined,captureConfirmed=false;
    offlineLease.current=createJournalOfflineLease({
      now:()=>performance.now(),boundary:readAccountBoundary,lifetime:()=>lifetime.current,current:()=>verified.current,
      changed:value=>{if(mounted.current)setLocalAccess(value);localAccessChanged.current?.(value);},
      invalidate:()=>{if(!disposed){const controller=vault.current;if(controller)void controller.lock('manual').catch(()=>undefined);else clearPrivate();}},
    });
    exportReview.current = createJournalExportReview({
      current: () => storageScope(),
      prepare: ids => { const controller = vault.current; if (!controller) throw new VaultError("locked"); return controller.preparePlaintextExport(ids); },
      changed: text => { if (!disposed && mounted.current) setExportText(text); },
    });
    draftProtection.current = createJournalDraftProtection({
      authorized: stamp => !disposed && mounted.current && stamp === draftStamp.current && journalOpen.current && !refreshing.current && !draftCovered.current && AppState.currentState === "active" && verified.current?.actor.subject === context.user.id && offlineLease.current?.allowed()===true,
      save: input => { const controller = vault.current; if (!controller) throw new VaultError("locked"); return controller.saveDraft(input); },
      changed: value => {
        if (disposed || value.stamp !== draftStamp.current) return;
        setDraftStatus(value.status);
        if (value.draft) {
          const { id, title, createdAt, updatedAt, revision, kind } = value.draft;
          setDrafts(values => [{ id, title, createdAt, updatedAt, revision, kind }, ...values.filter(draft => draft.id !== id)]);
        }
      },
    });
    model.current = createJournalModelController({ status: getLocalModelStatus, adapter: getLocalModelAdapter, download: downloadAndLoadModel, load: loadDownloadedModel, unload: unloadLocalModel }, () => {
      const access = verified.current;
      return mounted.current && journalOpen.current && !refreshing.current && AppState.currentState === "active" && access?.actor.subject === context.user.id && offlineLease.current?.allowed()
        ? `${access.actor.issuer}/${access.actor.subject}/${access.actor.sessionId}/${lifetime.current}` : undefined;
    });
    refreshGuard.current = createJournalRefreshCoordinator({
      current: () => verified.current,
      verify: (previous, signal) => verifyManagedAccess(previous.actor.subject, signal),
      commit: next => {
        if(!offlineLease.current?.renew(next))throw new JournalAccessError();
        verified.current = next;proofRevision.current++;setLocalOnly(false);
        void latestContactRefresh.current?.(next.actor.subject,lifetime.current);
      },
      conceal: value => { refreshing.current = value; if (value) draftProtection.current?.suspend(); else draftProtection.current?.resume(); if (!disposed) setRefreshConcealed(value); },
      beforeVerification: () => { if (!disposed) { cancelIdeas(); exportReview.current?.hide(); } },
      invalidate: () => { clearPrivate(); void vault.current?.lock("revoked").catch(() => undefined); },
      unavailable: () => { if (!disposed) {setLocalOnly(true);setNotice("Online account checks are temporarily unavailable. Your already unlocked private journal can continue within its original local window. Sending and account actions still need verification.");} },
      continuation:()=>!disposed&&journalOpen.current&&offlineLease.current?.allowed()===true,
    });
    const captureKey = `production-journal-${captureId}-${++captureGeneration.current}`;
    void (async () => {
        await Promise.resolve(); if (disposed) return;
        clearPrivate(); draftCovered.current = false; setStatus("starting"); setCaptureReady(false); setConcealed(false);
        if (Platform.OS === "web") { setStatus("unsupported"); setNotice("The browser cannot open this encrypted device journal. A compatible Android or iOS build is required; no browser journal storage is created."); return; }
        try {
          capture=createPrivateScreenCaptureLease({
            newTag:()=>captureKey,
            protect:tag=>ScreenCapture.preventScreenCaptureAsync(tag),release:tag=>ScreenCapture.allowScreenCaptureAsync(tag),
            onReady:()=>{captureConfirmed=true;if(!disposed)setCaptureReady(true);},
            onError:()=>{if(!disposed){setCaptureReady(false);setStatus('unsupported');setNotice('This build cannot establish the required device privacy protection. Writing is unavailable.');}},
          });
          await capture.settled;
          if (disposed||!captureConfirmed) return;
          const controller = await createProtectedNativeVaultController({
            onLock: () => { if (!disposed) clearPrivate(); },
            onConceal: covered => { if (disposed) return; Keyboard.dismiss(); draftCovered.current = covered; if (covered) { model.current?.cancelSuggestion(); draftProtection.current?.suspend(); exportReview.current?.hide(); } else draftProtection.current?.resume(); setConcealed(covered); },
          });
          if (disposed) { await controller.dispose(); return; }
          vault.current = controller; setStatus("locked");
        } catch { if (!disposed) { setStatus("unsupported"); setNotice("This build cannot establish the required device privacy protection. Writing is unavailable."); } }
    })();
    const auth = accountClient?.auth.onAuthStateChange(event => {
      if (disposed) return;
      if (event === "TOKEN_REFRESHED") {
        // Never await managed Auth inside its own subscription callback.
        queueMicrotask(() => { if (!disposed) void refreshGuard.current?.refresh(); });
      } else if (event !== "INITIAL_SESSION") { clearPrivate(); void vault.current?.lock(event === "SIGNED_OUT" ? "signout" : "revoked").catch(() => undefined); }
    });
    const expiry=setInterval(()=>{if(!disposed&&journalOpen.current&&AppState.currentState==='active')offlineLease.current?.allowed();},1000);
    const recheck=setInterval(()=>{if(!disposed&&journalOpen.current&&AppState.currentState==='active')void refreshGuard.current?.refresh();},60_000);
    return () => {
      disposed = true; mounted.current = false; lifetime.current += 1; sessionAbort.current?.abort(); verified.current = undefined;
      journalOpen.current = false; refreshGuard.current?.cancel(); void model.current?.invalidate().catch(() => undefined);
      draftProtection.current?.cancel(); draftStamp.current = undefined;
      exportReview.current?.clear();
      offlineLease.current?.clear();clearInterval(expiry);clearInterval(recheck);
      retireIdeas(); contactCache.current = undefined;
      auth?.data.subscription.unsubscribe();
      const controller = vault.current; vault.current = undefined; void controller?.dispose().catch(() => undefined);
      void capture?.dispose();
    };
  }, [captureId, cancelIdeas, clearPrivate, context.user.id, retireIdeas, storageScope]);

  const stillCurrent = (version: number) => mounted.current && lifetime.current === version && AppState.currentState === "active" && (!journalOpen.current||offlineLease.current?.allowed()===true);
  function clearExportSelection() { exportReview.current?.clear(); setSelectedExport([]); }
  async function currentManagedSession(onlineOnly=false) {
    if(!offlineLease.current?.allowed())throw new JournalAccessError();
    if(!onlineOnly)return;
    const before=proofRevision.current;
    await refreshGuard.current?.refresh();await refreshGuard.current?.wait();
    if(!offlineLease.current?.allowed())throw new JournalAccessError();
    if(proofRevision.current===before)throw new JournalAccessError('unavailable');
  }
  async function refresh(controller: VaultController, version: number) {
    const [pages, protectedDrafts] = await Promise.all([controller.list(), controller.listDrafts({kind:'journal-editor'})]);
    if (stillCurrent(version)) { clearExportSelection(); setEntries(pages); setDrafts(protectedDrafts.filter(value => value.kind === "journal-editor")); }
  }
  async function loadContacts(subject: string) {
    try {
      const rows = await accountRpc<AuthorizedJournalContact[]>("list_contacts", {}, subject);
      if (!Array.isArray(rows)) throw new Error();
      return { subject, rows, known: true };
    } catch (error) {
      if (error instanceof AccountRpcError && (error.code === "42501"||error.status===401||error.status===403)) throw new JournalAccessError();
      return { subject, rows: [] as AuthorizedJournalContact[], known: false };
    }
  }
  async function refreshContactSnapshot(subject:string,version:number) {
    try {const loaded=await loadContacts(subject);if(stillCurrent(version)&&verified.current?.actor.subject===subject)contactCache.current=loaded;}
    catch(error){if(stillCurrent(version)&&error instanceof JournalAccessError){clearPrivate();void vault.current?.lock('revoked').catch(()=>undefined);}}
  }
  useEffect(()=>{latestContactRefresh.current=refreshContactSnapshot;});
  function perform(work: (controller: VaultController, version: number) => Promise<void>, verifySession:boolean|'online' = true): Promise<boolean> {
    const controller = vault.current, version = lifetime.current;
    if (!controller || busyGate.current || erasing.current || concealed || refreshing.current) return Promise.resolve(false);
    busyGate.current = true;
    setBusy(true); setNotice("");
    return (async () => {
      try {
        if (verifySession) await currentManagedSession(verifySession==='online');
        if (!stillCurrent(version)) return false;
        await work(controller, version);
        return stillCurrent(version);
      } catch (error) {
        if (mounted.current && lifetime.current === version) {
          if (error instanceof JournalAccessError && error.code !== "unavailable") { clearPrivate(); void controller.lock("revoked").catch(() => undefined); }
          if (error instanceof VaultError && error.code === "unsupported") setStatus("unsupported");
          setNotice(errorMessage(error));
        }
        return false;
      } finally { if (mounted.current && lifetime.current === version) { busyGate.current = false; setBusy(false); } }
    })();
  }
  function beginEditor(value: Editor) {
    clearExportSelection(); setStorageShown(false);
    const stamp = `${lifetime.current}/${++draftSerial.current}`;
    draftStamp.current = stamp; draftProtection.current?.open(stamp, value, value.protectedDraft); setEditor(value);
  }
  function closeEditor() { draftProtection.current?.cancel(); draftStamp.current = undefined; setDraftStatus("clean"); setEditor(undefined); }
  function touchWriter() { return mounted.current && !busyGate.current && journalOpen.current && !refreshing.current && !draftCovered.current && AppState.currentState === "active" && offlineLease.current?.allowed()===true && vault.current?.touch() === true; }
  function edit(value: Editor) { if (!touchWriter()) return; cancelIdeas(); draftProtection.current?.update(value); setEditor(value); }
  function unlock(create: boolean) {
    if (create && !acknowledged) return;
    perform(async (controller, version) => {
      if (!accountClient || !backendUrl || !captureReady) throw new JournalAccessError();
      const abort = new AbortController(); sessionAbort.current = abort;
      const access = await verifyManagedAccess(context.user.id, abort.signal);
      if (!stillCurrent(version)) return;
      if (create) await controller.enroll(access.actor, abort.signal);
      await controller.unlock(access.actor, abort.signal);
      if (!stillCurrent(version)) return;
      verified.current = access;journalOpen.current=true;
      if(!offlineLease.current?.start(access)){await controller.lock('manual');throw new JournalAccessError();}
      await refresh(controller, version);
      if (stillCurrent(version)) { setUnlockedAuthor(access.actor.subject); setStatus("open"); setNotice(create ? "Your device journal is ready. Use fictional writing while production review remains open." : "Your own device journal is unlocked.");void refreshContactSnapshot(access.actor.subject,version); }
    }, false);
  }
  function confirm(value: Confirmation) { Keyboard.dismiss(); setConfirmationWords(""); setConfirmation(value); }
  function choose(next: () => void) {
    const proceed = () => { cancelIdeas(); next(); };
    if (!editor) { proceed(); return; }
    const version = lifetime.current; let protectedLatest = false;
    void perform(async () => { protectedLatest = await draftProtection.current?.flush() ?? false; }).then(ok => {
      if (!ok || !stillCurrent(version) || refreshing.current || draftCovered.current) return;
      if (protectedLatest) proceed();
      else confirm({ title: "Latest edits are not protected", description: "The device could not confirm a private draft save. Keep writing and retry protection, or leave knowing the latest edits may be lost. Earlier confirmed drafts remain available.", label: "Leave without protecting latest edits", action: proceed });
    });
  }
  function leave() { if (busyGate.current || erasing.current) return; if (storageShown) { clearExportSelection(); setStorageShown(false); return; } if (status !== "open") { onBack(); return; } choose(() => { perform(async controller => { await controller.lock("manual"); onBack(); }, false); }); }
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { leave(); return true; });
    return () => subscription.remove();
  });
  function openPage(id: string) {
    choose(() => { void perform(async (controller, version) => { const page = await controller.read(id); if (page && stillCurrent(version)) { beginEditor(savedEditor(page)); setIdeas(undefined); } }); });
  }
  function openDraft(id: string) {
    choose(() => { void perform(async (controller, version) => {
      const value = await controller.readDraft(id);
      if (value?.kind === "journal-editor" && stillCurrent(version)) {
        beginEditor({ ...emptyEditor(), title: value.title, body: value.body, protectedDraft: value }); setIdeas(undefined);
        setNotice("Recovered as a private draft. Saving creates a new page and does not overwrite an older page.");
      }
    }); });
  }
  function protectDraft() {
    if (!editor) return;
    confirm({ title: "Protect the latest writing now?", description: "Confirm a private draft save in the separate encrypted store on this device. These words remain unsent. Losing the device key can permanently lose this draft.", label: "Store my private draft", action: () => { void perform(async (_controller, version) => {
      const protectedLatest = await draftProtection.current?.flush(true);
      if (stillCurrent(version)) setNotice(protectedLatest ? "Latest writing confirmed in your private device draft." : "The latest draft save could not be confirmed. Keep this screen open and retry; latest edits may still be only in memory.");
    }); } });
  }
  function savePage() {
    if (!editor) return;
    perform(async (controller, version) => {
      draftProtection.current?.suspend(); await draftProtection.current?.drain();
      const protectedDraft = draftProtection.current?.draft();
      try {
      const saved = await controller.save({ id: editor.id, expectedRevision: editor.revision, title: editor.title, body: editor.body });
      if (stillCurrent(version)) { beginEditor(savedEditor(saved)); setIdeas(undefined); setNotice("Saved in your own encrypted device journal. Nothing was shared."); }
      if (protectedDraft) await controller.clearDraft(protectedDraft.id, protectedDraft.revision);
      await refresh(controller, version);
      } finally { if (stillCurrent(version)) draftProtection.current?.resume(); }
    });
  }
  function removePage() {
    if (!editor?.id || editor.revision === null) return;
    const id = editor.id, revision = editor.revision;
    confirm({ title: "Delete this saved page?", description: "This removes the saved page and clears current on-screen edits. It cannot be undone. A separately protected draft remains until you delete it from Protected private drafts. Copies exported yourself are outside this app's control.", label: "Delete my saved page", action: () => { void perform(async (controller, version) => { draftProtection.current?.suspend(); await draftProtection.current?.drain(); try { await controller.delete(id, revision); if (stillCurrent(version)) { closeEditor(); setIdeas(undefined); } await refresh(controller, version); } finally { if (stillCurrent(version)) draftProtection.current?.resume(); } }); } });
  }
  function selectExportPage(id: string) {
    if (!touchWriter() || !entries.some(page => page.id === id)) return;
    const selected = exportReview.current?.selection() ?? [];
    const next = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id];
    if (next.length > MAX_JOURNAL_REVIEW_PAGES) { setNotice("Choose up to five saved pages for one in-memory review."); return; }
    exportReview.current?.select(next); setSelectedExport(next); setConfirmation(undefined);
  }
  function requestExportReview() {
    if (!touchWriter()) return;
    const selected = exportReview.current?.selection() ?? [], scope = storageScope();
    if (!scope || !selected.length) return;
    confirm({ title: "Review readable private pages in memory?", description: "Device authentication will reveal the selected saved pages as readable JSON on this screen. This is not an encrypted backup or an exported file. No file, clipboard or sharing destination is created. Unprotected edits and private drafts are not included. The review clears on lock, background, account change or page-selection change.", label: "Authenticate and review selected pages", action: () => {
      if (storageScope()?.stamp !== scope.stamp || JSON.stringify(exportReview.current?.selection()) !== JSON.stringify(selected)) return;
      void perform(async () => { await exportReview.current?.review(); },'online');
    } });
  }
  function requestEraseVault() {
    if (!touchWriter()) return;
    const scope = storageScope();
    if (!scope) return;
    const authorId = scope.actor.subject;
    confirm({ title: "Permanently delete all my private journal storage?", description: "This deletes every saved journal page, every protected journal and conversation draft in your private device store, and their keys. Unsaved words will be cleared. This cannot be undone; the service and your family cannot recover it. Previously shared messages, messages already approved for sending and copies outside this private store are not deleted. Type DELETE, then confirm and complete fresh device authentication.", label: "Delete all my journal and private draft storage", requiredText: "DELETE", action: () => {
      if (storageScope()?.stamp !== scope.stamp) return;
      void perform(async (controller, version) => {
        erasing.current = true; clearExportSelection(); cancelIdeas(); setPrepared(undefined);
        const completionIsCurrent = () => mounted.current && lifetime.current === version + 1 && AppState.currentState === "active";
        async function publishDeletionNotice(text: string) {
          if (!completionIsCurrent() || !accountClient) return;
          const current = getAccountProofCandidate();
          if (completionIsCurrent() && current?.userId === authorId) setNotice(text);
        }
        try {
          const removed = await eraseOwnJournalStorage(scope, {
            current: storageScope,
            drainDrafts: async () => { draftProtection.current?.suspend(); await draftProtection.current?.drain(); if (stillCurrent(version)) closeEditor(); },
            retireModel: async () => { modelOperation.current++; modelPending.current = false; await model.current?.invalidate(); },
            verifyActor: async () => (await verifyManagedAccess(scope.actor.subject)).actor,
            // erase synchronously invokes onLock; reusing the old unlock signal would abort itself.
            erase: actor => controller.erase(actor),
          });
          if (removed) await publishDeletionNotice("Your journal pages, protected private drafts and their device keys were deleted. No message or external copy was deleted. Creating a new journal now requires a new explicit enrollment.");
          else {
            if (stillCurrent(version)) await controller.lock("manual").catch(() => undefined);
            await publishDeletionNotice("Deletion did not start because current access changed. Unlock your own journal and review the deletion request again.");
          }
        } catch {
          if (stillCurrent(version)) await controller.lock("manual").catch(() => undefined);
          await publishDeletionNotice("Deletion could not be confirmed. Storage may be unchanged or partly removed. The journal stays locked; do not assume recovery is possible or create a replacement to bypass an error. No automatic reset was performed.");
        } finally {
          erasing.current = false;
          if (mounted.current) { busyGate.current = false; setBusy(false); }
        }
      });
    } });
  }
  function handoff() {
    if (!prepared || !onPrepareConversation) return;
    const selected = { ...prepared, excludedContactIds: [...prepared.excludedContactIds], excludedCategories: [...prepared.excludedCategories] };
    choose(() => perform(async (controller, version) => {
      const access = verified.current;
      if (!access || !accountClient) throw new JournalAccessError();
      await controller.lock("manual");
      const candidate=getAccountProofCandidate();
      // This deliberate lock clears the writer once. Any additional account/lifecycle event denies handoff.
      if (!mounted.current || lifetime.current !== version + 1 || candidate?.accessToken !== access.token || candidate.userId !== access.actor.subject || AppState.currentState !== "active") return;
      onPrepareConversation(selected);
    },'online'));
  }
  function findWords(automatic = false) {
    const access = verified.current, version = lifetime.current, writing = editor?.body;
    if (!writing || !access || !journalOpen.current || refreshing.current || concealed || !offlineLease.current?.allowed()) return;
    clearTimeout(autoTimer.current); model.current?.cancelSuggestion(); const operation = ++ideaOperation.current;
    if (!automatic) vault.current?.touch(); // An automatic suggestion never extends the author idle deadline.
    setIdeas(undefined); setFinding(true);
    void (async () => {
      try {
        // Local reflection uses only the last online contact snapshot, never current permission.
        if (!automatic) {
          await currentManagedSession();
          if (!stillCurrent(version) || operation !== ideaOperation.current) return;
        }
        const cached = contactCache.current?.subject === access.actor.subject ? contactCache.current : undefined;
        const rows = cached?.rows ?? [], contacts = journalContacts(rows, access.actor.subject);
        if (!stillCurrent(version) || operation !== ideaOperation.current || refreshing.current) return;
        const value = await model.current?.suggest({ text: writing, role: access.role, contacts });
        if (!value || !stillCurrent(version) || operation !== ideaOperation.current || refreshing.current) return;
        if (!cached?.known) {
          value.excludedCategories = [...allRecipientCategories];
          value.fallbackReason = "Contact information could not be refreshed. Use these as in-person starters only.";
          if (!automatic) setNotice(value.fallbackReason);
        } else {
          const permitted = safePreparedContacts(rows, access.actor.subject, { ...value, text: writing });
          const permittedIds = new Set(journalContacts(permitted, access.actor.subject).map(contact => contact.id));
          value.excludedContactIds = [...new Set([...value.excludedContactIds, ...contacts.filter(contact => !permittedIds.has(contact.id)).map(contact => contact.id)])];
        }
        setIdeas(value);
      } catch (error) {
        if (stillCurrent(version) && operation === ideaOperation.current) {
          if (error instanceof JournalAccessError && error.code !== "unavailable") { clearPrivate(); void vault.current?.lock("revoked").catch(() => undefined); }
          else setNotice("Conversation starters could not finish. Your private writing remains here.");
        }
      } finally { if (stillCurrent(version) && operation === ideaOperation.current) setFinding(false); }
    })();
  }
  function setupModel(kind: "download" | "load") {
    const controller = model.current, version = lifetime.current;
    if (!controller || modelPending.current || !journalOpen.current || refreshing.current || concealed) return;
    const operation = ++modelOperation.current; modelPending.current = true; setModelBusy(true); setNotice("");
    void (async () => {
      try {
        await currentManagedSession(); if (!stillCurrent(version)) return;
        const ready = await controller.setup(kind);
        if (stillCurrent(version)) setNotice(ready ? "Model loaded but off. Enable it below to use it for manual starters and any separately enabled while-writing ideas." : "Optional model setup did not finish. Local conversation templates remain available.");
      } catch (error) {
        if (stillCurrent(version)) {
          if (error instanceof JournalAccessError && error.code !== "unavailable") { clearPrivate(); void vault.current?.lock("revoked").catch(() => undefined); }
          else setNotice("Optional model setup did not finish. Local conversation templates remain available.");
        }
      } finally {
        if (operation === modelOperation.current) { modelPending.current = false; if (stillCurrent(version)) { setModelBusy(false); setModelView(controller.state()); } }
      }
    })();
  }
  function disableModel() {
    const controller = model.current, version = lifetime.current; modelOperation.current++; modelPending.current = false;
    if (!controller) return;
    setModelBusy(false); setIdeas(undefined); setModelView({ ...getLocalModelStatus(), enabled: false });
    void controller.invalidate().catch(() => undefined).finally(() => { if (stillCurrent(version)) setModelView(controller.state()); });
  }
  function toggleModel() {
    const controller = model.current, version = lifetime.current;
    if (!controller || modelBusy || refreshing.current) return;
    if (modelView.enabled) { disableModel(); return; }
    perform(async () => { await controller.useModel(true); if (stillCurrent(version)) setModelView(controller.state()); });
  }
  useEffect(() => { latestFind.current = findWords; });
  useEffect(() => {
    if (!ideasWhileWriting || status !== "open" || concealed || refreshConcealed || prepared || !editor?.body.trim()) return;
    autoTimer.current = setTimeout(() => latestFind.current?.(true), 1200);
    return () => { clearTimeout(autoTimer.current); cancelIdeas(); };
  }, [ideasWhileWriting, status, concealed, refreshConcealed, prepared, editor?.body, editor?.title, editor?.id, cancelIdeas]);
  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.paper }];
  const inputPrivacy = { autoComplete: "off" as const, autoCorrect: false, importantForAutofill: "no" as const, underlineColorAndroid: "transparent", editable: !busy };

  if (concealed || refreshConcealed || status === "open" && (unlockedAuthor !== context.user.id||!leaseVisible)) return <View style={[styles.cover, { backgroundColor: theme.background }]} accessibilityViewIsModal><Heading>Private journal covered</Heading><Body muted>{status==='open'&&!leaseVisible ? "The current local access window ended or the account changed. Reconnect and unlock your own pages again. Confirmed private drafts remain on this device." : refreshConcealed ? "Checking current account access. A real identity change, background or normal timeout still locks and clears unprotected words." : "Return to the app to continue. Backgrounding locks your journal."}</Body>{refreshConcealed && <Button label="Retry account verification" onPress={() => { void refreshGuard.current?.refresh(); }} />}{onOpenSafety && <Button label="Safety information" quiet onPress={onOpenSafety} />}</View>;
  return <View style={styles.fill}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Button label="Back" quiet onPress={status === "open" ? leave : onBack} disabled={busy} />
      <Eyebrow>A SPACE OF YOUR OWN</Eyebrow><Heading large>My Journal</Heading>
      <Body muted>Private to your own device account. Your family administrator cannot read these pages through Between Us.</Body>
      <Body muted>Fictional writing only while security, child privacy and native device review remain open.</Body>
      {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>{notice}</Text>}
      {busy && <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>Please wait. Your words stay private.</Text>}
      {status==='open'&&<Paper><Body>{localOnly?'Connection unavailable: private local writing only.':'Your current private writing window is verified.'}</Body><Body muted>Local writing can continue for up to 15 minutes from its last full online proof, or earlier account expiry. Two minutes without author input, backgrounding, signout or an account change still locks it. Timers and typing never extend the absolute window; only a complete new online check can renew it. Only confirmed local saves protect the latest edits.</Body><Button label="Recheck my account online" quiet disabled={busy} onPress={()=>{if(touchWriter())void perform(async()=>{setNotice('Current online account access was verified.');},'online');}}/></Paper>}
      {status !== "open" ? <Paper>
        <Heading>{status === "unsupported" ? "Device journal unavailable" : "Unlock your own pages"}</Heading>
        <Body>Unlock requires your current managed account, an online account check and device authentication. This screen does not start a new offline session. After a lock or reload, reconnect to verify your account again.</Body>
        <Body muted>While unlocked, journal edits are automatically protected as private device drafts after a pause. Only a confirmed save protects the latest edits; backgrounding or locking can clear edits still waiting to save.</Body>
        <Body muted>One author can enroll per OS installation. A shared device passcode or enrolled fingerprint may unlock device-protected keys; use an author-controlled device. Device storage does not provide end-to-end messaging encryption.</Body>
        {status !== "unsupported" && <>
          <Button label="Unlock saved pages" primary disabled={busy || !captureReady || status === "starting"} onPress={() => unlock(false)} />
          <Body>Before creating a journal: we cannot recover these pages if the device or key is lost. Changing biometric or passcode settings can make them permanently inaccessible. Your parent, guardian and this service cannot unlock them for you.</Body>
          <Button label={acknowledged ? "Device and recovery limits acknowledged" : "I understand the device and recovery limits"} selected={acknowledged} disabled={busy} onPress={() => setAcknowledged(value => !value)} />
          <Button label="Create and unlock my device journal" disabled={busy || !captureReady || !acknowledged || status === "starting"} onPress={() => unlock(true)} />
        </>}
      </Paper> : prepared ? <Paper>
        <Heading>Separate words to share</Heading>
        <Body muted>These words are separate from your page. Choose a recipient and review later; nothing here sends a message. This unsent text clears on lock.</Body>
        <TextInput {...inputPrivacy} accessibilityLabel="Separate conversation words" value={prepared.text} multiline maxLength={5000} textAlignVertical="top" style={[...inputStyle, styles.writing]} onChangeText={text => { if (touchWriter()) setPrepared({ ...prepared, text }); }} />
        {onPrepareConversation && <Button label="Choose a recipient and review these words" primary disabled={busy || !prepared.text.trim()} onPress={handoff} />}
        {!onPrepareConversation && <Body muted>Use these words to practice an in-person conversation. Messaging is not connected on this screen.</Body>}
        <Button label="Return to my page" quiet disabled={busy} onPress={() => confirm({ title: "Discard these separate unsent words?", description: "Your journal page stays open. These conversation words have not been sent or stored.", label: "Discard unsent words", action: () => setPrepared(undefined) })} />
      </Paper> : editor ? <>
        <Paper>
          <Text style={{ color: theme.text }}>ENTRY TITLE</Text>
          <TextInput {...inputPrivacy} accessibilityLabel="Private entry title" value={editor.title} maxLength={150} style={inputStyle} onChangeText={title => edit({ ...editor, title })} />
          <Text style={{ color: theme.text }}>YOUR PRIVATE WORDS</Text>
          <TextInput {...inputPrivacy} accessibilityLabel="Private journal writing" value={editor.body} multiline maxLength={5000} textAlignVertical="top" style={[...inputStyle, styles.writing]} onChangeText={body => edit({ ...editor, body })} />
          <Button label="Save my entry" primary disabled={busy || !editor.body.trim() || !dirty(editor)} onPress={savePage} />
          <Button label="Protect unsaved writing as a private draft" disabled={busy || !(editor.body.trim() || editor.title.trim())} onPress={protectDraft} />
          <Text accessibilityLiveRegion="polite" style={{ color: draftStatus === "error" ? theme.danger : theme.muted }}>{draftStatus === "protected" ? "Latest writing confirmed in your protected device draft." : draftStatus === "saving" ? "Protecting a private draft on this device…" : draftStatus === "pending" ? "Latest edits are waiting for private draft protection." : draftStatus === "error" ? "Draft protection could not be confirmed. Latest edits may be only in memory. Keep this screen open and retry Protect unsaved writing." : "Edit to begin automatic private draft protection."}</Text>
          <Body muted>After a pause, writing is protected in your encrypted device draft store. Back waits for confirmation. Backgrounding and locking never wait for a save; edits not yet confirmed may be lost. Nothing is sent or shared.</Body>
        </Paper>
        <Paper>
          <Eyebrow>OPTIONAL · ON THIS DEVICE</Eyebrow><Heading>Conversation starters, when you ask</Heading>
          <Body muted>Local templates work without a model. The optional experimental model is off by default; it never sends your writing to an AI service. Suggestions run when you ask, unless you turn on the separate while-writing option.</Body>
          <Body muted>Conversation starters use connection details last checked online. They do not establish current permission or anyone&apos;s safety. Choosing a recipient and sending still require a fresh online check.</Body>
          <Button label="Conversation ideas while I write" selected={ideasWhileWriting} onPress={() => { cancelIdeas(); setIdeasWhileWriting(value => !value); }} />
          <Body muted>{ideasWhileWriting ? "On for this unlocked author only. Ideas appear after a pause, using contact metadata already on this device. Turn it off anytime; nothing is sent or shared." : "Off. You can ask for a starter whenever you want. This choice is not saved."}</Body>
          <Body muted>{modelView.message}</Body>
          {modelView.available && <>
            <Body muted>{LOCAL_MODEL.name} · {LOCAL_MODEL.license}. Pinned public download: 369 MiB; keep at least 1 GiB free. SHA-256 is checked before loading. Physical-device model validation remains pending.</Body>
            <Button label="Download and load optional on-device model" disabled={modelBusy} onPress={() => confirm({ title: "Download the pinned public model?", description: "Download the 369 MiB licensed model from its pinned Hugging Face source, verify its size and SHA-256, then load it? Your writing is not included. Public model files remain on this device; prompts and sessions are not saved. Loading leaves model use off until you enable it.", label: "Download verified public model", action: () => setupModel("download") })} />
            <Button label="Load verified downloaded model" disabled={modelBusy} onPress={() => setupModel("load")} />
            <Button label="Use optional model for conversation starters" selected={modelView.enabled} disabled={modelBusy || !modelView.ready} onPress={toggleModel} />
            <Button label={modelBusy ? "Cancel optional model setup" : "Unload optional model"} quiet disabled={!modelBusy && !modelView.ready} onPress={disableModel} />
          </>}
          <Button label="Find optional conversation starters" quiet disabled={busy || finding || !editor.body.trim()} onPress={() => findWords()} />
          {finding && <><Body muted>Finding words on this device…</Body><Button label="Cancel conversation starter" quiet onPress={cancelIdeas} /></>}
        </Paper>
        {ideas && <Paper>
          <Heading>You choose whether to share</Heading><Body muted>{ideas.label}</Body>
          {ideas.safetyNotice && <Body>{ideas.safetyNotice}</Body>}
          {ideas.suggestions.map(suggestion => <View key={suggestion.id} style={styles.section}><Body>{suggestion.draft}</Body><Button label="Prepare these separate words" disabled={busy} onPress={() => { vault.current?.touch(); setPrepared({ text: suggestion.draft, excludedContactIds: [...ideas.excludedContactIds], excludedCategories: [...ideas.excludedCategories] }); }} /></View>)}
          <Button label="Dismiss starters" quiet onPress={() => { model.current?.cancelSuggestion(); setIdeas(undefined); }} />
        </Paper>}
        <Button label="Return to my pages" quiet disabled={busy} onPress={() => choose(() => { closeEditor(); setIdeas(undefined); })} />
        {!!editor.id && <Button label="Delete this saved page" quiet disabled={busy} onPress={removePage} />}
      </> : <>
        <Button label="New private entry" primary disabled={busy} onPress={() => { if (touchWriter()) { cancelIdeas(); beginEditor(emptyEditor()); } }} />
        {!!drafts.length && <Paper><Heading>Protected private drafts</Heading><Body muted>These words are unsent. Recovering a draft prepares a new page.</Body>{drafts.map(value => <View key={value.id} style={styles.section}><Button label={`Recover ${value.title || "untitled private draft"}`} disabled={busy} onPress={() => openDraft(value.id)} /><Button label="Delete this protected draft" quiet disabled={busy} onPress={() => confirm({ title: "Delete this protected draft?", description: "These unsent words will be removed from this device. Saved journal pages are separate.", label: "Delete my draft", action: () => perform(async (controller, version) => { await controller.clearDraft(value.id, value.revision); await refresh(controller, version); }) })} /></View>)}</Paper>}
        <Eyebrow>YOUR PAGES</Eyebrow>
        {!entries.length && <Body muted>No saved pages yet. A few words are enough to begin.</Body>}
        {entries.map(value => <Paper key={value.id}><Button label={value.title || "Untitled entry"} quiet disabled={busy} onPress={() => openPage(value.id)} /><Body muted>{new Date(value.updatedAt).toLocaleDateString()} · Saved on this device</Body></Paper>)}
        {entries.length >= 50 && <Button label="Show older pages" quiet disabled={busy} onPress={() => perform(async (controller, version) => { const last = entries[entries.length - 1]; const older = await controller.list({ before: { updatedAt: last.updatedAt, id: last.id } }); if (stillCurrent(version)) setEntries(values => [...values, ...older]); })} />}
        <Button label={storageShown ? "Close private storage controls" : "Manage my private journal storage"} quiet disabled={busy} onPress={() => { if (touchWriter()) { clearExportSelection(); setStorageShown(value => !value); } }} />
        {storageShown && <Paper>
          <Heading>My private device storage</Heading>
          <Body>These controls apply only to your unlocked journal and protected private drafts on this installation. They give no family administrator access.</Body>
          <Heading>Review selected saved pages</Heading>
          <Body>Choose up to five saved pages. After fresh device authentication, readable JSON appears here in memory only, including saved titles, words, identifiers and timestamps. It is not an encrypted backup or a completed portable export. No file, clipboard or sharing destination is created. Unprotected edits and protected drafts are excluded.</Body>
          {entries.map(page => <Button key={page.id} label={`${selectedExport.includes(page.id) ? "Selected" : "Select"}: ${page.title || "Untitled entry"}`} selected={selectedExport.includes(page.id)} disabled={busy || !selectedExport.includes(page.id) && selectedExport.length >= MAX_JOURNAL_REVIEW_PAGES} onPress={() => selectExportPage(page.id)} />)}
          {!entries.length && <Body muted>Save a journal page before selecting it for a readable review.</Body>}
          <Body muted>{selectedExport.length} of {MAX_JOURNAL_REVIEW_PAGES} pages selected. Load older pages above to select from more saved pages. Changing selection clears the readable review.</Body>
          <Button label="Review selected pages in memory" disabled={busy || !selectedExport.length} onPress={requestExportReview} />
          {exportText !== undefined && <View style={styles.section}>
            <Heading>Readable private review — memory only</Heading>
            <Body>This is plaintext on your screen. Nothing here creates a backup, file or shared copy. Locking, backgrounding, closing these controls or changing selection clears this review.</Body>
            <Text selectable={false} style={{color:theme.text,fontSize:16,lineHeight:24}}>{exportText}</Text>
            <Button label="Clear readable review" quiet disabled={busy} onPress={() => exportReview.current?.hide()} />
          </View>}
          <Heading>Delete my journal and protected drafts</Heading>
          <Body>This permanently removes all your saved journal pages, protected journal drafts, protected conversation drafts and their device keys. Previously sent messages and messages already approved for sending remain separate. There is no service or guardian recovery.</Body>
          <Button label="Review permanent private storage deletion" quiet disabled={busy} onPress={requestEraseVault} />
        </Paper>}
      </>}
      {status === "open" && <Button label="Lock my journal now" quiet disabled={busy} onPress={() => choose(() => { void vault.current?.lock("manual").catch(() => undefined); })} />}
      <Body muted>Safety information and seeking another safe adult never require guardian approval. You do not need to share a journal to seek help.</Body>
      {onOpenSafety && <Button label="Privacy and safety information" quiet onPress={() => { clearPrivate(); void vault.current?.lock("manual").catch(() => undefined); onOpenSafety(); }} />}
    </ScrollView>
    <Modal visible={!!confirmation} transparent animationType="none" onRequestClose={() => { setConfirmation(undefined); setConfirmationWords(""); }}>
      <WritingKeyboardView style={styles.fill}>
        <ScrollView contentContainerStyle={[styles.modal, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled" accessibilityViewIsModal>
          {confirmation && <Paper><Heading>{confirmation.title}</Heading><Body>{confirmation.description}</Body>
            {confirmation.requiredText && <TextInput {...inputPrivacy} accessibilityLabel={`Type ${confirmation.requiredText} to confirm whole-vault deletion`} value={confirmationWords} onChangeText={setConfirmationWords} maxLength={confirmation.requiredText.length} autoCapitalize="characters" style={inputStyle} />}
            <Button label="Keep writing" disabled={busy} onPress={() => { setConfirmation(undefined); setConfirmationWords(""); }} />
            <Button label={confirmation.label} disabled={busy || !!confirmation.requiredText && confirmationWords !== confirmation.requiredText} onPress={() => { if (confirmation.requiredText && confirmationWords !== confirmation.requiredText) return; const action = confirmation.action; setConfirmation(undefined); setConfirmationWords(""); action(); }} />
          </Paper>}
        </ScrollView>
      </WritingKeyboardView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, page: { padding: 24, gap: 18, paddingBottom: 48 }, section: { gap: 12 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 52, padding: 14, fontSize: 18, lineHeight: 28 },
  writing: { minHeight: 220 }, cover: { flex: 1, padding: 28, gap: 18, justifyContent: "center" },
  modal: { flexGrow: 1, padding: 24, justifyContent: "center" },
});
