const { withAndroidManifest } = require('expo/config-plugins');
const permission = 'android.permission.DETECT_SCREEN_CAPTURE';

// Pinned expo-screen-capture 58 eagerly registers its API34+ callback, even without JS listeners.
// Retain this normal permission. FLAG_SECURE itself does not need photo-library access.
function capturePermissions(manifest) {
  const entries = manifest.manifest['uses-permission'] ?? [];
  const matching = entries.filter(entry => entry.$['android:name'] === permission);
  if (matching.length > 1) throw Error('Private capture: duplicate callback permission requires review.');
  for (const entry of matching) {
    const attrs = entry.$;
    if (Object.keys(attrs).some(key => !['android:name', 'tools:node'].includes(key)) ||
        attrs['tools:node'] !== undefined && attrs['tools:node'] !== 'remove') {
      throw Error('Private capture: custom callback permission requires review.');
    }
    // Non-clean CNG preserves obsolete removal markers; repair only this exact known marker.
    delete attrs['tools:node'];
  }
  if (!matching.length) entries.push({ $: { 'android:name': permission } });
  manifest.manifest['uses-permission'] = entries;
  return manifest;
}
module.exports = config => {
  if (config.android?.blockedPermissions?.some(value => value === permission || value === 'DETECT_SCREEN_CAPTURE')) {
    throw Error('Private capture: pinned runtime requires the normal callback permission.');
  }
  return withAndroidManifest(config, result => {
    result.modResults = capturePermissions(result.modResults);
    return result;
  });
};
module.exports.capturePermissions = capturePermissions;
