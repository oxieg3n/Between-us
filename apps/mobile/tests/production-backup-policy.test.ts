import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { XML } from 'expo/config-plugins';

const requireFromTest = createRequire(__filename);
const secureStoreRoot = dirname(requireFromTest.resolve('expo-secure-store/package.json'));
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const librarySource = (path: string) => readFileSync(join(secureStoreRoot, path), 'utf8');
type Rule = { $: { domain: string; path: string } };
type Rules = { include?: Rule[]; exclude?: Rule[] };
async function installedRules(): Promise<Rules[]> {
  const legacy = await XML.parseXMLAsync(librarySource('android/src/main/res/xml/secure_store_backup_rules.xml'));
  const modern = await XML.parseXMLAsync(librarySource('android/src/main/res/xml/secure_store_data_extraction_rules.xml'));
  const modes = modern['data-extraction-rules'] as unknown as Record<string, Rules[]>;
  assert.ok(modes['cloud-backup']?.length === 1 && modes['device-transfer']?.length === 1);
  return [legacy['full-backup-content'] as unknown as Rules, modes['cloud-backup'][0], modes['device-transfer'][0]];
}

// Only models the reviewed domain/path rules; this is not an Android transport emulator.
function eligible(rules: Rules, domain: string, path: string): boolean {
  const matches = (rule: Rule) => rule.$.domain === domain &&
    (rule.$.path === '.' || rule.$.path === path || path.startsWith(`${rule.$.path}/`));
  return (!rules.include?.length || rules.include.some(matches)) && !rules.exclude?.some(matches);
}

test('configured pinned SecureStore supplies the reviewed legacy, cloud and D2D rules', async () => {
  const app = JSON.parse(source('app.json')).expo;
  const lock = JSON.parse(source('package-lock.json'));
  assert.equal(JSON.parse(librarySource('package.json')).version, '58.0.3');
  assert.equal(lock.packages['node_modules/expo-secure-store'].version, '58.0.3');
  assert.equal(app.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store')[1].configureAndroidBackup, true);
  for (const rules of await installedRules()) {
    assert.deepEqual(rules.include, [{ $: { domain: 'sharedpref', path: '.' } }]);
    assert.deepEqual(rules.exclude, [{ $: { domain: 'sharedpref', path: 'SecureStore' } }]);
  }
  const plugin = librarySource('plugin/src/withSecureStore.ts');
  assert.match(plugin, /BACKUP_RULES_PATH = '@xml\/secure_store_backup_rules'/);
  assert.match(plugin, /EXTRACTION_RULES_PATH = '@xml\/secure_store_data_extraction_rules'/);
  assert.match(plugin, /mainApplication\.\$\['android:fullBackupContent'\] = BACKUP_RULES_PATH/);
  assert.match(plugin, /mainApplication\.\$\['android:dataExtractionRules'\] = EXTRACTION_RULES_PATH/);
});

test('all configured modes exclude secrets and file/database assets with positive and negative controls', async () => {
  for (const rules of await installedRules()) {
    // Shared-preference names here are logical XML rule paths, not physical .xml filenames.
    assert.equal(eligible(rules, 'sharedpref', 'SecureStore'), false);
    assert.equal(eligible(rules, 'sharedpref', 'SecureStoreOther'), true);
    assert.equal(eligible(rules, 'sharedpref', 'framework-preferences'), true);
    for (const [domain, path] of [
      ['database', 'journal.db'], ['database', 'message-outbox.db-wal'],
      ['file', 'between-us-model-assets/model.gguf'], ['external', 'private.bin'],
      ['device_sharedpref', 'SecureStore'],
    ]) assert.equal(eligible(rules, domain, path), false, `${domain}/${path}`);
    assert.equal(eligible({ include: rules.include }, 'sharedpref', 'SecureStore'), true, 'removing exclusion exposes secrets');
    assert.equal(eligible({ exclude: rules.exclude }, 'file', 'private.bin'), true, 'removing whitelist restores default file inclusion');
    assert.equal(eligible({ ...rules, include: [...rules.include!, { $: { domain: 'file', path: '.' } }] }, 'file', 'private.bin'), true);
  }
});

test('Android private SQLCipher stores stay in separate fixed no-backup children and fail closed', () => {
  const native = source('modules/between-us-protection/android/src/main/java/com/oxieg3n/betweenus/protection/BetweenUsProtectionModule.kt');
  assert.match(native, /VAULTS\("between-us-vaults"\)/);
  assert.match(native, /MESSAGE_OUTBOX\("between-us-message-outbox"\)/);
  assert.match(native, /val noBackup = context\.noBackupFilesDir\.canonicalFile/);
  assert.match(native, /noBackup\.parentFile != appRoot \|\| noBackup != File\(appRoot, "no_backup"\)\.canonicalFile \|\| !noBackup\.isDirectory/);
  assert.match(native, /if \(!directory\.isDirectory \|\| directory\.parentFile != noBackup\) return null/);
  assert.match(native, /files\.any \{ !it\.isFile \|\| it\.canonicalFile != it\.absoluteFile/);
  assert.doesNotMatch(native, /context\.(?:filesDir|cacheDir|getExternalFilesDir)|getDatabasePath/);
  const vault = source('src/production/vault/platform.native.ts');
  assert.match(vault, /directory, protectAndVerifyDirectory: \(\) => protection\.protectVaultDirectory\(\)/);
  assert.match(vault, /return createNativeVaultController\(\)/);
  const outbox = source('src/production/message-outbox.native.ts');
  assert.match(outbox, /prepareMessageOutboxDirectory\?\.\(\)/);
  assert.match(outbox, /if\(!protection\|\|!path\|\|!await secrets\.isAvailableAsync\(\)\|\|!await protection\.protectMessageOutboxDirectory\?\.\(\)\)throw/);
  assert.match(outbox, /openDatabaseAsync\(name,\{useNewConnection:true\},path\)/);
});

test('iOS directory exclusions are read back and private key/recovery callers remain device-only', () => {
  const native = source('modules/between-us-protection/ios/BetweenUsProtectionModule.swift');
  assert.match(native, /case vaults = "BetweenUsPrivateVaults"/);
  assert.match(native, /case messageOutbox = "BetweenUsApprovedMessageOutbox"/);
  assert.match(native, /try protect\(root\)/);
  assert.match(native, /try protect\(child\)/);
  assert.match(native, /values\.isExcludedFromBackup = true/);
  assert.match(native, /try url\.setResourceValues\(values\)/);
  assert.match(native, /let fresh = URL\(fileURLWithPath: url\.path/);
  assert.match(native, /fresh\.resourceValues\(forKeys: \[\.isExcludedFromBackupKey\]\)\.isExcludedFromBackup == true else \{ throw/);
  for (const path of ['pending-finance.native.ts', 'session-storage.native.ts', 'message-outbox.native.ts']) {
    assert.match(source(`src/production/${path}`), /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  }
  assert.match(source('src/production/vault/platform.native.ts'), /WHEN_PASSCODE_SET_THIS_DEVICE_ONLY : modules\(\)\.secrets\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  const secureStore = librarySource('android/src/main/java/expo/modules/securestore/SecureStoreModule.kt');
  assert.match(secureStore, /SHARED_PREFERENCES_NAME = "SecureStore"/);
  assert.match(secureStore, /getSharedPreferences\(SHARED_PREFERENCES_NAME, Context\.MODE_PRIVATE\)/);
});
