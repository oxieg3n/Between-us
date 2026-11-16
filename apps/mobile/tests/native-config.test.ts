import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { AndroidConfig } from "expo/config-plugins";

type Manifest = Parameters<typeof AndroidConfig.Manifest.getMainActivityOrThrow>[0];
const pluginRequire = createRequire(__filename);
const { addDensityConfigChange, addRootRemeasure } = pluginRequire("../plugins/with-adaptive-display") as {
  addDensityConfigChange: (manifest: Manifest) => Manifest;
  addRootRemeasure: (source: string) => string;
};
const { removeContents, mergeContents } = pluginRequire("@expo/config-plugins/build/utils/generateCode");

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

const activityFixture = `package com.example.family
import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
  override fun getMainComponentName(): String = "main"
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }
}
`;

test("native remeasurement preserves the Activity lifecycle and deep-link handler without replacing the surface", () => {
  const patched = addRootRemeasure(activityFixture);
  assert.equal(addRootRemeasure(patched), patched);
  assert.equal(removeContents({ src: patched, tag: "between-us-adaptive-display" }).contents, activityFixture);
  assert.equal(patched.match(/override fun onConfigurationChanged/g)?.length, 1);
  assert.ok(patched.indexOf("super.onConfigurationChanged(newConfig)") < patched.indexOf("window.decorView.post"));
  assert.match(patched, /!isDestroyed && root\.isAttachedToWindow && root === reactDelegate\?\.reactRootView/);
  assert.match(patched, /view\.isAttachedToWindow && !view\.isBeingRemoved/);
  assert.doesNotMatch(patched, /recreate\(|reload\(|setContentView\(|unmount|fontScale|probeDisplay|android\.util\.Log/);

  const oldGenerated = mergeContents({
    src: activityFixture,
    tag: "between-us-adaptive-display",
    anchor: /^class MainActivity/,
    offset: 1,
    comment: "//",
    newSrc: "  override fun onConfigurationChanged(config: android.content.res.Configuration) { super.onConfigurationChanged(config) }",
  }).contents;
  assert.equal(addRootRemeasure(oldGenerated), patched);
});

test("native configuration generation rejects unmanaged overrides and ambiguous templates", () => {
  const unmanaged = activityFixture.replace(
    '  override fun getMainComponentName(): String = "main"',
    "  override fun onConfigurationChanged(config: android.content.res.Configuration) { super.onConfigurationChanged(config) }",
  );
  assert.throws(() => addRootRemeasure(unmanaged), /already handles configuration/);
  const unmanagedHelper = activityFixture.replace(
    '  override fun getMainComponentName(): String = "main"',
    "  private fun refreshExistingStackFrames(view: android.view.View) { view.requestLayout() }",
  );
  const originalHelperSource = unmanagedHelper;
  assert.throws(() => addRootRemeasure(unmanagedHelper), /already defines the adaptive display helper/);
  assert.equal(unmanagedHelper, originalHelperSource);
  assert.throws(() => addRootRemeasure(activityFixture + "// @generated begin between-us-adaptive-display - interrupted\n"), /ambiguous/);
  assert.throws(() => addRootRemeasure(activityFixture.replace("class MainActivity", "class OtherActivity")), /Failed to match/);
});
