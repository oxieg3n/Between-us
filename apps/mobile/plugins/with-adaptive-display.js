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
  return mergeContents({
    src: cleared.contents,
    tag: activityTag,
    anchor: /^class MainActivity\s*:\s*ReactActivity\(\)\s*\{\s*$/,
    offset: 1,
    comment: "//",
    newSrc: `  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    // Remeasure the existing Fabric surface after configuration resources settle.
    window.decorView.post {
      if (!isDestroyed) reactDelegate?.reactRootView?.requestLayout()
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
