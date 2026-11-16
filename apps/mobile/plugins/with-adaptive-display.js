const { AndroidConfig, withAndroidManifest, withMainActivity } = require("expo/config-plugins");
const { mergeContents, removeContents } = require("@expo/config-plugins/build/utils/generateCode");

const activityTag = "between-us-adaptive-display";

function addRootRemeasure(source) {
  const starts = source.match(/@generated begin between-us-adaptive-display -/g) ?? [];
  const ends = source.match(/@generated end between-us-adaptive-display\b/g) ?? [];
  if (starts.length !== ends.length || starts.length > 1) {
    throw new Error("Adaptive display has ambiguous generated MainActivity markers.");
  }
  const cleared = removeContents({ src: source, tag: activityTag });
  if (starts.length && !cleared.didClear) {
    throw new Error("Adaptive display could not safely replace its MainActivity section.");
  }
  if (/\bfun\s+onConfigurationChanged\s*\(/.test(cleared.contents)) {
    throw new Error("MainActivity already handles configuration changes; review it before adding adaptive display.");
  }
  if (/\bfun\s+refreshExistingStackFrames\s*\(/.test(cleared.contents)) {
    throw new Error("MainActivity already defines the adaptive display helper; review it before replacement.");
  }
  return mergeContents({
    src: cleared.contents,
    tag: activityTag,
    anchor: /^class MainActivity\s*:\s*ReactActivity\(\)\s*\{\s*$/,
    offset: 1,
    comment: "//",
    newSrc: `  private fun refreshExistingStackFrames(view: android.view.View) {
    if (view is com.swmansion.rnscreens.Screen &&
        view.isAttachedToWindow && !view.isBeingRemoved &&
        view.container is com.swmansion.rnscreens.ScreenStack &&
        view.stackPresentation == com.swmansion.rnscreens.Screen.StackPresentation.PUSH &&
        view.width > 0 && view.height > 0) {
      // Same pixel bounds can still require new density-dependent screen state.
      view.updateState(view.width, view.height, view.top)
      view.requestLayout()
    }
    if (view is android.view.ViewGroup) {
      for (i in 0 until view.childCount) refreshExistingStackFrames(view.getChildAt(i))
    }
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    window.decorView.post {
      if (!isDestroyed) {
        val root = reactDelegate?.reactRootView ?: return@post
        val context = reactDelegate?.currentReactContext ?: return@post
        if (!root.isAttachedToWindow || !context.hasActiveReactInstance()) return@post
        com.facebook.react.uimanager.DisplayMetricsHolder.initDisplayMetrics(this@MainActivity)
        // RN 0.88: only DeviceInfo's audited font cache/event refresh, never the host lifecycle.
        val deviceInfo = context.getNativeModule(com.facebook.fbreact.specs.NativeDeviceInfoSpec.NAME)
        (deviceInfo as? com.facebook.react.bridge.LifecycleEventListener)?.onHostResume()
        root.forceLayout()
        root.requestLayout()
        root.postOnAnimation {
          if (!isDestroyed && root.isAttachedToWindow && root === reactDelegate?.reactRootView) {
            refreshExistingStackFrames(root)
          }
        }
      }
    }
  }`,
  }).contents;
}

function addDensityConfigChange(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const existing = activity.$["android:configChanges"] ?? "";
  if (!existing.split("|").some((flag) => flag.trim() === "density")) {
    // React Native refreshes display metrics/layout without recreating private session state.
    activity.$["android:configChanges"] = existing ? `${existing}|density` : "density";
  }
  return manifest;
}

module.exports = function withAdaptiveDisplay(config) {
  const manifestConfig = withAndroidManifest(config, (result) => {
    result.modResults = addDensityConfigChange(result.modResults);
    return result;
  });
  return withMainActivity(manifestConfig, (result) => {
    if (result.modResults.language !== "kt") {
      throw new Error("Adaptive display requires the reviewed Kotlin MainActivity template.");
    }
    result.modResults.contents = addRootRemeasure(result.modResults.contents);
    return result;
  });
};

module.exports.addDensityConfigChange = addDensityConfigChange;
module.exports.addRootRemeasure = addRootRemeasure;
