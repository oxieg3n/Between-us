import assert from 'node:assert/strict';
import test from 'node:test';
import {createJournalOfflineLease,MAX_JOURNAL_LEASE_MS,type JournalLeaseAccess,type JournalLocalAvailability} from '../src/production/journal-offline-lease';
import {createJournalDraftProtection} from '../src/production/journal-draft';
import {createJournalRefreshCoordinator,JournalAccessError,type VerifiedJournalAccess} from '../src/production/journal-access';

const access=():JournalLeaseAccess=>({actor:{issuer:'https://fictional.test/auth/v1',subject:'author-A',sessionId:'session-A'},role:'child',lease:{epoch:7,startedAt:100,deadline:900100}});
function fixture() {
  let clock=200,boundary={epoch:7,userId:'author-A' as string|null},lifetime=1,current:JournalLeaseAccess|undefined=access(),invalidations=0;
  const signals:(JournalLocalAvailability|null)[]=[];
  const lease=createJournalOfflineLease({now:()=>clock,boundary:()=>boundary,lifetime:()=>lifetime,current:()=>current,invalidate:()=>{invalidations++;},changed:value=>signals.push(value)});
  return {lease,signals,clock(value:number){clock=value;},boundary(value:typeof boundary){boundary=value;},lifetime(value:number){lifetime=value;},current(value:JournalLeaseAccess|undefined){current=value;},invalidations:()=>invalidations};
}

test('only explicit post-unlock activation grants the original bounded local window; a fresh process has none',()=>{
  const f=fixture();assert.equal(f.lease.allowed(),false);assert.equal(f.lease.snapshot(),false);
  assert.equal(f.lease.start(access()),true);assert.equal(f.lease.allowed(),true);
  assert.deepEqual(f.signals.at(-1),{authorId:'author-A',epoch:7,unlocked:true,deadline:900100});
  assert.equal('token' in f.signals.at(-1)!,false);assert.equal('body' in f.signals.at(-1)!,false);
  assert.equal(fixture().lease.allowed(),false);
});

test('proof and device-authentication latency consume TTL; no offline interval starts at response or first failure',()=>{
  const f=fixture();f.clock(500);const short=access();short.lease={epoch:7,startedAt:100,deadline:600};
  assert.equal(f.lease.start(short),true);f.clock(599);assert.equal(f.lease.allowed(),true);
  f.clock(600);assert.equal(f.lease.allowed(),false);assert.equal(f.invalidations(),1);assert.equal(f.signals.at(-1),null);
  const expired=fixture();expired.clock(600);assert.equal(expired.lease.start(short),false);assert.equal(expired.lease.allowed(),false);
});

test('snapshot conceals expired writing without mutating during render; imperative admission then locks',()=>{
  const f=fixture();f.lease.start(access());let notifications=0;const unsubscribe=f.lease.subscribe(()=>notifications++);
  f.clock(900100);assert.equal(f.lease.snapshot(),false);assert.equal(f.invalidations(),0);assert.equal(notifications,0);
  assert.equal(f.lease.allowed(),false);assert.equal(f.invalidations(),1);assert.equal(notifications,1);unsubscribe();
});

test('input/retries/cached refreshes cannot extend a deadline; only fresh proof can renew before expiration',()=>{
  const f=fixture();f.lease.start(access());
  for(const clock of [1000,50000,200000]) {f.clock(clock);assert.equal(f.lease.allowed(),true);assert.equal(f.lease.renew(access()),true);assert.equal(f.signals.at(-1)?.deadline,900100);}
  const fresh=access();fresh.lease={epoch:7,startedAt:200000,deadline:200000+MAX_JOURNAL_LEASE_MS};
  assert.equal(f.lease.renew(fresh),true);assert.equal(f.signals.at(-1)?.deadline,1100000);
  f.clock(1100000);const tooLate=access();tooLate.lease={epoch:7,startedAt:1100000,deadline:1200000};
  assert.equal(f.lease.renew(tooLate),false);assert.equal(f.invalidations(),1);
});

test('account/author/session/role/controller boundaries revoke immediately, including same-user sign-in epoch changes',()=>{
  for(const change of [
    (f:ReturnType<typeof fixture>)=>f.boundary({epoch:8,userId:'author-A'}),
    (f:ReturnType<typeof fixture>)=>f.boundary({epoch:7,userId:'author-B'}),
    (f:ReturnType<typeof fixture>)=>f.boundary({epoch:7,userId:null}),
    (f:ReturnType<typeof fixture>)=>f.lifetime(2),
    (f:ReturnType<typeof fixture>)=>f.current({...access(),actor:{...access().actor,sessionId:'different-session'}}),
    (f:ReturnType<typeof fixture>)=>f.current({...access(),role:'parent'}),
  ]) {const f=fixture();f.lease.start(access());change(f);assert.equal(f.lease.snapshot(),false);assert.equal(f.lease.allowed(),false);assert.equal(f.invalidations(),1);assert.equal(f.signals.at(-1),null);}
});

test('background/manual retirement cannot be renewed or restored by a late result',()=>{
  const f=fixture();f.lease.start(access());f.lease.clear();assert.equal(f.lease.snapshot(),false);assert.equal(f.lease.renew(access()),false);assert.equal(f.signals.at(-1),null);
});

test('nonfinite/backward monotonic clocks and malformed or overlong proofs fail closed',()=>{
  for(const clock of [NaN,Infinity,-1,100]){const f=fixture();f.lease.start(access());f.clock(clock);assert.equal(f.lease.allowed(),false);assert.equal(f.invalidations(),1);}
  for(const timing of [undefined,{epoch:7,startedAt:100,deadline:900101},{epoch:7,startedAt:NaN,deadline:500},{epoch:7,startedAt:100,deadline:100},{epoch:8,startedAt:100,deadline:500}]){
    const f=fixture();assert.equal(f.lease.start({...access(),lease:timing}),false);assert.equal(f.lease.snapshot(),false);
  }
});

test('wall-clock changes do not influence this monotonic deadline',()=>{
  const original=Date.now,f=fixture();
  try{f.lease.start(access());Date.now=()=>0;f.clock(500);assert.equal(f.lease.allowed(),true);Date.now=()=>Number.MAX_SAFE_INTEGER;assert.equal(f.lease.allowed(),true);f.clock(900100);assert.equal(f.lease.allowed(),false);}
  finally{Date.now=original;}
});

test('typed offline recheck keeps already-unlocked local draft protection usable, without a new network or key path',async()=>{
  const f=fixture();f.lease.start(access());let attempts=0,writes=0,timer:(()=>void)|undefined;
  const current={...access(),token:'verified-online-token'} as VerifiedJournalAccess;
  const covers:boolean[]=[],states:string[]=[];
  const recheck=createJournalRefreshCoordinator({current:()=>current,verify:async()=>{attempts++;throw new JournalAccessError('unavailable');},commit:()=>{throw new Error('An outage cannot renew proof.');},conceal:value=>covers.push(value),beforeVerification:()=>{},continuation:()=>f.lease.allowed(),invalidate:()=>f.lease.clear()});
  const drafts=createJournalDraftProtection({authorized:()=>f.lease.allowed(),
    // Fake local save port; native encryption is a separate operator-owned check.
    save:async input=>{writes++;return {...input,id:'own-draft',revision:1,createdAt:'2026-11-16T12:00:00.000Z',updatedAt:'2026-11-16T12:00:00.000Z'};},
    changed:value=>states.push(value.status),delay:work=>{timer=work;return()=>{timer=undefined;};},
  });
  drafts.open('same-unlocked-editor',{title:'',body:''});await recheck.refresh();
  drafts.update({title:'Fictional offline page',body:'Fictional local-only writing'});timer?.();
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(covers.at(-1),false);assert.equal(writes,1);assert.equal(states.at(-1),'protected');assert.equal(attempts,1);
  f.clock(900100);drafts.update({title:'Fictional page',body:'Expired pending edit'});timer?.();await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(writes,1);assert.equal(f.invalidations(),1);drafts.cancel();
});
