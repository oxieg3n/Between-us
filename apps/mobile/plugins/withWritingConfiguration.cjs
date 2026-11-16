const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

function addFontScaleConfigChange(manifest) {
  const applications = manifest.manifest.application ?? [];
  const activities = applications[0]?.activity ?? [];
  if (applications.length !== 1 || activities.filter(activity => activity.$['android:name'] === '.MainActivity').length !== 1) {
    throw new Error('Writing configuration requires one reviewed MainActivity.');
  }
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const existing = activity.$['android:configChanges'];
  if (existing !== undefined && typeof existing !== 'string') {
    throw new Error('Writing configuration requires string configChanges.');
  }
  if (!(existing ?? '').split('|').some(flag => flag.trim() === 'fontScale')) {
    // RN 0.88 handles font metrics/layout through the existing super configuration callback.
    activity.$['android:configChanges'] = existing ? `${existing}|fontScale` : 'fontScale';
  }
  return manifest;
}

module.exports = function withWritingConfiguration(config) {
  return withAndroidManifest(config, result => {
    result.modResults = addFontScaleConfigChange(result.modResults);
    return result;
  });
};
module.exports.addFontScaleConfigChange = addFontScaleConfigChange;
