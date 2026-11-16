import { sameJournalAuthorSession, type VerifiedJournalAccess } from './journal-access';
import { VaultError, type EntrySummary, type LockReason, type NativeVaultConfiguration, type PrivateDraft, type VaultController } from './vault';
export type MessageDraftResponse = 'listen'|'reply'|'later'|'talk';
export type MessageDraftScope = Readonly<{issuer:string;authorId:string;conversationId:string;peerId:string}>;
export type MessageDraftSummary = EntrySummary & {kind:'conversation'};
export type RecoveredMessageDraft = {words:string;response:MessageDraftResponse};
export type MessageDraftState = {open:boolean;covered:boolean;notice:string;drafts:MessageDraftSummary[]};
export type MessageDraftFactory = (options?:Pick<NativeVaultConfiguration,'onLock'|'onConceal'>)=>Promise<VaultController>;
export type MessageDraftOptions = {
  scope:MessageDraftScope;
  current():boolean;
  active():boolean;
  verify(signal:AbortSignal):Promise<VerifiedJournalAccess>;
  verifyRecipient(scope:MessageDraftScope,signal:AbortSignal):Promise<boolean>;
  clear(scope:MessageDraftScope):void;
  changed(state:MessageDraftState):void;
  vaultFactory:MessageDraftFactory;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const preferences:readonly MessageDraftResponse[]=['listen','reply','later','talk'];
export function messageDraftMarker(scope:MessageDraftScope){
  if(!scope||![scope.authorId,scope.conversationId,scope.peerId].every(value=>typeof value==='string'&&uuid.test(value))
    ||scope.authorId===scope.peerId||typeof scope.issuer!=='string'||scope.issuer.length>512)throw new VaultError('invalid-input');
  return `message-thread:${scope.conversationId}`;
}
export function matchingMessageDrafts(rows:Awaited<ReturnType<VaultController['listDrafts']>>,scope:MessageDraftScope):MessageDraftSummary[]{
  const title=messageDraftMarker(scope);
  return rows.filter((row):row is MessageDraftSummary=>row.kind==='conversation'&&row.title===title);
}
function matches(draft:PrivateDraft,scope:MessageDraftScope){
  return draft.kind==='conversation'&&draft.title===messageDraftMarker(scope)&&draft.recipientCandidate===scope.peerId
    &&typeof draft.body==='string'&&draft.body.length<=5000&&preferences.includes(draft.responsePreference as MessageDraftResponse);
}
/** Manual own-author protection only. No timer, journal entry read, network send or automatic recovery. */
export function createPrivateMessageDraftController(ports:MessageDraftOptions){
  const scope=Object.freeze({...ports.scope});messageDraftMarker(scope);
  let vault:VaultController|undefined,access:VerifiedJournalAccess|undefined,abort:AbortController|undefined;
  let version=0,busy=false,disposed=false,open=false,covered=false,suppressManualClear=false,drafts:MessageDraftSummary[]=[],selected:Pick<PrivateDraft,'id'|'revision'>|undefined;
  const current=()=>!disposed&&ports.current();
  const listThread=(controller:VaultController)=>controller.listDrafts({kind:'conversation',title:messageDraftMarker(scope)});
  const publish=(notice:string)=>{if(current())ports.changed({open,covered,notice,drafts:[...drafts]});};
  function invalidate(reason:LockReason,clear=true){
    version++;abort?.abort();abort=undefined;access=undefined;open=false;covered=false;drafts=[];selected=undefined;
    if(clear&&current())ports.clear(scope);
    publish(clear?`Private message storage locked (${reason}). The last confirmed protected copy stays local. Unprotected edits were cleared; background lock does not flush them.`
      :'Private message storage is closed. Confirmed copies were not reset, and no automatic save or composer replacement was performed.');
  }
  const check=(stamp:number)=>{if(!current()||!ports.active()||covered||version!==stamp)throw new VaultError('cancelled');};
  async function verify(stamp:number,signal:AbortSignal){
    const next=await ports.verify(signal);check(stamp);
    if(next.actor.issuer!==scope.issuer||next.actor.subject!==scope.authorId||(access&&!sameJournalAuthorSession(access,next)))throw new VaultError('identity-mismatch');
    return next;
  }
  async function perform<T>(work:(controller:VaultController,stamp:number,signal:AbortSignal)=>Promise<T>):Promise<T>{
    if(busy||!open||!vault)throw new VaultError('locked');busy=true;
    const stamp=version,controller=vault,signal=abort?.signal;
    if(!signal){busy=false;throw new VaultError('locked');}
    try{check(stamp);access=await verify(stamp,signal);const result=await work(controller,stamp,signal);check(stamp);return result;}
    catch(error){if(version===stamp){
      if(error instanceof VaultError&&['storage','conflict','quota','invalid-input'].includes(error.code))publish('Protection did not finish. Your current words remain in memory; the last confirmed protected copy was not replaced by a success claim.');
      else{invalidate('revoked');await controller.lock('revoked').catch(()=>undefined);}
    }throw error;}
    finally{busy=false;}
  }
  return {
    scope,
    async unlock(enroll=false,acknowledged=false){
      if(busy||disposed||!current()||!ports.active())throw new VaultError('locked');
      if(enroll&&!acknowledged)throw new VaultError('invalid-input');
      busy=true;const stamp=++version;abort?.abort();const operation=new AbortController();abort=operation;
      try{
        access=undefined;const next=await verify(stamp,operation.signal);
        if(!vault){
          const created=await ports.vaultFactory({onLock:reason=>invalidate(reason,!(suppressManualClear&&reason==='manual')),onConceal:value=>{covered=value;publish(value?'Private words are covered during device authentication.':'Private device storage is open.');}});
          if(!current()||version!==stamp){await created.dispose();throw new VaultError('cancelled');}vault=created;
        }
        check(stamp);access=next;
        if(enroll)await vault.enroll(next.actor,operation.signal);
        await vault.unlock(next.actor,operation.signal);check(stamp);
        access=await verify(stamp,operation.signal);open=true;
        drafts=matchingMessageDrafts(await listThread(vault),scope);check(stamp);
        publish('Own-author message storage is unlocked. Typing is not protected until you choose Protect this message.');
      }catch(error){
        if(version===stamp){invalidate('manual',false);suppressManualClear=true;try{await vault?.lock('manual').catch(()=>undefined);}finally{suppressManualClear=false;}}throw error;
      }finally{busy=false;}
    },
    async protect(words:string,response:MessageDraftResponse){
      if(typeof words!=='string'||!words.trim()||words.length>5000||!preferences.includes(response))throw new VaultError('invalid-input');
      const snapshot={words,response};
      return perform(async(controller,stamp)=>{
        const saved=await controller.saveDraft({id:selected?.id,expectedRevision:selected?.revision??null,title:messageDraftMarker(scope),body:snapshot.words,
          kind:'conversation',recipientCandidate:scope.peerId,responsePreference:snapshot.response});
        check(stamp);if(!matches(saved,scope))throw new VaultError('corrupt');selected={id:saved.id,revision:saved.revision};
        drafts=matchingMessageDrafts(await listThread(controller),scope);check(stamp);publish('This exact message copy was protected on this device. Later edits need Protect again.');return snapshot;
      });
    },
    list:()=>perform(async(controller,stamp)=>{const rows=matchingMessageDrafts(await listThread(controller),scope);check(stamp);drafts=rows;publish('Choose a protected copy for this conversation. Recovery replaces current unsent words only after your explicit choice.');return [...rows];}),
    recover:(id:string)=>perform(async(controller,stamp,signal)=>{
      const rows=matchingMessageDrafts(await listThread(controller),scope);check(stamp);
      if(!rows.some(row=>row.id===id)||!await ports.verifyRecipient(scope,signal))throw new VaultError('identity-mismatch');check(stamp);
      const saved=await controller.readDraft(id);check(stamp);
      if(!saved||!matches(saved,scope)||!await ports.verifyRecipient(scope,signal))throw new VaultError('identity-mismatch');check(stamp);
      // Session/author are verified again after the local read and current-recipient checks.
      access=await verify(stamp,signal);selected={id:saved.id,revision:saved.revision};
      return {words:saved.body,response:saved.responsePreference as MessageDraftResponse};
    }),
    touch(){return current()&&ports.active()&&!covered&&open&&vault?.touch()===true;},
    async lock(reason:LockReason='manual'){invalidate(reason);await vault?.lock(reason);},
    async dispose(){if(disposed)return;invalidate('manual',false);disposed=true;await vault?.dispose();vault=undefined;},
  };
}
export type PrivateMessageDraftController=ReturnType<typeof createPrivateMessageDraftController>;
