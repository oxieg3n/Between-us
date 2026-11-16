const { withAppBuildGradle } = require('expo/config-plugins');

const begin = '// @generated begin between-us-production-signing';
const end = '// @generated end between-us-production-signing';

// Braces inside comments/quoted Groovy strings must not select another release block.
function maskedGroovy(source) {
  const chars = source.split('');
  let quote = null, comment = null;
  for (let i = 0; i < source.length; i++) {
    if (comment === 'line') { if (source[i] === '\n') comment = null; else chars[i] = ' '; continue; }
    if (comment === 'block') {
      if (source.slice(i, i + 2) === '*/') { chars[i] = chars[i + 1] = ' '; i++; comment = null; }
      else if (source[i] !== '\n') chars[i] = ' ';
      continue;
    }
    if (quote) {
      if (source[i] === '\\') { chars[i] = ' '; if (i + 1 < source.length) chars[++i] = ' '; }
      else if (source.slice(i, i + quote.length) === quote) { for (let n = 0; n < quote.length; n++) chars[i + n] = ' '; i += quote.length - 1; quote = null; }
      else if (source[i] !== '\n') chars[i] = ' ';
      continue;
    }
    if (source.slice(i, i + 2) === '//') { chars[i] = chars[i + 1] = ' '; i++; comment = 'line'; }
    else if (source.slice(i, i + 2) === '/*') { chars[i] = chars[i + 1] = ' '; i++; comment = 'block'; }
    else if (source[i] === '"' || source[i] === "'") {
      quote = source.slice(i, i + 3) === source[i].repeat(3) ? source[i].repeat(3) : source[i];
      for (let n = 0; n < quote.length; n++) chars[i + n] = ' '; i += quote.length - 1;
    }
  }
  if (quote || comment === 'block') throw Error('Production signing: unfinished Groovy string/comment. Review the generated template.');
  return chars.join('');
}
function namedBlock(mask, name, from = 0, until = mask.length) {
  const matches = [];
  let depth = 0;
  for (let i = from; i < until; i++) {
    if (depth === 0 && !/[\w.]/.test(mask[i - 1] || '')) {
      const match = new RegExp(`^${name}\\s*\\{`).exec(mask.slice(i, until));
      if (match) {
        const open = i + match[0].lastIndexOf('{'); let close = open + 1, nested = 1;
        for (; close < until && nested; close++) { if (mask[close] === '{') nested++; if (mask[close] === '}') nested--; }
        if (nested) throw Error('Production signing: unbalanced Gradle block.');
        matches.push({ open, close: close - 1 }); i = close - 1; continue;
      }
    }
    if (mask[i] === '{') depth++; if (mask[i] === '}') depth--;
    if (depth < 0) throw Error('Production signing: unbalanced Gradle scope.');
  }
  if (depth !== 0 || matches.length !== 1) throw Error(`Production signing: expected one reviewed ${name} block.`);
  return matches[0];
}

const managedSigning = `${begin}
// Values are read only by Gradle at owner build time; never write them into generated source.
def betweenUsSigningNames = ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']
def betweenUsSigningValues = betweenUsSigningNames.collectEntries { suffix ->
    def name = 'BETWEENUS_RELEASE_' + suffix
    [(suffix): providers.environmentVariable(name).orElse(providers.gradleProperty(name)).orNull]
}
def betweenUsSigningComplete = betweenUsSigningValues.values().every { it != null && !it.trim().isEmpty() }
def betweenUsOwnerStore = null
def betweenUsSigningReady = false
try {
    if (betweenUsSigningComplete) {
        def candidate = new File(betweenUsSigningValues.STORE_FILE)
        def repository = rootProject.projectDir.parentFile.parentFile.parentFile.canonicalFile
        def debugStore = android.signingConfigs.debug.storeFile.canonicalFile
        betweenUsOwnerStore = candidate.canonicalFile
        betweenUsSigningReady = candidate.isAbsolute() && betweenUsOwnerStore.isFile() && betweenUsOwnerStore.canRead() &&
            !betweenUsOwnerStore.toPath().startsWith(repository.toPath()) && betweenUsOwnerStore != debugStore &&
            !betweenUsOwnerStore.name.equalsIgnoreCase('debug.keystore') &&
            !betweenUsSigningValues.KEY_ALIAS.equalsIgnoreCase('androiddebugkey')
    }
} catch (Exception ignored) {
    // Invalid/missing owner material must not break ordinary debug configuration.
    betweenUsSigningReady = false
}
android {
    buildTypes.release.signingConfig = null
    if (betweenUsSigningReady) {
        signingConfigs {
            betweenUsOwnerRelease {
                storeFile betweenUsOwnerStore
                storePassword betweenUsSigningValues.STORE_PASSWORD
                keyAlias betweenUsSigningValues.KEY_ALIAS
                keyPassword betweenUsSigningValues.KEY_PASSWORD
            }
        }
        buildTypes.release.signingConfig = signingConfigs.betweenUsOwnerRelease
    }
}
def betweenUsSigningCheck = tasks.register('verifyBetweenUsOwnerSigning') {
    doLast {
        def configured = android.buildTypes.release.signingConfig
        def ownerStillSelected = false
        try {
            ownerStillSelected = betweenUsSigningReady && configured != null && configured.name == 'betweenUsOwnerRelease' &&
                configured.storeFile.canonicalFile == betweenUsOwnerStore && configured.keyAlias == betweenUsSigningValues.KEY_ALIAS
        } catch (Exception ignored) { ownerStillSelected = false }
        if (!ownerStillSelected) {
            throw new GradleException('Release signing is closed. Provide all four BETWEENUS_RELEASE_* owner settings and a readable absolute keystore outside the repository; debug signing is forbidden. No credential value is logged.')
        }
    }
}
// Covers direct/aggregate/flavored release builds, bundles, packages and installs, not debug tasks.
tasks.configureEach { task ->
    if (task.name.toLowerCase(java.util.Locale.ROOT).contains('release')) {
        task.dependsOn(betweenUsSigningCheck)
    }
}
${end}`;

function transformAppBuildGradle(input) {
  let source = input.replace(/\r\n/g, '\n');
  const starts = source.split(begin).length - 1, ends = source.split(end).length - 1;
  if (starts !== ends || starts > 1) throw Error('Production signing: ambiguous managed markers.');
  if (starts) source = source.replace(/^\/\/ @generated begin between-us-production-signing\n[\s\S]*?^\/\/ @generated end between-us-production-signing\n?/m, '');
  if (source.includes(begin) || source.includes(end)) throw Error('Production signing: managed block could not be safely replaced.');
  const mask = maskedGroovy(source), android = namedBlock(mask, 'android');
  if (/\bproductFlavors\s*\{/.test(mask.slice(android.open + 1, android.close))) throw Error('Production signing: product-flavor signing requires owner review.');
  const builds = namedBlock(mask, 'buildTypes', android.open + 1, android.close);
  const release = namedBlock(mask, 'release', builds.open + 1, builds.close);
  const signing = namedBlock(mask, 'signingConfigs', android.open + 1, android.close);
  if (/\b(?:release|betweenUsOwnerRelease)\s*\{/.test(mask.slice(signing.open + 1, signing.close))) throw Error('Production signing: custom signing configuration requires owner review.');
  const body = source.slice(release.open + 1, release.close);
  const directives = maskedGroovy(body).match(/\bsigningConfig\b/g) || [];
  const expected = /^[ \t]*signingConfig[ \t]+(?:signingConfigs\.debug|null)[ \t]*(?:\/\/[^\n]*)?$/m;
  if (directives.length > 1 || (directives.length === 1 && !expected.test(body))) throw Error('Production signing: custom release signing directive requires owner review.');
  const updated = directives.length ? body.replace(expected, '            signingConfig null // owner material is required below')
    : '\n            signingConfig null // owner material is required below' + body;
  source = source.slice(0, release.open + 1) + updated + source.slice(release.close);
  return source.trimEnd() + '\n\n' + managedSigning + '\n';
}
module.exports = function withProductionSigning(config) {
  return withAppBuildGradle(config, (result) => {
    if (result.modResults.language !== 'groovy') throw Error('Production signing supports only the reviewed Groovy app template.');
    result.modResults.contents = transformAppBuildGradle(result.modResults.contents); return result;
  });
};
module.exports.transformAppBuildGradle = transformAppBuildGradle;
