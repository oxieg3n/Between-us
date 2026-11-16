const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

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
  return withAndroidManifest(config, (result) => {
    result.modResults = addDensityConfigChange(result.modResults);
    return result;
  });
};

module.exports.addDensityConfigChange = addDensityConfigChange;
