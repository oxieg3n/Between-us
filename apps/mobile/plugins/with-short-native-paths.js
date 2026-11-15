const { withProjectBuildGradle } = require("expo/config-plugins");

// CMake 3.22/Ninja on Windows otherwise creates object paths beyond MAX_PATH.
module.exports = function withShortNativePaths(config) {
  return withProjectBuildGradle(config, (result) => {
    const marker = "// Between Us: bounded native object paths";
    // Register before Expo's root plugin evaluates native subprojects.
    const clean = result.modResults.contents.replace(
      /\n\/\/ Between Us: bounded native object paths\nsubprojects \{ nativeProject ->[\s\S]*?\n\}\n/g,
      "\n",
    );
    const plugin = 'apply plugin: "expo-root-project"';
    if (!clean.includes(plugin))
      throw new Error("Expected Expo root Gradle plugin was not found.");
    result.modResults.contents = clean.replace(
      plugin,
      `${marker}
subprojects { nativeProject ->
  nativeProject.afterEvaluate {
    if (nativeProject.hasProperty('android') && (nativeProject.plugins.hasPlugin('com.android.application') || nativeProject.android.externalNativeBuild.cmake.path != null)) {
      def cacheName = nativeProject.plugins.hasPlugin('com.android.application') ? 'app' : (nativeProject.name == 'llama.rn' ? 'llama' : nativeProject.name.replace('react-native-', 'rn-').replaceAll('[^A-Za-z0-9_-]', '_'))
      def objectPathLimit = nativeProject.plugins.hasPlugin('com.android.application') ? '250' : '128'
      nativeProject.android.externalNativeBuild.cmake.buildStagingDirectory = rootProject.file('../../../.native-build/' + cacheName)
      nativeProject.android.defaultConfig.externalNativeBuild.cmake.arguments.add('-DCMAKE_OBJECT_PATH_MAX=' + objectPathLimit)
    }
  }
}
\n${plugin}`,
    );
    return result;
  });
};
