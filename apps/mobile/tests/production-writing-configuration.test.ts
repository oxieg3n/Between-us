import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {AndroidConfig} from 'expo/config-plugins';

type Manifest = Parameters<typeof AndroidConfig.Manifest.getMainActivityOrThrow>[0];
const pluginRequire = createRequire(__filename);
const {addFontScaleConfigChange} = pluginRequire('../plugins/withWritingConfiguration.cjs') as {
  addFontScaleConfigChange(manifest: Manifest): Manifest;
};
const {addDensityConfigChange} = pluginRequire('../plugins/with-adaptive-display.js') as {
  addDensityConfigChange(manifest: Manifest): Manifest;
};
const flags = 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize|assetsPaths|density';
function fixture(): Manifest {
  return {manifest: {
    $: {'xmlns:android':'http://schemas.android.com/apk/res/android'}, queries: [],
    application: [{
      $: {'android:name':'.MainApplication','android:allowBackup':'true'},
      activity: [
        {$: {'android:name':'.MainActivity','android:configChanges':flags,'android:launchMode':'singleTask','android:windowSoftInputMode':'adjustResize','android:exported':'true'}},
        {$: {'android:name':'.OtherActivity','android:configChanges':'orientation','android:theme':'@style/Other'}},
      ],
    }],
  }};
}
const main = (manifest: Manifest) => AndroidConfig.Manifest.getMainActivityOrThrow(manifest);

test('writing configuration adds only MainActivity fontScale and preserves keyboard, density and other manifest policy', () => {
  const manifest = fixture(), expected = structuredClone(manifest);
  main(expected).$['android:configChanges'] = `${flags}|fontScale`;
  assert.strictEqual(addFontScaleConfigChange(manifest), manifest);
  assert.deepEqual(manifest, expected);
});

test('fontScale transform is idempotent and uses complete flag names', () => {
  for (const existing of [`${flags}|fontScale`, `${flags}| fontScale `]) {
    const manifest = fixture();
    main(manifest).$['android:configChanges'] = existing;
    const expected = structuredClone(manifest);
    assert.deepEqual(addFontScaleConfigChange(addFontScaleConfigChange(manifest)), expected);
  }
  const manifest = fixture();
  main(manifest).$['android:configChanges'] = 'fontScaleExtra|orientation';
  assert.equal(main(addFontScaleConfigChange(manifest)).$['android:configChanges'], 'fontScaleExtra|orientation|fontScale');
});

test('missing or empty configuration is initialized without changing unrelated activity attributes', () => {
  for (const existing of [undefined, '']) {
    const manifest = fixture(), attributes = main(manifest).$;
    if (existing === undefined) delete attributes['android:configChanges'];
    else attributes['android:configChanges'] = existing;
    const expected = structuredClone(manifest);
    main(expected).$['android:configChanges'] = 'fontScale';
    assert.deepEqual(addFontScaleConfigChange(manifest), expected);
  }
});

test('ambiguous or malformed activity configuration rejects without mutating the manifest', () => {
  const missing = fixture();
  missing.manifest.application![0].activity!.shift();
  const duplicate = fixture();
  duplicate.manifest.application![0].activity!.push(structuredClone(main(duplicate)));
  const multipleApplications = fixture();
  multipleApplications.manifest.application!.push(structuredClone(multipleApplications.manifest.application![0]));
  const malformed = fixture();
  Object.assign(main(malformed).$, {'android:configChanges': 4});
  for (const manifest of [missing, duplicate, multipleApplications, malformed]) {
    const before = structuredClone(manifest);
    assert.throws(() => addFontScaleConfigChange(manifest), /Writing configuration requires/);
    assert.deepEqual(manifest, before);
  }
});

test('writing and existing density transforms compose in either order without duplicate flags', () => {
  const left = fixture(), right = fixture();
  main(left).$['android:configChanges'] = main(right).$['android:configChanges'] = 'keyboard|orientation';
  addFontScaleConfigChange(addDensityConfigChange(left));
  addDensityConfigChange(addFontScaleConfigChange(right));
  const values = (manifest: Manifest) => main(manifest).$['android:configChanges']!.split('|');
  assert.deepEqual(new Set(values(left)), new Set(['keyboard','orientation','density','fontScale']));
  assert.deepEqual(new Set(values(left)), new Set(values(right)));
  assert.equal(values(left).length, 4);
  assert.equal(values(right).length, 4);
  addFontScaleConfigChange(left); addDensityConfigChange(left);
  assert.equal(values(left).length, 4);
});
