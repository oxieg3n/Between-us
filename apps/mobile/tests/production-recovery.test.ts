import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryProofState } from '../src/production/recovery-proof';

test('old-author recovery intent cannot update a newly recovered different account', () => {
  const state=createRecoveryProofState();
  state.update('PASSWORD_RECOVERY',{user:{id:'A'},access_token:'fictional-A'});
  const old=state.read()!;
  state.update('PASSWORD_RECOVERY',{user:{id:'B'},access_token:'fictional-B'});
  let updates=0;
  assert.throws(()=>{state.require(old);updates++;},/account changed/);
  assert.equal(updates,0);
  state.require(state.read()!);
});
test('ordinary sign-in, URL hints, token replacement and sign-out confer no recovery authority', () => {
  const state=createRecoveryProofState(), a={user:{id:'A'},access_token:'fictional-A'};
  state.update('SIGNED_IN',a);assert.equal(state.read(),null);
  state.update('PASSWORD_RECOVERY',a);const proof=state.read()!;
  state.update('USER_UPDATED',a);state.require(proof);
  state.update('TOKEN_REFRESHED',{...a,access_token:'fictional-refreshed'});
  assert.equal(state.read(),null);assert.throws(()=>state.require(proof));
  state.update('PASSWORD_RECOVERY',a);state.clear();assert.equal(state.read(),null);
  state.update('PASSWORD_RECOVERY',a);state.update('SIGNED_OUT',null);assert.equal(state.read(),null);
});
