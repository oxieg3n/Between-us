import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateMessageDraftController, matchingMessageDrafts, messageDraftMarker, type MessageDraftScope, type MessageDraftState } from '../src/production/private-message-draft-policy';
import { VaultError,type NativeVaultConfiguration,type PrivateDraft,type VaultController } from '../src/production/vault';
import type { VerifiedJournalAccess } from '../src/production/journal-access';
const id=(n:number)=>`b0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope:MessageDraftScope={issuer:'https://fixture.example/auth/v1',authorId:id(1),conversationId:id(2),peerId:id(3)};
function fixture(){
  const rows=new Map<string,PrivateDraft>(),states:MessageDraftState[]=[],calls:string[]=[],filters:unknown[]=[];
  let callbacks:Pick<NativeVaultConfiguration,'onLock'|'onConceal'>|undefined,serial=10;
  const state={current:true,active:true,session:id(4),author:scope.authorId,recipient:true,recipientCalls:0,clears:0,enroll:0,unlock:0,read:0,
    failSave:false,failUnlock:false,holdRead:undefined as (()=>Promise<void>)|undefined,holdSave:undefined as (()=>Promise<void>)|undefined};
  const guard=()=>{throw Error('Journal/erase/export API must never be called by message drafts');};
  const vault:VaultController={enroll:async()=>{state.enroll++;},unlock:async()=>{state.unlock++;if(state.failUnlock)throw new VaultError('identity-mismatch');},
    lock:async reason=>{calls.push(`lock:${reason}`);callbacks?.onLock?.(reason);},touch:()=>true,dispose:async()=>{calls.push('dispose');},
    list:guard,read:guard,save:guard,delete:guard,preparePlaintextExport:guard,erase:guard,
    async listDrafts(filter){filters.push(filter);return [...rows.values()].filter(row=>(!filter?.kind||row.kind===filter.kind)&&(!filter?.title||row.title===filter.title))
      .slice(0,50).map(({id,title,revision,createdAt,updatedAt,kind})=>({id,title,revision,createdAt,updatedAt,kind}));},
    async readDraft(value){state.read++;await state.holdRead?.();return rows.get(value);},
    async saveDraft(value){if(state.failSave)throw new VaultError('storage');await state.holdSave?.();
      const previous=value.id?rows.get(value.id):undefined;if(previous&&previous.revision!==value.expectedRevision)throw new VaultError('conflict');
      const saved:PrivateDraft={...value,id:value.id??id(serial++),revision:(previous?.revision??0)+1,createdAt:'2026-11-16T12:00:00.000Z',updatedAt:'2026-11-16T12:00:00.000Z'};
      rows.set(saved.id,saved);return saved;
    },clearDraft:guard,
  };
  const controller=createPrivateMessageDraftController({scope,current:()=>state.current,active:()=>state.active,
    verify:async()=>({actor:{issuer:scope.issuer,subject:state.author,sessionId:state.session},token:'fictional-transient-token',role:'child'} as VerifiedJournalAccess),
    verifyRecipient:async()=>{state.recipientCalls++;return state.recipient;},clear:()=>{state.clears++;},changed:value=>states.push(value),
    vaultFactory:async value=>{callbacks=value;calls.push('factory');return vault;},
  });
  const add=(n:number,change:Partial<PrivateDraft>={})=>{
    const row:PrivateDraft={id:id(n),revision:1,title:messageDraftMarker(scope),body:'Fictional protected words',kind:'conversation',recipientCandidate:scope.peerId,responsePreference:'later',
      createdAt:'2026-11-16T12:00:00.000Z',updatedAt:'2026-11-16T12:00:00.000Z',...change};rows.set(row.id,row);return row;
  };
  return {controller,rows,states,calls,filters,state,add,callbacks:()=>callbacks};
}

test('no automatic vault/auth/content work; unlock lists only current-thread conversation metadata and never journals',async()=>{
  const f=fixture();f.add(11);f.add(12,{kind:'journal-editor',title:messageDraftMarker(scope),recipientCandidate:null,responsePreference:null});f.add(13,{title:`message-thread:${id(99)}`});
  assert.deepEqual(f.calls,[]);assert.equal(f.state.unlock,0);assert.equal(f.state.read,0);
  await f.controller.unlock();assert.equal(f.state.enroll,0);assert.equal(f.state.read,0);
  assert.deepEqual(f.filters[0],{kind:'conversation',title:messageDraftMarker(scope)});
  assert.deepEqual(f.states.at(-1)?.drafts.map(row=>row.id),[id(11)]);
  assert.equal(JSON.stringify(f.states).includes('Fictional protected words'),false,'state/summary does not expose a body');
  const summaries=[...f.rows.values()].map(({id,title,revision,createdAt,updatedAt,kind})=>({id,title,revision,createdAt,updatedAt,kind}));
  assert.equal(matchingMessageDrafts(summaries,scope).length,1);
});

test('manual protect stores <=5000 own words, exact recipient/thread and later preference; repeated protect uses revision CAS',async()=>{
  const f=fixture();await f.controller.unlock();
  await f.controller.protect('Fictional private message','later');const first=[...f.rows.values()][0];
  assert.equal(first.kind,'conversation');assert.equal(first.recipientCandidate,scope.peerId);assert.equal(first.responsePreference,'later');assert.equal(first.title,messageDraftMarker(scope));
  await f.controller.protect('Fictional private message edited','reply');assert.equal(f.rows.size,1);assert.equal(f.rows.get(first.id)?.revision,2);
  assert.equal(f.state.recipientCalls,0,'protecting own unsent words does not claim contact verification or delivery');
  await assert.rejects(f.controller.protect('x'.repeat(5001),'listen'),error=>error instanceof VaultError&&error.code==='invalid-input');
  await assert.rejects(f.controller.protect('words','unexpected' as 'listen'),error=>error instanceof VaultError&&error.code==='invalid-input');
});

test('only explicit recovery reads selected body; matching recipient is checked before/after and response is exact',async()=>{
  const f=fixture(),copy=f.add(11);await f.controller.unlock();await f.controller.list();assert.equal(f.state.read,0);
  assert.deepEqual(await f.controller.recover(copy.id),{words:copy.body,response:'later'});assert.equal(f.state.read,1);assert.equal(f.state.recipientCalls,2);
  assert.equal(f.state.clears,0,'recovery returns words but does not auto-review/send/clear composer');
  const blocked=fixture();blocked.add(11);await blocked.controller.unlock();blocked.state.recipient=false;
  await assert.rejects(blocked.controller.recover(id(11)));assert.equal(blocked.state.read,0,'unverified/blocked recipient denies before reading body');
});

test('cross-thread, wrong-recipient, unknown-kind and wrong-author/session remain closed',async()=>{
  for(const change of [{title:`message-thread:${id(99)}`},{recipientCandidate:id(99)},{kind:'journal-editor' as const}]){
    const f=fixture();f.add(11,change);await f.controller.unlock();await assert.rejects(f.controller.recover(id(11)));
  }
  const other=fixture();other.state.author=id(99);await assert.rejects(other.controller.unlock());assert.equal(other.state.unlock,0);assert.equal(other.calls.includes('factory'),false);
  const session=fixture();session.add(11);await session.controller.unlock();session.state.session=id(99);
  await assert.rejects(session.controller.recover(id(11)));assert.equal(session.state.read,0);
});

test('background and old-author races withhold a late recovery result and clear only the still-current bound scope',async()=>{
  const f=fixture();f.add(11);await f.controller.unlock();let release!:()=>void,started=false;
  f.state.holdRead=()=>{started=true;return new Promise(resolve=>{release=resolve;});};
  const reading=f.controller.recover(id(11));while(!started)await new Promise(resolve=>setImmediate(resolve));
  f.state.active=false;await f.controller.lock('background');release();await assert.rejects(reading);assert.ok(f.state.clears>0);assert.equal(f.states.at(-1)?.open,false);
  const old=fixture();old.add(11);await old.controller.unlock();old.state.current=false;await old.controller.lock('account-change');assert.equal(old.state.clears,0,'late A callback must not clear B/new thread');
});

test('recipient/session changes during a local read cannot return protected words',async()=>{
  const f=fixture();f.add(11);await f.controller.unlock();f.state.holdRead=async()=>{f.state.recipient=false;};
  await assert.rejects(f.controller.recover(id(11)));assert.equal(f.state.read,1);assert.equal(f.states.at(-1)?.open,false);
  const changed=fixture();changed.add(11);await changed.controller.unlock();changed.state.holdRead=async()=>{changed.state.session=id(99);};
  await assert.rejects(changed.controller.recover(id(11)));assert.equal(changed.states.at(-1)?.open,false);
});

test('failed storage protection preserves current memory and never claims a confirmed flush; in-flight background save is stale',async()=>{
  const f=fixture();await f.controller.unlock();f.state.failSave=true;await assert.rejects(f.controller.protect('Fictional unsaved edits','listen'));
  assert.equal(f.state.clears,0);assert.equal(f.states.at(-1)?.open,true);assert.match(f.states.at(-1)?.notice??'',/did not finish/);
  const racing=fixture();await racing.controller.unlock();let release!:()=>void,started=false;
  racing.state.holdSave=()=>{started=true;return new Promise(resolve=>{release=resolve;});};
  const saving=racing.controller.protect('Fictional in-flight words','talk');while(!started)await new Promise(resolve=>setImmediate(resolve));
  racing.state.active=false;await racing.controller.lock('background');release();await assert.rejects(saving);assert.equal(racing.states.at(-1)?.open,false);
  assert.equal(racing.states.some(value=>value.notice.startsWith('This exact message copy')),false,'late native commit must not publish protection success');
});

test('setup requires its explicit acknowledgement and never erases/replaces another author storage',async()=>{
  const f=fixture();await assert.rejects(f.controller.unlock(true,false));assert.equal(f.state.enroll,0);assert.equal(f.calls.length,0);
  await f.controller.unlock(true,true);assert.equal(f.state.enroll,1);assert.equal(f.state.unlock,1);
  const denied=fixture();denied.state.failUnlock=true;await assert.rejects(denied.controller.unlock());assert.equal(denied.state.clears,0,'cancelled/failed unlock does not erase ordinary composer words');
  await denied.controller.dispose();assert.equal(denied.calls.includes('dispose'),true);
});
