import assert from 'node:assert/strict';
import test from 'node:test';
import {createPrivateScreenCaptureLease,privateCaptureActivation,privateCaptureState,type PrivateCaptureActivation} from '../src/production/private-screen-capture-lease';
import {usePrivateMessageCapture as browserCapture} from '../src/production/private-screen-capture';
function deferred(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
test('every new activation starts covered, including exact-key return after null and unmount',()=>{
  const first=privateCaptureActivation('author/session/thread');
  assert.deepEqual(privateCaptureState(first,null,null),{covered:true,error:false});
  assert.equal(privateCaptureState(first,first,null).covered,false);
  const left=privateCaptureActivation(null);assert.deepEqual(privateCaptureState(left,first,first),{covered:false,error:false});
  const returned=privateCaptureActivation(first.key);assert.notEqual(returned,first);
  assert.equal(privateCaptureState(returned,first,null).covered,true,'same string cannot reuse an old ready identity');
  const remounted=privateCaptureActivation(first.key);assert.equal(privateCaptureState(remounted,null,null).covered,true);
});
test('leaving while protect is pending waits for settlement and releases only its own tag once',async()=>{
  const pending=deferred(),calls:string[]=[];let ready=0,error=0;
  const lease=createPrivateScreenCaptureLease({newTag:()=> 'lease-A',protect:async tag=>{calls.push(`protect:${tag}`);await pending.promise;},
    release:async tag=>{calls.push(`release:${tag}`);},onReady:()=>{ready++;},onError:()=>{error++;}});
  await Promise.resolve();const firstDispose=lease.dispose();assert.equal(lease.dispose(),firstDispose);
  assert.deepEqual(calls,['protect:lease-A']);pending.resolve();await firstDispose;
  assert.deepEqual(calls,['protect:lease-A','release:lease-A']);assert.equal(ready,0);assert.equal(error,0);
});
test('reentry remains protected when an older native completion settles after the new lease',async()=>{
  const a=privateCaptureActivation('same-key'),none=privateCaptureActivation(null),b=privateCaptureActivation('same-key');
  let ready:PrivateCaptureActivation|null=null,failed:PrivateCaptureActivation|null=null;const old=deferred(),fresh=deferred(),protectedTags=new Set<string>();
  const ports=(activation:PrivateCaptureActivation,tag:string,pending:ReturnType<typeof deferred>)=>({newTag:()=>tag,
    protect:async(value:string)=>{protectedTags.add(value);await pending.promise;},release:async(value:string)=>{protectedTags.delete(value);},
    onReady:()=>{ready=activation;},onError:()=>{failed=activation;}});
  const first=createPrivateScreenCaptureLease(ports(a,'old-tag',old));await Promise.resolve();const retired=first.dispose();
  assert.equal(privateCaptureState(none,ready,failed).covered,false);
  const next=createPrivateScreenCaptureLease(ports(b,'new-tag',fresh));await Promise.resolve();assert.equal(privateCaptureState(b,ready,failed).covered,true);
  fresh.resolve();await next.settled;assert.equal(privateCaptureState(b,ready,failed).covered,false);
  old.resolve();await retired;
  assert.equal(ready,b,'old completion cannot replace new readiness');assert.deepEqual([...protectedTags],['new-tag'],'old cleanup cannot release new barrier');
  await next.dispose();assert.equal(protectedTags.size,0);
});
test('failed protection stays covered; partial failed protection is retired only by its own tag',async()=>{
  const activation=privateCaptureActivation('private');let ready:PrivateCaptureActivation|null=null,failed:PrivateCaptureActivation|null=null;
  const releases:string[]=[];
  const lease=createPrivateScreenCaptureLease({newTag:()=> 'failed-tag',protect:async()=>{throw Error('private native detail');},
    release:async tag=>{releases.push(tag);},onReady:()=>{ready=activation;},onError:()=>{failed=activation;}});
  await lease.settled;assert.deepEqual(privateCaptureState(activation,ready,failed),{covered:true,error:true});
  await lease.dispose();assert.deepEqual(releases,['failed-tag']);
});
test('late old failure cannot expose or fail a different activation; release failures never allow all capture',async()=>{
  const a=privateCaptureActivation('A'),b=privateCaptureActivation('B');let ready:PrivateCaptureActivation|null=null,failed:PrivateCaptureActivation|null=null;
  const pending=deferred(),releases:string[]=[];
  const old=createPrivateScreenCaptureLease({newTag:()=> 'tag-A',protect:()=>pending.promise,release:async tag=>{releases.push(tag);throw Error('release failed');},
    onReady:()=>{ready=a;},onError:()=>{failed=a;}});
  await Promise.resolve();const retired=old.dispose();ready=b;pending.reject(Error('late protect failed'));await retired;
  assert.deepEqual(privateCaptureState(b,ready,failed),{covered:false,error:false});assert.deepEqual(releases,['tag-A']);
});
test('tag creation failure stays covered and browser non-null scopes never claim native protection',async()=>{
  let ready=false,error=false,releases=0;
  const lease=createPrivateScreenCaptureLease({newTag:()=>{throw Error('unavailable');},protect:async()=>{throw Error('must not run');},
    release:async()=>{releases++;},onReady:()=>{ready=true;},onError:()=>{error=true;}});
  await lease.settled;await lease.dispose();assert.equal(ready,false);assert.equal(error,true);assert.equal(releases,0);
  assert.deepEqual(browserCapture(null),{covered:false,error:false});assert.deepEqual(browserCapture('private'),{covered:true,error:true});
});
