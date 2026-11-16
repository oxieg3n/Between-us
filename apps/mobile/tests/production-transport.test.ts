import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { AndroidConfig } from 'expo/config-plugins';

type Manifest = Parameters<typeof AndroidConfig.Manifest.getMainApplicationOrThrow>[0];
const { transformAndroidManifest, transformAppBuildGradle, transformInfoPlist } = createRequire(__filename)('../plugins/withProductionTransport.cjs') as {
  transformAndroidManifest: (manifest: Manifest) => Manifest;
  transformAppBuildGradle: (source: string) => string;
  transformInfoPlist: (plist: Record<string, unknown>) => Record<string, unknown>;
};
function manifest(): Manifest {
  return { manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, queries: [], application: [{ $: {
    'android:name': '.MainApplication', 'android:allowBackup': 'true', 'android:fullBackupContent': '@xml/secure_store_backup_rules',
    'android:usesCleartextTraffic': 'true', 'tools:replace': 'android:allowBackup',
  } }] } };
}
const gradle = `apply plugin: "com.android.application"
android {
    defaultConfig { applicationId 'fictional.betweenus' }
    buildTypes {
        debug { signingConfig signingConfigs.debug }
        release { signingConfig null }
    }
}
// @generated begin between-us-production-signing
// Existing owner signing block must survive unchanged.
// @generated end between-us-production-signing
`;

test('transport manifest owns only cleartext merge policy and preserves backup/other attributes', () => {
  const value = manifest(), before = structuredClone(value);
  const result = transformAndroidManifest(value);
  assert.strictEqual(result, value);
  assert.equal(result.manifest.application![0].$['android:usesCleartextTraffic'], '${betweenUsUsesCleartextTraffic}');
  assert.equal(result.manifest.application![0].$['tools:replace'], 'android:allowBackup,android:usesCleartextTraffic');
  assert.equal(result.manifest.application![0].$['android:fullBackupContent'], before.manifest.application![0].$['android:fullBackupContent']);
  assert.equal(result.manifest.application![0].$['android:allowBackup'], 'true');
  assert.deepEqual(transformAndroidManifest(result), result);
});

test('transport rejects a network policy which could override the manifest cleartext flag', () => {
  const value = manifest(); value.manifest.application![0].$['android:networkSecurityConfig'] = '@xml/unknown';
  const before = structuredClone(value);
  assert.throws(() => transformAndroidManifest(value), /network security config requires review/);
  assert.deepEqual(value, before);
  const removed = manifest(); removed.manifest.application![0].$['tools:remove'] = 'android:usesCleartextTraffic';
  assert.throws(() => transformAndroidManifest(removed), /attribute removal requires review/);
  const multiple = manifest(); multiple.manifest.application!.push(structuredClone(multiple.manifest.application![0]));
  assert.throws(() => transformAndroidManifest(multiple), /expected one application/);
});

test('Gradle generation is idempotent, preserves signing and denies main/release while debug stays enabled', () => {
  const output = transformAppBuildGradle(gradle);
  assert.equal(transformAppBuildGradle(output), output);
  assert.equal(transformAppBuildGradle(gradle.replaceAll('\n', '\r\n')), output);
  assert.ok(output.startsWith(gradle.trimEnd()));
  assert.match(output, /defaultConfig\.manifestPlaceholders\[betweenUsTransportKey\] = 'false'/);
  assert.match(output, /buildType\.name == 'debug' \? 'true' : 'false'/);
  assert.match(output, /buildTypes\.release\.manifestPlaceholders\[betweenUsTransportKey\] = 'false'/);
  assert.match(output, /tasks\.findByName\('processReleaseMainManifest'\) == null/);
  assert.match(output, /task\.outputs\.files\.asFileTree/);
  assert.match(output, /getAttributeNS\(namespace, 'usesCleartextTraffic'\) != 'false'/);
  assert.match(output, /hasAttributeNS\(namespace, 'networkSecurityConfig'\)/);
  assert.match(output, /manifests\.isEmpty\(\).*throw new GradleException/);
  assert.match(output, /task\.dependsOn\(betweenUsTransportCheck\)/);
  assert.doesNotMatch(output.slice(gradle.trimEnd().length), /environmentVariable|System\.getenv|keystore|storePassword|BETWEENUS_RELEASE_/);
});

test('unmanaged and interrupted Gradle transport configuration fails for review', () => {
  assert.throws(() => transformAppBuildGradle(gradle + '// @generated begin between-us-production-transport\n'), /ambiguous managed markers/);
  assert.throws(() => transformAppBuildGradle(gradle + "def betweenUsUsesCleartextTraffic = 'true'"), /unmanaged transport override/);
  assert.throws(() => transformAppBuildGradle('android { }'), /reviewed Groovy Android template/);
});

test('ATS disables every broad bypass while retaining the explicit local-only Metro exception', () => {
  const value: Record<string, unknown> = { CFBundleDisplayName: 'BetweenUs', NSAppTransportSecurity: {
    NSAllowsArbitraryLoads: true, NSAllowsArbitraryLoadsForMedia: true, NSAllowsArbitraryLoadsInWebContent: true,
    NSAllowsLocalNetworking: true,
  } };
  assert.deepEqual(transformInfoPlist(value), { CFBundleDisplayName: 'BetweenUs', NSAppTransportSecurity: {
    NSAllowsArbitraryLoads: false, NSAllowsArbitraryLoadsForMedia: false, NSAllowsArbitraryLoadsInWebContent: false,
    NSAllowsLocalNetworking: true,
  } });
  assert.deepEqual(transformInfoPlist(structuredClone(value)), value);
  assert.throws(() => transformInfoPlist({ NSAppTransportSecurity: { NSExceptionDomains: { 'unreviewed.test': {} } } }), /domain exceptions require review/);
  assert.throws(() => transformInfoPlist({ NSAppTransportSecurity: { NSExceptionDomains: [] } }), /domain exceptions require review/);
  assert.throws(() => transformInfoPlist({ NSAppTransportSecurity: true }), /unexpected ATS dictionary/);
  assert.throws(() => transformInfoPlist({ NSAppTransportSecurity: { NSAllowsLocalNetworking: 'YES' } }), /explicit Boolean/);
});
