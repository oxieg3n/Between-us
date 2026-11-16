import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { AndroidConfig } from "expo/config-plugins";

type Manifest = Parameters<typeof AndroidConfig.Manifest.getMainActivityOrThrow>[0];
const pluginRequire = createRequire(__filename);
const { addDensityConfigChange } = pluginRequire("../plugins/with-adaptive-display") as {
  addDensityConfigChange: (manifest: Manifest) => Manifest;
};

test("adaptive display handles only MainActivity density without changing other configuration", () => {
  const flags = "keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize|assetsPaths";
  const manifest: Manifest = {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      queries: [],
      application: [{
        $: { "android:name": ".MainApplication" },
        activity: [
          { $: { "android:name": ".MainActivity", "android:configChanges": flags, "android:launchMode": "singleTask", "android:exported": "true" } },
          { $: { "android:name": ".OtherActivity", "android:configChanges": "orientation", "android:theme": "@style/Other" } },
        ],
      }],
    },
  };
  const expected = structuredClone(manifest);
  AndroidConfig.Manifest.getMainActivityOrThrow(expected).$["android:configChanges"] = `${flags}|density`;

  assert.strictEqual(addDensityConfigChange(manifest), manifest);
  assert.deepEqual(manifest, expected);
  assert.deepEqual(addDensityConfigChange(manifest), expected);
  assert.equal(AndroidConfig.Manifest.getMainActivityOrThrow(manifest).$["android:configChanges"]?.includes("fontScale"), false);

  const empty = structuredClone(manifest);
  delete AndroidConfig.Manifest.getMainActivityOrThrow(empty).$["android:configChanges"];
  assert.equal(AndroidConfig.Manifest.getMainActivityOrThrow(addDensityConfigChange(empty)).$["android:configChanges"], "density");

  const missing = structuredClone(manifest);
  missing.manifest.application![0].activity!.shift();
  const before = structuredClone(missing);
  assert.throws(() => addDensityConfigChange(missing), /missing the required MainActivity/);
  assert.deepEqual(missing, before);
});
