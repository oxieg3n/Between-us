import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {type AndroidConfig} from 'expo/config-plugins';
type Manifest=Parameters<typeof AndroidConfig.Manifest.getMainApplicationOrThrow>[0];
const plugin=createRequire(__filename)('../plugins/withPrivateCapturePermissions.cjs');
const permission='android.permission.DETECT_SCREEN_CAPTURE';
const fixture=(entries:object[]=[]):Manifest=>({manifest:{$:{'xmlns:android':'http://schemas.android.com/apk/res/android'},'uses-permission':entries}} as Manifest);
test('private capture retains the normal callback permission across fresh and repeated CNG',()=>{
  const result=plugin.capturePermissions(fixture());
  assert.deepEqual(result.manifest['uses-permission'],[{$:{'android:name':permission}}]);
  assert.deepEqual(plugin.capturePermissions(result),result);
});
test('non-clean capture permission repair preserves photo-library denial and unrelated manifest state',()=>{
  const denied={$:{'android:name':'android.permission.READ_MEDIA_IMAGES','tools:node':'remove'}};
  const input=fixture([denied,{$:{'android:name':permission,'tools:node':'remove'}}]);
  assert.deepEqual(plugin.capturePermissions(input).manifest['uses-permission'],[denied,{$:{'android:name':permission}}]);
});
test('unreviewed capture permission variants and explicit incompatible runtime policy fail closed',()=>{
  assert.throws(()=>plugin.capturePermissions(fixture([{$:{'android:name':permission,'android:maxSdkVersion':'33'}}])),/requires review/);
  assert.throws(()=>plugin.capturePermissions(fixture([{$:{'android:name':permission}},{$:{'android:name':permission}}])),/requires review/);
  assert.throws(()=>plugin({android:{blockedPermissions:[permission]}}),/runtime requires/);
  assert.throws(()=>plugin({android:{blockedPermissions:['DETECT_SCREEN_CAPTURE']}}),/runtime requires/);
});
