const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withInfoPlist } = require('expo/config-plugins');

const placeholder = '${betweenUsUsesCleartextTraffic}';
const begin = '// @generated begin between-us-production-transport';
const end = '// @generated end between-us-production-transport';
const failure = message => new Error(`Production transport: ${message}`);

function transformAndroidManifest(manifest) {
  if (manifest.manifest.application?.length !== 1) throw failure('expected one application in the reviewed manifest.');
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const attributes = application.$;
  if (attributes['android:networkSecurityConfig'] !== undefined) throw failure('custom network security config requires review.');
  if ((attributes['tools:remove'] || '').split(',').map(value => value.trim()).includes('android:usesCleartextTraffic')) {
    throw failure('cleartext attribute removal requires review.');
  }
  const tools = manifest.manifest.$['xmlns:tools'];
  if (tools && tools !== 'http://schemas.android.com/tools') throw failure('unexpected tools namespace.');
  manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  attributes['android:usesCleartextTraffic'] = placeholder;
  attributes['tools:replace'] = [...new Set((attributes['tools:replace'] || '').split(',').map(value => value.trim()).filter(Boolean)
    .concat('android:usesCleartextTraffic'))].join(',');
  return manifest;
}

const managedGradle = `${begin}
// No environment/credential reads. Only debug permits cleartext for Metro/local fixtures.
def betweenUsTransportKey = 'betweenUsUsesCleartextTraffic'
android.defaultConfig.manifestPlaceholders[betweenUsTransportKey] = 'false'
android.buildTypes.configureEach { buildType ->
    buildType.manifestPlaceholders[betweenUsTransportKey] = buildType.name == 'debug' ? 'true' : 'false'
}
android.buildTypes.release.manifestPlaceholders[betweenUsTransportKey] = 'false'

def betweenUsReadTransportApplication = { File manifestFile ->
    def factory = javax.xml.parsers.DocumentBuilderFactory.newInstance()
    factory.setNamespaceAware(true)
    factory.setFeature('http://apache.org/xml/features/disallow-doctype-decl', true)
    factory.setExpandEntityReferences(false)
    factory.setXIncludeAware(false)
    def document = factory.newDocumentBuilder().parse(manifestFile)
    def applications = document.getElementsByTagName('application')
    if (applications.length != 1) throw new GradleException('Production transport: unexpected application manifest; review native outputs.')
    return applications.item(0)
}
def betweenUsCheckMergedTransport = { File manifestFile ->
    def application = betweenUsReadTransportApplication(manifestFile)
    def namespace = 'http://schemas.android.com/apk/res/android'
    if (application.getAttributeNS(namespace, 'usesCleartextTraffic') != 'false' ||
        application.hasAttributeNS(namespace, 'networkSecurityConfig') ||
        application.getAttributeNS(namespace, 'debuggable') == 'true') {
        throw new GradleException('Production transport: release manifest permits cleartext, custom network policy or debugging; review native outputs.')
    }
}
def betweenUsTransportCheck = tasks.register('verifyBetweenUsProductionTransport') {
    doLast {
        if (String.valueOf(android.defaultConfig.manifestPlaceholders[betweenUsTransportKey]) != 'false' ||
            String.valueOf(android.buildTypes.release.manifestPlaceholders[betweenUsTransportKey]) != 'false' ||
            android.buildTypes.release.debuggable || android.productFlavors.size() != 0 ||
            tasks.findByName('processReleaseMainManifest') == null) {
            throw new GradleException('Production transport: release configuration changed; review the native template.')
        }
        def application = betweenUsReadTransportApplication(file('src/main/AndroidManifest.xml'))
        def namespace = 'http://schemas.android.com/apk/res/android'
        if (application.getAttributeNS(namespace, 'usesCleartextTraffic') != '\${betweenUsUsesCleartextTraffic}' ||
            application.hasAttributeNS(namespace, 'networkSecurityConfig')) {
            throw new GradleException('Production transport: main manifest changed; rerun reviewed prebuild.')
        }
    }
}
tasks.configureEach { task ->
    def lower = task.name.toLowerCase(java.util.Locale.ROOT)
    if (lower.contains('release')) {
        task.dependsOn(betweenUsTransportCheck)
        if (lower.startsWith('process') && lower.contains('manifest')) {
            task.doLast {
                def manifests = task.outputs.files.asFileTree.matching { include '**/AndroidManifest.xml' }.files
                if (manifests.isEmpty()) throw new GradleException('Production transport: release manifest output changed; review the native template.')
                manifests.each { manifestFile -> betweenUsCheckMergedTransport(manifestFile) }
            }
        }
    }
}
${end}`;

function transformAppBuildGradle(input) {
  let source = input.replace(/\r\n/g, '\n');
  const starts = source.split(begin).length - 1, ends = source.split(end).length - 1;
  if (starts !== ends || starts > 1) throw failure('ambiguous managed markers.');
  if (starts) source = source.replace(/^\/\/ @generated begin between-us-production-transport\n[\s\S]*?^\/\/ @generated end between-us-production-transport\n?/m, '');
  if (source.includes(begin) || source.includes(end)) throw failure('managed block could not be safely replaced.');
  if (!/^\s*android\s*\{/m.test(source) || !/^\s*defaultConfig\s*\{/m.test(source) || !/^\s*buildTypes\s*\{/m.test(source)) {
    throw failure('expected the reviewed Groovy Android template.');
  }
  if (source.includes('betweenUsUsesCleartextTraffic') || source.includes('verifyBetweenUsProductionTransport')) throw failure('unmanaged transport override requires review.');
  return source.trimEnd() + '\n\n' + managedGradle + '\n';
}

function transformInfoPlist(plist) {
  const current = plist.NSAppTransportSecurity;
  if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) throw failure('unexpected ATS dictionary.');
  const ats = { ...(current || {}) };
  if (ats.NSExceptionDomains !== undefined && (!ats.NSExceptionDomains || typeof ats.NSExceptionDomains !== 'object' || Array.isArray(ats.NSExceptionDomains) || Object.keys(ats.NSExceptionDomains).length)) {
    throw failure('ATS domain exceptions require review.');
  }
  if (ats.NSAllowsLocalNetworking !== undefined && typeof ats.NSAllowsLocalNetworking !== 'boolean') throw failure('local ATS exception must be an explicit Boolean.');
  ats.NSAllowsArbitraryLoads = false;
  ats.NSAllowsArbitraryLoadsForMedia = false;
  ats.NSAllowsArbitraryLoadsInWebContent = false;
  // Explicitly retained Expo development exception, including in release plists.
  // It is narrower than arbitrary loads; iOS transport/device review is still required.
  if (ats.NSAllowsLocalNetworking === undefined) ats.NSAllowsLocalNetworking = true;
  plist.NSAppTransportSecurity = ats;
  return plist;
}

module.exports = function withProductionTransport(config) {
  config = withAndroidManifest(config, result => { result.modResults = transformAndroidManifest(result.modResults); return result; });
  config = withAppBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') throw failure('only the reviewed Groovy app template is supported.');
    result.modResults.contents = transformAppBuildGradle(result.modResults.contents); return result;
  });
  return withInfoPlist(config, result => { result.modResults = transformInfoPlist(result.modResults); return result; });
};
module.exports.transformAndroidManifest = transformAndroidManifest;
module.exports.transformAppBuildGradle = transformAppBuildGradle;
module.exports.transformInfoPlist = transformInfoPlist;
