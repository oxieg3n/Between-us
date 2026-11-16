import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinanceMutation, createPendingFinanceStore, decodePendingFinance, encodePendingFinance, MAX_PENDING_FINANCE_BYTES,
  pendingFinanceScopeKey, type PendingFinanceRecord, type PendingFinanceScope, type ProductionFinanceAction } from '../src/production/pending-finance-policy';
import type { FinanceView } from '../src/finance/types';
const id=(n:number)=>`a0000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const scope:PendingFinanceScope={issuer:'http://127.0.0.1:54321/auth/v1',authorId:id(1),familyId:id(2),childId:id(3)};
const action:ProductionFinanceAction={kind:'request_payout',amountCents:100};
const view={childId:scope.childId,balances:{availableCents:900}} as FinanceView;
function fixture(){
  const rows=new Map<string,string>(),events:string[]=[];const failures={write:false,remove:false,read:false};
  const raw={async getItem(key:string){events.push('read');if(failures.read)throw Error('private platform error');return rows.get(key)??null;},
    async setItem(key:string,value:string){events.push('write');if(failures.write)throw Error('private platform error');rows.set(key,value);},
    async removeItem(key:string){events.push('remove');if(failures.remove)throw Error('private platform error');rows.delete(key);}};
  const store=createPendingFinanceStore(raw,async value=>pendingFinanceScopeKey(value),true);
  return {rows,events,failures,store};
}
const saved=(envelope:PendingFinanceRecord['envelope'],outcome:PendingFinanceRecord['outcome']='unknown'):PendingFinanceRecord=>({version:1,scope,envelope,outcome});

test('restart recovers the immutable exact UUID/body without automatic resend; every send follows a verified storage write',async()=>{
  const f=fixture(),seen:string[]=[];let sends=0,ids=0;
  const send=async(request:PendingFinanceRecord['envelope'])=>{
    assert.equal((await f.store.load(scope))?.envelope.id,request.id,'write must precede transmission');
    seen.push(JSON.stringify(request));if(++sends===1)throw Error('unknown after possible commit');return view;
  };
  const first=createFinanceMutation(send,()=>{ids++;return id(10);},{scope,store:f.store,current:()=>true});
  assert.throws(()=>first.stage(action),/pending/);await first.recover();
  const staged=first.stage(action);assert.ok(Object.isFrozen(staged.action));
  await assert.rejects(first.submit(),/unknown/);assert.equal(sends,1);
  const restarted=createFinanceMutation(send,()=>{throw Error('must not replace recovered UUID');},{scope,store:f.store,current:()=>true});
  assert.deepEqual(await restarted.recover(),staged);assert.equal(sends,1,'storage recovery is read-only');
  assert.throws(()=>restarted.cancel(),/has not confirmed/);
  assert.equal(await restarted.submit(),view);assert.equal(seen[0],seen[1]);assert.equal(ids,1);assert.equal(await f.store.load(scope),null);
});

test('author, issuer, family and child all isolate recovery slots; mismatched stored scope fails closed without deletion',async()=>{
  const f=fixture();await f.store.put(scope,saved({id:id(10),action}),()=>true);
  for(const other of [{...scope,authorId:id(4)},{...scope,issuer:'https://other.example/auth/v1'},{...scope,familyId:id(5)},{...scope,childId:id(6)}])assert.equal(await f.store.load(other),null);
  const key=pendingFinanceScopeKey(scope),bad=JSON.stringify({...saved({id:id(10),action}),scope:{...scope,authorId:id(4)}});
  f.rows.set(key,bad);await assert.rejects(f.store.load(scope),/cannot be read safely/);assert.equal(f.rows.get(key),bad);
  await assert.rejects(f.store.remove(scope,id(10),()=>true),/cannot be read safely/);assert.equal(f.rows.get(key),bad);
});

test('storage write/read validation failures cause zero sends and cannot silently start a replacement operation',async()=>{
  const f=fixture();let sends=0;const queue=createFinanceMutation(async()=>{sends++;return view;},()=>id(10),{scope,store:f.store,current:()=>true});
  await queue.recover();queue.stage(action);f.failures.write=true;
  await assert.rejects(queue.submit(),/storage is unavailable/);assert.equal(sends,0);assert.ok(queue.pending());
  assert.throws(()=>queue.stage(action),/pending/);f.failures.write=false;f.failures.read=true;
  await assert.rejects(queue.submit(),/storage is unavailable/);assert.equal(sends,0);
});

test('a confirmed first rejection clears only after persisting its outcome; failed rejected cleanup is recoverable without resending',async()=>{
  const f=fixture();let sends=0;
  const queue=createFinanceMutation(async()=>{sends++;throw Object.assign(Error('amount rejected'),{confirmedRejected:true});},()=>id(10),{scope,store:f.store,current:()=>true});
  await queue.recover();queue.stage(action);f.failures.remove=true;
  await assert.rejects(queue.submit());assert.equal(queue.status(),'rejected');assert.equal((await f.store.load(scope))?.outcome,'rejected');
  const restarted=createFinanceMutation(async()=>{sends++;return view;},()=>id(11),{scope,store:f.store,current:()=>true});
  await restarted.recover();assert.equal(restarted.status(),'rejected');assert.throws(()=>restarted.stage(action),/pending/);
  f.failures.remove=false;await restarted.cleanupConfirmed();assert.equal(sends,1);assert.equal(restarted.pending(),null);assert.equal(restarted.stage(action).id,id(11));
  const clean=fixture(),rejected=createFinanceMutation(async()=>{throw Object.assign(Error('rejected'),{confirmedRejected:true});},()=>id(12),{scope,store:clean.store,current:()=>true});
  await rejected.recover();rejected.stage(action);await assert.rejects(rejected.submit(),/rejected/);assert.equal(rejected.pending(),null);assert.equal(await clean.store.load(scope),null);
});

test('known saved result survives failed removal and explicit cleanup never sends the financial command again',async()=>{
  const f=fixture();let sends=0;
  const queue=createFinanceMutation(async()=>{sends++;return view;},()=>id(10),{scope,store:f.store,current:()=>true});
  await queue.recover();queue.stage(action);f.failures.remove=true;
  await assert.rejects(queue.submit(),/server confirmed/);assert.equal((await f.store.load(scope))?.outcome,'saved');
  const restarted=createFinanceMutation(async()=>{sends++;return view;},()=>id(11),{scope,store:f.store,current:()=>true});
  await restarted.recover();await assert.rejects(restarted.submit(),/ready to send/);assert.throws(()=>restarted.stage(action),/pending/);
  f.failures.remove=false;await restarted.cleanupConfirmed();assert.equal(sends,1);assert.equal(await f.store.load(scope),null);
});

test('late old-author or unmounted completions cannot clear another author or a newer operation',async()=>{
  const f=fixture();let active=true,release!:(value:FinanceView)=>void;
  const old=createFinanceMutation(()=>new Promise(resolve=>{release=resolve;}),()=>id(10),{scope,store:f.store,current:()=>active});
  await old.recover();old.stage(action);const pending=old.submit();
  while(!release)await new Promise(resolve=>setImmediate(resolve));active=false;
  const other={...scope,authorId:id(9)};await f.store.put(other,{...saved({id:id(11),action}),scope:other},()=>true);
  release(view);await assert.rejects(pending,/Account or screen changed/);
  assert.equal((await f.store.load(scope))?.outcome,'unknown');assert.equal((await f.store.load(other))?.envelope.id,id(11));
  f.rows.set(pendingFinanceScopeKey(scope),encodePendingFinance(saved({id:id(12),action})));
  await assert.rejects(f.store.remove(scope,id(10),()=>true),/must not be removed/);assert.equal((await f.store.load(scope))?.envelope.id,id(12));
});

test('malformed/oversized records remain untouched, and Unicode financial notes respect the exact native byte bound',async()=>{
  const f=fixture(),key=pendingFinanceScopeKey(scope);f.rows.set(key,'{broken');
  const queue=createFinanceMutation(async()=>view,()=>id(10),{scope,store:f.store,current:()=>true});
  await assert.rejects(queue.recover(),/cannot be read safely/);assert.equal(queue.ready(),false);assert.throws(()=>queue.stage(action),/pending/);assert.equal(f.rows.get(key),'{broken');
  const unicodeScope={...scope,issuer:`https://${'a'.repeat(180)}.example/auth/v1`};
  const withNote=(count:number):PendingFinanceRecord=>({...saved({id:id(10),action:{kind:'review_chore',occurrenceId:'x'.repeat(500),decision:'approved',note:'😀'.repeat(count)}}),scope:unicodeScope});
  let fit=0;while(fit<250&&Buffer.byteLength(JSON.stringify({...withNote(fit+1),outcome:'rejected'}),'utf8')<=MAX_PENDING_FINANCE_BYTES)fit++;
  const text=encodePendingFinance(withNote(fit));assert.ok(Buffer.byteLength(text,'utf8')<=MAX_PENDING_FINANCE_BYTES);
  assert.deepEqual(decodePendingFinance(text,unicodeScope).envelope.action,withNote(fit).envelope.action);
  assert.throws(()=>encodePendingFinance(withNote(fit+1)),/shorter/);
  for(const change of [{extra:'unknown'}, {envelope:{id:id(10),action:{...action,at:'client-clock'}}}])assert.throws(()=>decodePendingFinance(JSON.stringify({...saved({id:id(10),action}),...change}),scope));
});

test('oversized Unicode review leaves editing available with no writes or sends; a shortened action keeps its UUID on retry',async()=>{
  const f=fixture(),longScope={...scope,issuer:`https://${'a'.repeat(180)}.example/auth/v1`},seen:string[]=[];
  let sends=0,ids=0;
  const withNote=(note:string):PendingFinanceRecord=>({...saved({id:id(10),action:{kind:'review_chore',occurrenceId:'x'.repeat(500),decision:'approved',note}}),scope:longScope});
  let fit=0;while(Buffer.byteLength(JSON.stringify({...withNote('😀'.repeat(fit+1)),outcome:'rejected'}),'utf8')<=MAX_PENDING_FINANCE_BYTES)fit++;
  const partial=withNote('😀'.repeat(fit)),padding=MAX_PENDING_FINANCE_BYTES-Buffer.byteLength(JSON.stringify({...partial,outcome:'rejected'}),'utf8');
  const valid=withNote('😀'.repeat(fit)+'a'.repeat(padding)),oversized=withNote('😀'.repeat(fit)+'a'.repeat(padding+1));
  assert.equal(Buffer.byteLength(JSON.stringify({...valid,outcome:'rejected'}),'utf8'),MAX_PENDING_FINANCE_BYTES);
  assert.equal(Buffer.byteLength(JSON.stringify(oversized),'utf8'),MAX_PENDING_FINANCE_BYTES,'unknown fits, but its eventual rejection marker would exceed the bound');
  const queue=createFinanceMutation(async request=>{seen.push(JSON.stringify(request));if(++sends===1)throw Error('unknown after possible commit');return view;},()=>id(10+ids++),{scope:longScope,store:f.store,current:()=>true});
  await queue.recover();
  assert.throws(()=>queue.stage(oversized.envelope.action),/shorter/);assert.equal(queue.pending(),null);assert.equal(queue.ready(),true);
  await assert.rejects(queue.submit(),/ready to send/);assert.equal(sends,0);assert.equal(f.events.filter(event=>event!=='read').length,0);assert.equal(f.rows.size,0);
  const staged=queue.stage(valid.envelope.action);assert.equal(staged.id,id(11));assert.equal(ids,2);assert.equal(f.rows.size,0,'staging is validation only');
  await assert.rejects(queue.submit(),/unknown after possible commit/);assert.deepEqual(queue.pending(),staged);
  assert.equal(await queue.submit(),view);assert.equal(ids,2);assert.equal(seen[0],seen[1]);assert.equal(queue.pending(),null);
});

test('a rejection of a recovered retry cannot prove whether the earlier unknown request committed',async()=>{
  const f=fixture();await f.store.put(scope,saved({id:id(10),action}),()=>true);
  const queue=createFinanceMutation(async()=>{throw Object.assign(Error('access revoked'),{confirmedRejected:true,status:403});},()=>id(11),{scope,store:f.store,current:()=>true});
  await queue.recover();await assert.rejects(queue.submit(),/earlier result is still unknown/);assert.equal((await f.store.load(scope))?.outcome,'unknown');
});
