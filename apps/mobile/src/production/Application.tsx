import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, BackHandler, Image, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { WritingKeyboardView } from "../writing-keyboard-view";
import { Text, TextInput } from "../adaptive-writing-text";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { randomUUID } from "expo-crypto";
import { useAppearance } from "../appearance";
import { Body, Button, Field, Heading, Icon } from "../ui";
import {
  accountApi as managedApi,
  accountClient,
  accountRpc as managedRpc,
  signOutAccount,
  signOutOtherSessions,
  hasVerifiedRecovery,
  finishRecovery,
  verifiedRecoveryProof,
  requireRecoveryProof,
  requireSignedOut,
  AccountRpcError,
  type AccountContext,
  backendUrl,
  deploymentTarget,
  readAccountBoundary,
  getAccountProofCandidate,
  getVerifiedAccountContext,
  isTransientAccountFailure,
} from "./client";
import { ProductionFinance } from "./Finance";
import { ProductionJournal } from "./Journal";
import { ProductionCircle } from './Circle';
import { ProductionCheckins } from './Checkins';
import { ProductionConversation, type ThreadMessage, type ResponsePreference } from "./Conversation";
import { ProductionNotifications } from "./Notifications";
import { ProductionFamily } from './Family';
import { usePrivateMessageCapture } from './private-screen-capture';
import type { MessageDraftScope } from './private-message-draft-policy';
import {createPrivateWritingLifetime} from './private-writing-lifetime';
import { ProductionAccount, type PrivacyIdentity } from './Account';
import { authRedirectTo } from './auth-redirect';
import {runAuthMutation,getAuthMutationPending,subscribeAuthMutation} from './auth-mutation';
import { safePreparedContacts, type AuthorizedJournalContact } from './journal-contacts';
import type { PreparedJournalConversation } from './Journal';
import { establishAppPrivacy } from "./app-privacy";
import { type ReviewedMessage, type RecipientPolicy } from './reviewed-send';
import {createReviewedSendCoordinator,type ReviewedThread} from './reviewed-send-coordinator';
import {createMessageOutbox,messageOutboxSupported} from './message-outbox';
import type {MessageRecoveryRecord} from './message-outbox-policy';
import {makeReviewedMessageTransport,type SenderMessageReceipt} from './durable-message-send';
async function signedOutAuth<T>(work:()=>Promise<T>) {
  return runAuthMutation(async()=>{await requireSignedOut();return work();});
}
type Screen =
  | "welcome"
  | "signin"
  | "register"
  | "verify"
  | "recovery"
  | "child-join"
  | "family"
  | "child"
  | "guardian"
  | "Home"
  | "Journal"
  | "Chats"
  | "Circle"
  | "Finance"
  | "Checkins"
  | "settings"
  | "privacy"
  | "notifications"
  | "FamilyAccess"
  | "safety"
  | "conversation"
  | "review";
type Conversation = {
  id: string;
  peerId: string;
  canExchange: boolean;
  peerName?: string; preview?: string | null; lastMessageAt?: string | null; createdAt?: string;
};
type ConversationPage = { conversations: Conversation[]; hasMore: boolean; nextBeforeId: string | null };
type Message = ThreadMessage;
function NavigationTab({label,selected,onPress}:{label:'Home'|'Journal'|'Chats'|'Circle';selected:boolean;onPress:()=>void}) {
  const {theme}=useAppearance(); const [focused,setFocused]=useState(false);
  const icons={Home:'home',Journal:'journal',Chats:'chats',Circle:'circle'} as const;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onPress={onPress} style={({pressed})=>({minHeight:64,paddingVertical:8,paddingHorizontal:2,gap:4,alignItems:'center',justifyContent:'center',borderRadius:10,borderWidth:2,borderColor:focused?theme.primary:'transparent',backgroundColor:selected?theme.soft:'transparent',opacity:pressed?0.7:1})}>
    <Icon name={icons[label]} color={selected?theme.primary:theme.muted}/><Text style={{color:selected?theme.primary:theme.text,fontSize:13,fontWeight:selected?'700':'500'}}>{label}</Text>
  </Pressable>;
}
const noLeaseSubscription=()=>()=>{};
function SettingsAction({onPress}:{onPress:()=>void}) {
  const {theme}=useAppearance(),[focused,setFocused]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel="Settings" onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onPress={onPress} style={({pressed})=>({width:48,minHeight:48,alignItems:'center',justifyContent:'center',borderWidth:focused?2:1,borderRadius:12,borderColor:focused?theme.primary:theme.border,backgroundColor:theme.surface,opacity:pressed?0.7:1})}><Icon name="settings"/></Pressable>;
}
export default function ProductionApplication() {
  const authPending=useSyncExternalStore(subscribeAuthMutation,getAuthMutationPending,getAuthMutationPending);
  const mounted = useRef(true);
  const navigationIntent=useRef(0);
  const privateWriting=useRef<ReturnType<typeof createPrivateWritingLifetime>|null>(null);
  const { theme: t, appearance, setAppearance } = useAppearance();
  const [screen, navigate] = useState<Screen>("welcome");
  const [context, setContext] = useState<AccountContext | null>(null);
  const [privacyIdentity, setPrivacyIdentity] = useState<PrivacyIdentity | null>(null);
  const [selectedFamilyId,setSelectedFamilyId]=useState('');
  const recoveryProof = verifiedRecoveryProof();
  const [covered, setCovered] = useState(false);
  const [privacyReady, setPrivacyReady] = useState(Platform.OS === "web");
  const [accessError, setAccessError] = useState("");
  const [accessFailureTransient,setAccessFailureTransient]=useState(false);
  const accessAuthorityInvalid=useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationCursor,setConversationCursor]=useState<string|null>(null);
  const [messagesHaveOlder,setMessagesHaveOlder]=useState(false);
  const pagedBeyondFirst=useRef(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const conversationId = conversation?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionNotice, setConnectionNotice] = useState('');
  const [homeQuestion,setHomeQuestion]=useState<string|null>(null);
  const [homeConversation,setHomeConversation]=useState<Conversation|null>(null);
  const [homeError,setHomeError]=useState(false),[homeRetry,setHomeRetry]=useState(0);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>(
    {},
  );
  const [reportWords, setReportWords] = useState("");
  const [preparation,setPreparation] = useState<(PreparedJournalConversation & {authorId:string})|null>(null);
  const [draftPolicies,setDraftPolicies] = useState<Record<string,RecipientPolicy>>({});
  const words = conversation ? (messageDrafts[conversation.id] ?? "") : "";
  function setWords(value: string) {
    if (conversation)
      setMessageDrafts((previous) => ({
        ...previous,
        [conversation.id]: value,
      }));
  }
  const [response, setResponse] = useState<ResponsePreference>(
    "listen",
  );
  const [reviewed, setReviewed] = useState<ReviewedMessage | null>(null);
  const [recoveredSends,setRecoveredSends]=useState<readonly MessageRecoveryRecord[]>([]);
  const [awaitingMessageConfirmation, setAwaitingMessageConfirmation] =
    useState(false);
  const [accountGeneration, setAccountGeneration] = useState(0);
  const [journalLocalAccess,setJournalLocalAccess]=useState<{authorId:string;epoch:number;unlocked:boolean;deadline:number;generation:number}|null>(null);
  const [privateDraftEpoch,setPrivateDraftEpoch]=useState(0),[reviewLocked,setReviewLocked]=useState(false);
  const privateMessageCapture=usePrivateMessageCapture(Platform.OS!=='web'&&context&&conversation&&['conversation','review'].includes(screen)?`${context.user.id}:${accountGeneration}:${privateDraftEpoch}:${conversation.id}`:null);
  const currentPrivateFlow=useRef({authorId:context?.user.id,conversationId:conversation?.id,peerId:conversation?.peerId,generation:accountGeneration,privateEpoch:privateDraftEpoch,screen});
  useEffect(()=>{currentPrivateFlow.current={authorId:context?.user.id,conversationId:conversation?.id,peerId:conversation?.peerId,generation:accountGeneration,privateEpoch:privateDraftEpoch,screen};},[context?.user.id,conversation?.id,conversation?.peerId,accountGeneration,privateDraftEpoch,screen]);
  function currentReviewedScope(scope:MessageDraftScope,lifetime:number) {
    const active=currentPrivateFlow.current;
    return mounted.current&&active.generation===lifetime&&active.authorId===scope.authorId&&active.conversationId===scope.conversationId&&active.peerId===scope.peerId&&scope.issuer===`${backendUrl}/auth/v1`;
  }
  function currentDraftScope(scope:MessageDraftScope,lifetime:number) {return currentReviewedScope(scope,lifetime)&&currentPrivateFlow.current.privateEpoch===privateDraftEpoch;}
  const publishJournalAccess=useCallback((value:{authorId:string;epoch:number;unlocked:boolean;deadline:number}|null)=>{
    const active=currentPrivateFlow.current,boundary=readAccountBoundary();
    if(!mounted.current||accessAuthorityInvalid.current||active.authorId!==context?.user.id||active.generation!==accountGeneration)return;
    if(value===null){setJournalLocalAccess(null);return;}
    if(Platform.OS==='web'||!value.unlocked||value.authorId!==active.authorId||boundary.userId!==value.authorId||boundary.epoch!==value.epoch||!Number.isFinite(value.deadline)||value.deadline<=performance.now())return;
    setJournalLocalAccess({...value,generation:accountGeneration});
  },[context?.user.id,accountGeneration]);
  useEffect(()=>{
    if(!journalLocalAccess)return;
    const timer=setTimeout(()=>setJournalLocalAccess(previous=>previous===journalLocalAccess?null:previous),Math.max(0,journalLocalAccess.deadline-performance.now()));
    return()=>clearTimeout(timer);
  },[journalLocalAccess]);
  const localJournalAllowed=useSyncExternalStore(noLeaseSubscription,useCallback(()=>{
    const boundary=readAccountBoundary();
    return Platform.OS!=='web'&&screen==='Journal'&&privacyReady&&!covered&&!accessAuthorityInvalid.current&&AppState.currentState==='active'&&!!journalLocalAccess?.unlocked
      &&journalLocalAccess.authorId===context?.user.id&&journalLocalAccess.generation===accountGeneration&&boundary.userId===journalLocalAccess.authorId&&boundary.epoch===journalLocalAccess.epoch&&performance.now()<journalLocalAccess.deadline;
  },[screen,privacyReady,covered,journalLocalAccess,context?.user.id,accountGeneration]),()=>false);
  const accountCovered=!!accessError&&!(accessFailureTransient&&localJournalAllowed);
  const messageCoordinator=useRef<{authorId:string;lifetime:number;controller:ReturnType<typeof createReviewedSendCoordinator>}|null>(null);
  function senderFor(thread:ReviewedThread,lifetime=accountGeneration) {
    const active=currentPrivateFlow.current;
    if(!mounted.current||active.authorId!==thread.authorId||active.generation!==lifetime)throw Error('The account changed. Review your own words again.');
    let coordinator=messageCoordinator.current;
    if(!coordinator||coordinator.authorId!==thread.authorId||coordinator.lifetime!==lifetime) {
      coordinator?.controller.resetAll();
      const outbox=messageOutboxSupported?createMessageOutbox({issuer:`${backendUrl}/auth/v1`,authorId:thread.authorId}):undefined;
      const current=()=>mounted.current&&currentPrivateFlow.current.authorId===thread.authorId&&currentPrivateFlow.current.generation===lifetime;
      const transport=makeReviewedMessageTransport({outbox,
        receipt:message=>{if(!current())throw Error('The account changed.');return managedRpc<SenderMessageReceipt>('get_message_receipt',{p_client_id:message.id},message.authorId);},
        sendCurrent:async message=>{
          if(currentPrivateFlow.current.authorId!==message.authorId||currentPrivateFlow.current.generation!==lifetime)throw Error('The account changed. No new message was sent.');
          if(message.recipientPolicy) {
            const fresh=await managedRpc<AuthorizedJournalContact[]>('list_contacts',{},message.authorId);
            const allowed=safePreparedContacts(fresh,message.authorId,{...message.recipientPolicy,text:message.body});
            if(!allowed.some(row=>row.a===message.peerId||row.b===message.peerId))throw new AccountRpcError('Choose another currently permitted trusted person.','42501');
          }
          if(currentPrivateFlow.current.authorId!==message.authorId||currentPrivateFlow.current.generation!==lifetime)throw Error('The account changed. No new message was sent.');
          await managedRpc('send_message',{p_conversation_id:message.conversationId,p_body:message.body,p_client_id:message.id,p_response:message.response},message.authorId);
        }});
      coordinator={authorId:thread.authorId,lifetime,controller:createReviewedSendCoordinator({authorId:thread.authorId,sessionKey:String(lifetime)},transport,randomUUID)};
      messageCoordinator.current=coordinator;
    }
    return coordinator.controller.forThread(thread);
  }
  const accountApi = useCallback(
    <T,>(path: string, value?: unknown) =>
      managedApi<T>(path, value, context?.user.id ?? privacyIdentity?.userId),
    [context?.user.id, privacyIdentity?.userId],
  );
  const accountRpc = useCallback(
    <T,>(name: string, args: Record<string, unknown> = {}) =>
      managedRpc<T>(name, args, context?.user.id ?? privacyIdentity?.userId),
    [context?.user.id, privacyIdentity?.userId],
  );
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
    currentPrivateFlow.current={authorId:undefined,conversationId:undefined,peerId:undefined,generation:-1,privateEpoch:-1,screen:'welcome'};
  }, []);
  const actionBusy=useRef<symbol|null>(null);
  const familyId = context?.families.find(row=>row.id===selectedFamilyId)?.id ?? context?.families[0]?.id;
  const guardian =
    context?.memberships.some(
      (m) => m.familyId === familyId && m.role === "guardian",
    ) ?? false;
  const go = useCallback(
    (next: Screen) => {
      navigationIntent.current++;
      const flow=currentPrivateFlow.current,coordinator=messageCoordinator.current;
      if(next==='conversation'&&flow.screen==='review'&&coordinator?.controller.pendingThreads().some(row=>row.conversationId===flow.conversationId&&row.uncertain)) {
        navigate('review');setNotice('This thread keeps its original reviewed message while its outcome is unknown. Home and other conversations remain available.');return;
      }
      navigate(next);
      setNotice("");
      setPassword("");
    },
    [],
  );
  const clear = useCallback(() => {
    currentPrivateFlow.current={authorId:undefined,conversationId:undefined,peerId:undefined,generation:-1,privateEpoch:-1,screen:'welcome'};
    privateWriting.current?.cancel();privateWriting.current=null;setReviewLocked(false);
    setContext(null);setJournalLocalAccess(null);
    setPrivacyIdentity(null);
    setSelectedFamilyId('');
    setConversations([]);setConversationCursor(null);setMessagesHaveOlder(false);pagedBeyondFirst.current=false;
    setMessages([]);
    setConversation(null);
    setMessageDrafts({});
    setReportWords("");
    setHomeQuestion(null);setHomeConversation(null);setHomeError(false);setResponse('listen');
    setPreparation(null); setDraftPolicies({});
    setPassword("");
    setCode("");
    setName("");
    setEmail("");
    setReviewed(null);setRecoveredSends([]);
    setAwaitingMessageConfirmation(false);
    setAccountGeneration((value) => value + 1);
    setAccessError("");setAccessFailureTransient(false);accessAuthorityInvalid.current=false;
    messageCoordinator.current?.controller.resetAll();messageCoordinator.current=null;
  }, []);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    let data: AccountContext;
    try {
      data = await managedRpc<AccountContext>("get_context");
    } catch (error) {
      if (!mounted.current || version !== generation.current) return;
      if (!(error instanceof AccountRpcError) || error.code !== '42501') throw error;
      const own = await managedRpc<PrivacyIdentity>('get_privacy_context');
      if (!mounted.current || version !== generation.current) return;
      setContext(null); setPrivacyIdentity(own); navigate('privacy');
      if (AppState.currentState === 'active') setCovered(false);
      return;
    }
    if (!mounted.current || version !== generation.current) return;
    setContext(data);
    setPrivacyIdentity(null);
    // An initial Auth event can supersede the foreground validation request.
    // Only its current, server-validated replacement may uncover the account.
    if (AppState.currentState === 'active') setCovered(false);
    if (hasVerifiedRecovery()) { navigate('recovery'); return; }
    navigate(
      data.user.kind === "pending"
        ? "family"
        : data.user.state === "onboarding"
          ? "child-join"
          : "Home",
    );
  }, []);
  async function act(work: () => Promise<unknown>) {
    if (actionBusy.current) return;
    const ticket=Symbol();actionBusy.current=ticket;
    setBusy(true);
    setNotice("");
    const version = generation.current;
    try {
      await work();
    } catch (error) {
      if (mounted.current && version === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "This action could not be confirmed. Try again.",
        );
    } finally {
      if (actionBusy.current===ticket) {actionBusy.current=null;if(mounted.current)setBusy(false);}
    }
  }
  async function logout(scope:'local'|'global',expectedUserId?:string) {
    try {
      const result=await signOutAccount(scope,expectedUserId,()=>{
        invalidate();clear();navigate('welcome');actionBusy.current=null;setBusy(false);
      });
      if (!result.localCleared) setNotice('Device credential removal failed. Lock this device and retry sign-out before sharing it.');
      else if (!result.serverRevoked) setNotice('Signed out locally. Server session revocation could not be confirmed; retry online.');
    } catch (error) {
      setNotice(error instanceof Error?error.message:'Sign-out could not be confirmed. Retry before sharing this device.');
    }
  }
  useEffect(() => {
    mounted.current = true;
    let activeUser: string | null = null;
    let validation = 0;
    let restricted = false;
    const validateAccess = async () => {
      const userId = activeUser,
        version = ++validation;
      if (!userId) {
        setCovered(false);
        return;
      }
      let ordinaryDenied=false;
      try {
        let next: AccountContext | null = null;
        let own: PrivacyIdentity | null = null;
        try {const candidate=getAccountProofCandidate();if(!candidate||candidate.userId!==userId)throw new AccountRpcError('Sign in again.','42501',403);next=await getVerifiedAccountContext(candidate.accessToken,userId);}
        catch (error) {
          if (!(error instanceof AccountRpcError) || error.code !== '42501') throw error;
          if(!mounted.current||version!==validation||userId!==activeUser||AppState.currentState!=='active')return;
          ordinaryDenied=true;accessAuthorityInvalid.current=true;setJournalLocalAccess(null);setCovered(true);
          own = await managedRpc<PrivacyIdentity>('get_privacy_context', {}, userId);
        }
        if (
          !mounted.current ||
          version !== validation ||
          userId !== activeUser ||
          AppState.currentState !== "active"
        )
          return;
        if ((next?.user.id ?? own?.userId) !== userId)
          throw new Error("Account identity changed.");
        if (own) {
          if (!restricted) { invalidate(); clear(); navigate('privacy'); }
          restricted = true; setPrivacyIdentity(own);
        } else if (restricted) {
          restricted = false; setPrivacyIdentity(null); navigate('Home');
        }
        setContext(next);
        accessAuthorityInvalid.current=false;setAccessFailureTransient(false);setAccessError("");
        setCovered(false);
      } catch (error) {
        if (
          !mounted.current ||
          version !== validation ||
          userId !== activeUser ||
          AppState.currentState !== "active"
        )
          return;
        if (ordinaryDenied||!isTransientAccountFailure(error)) {
          accessAuthorityInvalid.current=true;setJournalLocalAccess(null);setAccessFailureTransient(false);
          invalidate();
          clear();
          navigate("signin");
          setNotice(
            "Current account access could not be verified. Sign in again or use Help.",
          );
          void signOutAccount("local", userId).catch(() => {});
        } else {
          setAccessFailureTransient(true);
          setAccessError(
            "Reconnect to verify current account access. No financial or messaging action is confirmed offline.",
          );
        }
        setCovered(false);
      }
    };
    void establishAppPrivacy().then((ready) => {
      if (mounted.current) setPrivacyReady(ready);
    });
    if (AppState.currentState === "active")
      accountClient?.auth.startAutoRefresh();
    const subscription = accountClient?.auth.onAuthStateChange(
      (event, session) => {
        activeUser = session?.user.id ?? null;
        if (event !== "TOKEN_REFRESHED") restricted = false;
        validation++;
        if (event === "SIGNED_OUT") {
          ++generation.current;
          clear();
          navigate("welcome");
          setAccessError("");
          setCovered(false);
        } else if (session && event !== "TOKEN_REFRESHED") {
          invalidate();
          clear();
          if (event === 'PASSWORD_RECOVERY' || hasVerifiedRecovery()) {
            navigate('recovery'); setCovered(false); return;
          }
          navigate("signin");
          queueMicrotask(() => {
            void refresh().catch(() => {
              clear();
              navigate("signin");
              setNotice("Sign in again to verify current account access.");
            });
          });
        }
      },
    ).data.subscription;
    const lifecycle = AppState.addEventListener("change", (state) => {
      setCovered(true);
      validation++;
      generation.current++;
      if (state === "active") {
        accountClient?.auth.startAutoRefresh();
        void validateAccess();
      } else {
        accountClient?.auth.stopAutoRefresh();
        if(state==='background')setPassword('');
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && activeUser)
        void validateAccess();
    }, 60_000);
    return () => {
      mounted.current = false;
      invalidate();
      subscription?.unsubscribe();
      lifecycle.remove();
      clearInterval(timer);
      validation++;
      accountClient?.auth.stopAutoRefresh();
    };
  }, [clear, refresh, invalidate]);
  useEffect(()=>{
    const author=context?.user.id;
    if(!author||context?.user.state!=='active')return;
    const lifetime=accountGeneration;
    const writing=createPrivateWritingLifetime({
      current:()=>mounted.current&&currentPrivateFlow.current.authorId===author&&currentPrivateFlow.current.generation===lifetime,
      monotonicNow:()=>performance.now(),attempted:()=>messageCoordinator.current?.controller.pendingThreads().some(row=>row.conversationId===currentPrivateFlow.current.conversationId&&row.uncertain)??false,
      clearUnsent:()=>{messageCoordinator.current?.controller.clearUnattempted();setRecoveredSends([]);setMessageDrafts({});setReportWords('');setPreparation(null);setDraftPolicies({});setResponse('listen');},
      invalidateDraftHandlers:()=>{currentPrivateFlow.current={...currentPrivateFlow.current,privateEpoch:currentPrivateFlow.current.privateEpoch+1};setPrivateDraftEpoch(value=>value+1);},
      discardUnattemptedReview:()=>{setReviewed(null);setAwaitingMessageConfirmation(false);setReviewLocked(false);if(currentPrivateFlow.current.screen==='review')navigate('conversation');},
      hideAttemptedReview:()=>setReviewLocked(true),
    });
    privateWriting.current=writing;
    const lifecycle=AppState.addEventListener('change',state=>{if(state==='background')writing.lock();});
    const timer=setInterval(()=>{if(AppState.currentState==='active')writing.tick();},1000);
    return()=>{writing.cancel();lifecycle.remove();clearInterval(timer);if(privateWriting.current===writing)privateWriting.current=null;};
  },[context?.user.id,context?.user.state,accountGeneration]);
  useEffect(()=>{
    const userId=context?.user.id,kind=context?.user.kind;
    if(screen!=='Home'||!userId||context?.user.state!=='active')return;
    let alive=true;
    void Promise.resolve().then(async()=>{
      if(!alive)return;setHomeError(false);
      try {
        if(kind==='child')await managedRpc('refresh_checkin_invitations',{},userId);
        const [questions,page]=await Promise.all([
          managedRpc<{question:string}[]>(kind==='parent'?'list_checkin_schedules':'list_checkin_invitations',{},userId),
          managedRpc<ConversationPage>('list_conversations_page',{p_limit:1},userId),
        ]);
        if(alive){setHomeQuestion(questions[0]?.question??null);setHomeConversation(page.conversations[0]??null);}
      } catch {if(alive){setHomeError(true);setHomeQuestion(null);setHomeConversation(null);}}
    });
    return()=>{alive=false;};
  },[screen,context?.user.id,context?.user.kind,context?.user.state,homeRetry]);
  useEffect(() => {
    const userId=context?.user.id;
    if (!userId || !accountClient || !['Chats','conversation','review'].includes(screen)) return;
    let alive=true, fetching=false;
    const refreshMessages=async () => {
      if (!alive || fetching || AppState.currentState!=='active') return;
      fetching=true;
      try {
        if (screen==='Chats') {
          if(pagedBeyondFirst.current){if(alive)setConnectionNotice('Older conversations are shown. Refresh the list to check for new updates.');return;}
          const page=await managedRpc<ConversationPage>('list_conversations_page',{p_limit:50},userId);
          if (alive) {setConversations(page.conversations);setConversationCursor(page.hasMore?page.nextBeforeId:null);}
        } else if (conversationId) {
          const next=await managedRpc<{messages:Message[];canExchange:boolean}>('fetch_messages',{p_conversation_id:conversationId},userId);
          if (alive) { setMessages(next.messages); setConversation(previous=>previous?.id===conversationId?{...previous,canExchange:next.canExchange}:previous); }
        }
        if (alive) setConnectionNotice('Up to date with the account server.');
      } catch {
        if (alive) setConnectionNotice('Updates unavailable. Reconnect and refresh; no delivery is assumed.');
      } finally { fetching=false; }
    };
    // The SDK's initial Realtime auth bootstrap is asynchronous; wait before the first join.
    const client=accountClient,version=generation.current;
    let channel:ReturnType<typeof client.channel>|undefined;
    void (async()=>{
      const current=await client.auth.getSession();
      if(current.error||current.data.session?.user.id!==userId||!alive||version!==generation.current)return;
      await client.realtime.setAuth();
      if(!alive||version!==generation.current)return;
      channel=client.channel(`own-updates-${userId}-${randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'api',table:'user_invalidations',filter:`user_id=eq.${userId}`},()=>{void refreshMessages();}).subscribe(status=>{
        if(alive&&status==='SUBSCRIBED')void refreshMessages();
      });
    })().catch(()=>{if(alive)setConnectionNotice('Live updates are unavailable. Periodic authorized refresh remains active.');});
    const timer=setInterval(()=>{void refreshMessages();},15_000);
    const lifecycle=AppState.addEventListener('change',state=>{if(state==='active')void refreshMessages();});
    void refreshMessages();
    return ()=>{alive=false;clearInterval(timer);lifecycle.remove();if(channel)void client.removeChannel(channel);};
  },[context?.user.id,conversationId,screen]);
  const back = useCallback(
    () => go(context ? "Home" : privacyIdentity ? "privacy" : "welcome"),
    [context, privacyIdentity, go],
  );
  useEffect(() => {
    const backPress = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "Journal") return false;
      if (screen === "Finance") return false;
      if (screen === "Home" || screen === "welcome") return false;
      if (screen === "review") {
        const flow=currentPrivateFlow.current;
        const uncertain=messageCoordinator.current?.controller.pendingThreads().some(row=>row.conversationId===flow.conversationId&&row.uncertain);
        go(uncertain?'Home':'conversation');
        return true;
      }
      back();
      return true;
    });
    return () => backPress.remove();
  }, [back, go, screen]);
  function privateActionCurrent(authorId:string,lifetime:number,version:number,privateEpoch:number) {
    const active=currentPrivateFlow.current;
    return mounted.current && AppState.currentState==='active' && generation.current===version
      && active.authorId===authorId && active.generation===lifetime && active.privateEpoch===privateEpoch;
  }
  async function loadChats() {
    const authorId=context?.user.id,version=generation.current,lifetime=accountGeneration,privateEpoch=currentPrivateFlow.current.privateEpoch,intent=++navigationIntent.current;
    if(!authorId)return;
    const page=await managedRpc<ConversationPage>('list_conversations_page',{p_limit:50},authorId);
    if(!privateActionCurrent(authorId,lifetime,version,privateEpoch)||navigationIntent.current!==intent)return;
    pagedBeyondFirst.current=false;setConversations(page.conversations);setConversationCursor(page.hasMore?page.nextBeforeId:null);
    go('Chats');
  }
  async function loadCircle() { go('Circle'); }
  async function openConversation(item: Conversation):Promise<boolean> {
    const authorId=context?.user.id,version=generation.current,lifetime=accountGeneration,privateEpoch=currentPrivateFlow.current.privateEpoch,intent=++navigationIntent.current;
    if(!authorId)return false;
    const valid=()=>privateActionCurrent(authorId,lifetime,version,privateEpoch)&&navigationIntent.current===intent;
    const data=await managedRpc<{messages:Message[];canExchange:boolean}>('fetch_messages',{p_conversation_id:item.id},authorId);
    if(!valid())return false;
    const contacts=await managedRpc<AuthorizedJournalContact[]>('list_contacts',{},authorId);
    if(!valid())return false;
    const current=contacts.find(row=>row.canExchange&&!row.revoked&&row.bothAccepted&&((row.a===authorId&&row.b===item.peerId)||(row.b===authorId&&row.a===item.peerId)));
    const peerName=current?(current.a===authorId?current.bName:current.aName):'Connection unavailable';
    const pending=senderFor({authorId,conversationId:item.id,peerId:item.peerId},lifetime);
    setReviewed(pending.snapshot());setAwaitingMessageConfirmation(pending.uncertain());
    setReviewLocked(pending.uncertain());
    setConversation({...item,peerName:peerName||'Permitted person',canExchange:data.canExchange});
    setMessages(data.messages);setMessagesHaveOlder(data.messages.length===50);
    navigate(pending.uncertain()?'review':'conversation');setNotice('');
    for(const message of data.messages) {
      if(!valid())return false;
      if(message.senderId!==authorId&&message.status==='available')await managedRpc('ack_message',{p_message_id:message.id},authorId);
    }
    return valid()&&!pending.uncertain();
  }
  const secret = (
    <View style={{ gap: 8 }}>
      <Body>Password</Body>
      <TextInput
        accessibilityLabel="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={screen === "register" ? "newPassword" : "password"}
        maxLength={128}
        style={{
          minHeight: 52,
          borderWidth: 1,
          borderRadius: 10,
          borderColor: t.border,
          color: t.text,
          backgroundColor: t.surface,
          padding: 14,
          fontSize: 17,
        }}
      />
    </View>
  );
  const signIn = async () => {
    if (!accountClient) throw Error("Account services are not configured.");
    const result = await signedOutAuth(() => accountClient!.auth.signInWithPassword({
      email: email.trim(), password,
    }));
    setPassword("");
    if (result.error)
      throw Error(
        "Sign-in failed. Check your credentials and account verification.",
      );
    await refresh();
  };
  let content;
  if (screen === "safety")
    content = (
      <>
        <Heading>A safe person can help.</Heading>
        <Body>
          If someone at home is unsafe, you can reach another trusted adult,
          teacher or local emergency services. You do not need permission to
          seek help.
        </Body>
        <Body>
          Between Us is not an emergency service. Public report handling is not
          operating yet. Journal pages are never automatically attached to
          reports.
        </Body>
        {context && (
          <>
            <Field
              label="Report description (sent only when you submit)"
              value={reportWords}
              key={`report-${privateDraftEpoch}`}
              onChangeText={value=>{if(context&&currentPrivateFlow.current.authorId===context.user.id&&currentPrivateFlow.current.generation===accountGeneration&&currentPrivateFlow.current.privateEpoch===privateDraftEpoch&&privateWriting.current?.touch()===true)setReportWords(value);}}
              multiline
            />
            {
              <Button
                key={"Submit a confidential staging report"}
                label={"Submit a confidential staging report"}
                disabled={busy||authPending}
                primary={false}
                onPress={() =>
                  void act(async () => {
                    const result = await accountRpc<{
                      id: string;
                    }>("submit_report", {
                      p_reported_user_id: null,
                      p_description: reportWords,
                    });
                    setReportWords("");
                    setNotice(
                      `Staging report recorded: ${result.id}. This does not promise a staffed response.`,
                    );
                  })
                }
              />
            }
          </>
        )}
      </>
    );
  else if (!accountClient && screen !== "settings")
    content = (
      <>
        <Heading large>Some things are easier to write.</Heading>
        <Body>
          Account services are not configured for this build. Public enrollment
          is closed while security, child privacy and operations are reviewed.
        </Body>
        <Body>
          Every child and teen joins with their parent or guardian. No shared
          family password or ordinary role switch signs someone in as the child.
        </Body>
        <Button label="Appearance" onPress={() => go("settings")} />
        <Button label="Help & safety" onPress={() => go("safety")} />
      </>
    );
  else if (screen === "welcome")
    content = (
      <>
        <Heading large>A place to start, together.</Heading>
        <Body>{"when it's hard to find the words, start here"}</Body>
        <Body>
          Parents and guardians set up Between Us together with their child or
          teen, at every age. Each person has their own account.
        </Body>
        <Button label="Sign in" primary disabled={authPending} onPress={() => go("signin")} />
        <Button
          label="Create a parent account"
          disabled={authPending}
          onPress={() => go("register")}
        />
        <Button
          label="Join with my guardian"
          disabled={authPending}
          onPress={() => go("child-join")}
        />
        <Body muted>
          Development services accept fictional test accounts only.
        </Body>
      </>
    );
  else if (screen === "signin" || screen === "register")
    content = (
      <>
        <Heading>
          {screen === "register"
            ? "Create your parent account"
            : "Welcome back"}
        </Heading>
        <Field
          label="Email or child account identifier"
          value={email}
          onChangeText={setEmail}
        />
        {secret}
        {screen === "register" ? (
          <Button
            key={"Create parent account"}
            label={"Create parent account"}
            disabled={busy||authPending}
            primary={true}
            onPress={() =>
              void act(async () => {
                const intent = await accountApi<{
                  token: string;
                }>("/v1/enrollment/parent", { email: email.trim() });
                const result = await signedOutAuth(() => accountClient!.auth.signUp({
                  email: email.trim(),
                  password,
                  options: { emailRedirectTo: authRedirectTo(), data: { registration_token: intent.token } },
                }));
                setPassword("");
                if (result.error)
                  throw Error("Registration could not be completed.");
                go("verify");
              })
            }
          />
        ) : (
          <Button
            key={"Sign in"}
            label={"Sign in"}
            disabled={busy||authPending}
            primary={true}
            onPress={() => void act(signIn)}
          />
        )}
        <Button label="Recover my account" onPress={() => go("recovery")} />
      </>
    );
  else if (screen === "verify")
    content = (
      <>
        <Heading>Verify your account</Heading>
        <Body>
          Enter the code from your verification email. Local fictional mail is
          available only in the development mail inbox.
        </Body>
        <Field label="Email" value={email} onChangeText={setEmail} />
        <Field label="Verification code" value={code} onChangeText={setCode} />
        {
          <Button
            key={"Verify email"}
            label={"Verify email"}
            disabled={busy||authPending}
            primary={true}
            onPress={() =>
              void act(async () => {
                const result = await signedOutAuth(() => accountClient!.auth.verifyOtp({
                  email,
                  token: code,
                  type: "signup",
                }));
                setCode("");
                if (result.error)
                  throw Error("The code could not be verified.");
                await refresh();
              })
            }
          />
        }
        {
          <Button
            key={"Send another verification email"}
            label={"Send another verification email"}
            disabled={busy||authPending}
            primary={false}
            onPress={() =>
              void act(async () => {
                const result = await signedOutAuth(() => accountClient!.auth.resend({
                  type: "signup",
                  email, options: { emailRedirectTo: authRedirectTo() },
                }));
                if (result.error) throw Error("Try again later.");
                setNotice("If eligible, a verification email was requested.");
              })
            }
          />
        }
      </>
    );
  else if (screen === "recovery")
    content = (
      <>
        <Heading>Recover your own account</Heading>
        <Body>
          Recovery restores account access; it does not restore a lost
          device-only journal key. Opaque child identifiers have no mailbox and
          need a reviewed recovery process.
        </Body>
        <Field
          label="Your verified email"
          value={email}
          onChangeText={setEmail}
        />
        {
          <Button
            key={"Request recovery code"}
            label={"Request recovery code"}
            disabled={busy||authPending}
            primary={false}
            onPress={() =>
              void act(async () => {
                const result = await signedOutAuth(() => accountClient!.auth.resetPasswordForEmail(email, { redirectTo: authRedirectTo() }));
                if (result.error) throw Error("Recovery request could not be confirmed. Try again later.");
                setNotice("If eligible, a recovery email was requested.");
              })
            }
          />
        }
        <Field label="Recovery code" value={code} onChangeText={setCode} />
        {secret}
        {
          <Button
            key={"Verify and change password"}
            label={"Verify and change password"}
            disabled={busy||authPending}
            primary={true}
            onPress={() =>
              void act(async () => {
                const result = await runAuthMutation(async () => {
                  if (recoveryProof) requireRecoveryProof(recoveryProof);
                  else {
                    await requireSignedOut();
                    const verified = await accountClient!.auth.verifyOtp({ email, token: code, type: "recovery" });
                    const current = verifiedRecoveryProof();
                    if (verified.error || !current || current.userId !== verified.data.user?.id || current.token !== verified.data.session?.access_token) throw Error("Recovery could not be verified.");
                    requireRecoveryProof(current);
                  }
                  return accountClient!.auth.updateUser({ password });
                });
                setPassword("");
                setCode("");
                if (result.error) throw Error("Password could not be changed.");
                finishRecovery();
                await refresh();
                setNotice(
                  "Password changed. Other devices require separate session revocation.",
                );
              })
            }
          />
        }
      </>
    );
  else if (screen === "family")
    content = (
      <>
        <Heading>Your family starts here</Heading>
        <Field
          label={context?.user.kind === "pending" ? "Your name" : "Family name"}
          value={name}
          onChangeText={setName}
        />
        {
          <Button
            key={
              context?.user.kind === "pending"
                ? "Finish my parent account"
                : "Create family"
            }
            label={
              context?.user.kind === "pending"
                ? "Finish my parent account"
                : "Create family"
            }
            disabled={busy||authPending}
            primary={true}
            onPress={() =>
              void act(async () => {
                if (context?.user.kind === "pending")
                  await accountRpc("bootstrap_parent", {
                    p_display_name: name,
                  });
                else
                  await accountRpc("create_family", {
                    p_name: name,
                    p_timezone:
                      Intl.DateTimeFormat().resolvedOptions().timeZone,
                  });
                setName("");
                await refresh();
              })
            }
          />
        }
      </>
    );
  else if (screen === "child")
    content = (
      <>
        <Heading>Set up together</Heading>
        <Body>
          A guardian manages setup for every child and teen. Notice and
          independently verified consent come before activation. This screen
          cannot approve its own consent.
        </Body>
        <Field
          label="Child or teen's name (fictional only)"
          value={name}
          onChangeText={setName}
        />
        {
          <Button
            key={"Create pending child profile"}
            label={"Create pending child profile"}
            disabled={busy||authPending}
            primary={true}
            onPress={() =>
              void act(async () => {
                const id = await accountRpc<string>("create_child", {
                  p_family_id: familyId,
                  p_name: name,
                });
                await accountRpc("request_child_consent", {
                  p_child_id: id,
                  p_notice_version: context?.policy.noticeVersion,
                  p_policy_version: context?.policy.consentPolicyVersion,
                });
                setName("");
                await refresh();
                go("child");
                setNotice(
                  "Pending profile and consent request saved. Independent verification is required before enrollment.",
                );
              })
            }
          />
        }
        <Body>
          Once consent has been verified, let the child choose their own
          password here.
        </Body>
        {secret}
        {context?.children.map((child) => (
          <Button
            key={`Set up ${child.name}'s separate account`}
            label={`Set up ${child.name}'s separate account`}
            disabled={busy||authPending}
            primary={false}
            onPress={() =>
              void act(async () => {
                const enrolled = await accountApi<{
                  email: string;
                  acceptanceToken: string;
                }>("/v1/enrollment/child", { childId: child.id, password });
                setPassword("");
                setEmail(enrolled.email);
                setCode(enrolled.acceptanceToken);
                setNotice(
                  `Independent account created: ${enrolled.email}. Sign out, then the child signs in with their own password and accepts the invitation. Before signing out, copy the separate identifier and one-time invitation below for your child. The invitation expires in 30 minutes.`,
                );
              })
            }
          />
        ))}
        <Text
          selectable
          accessibilityLabel="Child account identifier and one-time invitation"
          style={{ color: t.text, fontSize: 16 }}
        >
          {email}
          {"\n"}
          {code}
        </Text>
      </>
    );
  else if (screen === "child-join")
    content = (
      <>
        <Heading>Join with your guardian</Heading>
        <Body>
          Your guardian needs to set this up with you, whether you are a child
          or a teen. Choose your own credential. This does not give your
          guardian access to your private journal.
        </Body>
        {!context ? (
          <>
            <Field
              label="Your separate account identifier"
              value={email}
              onChangeText={setEmail}
            />
            {secret}
            {
              <Button
                key={"Sign in as myself"}
                label={"Sign in as myself"}
                disabled={busy||authPending}
                primary={true}
                onPress={() => void act(signIn)}
              />
            }
          </>
        ) : (
          <>
            <Field
              label="One-time guardian enrollment invitation"
              value={code}
              onChangeText={setCode}
            />
            {
              <Button
                key={"Accept my account invitation"}
                label={"Accept my account invitation"}
                disabled={busy||authPending}
                primary={true}
                onPress={() =>
                  void act(async () => {
                    await accountRpc("accept_child_enrollment", {
                      p_token: code,
                    });
                    setCode("");
                    await refresh();
                  })
                }
              />
            }
          </>
        )}
      </>
    );
  else if (screen === "guardian")
    content = (
      <>
        <Heading>Invite or join a family</Heading>
        <Body>Invitation family: {context?.families.find(row=>row.id===familyId)?.name ?? 'No family selected. You can accept an invitation below.'}</Body>
        {context?.families.filter(row=>context.memberships.some(m=>m.familyId===row.id&&m.role==='guardian')).map(row=><Button key={row.id} label={`Invitation family: ${row.name}`} selected={row.id===familyId} onPress={()=>setSelectedFamilyId(row.id)}/>)}
        <Body>
          An invitation does not prove guardianship. Only invite an authorized
          adult. Each adult signs in to their own account.
        </Body>
        <Field label="Guardian email" value={email} onChangeText={setEmail} />
        {
          <Button
            key={"Create guardian invitation"}
            label={"Create guardian invitation"}
            disabled={busy||authPending}
            primary={false}
            onPress={() =>
              void act(async () => {
                const result = await accountRpc<{
                  token: string;
                }>("invite_guardian", {
                  p_family_id: familyId,
                  p_email: email,
                });
                setCode(result.token);
              })
            }
          />
        }
        <Field label="Invitation token" value={code} onChangeText={setCode} />
        {
          <Button
            key={"Accept invitation for my account"}
            label={"Accept invitation for my account"}
            disabled={busy||authPending}
            primary={false}
            onPress={() =>
              void act(async () => {
                await accountRpc("accept_guardian_invite", { p_token: code });
                setCode("");
                await refresh();
              })
            }
          />
        }
      </>
    );
  else if (screen === "Circle" || screen === "Checkins") content = null;
  else if (screen === "Chats")
    content = (
      <>
        <Heading>Conversations</Heading>
        <Body>
          Messages here use the configured account service. Saved means stored
          by the server; it does not mean read or received by another device.
        </Body>
        {
          <Button
            key={"New conversation"}
            label={"New conversation"}
            disabled={busy||authPending}
            primary={true}
            onPress={() => void act(loadCircle)}
          />
        }
        {conversations.length === 0 && (
          <Body>
            No conversations yet. Connect with a permitted person in My Circle.
          </Body>
        )}
        <Button label="Refresh conversations" quiet disabled={busy||authPending} onPress={()=>{void act(loadChats);}}/>
        {messageOutboxSupported ? <>
          <Button label="Find interrupted sends on this device" quiet disabled={busy||authPending} onPress={()=>{void act(async()=>{
            if(!context||!backendUrl)return;
            const version=generation.current,lifetime=accountGeneration,epoch=currentPrivateFlow.current.privateEpoch;
            const records=await createMessageOutbox({issuer:`${backendUrl}/auth/v1`,authorId:context.user.id}).loadRecovery();
            if(!privateActionCurrent(context.user.id,lifetime,version,epoch))return;
            setRecoveredSends(records);setNotice(records.length?'Choose an original approved message to review. Nothing was automatically sent.':'No interrupted sends are stored on this device.');
          });}}/>
          {recoveredSends.map((record,index)=><Button key={record.message.id} label={`Review interrupted send ${index+1}`} disabled={busy||authPending} onPress={()=>{void act(async()=>{
            const message=record.message;
            if(!context||message.authorId!==context.user.id||privateWriting.current?.touch()!==true)return;
            const sender=senderFor(message);sender.adopt(message,{attempted:true});
            const known=conversations.find(row=>row.id===message.conversationId&&row.peerId===message.peerId);
            setConversation(known??{id:message.conversationId,peerId:message.peerId,canExchange:false,peerName:'Original recipient'});
            setMessages([]);setMessagesHaveOlder(false);setReviewed(sender.snapshot());setAwaitingMessageConfirmation(true);setReviewLocked(false);
            navigate('review');setNotice(record.status==='saved'?'The server save was already confirmed. Retry only finishes its local recovery cleanup.':'This is the original approved command. A retry keeps its message ID and checks the current server outcome and permissions.');
          });}}/>)}
        </> : <Body muted>Browser sends have memory-only recovery. Keep this page open until the server confirms the outcome.</Body>}

        {conversations.map(item=><View key={item.id} style={{gap:6,paddingVertical:12,borderBottomWidth:1,borderColor:t.border}}>
          <Button label={`Open conversation with ${item.peerName || 'Permitted person'}`} disabled={busy||authPending} onPress={()=>void act(()=>openConversation(item))}/>
          <Body>{item.preview || 'No available messages yet.'}</Body>
          {!!item.lastMessageAt&&<Body muted>{new Date(item.lastMessageAt).toLocaleString()}</Body>}
        </View>)}
        {!!conversationCursor&&<Button label="Load older conversations" disabled={busy||authPending} onPress={()=>{void act(async()=>{
          if(!context)return;const version=generation.current,epoch=currentPrivateFlow.current.privateEpoch,intent=navigationIntent.current;
          const page=await accountRpc<ConversationPage>('list_conversations_page',{p_limit:50,p_before_id:conversationCursor});
          if(!privateActionCurrent(context.user.id,accountGeneration,version,epoch)||navigationIntent.current!==intent||currentPrivateFlow.current.screen!=='Chats')return;
          pagedBeyondFirst.current=true;setConversations(previous=>[...previous,...page.conversations.filter(row=>!previous.some(old=>old.id===row.id))]);setConversationCursor(page.hasMore?page.nextBeforeId:null);
        });}}/>}
      </>
    );
  else if (screen === "review") content = <><Heading>Review your words</Heading>
            <Body>To: {conversation?.peerName ?? "Permitted person"}</Body>
            <Body>Response: {reviewed?.response}</Body>
            <Body>{reviewLocked?'These reviewed words are hidden after locking. Retry sends the same previously approved message. Its wording cannot be changed while the outcome is unknown.':reviewed?.body}</Body>
            <Body>
              Only these reviewed words will be sent. Journal entries are not
              attached.
            </Body>
            <Body muted>{messageOutboxSupported?'Choosing Send protects this approved command on this device for exact retry after interruption. Unsent drafts and journal entries are separate.':'Browser recovery lasts only while this page stays open.'}</Body>
            {
              <Button
                key={"Send reviewed message"}
                label={
                  awaitingMessageConfirmation
                    ? "Retry reviewed message"
                    : "Send reviewed message"
                }
                disabled={busy||authPending}
                primary={true}
                onPress={() =>
                  void act(async () => {
                    const message = reviewed;
                    if (
                      !message ||
                      !conversation ||
                      message.conversationId !== conversation.id ||
                      !currentDraftScope({issuer:`${backendUrl}/auth/v1`,authorId:message.authorId,conversationId:message.conversationId,peerId:message.peerId},accountGeneration)
                    )
                      throw Error("Review the message first.");
                    if(privateWriting.current?.touch()!==true)return;
                    setAwaitingMessageConfirmation(true);
                    try {
                      await senderFor(message).submit({
                        conversationId: conversation.id,
                        peerId: conversation.peerId,
                      });
                    } catch (error) {
                      if(!currentReviewedScope({issuer:`${backendUrl}/auth/v1`,authorId:message.authorId,conversationId:message.conversationId,peerId:message.peerId},accountGeneration))throw error;
                      if (!senderFor(message).uncertain()) {
                        setAwaitingMessageConfirmation(false);
                        setReviewed(null);
                        navigate("conversation");
                      }
                      throw error;
                    }
                    if(!currentReviewedScope({issuer:`${backendUrl}/auth/v1`,authorId:message.authorId,conversationId:message.conversationId,peerId:message.peerId},accountGeneration))return;
                    setAwaitingMessageConfirmation(false);
                    setReviewLocked(false);
                    setReviewed(null);
                    setMessageDrafts(previous=>previous[message.conversationId]===message.body?{...previous,[message.conversationId]:''}:previous);
                    setRecoveredSends(previous=>previous.filter(row=>row.message.id!==message.id));
                    if(currentPrivateFlow.current.screen==='review') {
                      try {if(!await openConversation(conversation))return;}
                      catch {
                        if(currentReviewedScope({issuer:`${backendUrl}/auth/v1`,authorId:message.authorId,conversationId:message.conversationId,peerId:message.peerId},accountGeneration)) {
                          navigate('Chats');setNotice('Saved by the server. This conversation history is no longer available to this account.');
                        }
                        return;
                      }
                    }
                    if(!currentReviewedScope({issuer:`${backendUrl}/auth/v1`,authorId:message.authorId,conversationId:message.conversationId,peerId:message.peerId},accountGeneration))return;
                    setNotice(
                      "Saved by the server. Device receipt is not confirmed.",
                    );
                  })
                }
              />
            }
            <Button
              label="Edit before sending"
              disabled={awaitingMessageConfirmation || busy}
              onPress={() => go("conversation")}
            />
    </>;
  else if (screen === "settings")
    content = (
      <>
        <Heading>Profile & appearance</Heading>
        {!context&&!privacyIdentity&&readAccountBoundary().userId&&<Button label="Sign out on this device" onPress={()=>{void logout('local',readAccountBoundary().userId??undefined);}}/>}
        <Body>{t.name}</Body>
        {(["system", "light", "dark"] as const).map((option) => (
          <Button
            key={option}
            label={
              option === "system"
                ? "Follow device appearance"
                : option === "light"
                  ? "Safe Harbor · Light"
                  : "Night Harbor · Dark"
            }
            selected={appearance === option}
            onPress={() => setAppearance(option)}
          />
        ))}
        {(context || privacyIdentity) && (
          <>
            <Button label="Account, devices & data privacy" onPress={() => go("privacy")} />
            {!!context && <Button label="Notification preferences" onPress={()=>go('notifications')}/>}
            {
              <Button
                key={"Sign out on this device"}
                label={"Sign out on this device"}
                primary={false}
                onPress={() => { void logout("local", context?.user.id ?? privacyIdentity?.userId); }}
              />
            }
            {
              <Button
                key={"Sign out all devices"}
                label={"Sign out all devices"}
                primary={false}
                onPress={() => { void logout("global", context?.user.id ?? privacyIdentity?.userId); }}
              />
            }
          </>
        )}
      </>
    );
  else if (screen === "Journal")
    content = (
      <>
        <Heading>My Journal</Heading>
        <Body>
          The protected device vault requires a compatible native build. Journal
          contents are never sent to this account service.
        </Body>
      </>
    );
  else
    content = (
      <>
        <Body>Hi, {context?.user.displayName || "there"}.</Body>
        <Heading large>Some things are easier to write.</Heading>
        <Button
          label="Talk to someone"
          primary
          onPress={() => void act(loadCircle)}
        />
        <Button label="Write privately" quiet onPress={() => go("Journal")} />
        <Button label="Chores & savings" onPress={() => go("Finance")} />
        <View style={{gap:12,paddingVertical:20,borderTopWidth:1,borderColor:t.border}}><Heading>An open door</Heading>
          <Body>{homeQuestion??(guardian?'A small question can be a comfortable place to start.':'Check-ins are invitations. You can answer, come back later, or skip.')}</Body>
          <Button label="Open the Door" quiet onPress={()=>go('Checkins')}/>
        </View>
        {!!homeConversation&&<View style={{gap:8}}><Body muted>Within your Circle</Body><Button label={`Continue with ${homeConversation.peerName||'a permitted person'}`} quiet onPress={()=>{void act(()=>openConversation(homeConversation));}}/></View>}
        {homeError&&<><Body muted>Home updates could not be loaded. Your actions still check current server access.</Body><Button label="Retry home updates" quiet onPress={()=>setHomeRetry(value=>value+1)}/></>}
        {context?.user.kind==='parent'&&<Button label="Family & guardian access" quiet onPress={()=>go('FamilyAccess')}/>}
        {guardian && (
          <>
            <Button
              label="Set up with my child or teen"
              quiet
              onPress={() => go("child")}
            />
            <Button label="Invite a guardian" quiet onPress={() => go("guardian")} />
          </>
        )}
        {!familyId && (
          <Button label="Create a family" onPress={() => go("family")} />
        )}
        <Body muted>
          No public enrollment, real transfers or staffed safety service is
          enabled by this development build.
        </Body>
      </>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <StatusBar style={t.name === "Night Harbor" ? "light" : "dark"} />
      <View style={{flex:1}} pointerEvents={covered||!privacyReady||privateMessageCapture.covered||accountCovered||helpOpen?'none':'auto'} accessibilityElementsHidden={covered||!privacyReady||privateMessageCapture.covered||accountCovered||helpOpen} importantForAccessibility={covered||!privacyReady||privateMessageCapture.covered||accountCovered||helpOpen?'no-hide-descendants':'auto'}>
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderBottomWidth: 1,
          borderColor: t.border,
        }}
      >
        <Image
          source={require("../../assets/brand/symbol.png")}
          accessibilityLabel="Between Us"
          style={{ width: 42, height: 42, borderRadius: 8, backgroundColor: t.logoSurface }}
        />
        <View style={{ flex: 1, minWidth:0 }}>
          <Body>Between Us</Body>
        </View>
        <Button label="Help" onPress={() => setHelpOpen(true)} />
        {!["Home", "welcome", "Journal", "Finance", "Circle", "Checkins", "privacy", "notifications", "FamilyAccess"].includes(screen) && (
          <Button label="Back" onPress={back} />
        )}
        {!["Journal", "Finance", "Checkins"].includes(screen) && (
          <SettingsAction onPress={()=>go('settings')}/>
        )}
      </View>
      {screen === 'privacy' && !!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:t.text,padding:16}}>{notice}</Text>}
      <WritingKeyboardView>
      {screen === 'FamilyAccess' && context ? (
        <ProductionFamily key={`${context.user.id}:${accountGeneration}`} context={context} onBack={back} onChanged={refresh} onInvitations={id=>{if(id)setSelectedFamilyId(id);go('guardian');}}/>
      ) : screen === 'conversation' && context && conversation ? (
        <ProductionConversation key={`${context.user.id}:${accountGeneration}:${privateDraftEpoch}:${conversation.id}`} ownId={context.user.id} peerName={conversation.peerName||'Permitted person'} messages={messages} words={words} response={response} busy={busy} canExchange={conversation.canExchange} hasOlder={messagesHaveOlder} connectionNotice={notice||connectionNotice}
          privateDraft={{context,conversationId:conversation.id,peerId:conversation.peerId,
            isCurrent:scope=>currentDraftScope(scope,accountGeneration),
            verifyRecipient:async(scope,signal)=>{
              if(signal.aborted||!currentDraftScope(scope,accountGeneration))return false;
              const rows=await managedRpc<AuthorizedJournalContact[]>('list_contacts',{},scope.authorId);
              return !signal.aborted&&currentDraftScope(scope,accountGeneration)&&rows.some(row=>row.canExchange&&!row.revoked&&row.bothAccepted&&((row.a===scope.authorId&&row.b===scope.peerId)||(row.b===scope.authorId&&row.a===scope.peerId)));
            },
            onClear:scope=>{if(currentDraftScope(scope,accountGeneration))setMessageDrafts(previous=>({...previous,[scope.conversationId]:''}));},
            onRecover:(scope,value)=>{if(currentDraftScope(scope,accountGeneration)&&AppState.currentState==='active'&&privateWriting.current?.touch()===true){setMessageDrafts(previous=>({...previous,[scope.conversationId]:value.words}));setResponse(value.response);setReviewed(null);}},
          }}
          onWords={value=>{if(currentDraftScope({issuer:`${backendUrl}/auth/v1`,authorId:context.user.id,conversationId:conversation.id,peerId:conversation.peerId},accountGeneration)&&privateWriting.current?.touch()===true){setWords(value);setReviewed(null);}}} onResponse={value=>{if(currentDraftScope({issuer:`${backendUrl}/auth/v1`,authorId:context.user.id,conversationId:conversation.id,peerId:conversation.peerId},accountGeneration)&&privateWriting.current?.touch()===true){setResponse(value);setReviewed(null);}}}
          onSafety={()=>go('safety')}
          onRefresh={()=>{void act(()=>openConversation(conversation));}}
          onOlder={()=>{void act(async()=>{
            const version=generation.current,epoch=currentPrivateFlow.current.privateEpoch,intent=navigationIntent.current;
            const page=await accountRpc<{messages:Message[];canExchange:boolean}>('fetch_messages',{p_conversation_id:conversation.id,p_before_id:messages[0]?.id});
            if(!privateActionCurrent(context.user.id,accountGeneration,version,epoch)||navigationIntent.current!==intent||currentPrivateFlow.current.conversationId!==conversation.id)return;
            setMessages(previous=>[...page.messages.filter(row=>!previous.some(old=>old.id===row.id)),...previous]);setMessagesHaveOlder(page.messages.length===50);
          });}}
          onReview={()=>{void act(async()=>{
            if(!currentDraftScope({issuer:`${backendUrl}/auth/v1`,authorId:context.user.id,conversationId:conversation.id,peerId:conversation.peerId},accountGeneration))throw new Error('The account or conversation changed. Review your own words again.');
            if(privateWriting.current?.touch()!==true)return;setReviewLocked(false);
            setReviewed(senderFor({authorId:context.user.id,conversationId:conversation.id,peerId:conversation.peerId}).stage({recipientPolicy:draftPolicies[conversation.id],authorId:context.user.id,conversationId:conversation.id,peerId:conversation.peerId,body:words,response}));go('review');
          });}}/>
      ) : screen === 'notifications' && context ? (
        <ProductionNotifications key={`${context.user.id}:${accountGeneration}`} context={context} onBack={()=>go('settings')}/>
      ) : screen === 'privacy' && (context || privacyIdentity) ? (
        <ProductionAccount key={`${context?.user.id ?? privacyIdentity?.userId}:${accountGeneration}`} context={context ?? undefined} identity={privacyIdentity ?? undefined} onBack={back} onSignOut={expectedUserId=>logout('local',expectedUserId)} onSignOutOthers={signOutOtherSessions} onAccessChanged={refresh}/>
      ) : screen === "Journal" && context ? (
        <ProductionJournal
          key={`${context.user.id}:${accountGeneration}`}
          context={context}
          onBack={back}
          onOpenSafety={() => setHelpOpen(true)}
          onLocalAccessChange={publishJournalAccess}
          onPrepareConversation={value=>{if(currentPrivateFlow.current.authorId!==context.user.id||currentPrivateFlow.current.generation!==accountGeneration||privateWriting.current?.touch()!==true)return;setPreparation({...value,authorId:context.user.id});go('Circle');}}
        />
      ) : screen === "Circle" && context ? (
        <ProductionCircle key={`${context.user.id}:${accountGeneration}`} context={context} onBack={()=>{setPreparation(null);back();}} preparation={preparation?.authorId===context.user.id?preparation:undefined}
          onOpenConversation={(id,peerId)=>{void act(()=>openConversation({id,peerId,canExchange:true}));}}
          onPrepare={value=>{void act(async()=>{if(!preparation||preparation.authorId!==context.user.id)throw new Error('Prepare these words again for your own account.');if(!await openConversation({id:value.conversationId,peerId:value.peerId,canExchange:true})||privateWriting.current?.touch()!==true)return;setMessageDrafts(previous=>({...previous,[value.conversationId]:value.text}));setDraftPolicies(previous=>({...previous,[value.conversationId]:{excludedContactIds:[...preparation.excludedContactIds],excludedCategories:[...preparation.excludedCategories]}}));setResponse('listen');setPreparation(null);setReviewed(null);});}}/>
      ) : screen === "Checkins" && context ? (
        <ProductionCheckins key={`${context.user.id}:${accountGeneration}`} context={context} onBack={back} onPrepareConversation={value=>{void act(async()=>{const version=generation.current,epoch=currentPrivateFlow.current.privateEpoch;const valid=()=>privateActionCurrent(context.user.id,accountGeneration,version,epoch);const current=await accountRpc<AuthorizedJournalContact[]>('list_contacts');if(!valid())return;const contact=current.find(row=>row.canExchange&&!row.revoked&&row.bothAccepted&&(row.a===value.recipientId||row.b===value.recipientId));if(!contact)throw new Error('This connection is not currently permitted.');const created=await accountRpc<{id:string}>('create_conversation',{p_contact_id:contact.id});if(!valid()||!await openConversation({id:created.id,peerId:value.recipientId,canExchange:true})||privateWriting.current?.touch()!==true)return;setMessageDrafts(previous=>({...previous,[created.id]:value.text}));setDraftPolicies(previous=>{const next={...previous};delete next[created.id];return next;});setResponse(value.response);setReviewed(null);});}}/>
      ) : screen === "Finance" && context ? (
        <ProductionFinance
          key={`${context.user.id}:${accountGeneration}`}
          context={context}
          onBack={back}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              width: "100%",
              maxWidth: 700,
              alignSelf: "center",
              padding: 24,
              paddingBottom: 40,
              gap: 20,
            }}
          >
            {notice ? <Text accessibilityLiveRegion="polite" style={{color:t.text,fontSize:17,lineHeight:26}}>{notice}</Text> : null}
            {busy && <Body>Checking with the account service…</Body>}
            {content}
            {['Chats','conversation','review'].includes(screen) && !!connectionNotice && <Body muted>{connectionNotice}</Body>}
            <Body muted style={{fontSize:11}}>1116-FinanceCheckpoints-r2 · {deploymentTarget.statusLabel}</Body>
            <Button label="Help & safety" quiet onPress={() => go("safety")} />
          </ScrollView>
        </View>
      )}
      </WritingKeyboardView>
      {context?.user.state === "active" &&
        !["Journal", "Finance", "Checkins"].includes(screen) && (
          <View
            style={{
              flexDirection: "row",
              gap: 2,
              padding: 6,
              borderTopWidth: 1,
              borderColor: t.border,
            }}
          >
            {(["Home", "Journal", "Chats", "Circle"] as const).map((tab) => (
              <View key={tab} style={{ flex: 1 }}>
                <NavigationTab
                  label={tab}
                  selected={screen === tab || (tab==='Chats' && ['conversation','review'].includes(screen))}
                  onPress={() => {
                    if (tab === "Chats") void act(loadChats);
                    else if (tab === "Circle") void act(loadCircle);
                    else go(tab);
                  }}
                />
              </View>
            ))}
          </View>
        )}
      </View>
      {privateMessageCapture.covered&&<View style={{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:t.background,padding:24,justifyContent:'center',gap:18}} accessibilityViewIsModal>
        <Heading>Private words stay covered.</Heading><Body>{privateMessageCapture.error?'Device capture protection could not be confirmed. Return home and reopen the conversation.':'Preparing this device’s privacy protection…'}</Body>
        <Button label="Return home" onPress={()=>go('Home')}/><Button label="Help" onPress={()=>setHelpOpen(true)}/>
      </View>}
      {!privacyReady && (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: t.background,
            padding: 24,
            justifyContent: "center",
            gap: 20,
          }}
        >
          <Heading>Device privacy protection is required.</Heading>
          <Body>
            This build has not established native app-switcher protection.
            Account content stays covered.
          </Body>
          <Button
            label="Retry device protection"
            onPress={() => {
              void establishAppPrivacy().then(setPrivacyReady);
            }}
          />
          <Button label="Help" onPress={() => setHelpOpen(true)} />
          {(context||privacyIdentity)&&<Button label="Sign out on this device" onPress={()=>{void logout('local',context?.user.id??privacyIdentity?.userId);}}/>}
        </View>
      )}
      {accountCovered && (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: t.background,
            padding: 24,
            justifyContent: "center",
            gap: 20,
          }}
        >
          <Heading>Account access needs checking</Heading>
          <Body>{accessError}</Body>
          <Button
            label="Retry account check"
            onPress={() => {
              void act(async () => {
                await accountRpc("get_context");
                setAccessError("");
              });
            }}
          />
          <Button label="Help" onPress={() => setHelpOpen(true)} />
          {(context||privacyIdentity)&&<Button label="Sign out on this device" onPress={()=>{void logout('local',context?.user.id??privacyIdentity?.userId);}}/>}
        </View>
      )}
      <Modal
        visible={helpOpen}
        onRequestClose={() => setHelpOpen(false)}
        animationType="none"
      >
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: t.background,
            padding: 24,
            gap: 24,
          }}
        >
          <Heading>A safe person can help.</Heading>
          <Body>
            If someone at home is unsafe, you can seek another trusted adult,
            teacher or local emergency services. You do not need permission to
            seek help.
          </Body>
          <Body>
            Between Us is not an emergency service. Public report handling is
            not operating yet.
          </Body>
          <Button label="Close help" onPress={() => setHelpOpen(false)} />
        </SafeAreaView>
      </Modal>
      {covered && (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: t.background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Heading>Between Us</Heading>
          <Button label="Help" onPress={()=>setHelpOpen(true)}/>
        </View>
      )}
    </SafeAreaView>
  );
}
