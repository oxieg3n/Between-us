import {useEffect,useMemo,useRef,useState} from 'react';
import { AppState, FlatList, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Text, TextInput } from "../adaptive-writing-text";
import * as ScreenCapture from 'expo-screen-capture';
import {randomUUID} from 'expo-crypto';
import {createPrivateScreenCaptureLease} from './private-screen-capture-lease';
import {useAppearance} from '../appearance';
import {Body,Button,Heading} from '../ui';
import {accountClient,backendUrl,type AccountContext} from './client';
import {createPrivateMessageDraftStorage,privateMessageDraftsSupported} from './private-message-drafts';
import type {MessageDraftFactory,MessageDraftScope,MessageDraftState,PrivateMessageDraftController,RecoveredMessageDraft} from './private-message-draft-policy';
import {VaultError} from './vault';
import {JournalAccessError} from './journal-access';

export type ResponsePreference='listen'|'reply'|'later'|'talk';
export const responseLabels={listen:'Just listen',reply:'Give me ideas',later:'Talk later',talk:'Talk in person'} as const;
export type ThreadMessage={id:string;senderId:string;body:string;createdAt:string;status:string;response?:string};
export type PrivateMessageDraftControls={context:AccountContext;conversationId:string;peerId:string;isCurrent:(scope:MessageDraftScope)=>boolean;
  verifyRecipient:(scope:MessageDraftScope,signal:AbortSignal)=>Promise<boolean>;onClear:(scope:MessageDraftScope)=>void;
  onRecover:(scope:MessageDraftScope,draft:RecoveredMessageDraft)=>void;vaultFactory?:MessageDraftFactory};
type Props={ownId:string;peerName:string;messages:ThreadMessage[];words:string;response:ResponsePreference;busy:boolean;canExchange:boolean;hasOlder:boolean;connectionNotice:string;onWords:(value:string)=>void;onResponse:(value:ResponsePreference)=>void;onReview:()=>void;onRefresh:()=>void;onOlder:()=>void;onSafety:()=>void;privateDraft?:PrivateMessageDraftControls};
const closedDraftState=():MessageDraftState=>({open:false,covered:false,notice:'Unsent words stay in memory until you explicitly protect a copy. Background/lock can clear unprotected edits without saving them.',drafts:[]});
function privateDraftFailure(error:unknown){
  if(error instanceof JournalAccessError)return error.message;
  if(error instanceof VaultError){
    if(error.code==='identity-mismatch')return 'This device belongs to another author, or the recipient/session changed. Existing storage was not reset.';
    if(error.code==='unsupported')return 'Protected message drafts require a compatible native SQLCipher build, strong device biometry and verified backup exclusions. No plaintext fallback is used.';
    if(error.code==='key-unavailable')return 'No usable own-author device key is available. Unlock existing storage, or deliberately set it up only if this device has never been enrolled. No automatic replacement is allowed.';
    if(error.code==='already-enrolled')return 'Private storage already exists. Use Unlock private message drafts; setup cannot replace it.';
    if(error.code==='recovery-required')return 'Private storage setup was interrupted or files are unavailable. No file/key was replaced; a reviewed recovery process is required.';
    if(error.code==='invalid-input')return 'Use 1 to5000 characters and a supported response preference. Setup also requires its explicit acknowledgement.';
    if(error.code==='conflict')return 'The protected copy changed. Current words remain in memory; unlock and check the saved copy before replacing it.';
  }
  return 'Private protection could not be confirmed. Do not assume a failed or interrupted save protected the latest words; no message was sent.';
}
export function ProductionConversation(p:Props) {
  const {theme:t}=useAppearance(),[helpers,setHelpers]=useState(false);
  const [privateTools,setPrivateTools]=useState(false);
  const props=useRef(p);props.current=p;
  const storage=useRef<PrivateMessageDraftController|undefined>(undefined),draftBusy=useRef(false);
  const [privateState,setPrivateState]=useState(closedDraftState),[privateBusy,setPrivateBusy]=useState(false),[captureReady,setCaptureReady]=useState(false);
  const [setupAcknowledged,setSetupAcknowledged]=useState(false),[selectedCopy,setSelectedCopy]=useState(''),[protectedSignature,setProtectedSignature]=useState<string>();
  const [stateScopeKey,setStateScopeKey]=useState('');
  const [visibility,setVisibility]=useState(AppState.currentState);
  const author=p.privateDraft?.context.user.id,conversationId=p.privateDraft?.conversationId,peerId=p.privateDraft?.peerId,authorState=p.privateDraft?.context.user.state;
  const scope=useMemo<MessageDraftScope|undefined>(()=>backendUrl&&author===p.ownId&&authorState==='active'&&conversationId&&peerId?{issuer:`${backendUrl}/auth/v1`,authorId:author,conversationId,peerId}:undefined,[author,p.ownId,authorState,conversationId,peerId]);
  const scopeKey=JSON.stringify(scope??null);
  useEffect(()=>{
    let alive=true;let capture:ReturnType<typeof createPrivateScreenCaptureLease>|undefined;
    setPrivateState(closedDraftState());setStateScopeKey(scopeKey);setSelectedCopy('');setProtectedSignature(undefined);setSetupAcknowledged(false);setCaptureReady(false);
    const bound=()=>{const latest=props.current.privateDraft;return alive&&!!scope&&props.current.ownId===scope.authorId&&latest?.context.user.id===scope.authorId
      &&latest.context.user.state==='active'&&latest.conversationId===scope.conversationId&&latest.peerId===scope.peerId&&latest.isCurrent(scope);};
    if(scope&&p.privateDraft){
      try{storage.current=createPrivateMessageDraftStorage({scope,current:bound,active:()=>AppState.currentState==='active',
        verifyRecipient:(expected,signal)=>props.current.privateDraft?.verifyRecipient(expected,signal)??Promise.resolve(false),
        clear:expected=>{if(bound())props.current.privateDraft?.onClear(expected);},
        changed:state=>{if(alive){setPrivateState(state);if(!state.open){setProtectedSignature(undefined);setSelectedCopy('');}}},
        vaultFactory:p.privateDraft.vaultFactory,
      });}catch{setPrivateState({...closedDraftState(),notice:'Private draft scope is unavailable. No storage was opened.'});}
      if(privateMessageDraftsSupported)capture=createPrivateScreenCaptureLease({
        newTag:()=>`between-us-message-drafts-${randomUUID()}`,
        protect:tag=>ScreenCapture.preventScreenCaptureAsync(tag),release:tag=>ScreenCapture.allowScreenCaptureAsync(tag),
        onReady:()=>{if(alive)setCaptureReady(true);},onError:()=>{if(alive)setPrivateState({...closedDraftState(),notice:'Device privacy protection is unavailable; private storage stays closed.'});},
      });
    }
    const lifecycle=AppState.addEventListener('change',state=>{if(!alive)return;setVisibility(state);if(state==='background'){Keyboard.dismiss();void storage.current?.lock('background').catch(()=>undefined);}});
    const auth=accountClient?.auth.onAuthStateChange(event=>{if(!alive||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;
      Keyboard.dismiss();setPrivateState(closedDraftState());setSelectedCopy('');setProtectedSignature(undefined);void storage.current?.lock(event==='SIGNED_OUT'?'signout':'account-change').catch(()=>undefined);
    });
    return()=>{alive=false;const old=storage.current;storage.current=undefined;void old?.dispose().catch(()=>undefined);auth?.data.subscription.unsubscribe();lifecycle.remove();
      void capture?.dispose();
    };
    // Callback identities, appearance/font changes and typing must not replace the storage lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scope,scopeKey]);
  async function privateWork(work:(controller:PrivateMessageDraftController)=>Promise<void>){
    const controller=storage.current;if(!controller||draftBusy.current||!scope)return;draftBusy.current=true;setPrivateBusy(true);
    try{await work(controller);}catch(error){if(storage.current===controller)setPrivateState(previous=>({...previous,notice:privateDraftFailure(error)}));}
    finally{draftBusy.current=false;if(storage.current===controller)setPrivateBusy(false);}
  }
  const privateCovered=!!p.privateDraft&&(stateScopeKey!==scopeKey||privateState.covered||visibility!=='active'||!scope||!p.privateDraft.isCurrent(scope));
  const signature=JSON.stringify([p.words,p.response]),latestProtected=protectedSignature===signature;
  const list=useRef<FlatList<ThreadMessage>>(null),atBottom=useRef(true);
  if(privateCovered)return <View accessibilityViewIsModal style={{flex:1,backgroundColor:t.background,justifyContent:'center',padding:24}}><Heading>Private words are covered</Heading><Body>Return to this account and unlock when ready. No message is sent or automatically saved.</Body></View>;
  return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <View style={{paddingHorizontal:20,paddingTop:12,gap:6}}><Heading>Your conversation</Heading><Body>{p.peerName}</Body>
      <Body muted>{p.connectionNotice||'Checking current account permissions…'}</Body>
    </View>
    <FlatList ref={list} style={{flex:1}} data={p.messages} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{padding:16,gap:10,flexGrow:1}} maintainVisibleContentPosition={{minIndexForVisible:0}}
      onScroll={event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;atBottom.current=contentSize.height-contentOffset.y-layoutMeasurement.height<100;}}
      onContentSizeChange={()=>{if(atBottom.current)list.current?.scrollToEnd({animated:false});}}
      ListHeaderComponent={<View style={{gap:8,marginBottom:12}}>{p.hasOlder&&<Button label="Load earlier messages" disabled={p.busy} onPress={()=>{atBottom.current=false;p.onOlder();}}/>}<Button label="Refresh messages" quiet disabled={p.busy} onPress={p.onRefresh}/><Button label="Help & safety" quiet onPress={p.onSafety}/></View>}
      ListEmptyComponent={<Body muted>No messages yet. You can start with a simple request to talk.</Body>}
      renderItem={({item:m})=>{
        const own=m.senderId===p.ownId,color=own?t.onOutgoing:t.text;
        const request=m.response&&m.response in responseLabels?responseLabels[m.response as ResponsePreference]:null;
        return <View style={{padding:14,gap:7,borderRadius:14,maxWidth:'90%',alignSelf:own?'flex-end':'flex-start',backgroundColor:own?t.outgoing:t.incoming}}>
          <Text selectable style={{color,fontSize:17,lineHeight:26}}>{m.body}</Text>
          {!!request&&!own&&<Text style={{color,fontSize:13,lineHeight:19}}>Asked for: {request}</Text>}
          <Text style={{color:own?t.onOutgoing:t.muted,fontSize:12,lineHeight:18}}>{new Date(m.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {m.status==='saved'?'Saved on server':m.status==='acknowledged'?'Received by this app':m.status==='available'?'Available to this app':m.status}</Text>
        </View>;
      }}/>
    <View style={{padding:16,gap:10,maxHeight:'60%',flexShrink:1,borderTopWidth:1,borderColor:t.border,backgroundColor:t.surface}}>
      <ScrollView style={{flexGrow:0,flexShrink:1}} contentContainerStyle={{gap:10}} keyboardShouldPersistTaps="handled">
      {!p.canExchange&&<Body>This connection is no longer permitted. New messages cannot be sent.</Body>}
      <TextInput accessibilityLabel="Your words" multiline maxLength={5000} placeholder="Write when you’re ready…" placeholderTextColor={t.muted} value={privateCovered?'':p.words} onChangeText={value=>{
        if(privateState.open&&storage.current?.touch()!==true)return;
        p.onWords(value);
      }} editable={!p.busy&&!privateCovered} style={{minHeight:52,maxHeight:140,borderWidth:1,borderColor:t.border,borderRadius:12,padding:12,color:t.text,backgroundColor:t.background,fontSize:17,lineHeight:25,textAlignVertical:'top'}}/>
      {p.privateDraft&&<View style={{gap:8}}>
        <Button label={privateTools?'Close private draft options':'Private draft options'} quiet onPress={()=>setPrivateTools(value=>!value)}/>
        {!privateTools&&<Body muted>{latestProtected?'This exact copy is protected on this device.':'Draft in memory. Open private draft options to protect a recoverable copy.'}</Body>}
        {privateTools&&<>
        <Heading>Private message draft</Heading>
        {!privateMessageDraftsSupported?<Body muted>Browser message drafts stay in memory only. Protected recovery requires a compatible native device; no browser persistence is created.</Body>:<>
          <Body muted>{privateState.notice}</Body><Body muted>{latestProtected?'This exact copy was confirmed protected locally. Later edits need Protect again.':'Latest words are unprotected in memory. Choose Protect this message before leaving if you want a confirmed recoverable copy. Background/lock never promises a final save.'}</Body>
          {!privateState.open?<><Button label="Unlock private message drafts" disabled={privateBusy||!captureReady||p.busy} onPress={()=>void privateWork(controller=>controller.unlock())}/>
            <Button label="I understand this device has one enrolled author; key loss can permanently lose protected writing" selected={setupAcknowledged} disabled={privateBusy} onPress={()=>setSetupAcknowledged(value=>!value)}/>
            <Button label="Set up my private device storage" disabled={!setupAcknowledged||privateBusy||!captureReady||p.busy} onPress={()=>void privateWork(controller=>controller.unlock(true,true))}/></>:
            <><Button label="Protect this message" disabled={privateBusy||p.busy||!p.words.trim()} onPress={()=>{const words=p.words,response=p.response;void privateWork(async controller=>{await controller.protect(words,response);if(storage.current===controller)setProtectedSignature(JSON.stringify([words,response]));});}}/>
              <Button label="Find protected copies for this conversation" disabled={privateBusy||p.busy} onPress={()=>void privateWork(async controller=>{await controller.list();})}/>
              <Body muted>Only this conversation&apos;s protected message copies are shown. No journal pages are read. Recovering replaces current unsent words; protect those first if needed.</Body>
              {privateState.drafts.map(draft=><Button key={draft.id} label={`Choose protected message copy from ${draft.updatedAt}`} selected={selectedCopy===draft.id} disabled={privateBusy} onPress={()=>setSelectedCopy(draft.id)}/>)}
              {!!selectedCopy&&<Button label="Recover selected copy into composer" disabled={privateBusy||p.busy||!p.canExchange} onPress={()=>void privateWork(async controller=>{const result=await controller.recover(selectedCopy);const latest=props.current.privateDraft;
                if(storage.current===controller&&latest?.isCurrent(controller.scope)&&latest.conversationId===controller.scope.conversationId&&latest.peerId===controller.scope.peerId){latest.onRecover(controller.scope,result);setProtectedSignature(JSON.stringify([result.words,result.response]));setSelectedCopy('');}
              })}/>}
              <Button label="Lock private message storage" disabled={privateBusy} onPress={()=>void privateWork(controller=>controller.lock('manual'))}/></>}
        </>}
        </>}
      </View>}
      <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}><Button label={helpers?'Close conversation helpers':'Help me find the words'} quiet onPress={()=>setHelpers(value=>!value)}/><Button label="Can we talk?" quiet onPress={()=>p.onWords('Can we talk?')}/></View>
      {helpers&&<View style={{gap:10}}>
        <Body>Optional starters. Edit these words before review.</Body>
        <Button label="Help me reply" onPress={()=>p.onWords('Thank you for telling me. Would you like me to listen or share some ideas?')}/>
        <Button label="Conversation Do-Over" onPress={()=>p.onWords('Could we start that conversation again? I would like another chance to explain what I mean.')}/>
        {p.privateDraft?.context.user.kind==='parent'&&<><Button label="Start an apology" onPress={()=>p.onWords('I would like to apologize for something. Could we find a time to talk?')}/><Button label="Talk about a family change" onPress={()=>p.onWords('There is a change in our family I would like us to talk about together, when you are ready.')}/></>}
        <Heading>What I need from you</Heading>
        {(Object.keys(responseLabels) as ResponsePreference[]).map(value=><Button key={value} label={responseLabels[value]} selected={p.response===value} onPress={()=>{storage.current?.touch();p.onResponse(value);}}/>)}
      </View>}
      <Body muted>Response: {responseLabels[p.response]}. Nothing is sent before review.</Body>
      </ScrollView>
      <Button label="Review message" primary disabled={p.busy||!p.canExchange||!p.words.trim()} onPress={p.onReview}/>
    </View>
  </KeyboardAvoidingView>;
}
