import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExclusiveVaultFactory} from '../src/production/vault/exclusive';
import type {VaultController} from '../src/production/vault/types';
test('next vault waits for the old private screen to finish closing its handles',async()=>{
  let retired!:()=>void,created=0,closes=0;
  const closing=new Promise<void>(resolve=>{retired=resolve;});
  const factory=createExclusiveVaultFactory(async()=>({dispose:async()=>{closes++;await closing;}} as VaultController));
  const first=await factory();created++;
  const second=factory().then(value=>{created++;return value;});
  await Promise.resolve();await Promise.resolve();assert.equal(created,1);assert.equal(closes,1);
  retired();await second;assert.equal(created,2);
  await first.dispose();assert.equal(closes,1,'old cleanup is idempotent after navigation');
});
test('failed vault retirement refuses all new controllers without opening another database',async()=>{
  let opened=0;
  const factory=createExclusiveVaultFactory(async()=>{opened++;return {dispose:async()=>{throw new Error('Fictional close failure');}} as unknown as VaultController;});
  await factory();await assert.rejects(factory(),/close failure/);await assert.rejects(factory(),/close failure/);
  assert.equal(opened,1);
});
