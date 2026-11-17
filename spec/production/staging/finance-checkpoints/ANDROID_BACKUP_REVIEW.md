# Android backup and extraction review

Initial review 2026-11-17 03:01 UTC, read only, against the current mobile source and existing generated debug outputs; source-contract regressions added and checked at 03:21 UTC. Version remains **0.6.0 / versionCode 5**. This review does not certify a signed release, physical-device transfer, iOS backup, or resistance to privileged filesystem extraction. No runtime configuration, native output or running device was changed.

The observed `android:allowBackup="true"` is **not evidence that the journal, outbox or pending financial command is included in backup**. The current rules and storage locations exclude those stores from Android cloud backup and Android-to-Android device transfer. There is no demonstrated sensitive-store leak in the reviewed paths that justifies a native version change. Final artifact and physical transfer qualification remain open.

## Configuration and generated scope

- [app.json](../../../../apps/mobile/app.json) enables `expo-secure-store` with `configureAndroidBackup: true` and SQLCipher through `expo-sqlite`. It has no explicit `android.allowBackup` override.
- Installed `apps/mobile/node_modules/expo-secure-store/plugin/src/withSecureStore.ts` assigns `@xml/secure_store_backup_rules` and `@xml/secure_store_data_extraction_rules`. The XML resources come from the SecureStore Android library, rather than an app-owned `src/main/res/xml` directory.
- Existing `apps/mobile/android/app/src/main/AndroidManifest.xml` and `android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml` reference both rules and have `allowBackup="true"`; the merged debug manifest targets SDK 36.
- No `app.config.*`, `eas.json`, release source-set manifest or backup override in the custom plugins was found. The shared app configuration therefore supplies these rules to release CNG as well. This is source-scope evidence, **not inspection of a final owner-signed release manifest/resources**. Existing signing and transport plugins provide no replacement backup policy.

Installed library resource `apps/mobile/node_modules/expo-secure-store/android/src/main/res/xml/secure_store_backup_rules.xml`:

```xml
<full-backup-content>
  <include domain="sharedpref" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>
</full-backup-content>
```

Installed sibling `secure_store_data_extraction_rules.xml`:

```xml
<data-extraction-rules>
  <cloud-backup>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
  </cloud-backup>
  <device-transfer>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
  </device-transfer>
</data-extraction-rules>
```

An include changes default inclusion to the listed resources; exclusions then take precedence. Thus these rules allow non-SecureStore shared preferences and exclude ordinary file/database/external domains. `getNoBackupFilesDir()` is excluded independently, even if rules request inclusion. These are documented platform semantics, not a physical transfer result. [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

## Private storage trace

| Data | Reviewed source and native destination | Backup boundary |
| --- | --- | --- |
| Journal and private drafts | [vault/platform.native.ts](../../../../apps/mobile/src/production/vault/platform.native.ts); Android protection module requires the fixed `Context.noBackupFilesDir/between-us-vaults` directory before opening SQLCipher | Directory is outside backup; keys/metadata use SecureStore. No public-path fallback. Database sidecars share the protected directory. |
| Approved message outbox | [message-outbox.native.ts](../../../../apps/mobile/src/production/message-outbox.native.ts); fixed sibling `noBackupFilesDir/between-us-message-outbox`, with scoped `message-outbox-v1-*.db` files | Same no-backup boundary; key service `betweenus.message-outbox.v1` uses SecureStore. Legacy outbox files found inside the vault directory fail closed. |
| Pending financial command/recovery record | [pending-finance.native.ts](../../../../apps/mobile/src/production/pending-finance.native.ts), service `betweenus.finance.pending.v1` | SecureStore; no separate persisted financial ledger or DTO cache was found in the reviewed mobile persistence paths. |
| Managed session | [session-storage.native.ts](../../../../apps/mobile/src/production/session-storage.native.ts) | SecureStore. |
| Optional licensed model weights and partial download | [local-model.native.ts](../../../../apps/mobile/src/local-model.native.ts), `Paths.document/between-us-model-assets` | Public model assets, excluded by the file-domain omission for the two configured extraction modes. No persisted prompts/sessions were found in this path. |

The fixed Android paths and canonical-directory/symlink checks are implemented in [BetweenUsProtectionModule.kt](../../../../apps/mobile/modules/between-us-protection/android/src/main/java/com/oxieg3n/betweenus/protection/BetweenUsProtectionModule.kt). The installed `SecureStoreModule.kt` writes every reviewed keychain service into the same private shared-preference file named `SecureStore`; a different `keychainService` does not create an independently backed-up preferences file. Expo documents the matching exclusion and requires it to remain present if custom backup rules are introduced. [Expo SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)

The iOS protection module separately sets and verifies `isExcludedFromBackup` on its fixed `BetweenUsPrivateVaults` and `BetweenUsApprovedMessageOutbox` directories/files. The reviewed SecureStore callers select `THIS_DEVICE_ONLY` accessibility. These source controls do not replace iOS device/backup qualification; see the existing [native module qualification limits](../../../../apps/mobile/modules/between-us-protection/README.md).

## Remaining qualification and policy limits

- **Shared preferences:** the rules permit other shared preferences, including possible framework or installation metadata. This is not an app-wide zero-backup policy. Application appearance uses AsyncStorage; this review makes no portability guarantee for that preference.
- **Flag and OEM behavior:** `allowBackup=false` alone is not a universal D2D guarantee on Android 12+ devices. Preserve explicit extraction rules and protected directories even if an owner later chooses that flag. [Android application manifest documentation](https://developer.android.com/guide/topics/manifest/application-element#allowbackup)
- **New transfer modes:** the stock XML has no `cross-platform-transfer` section. Android documents a separate Android 16 QPR2/API 36.1 mode and required platform-pairing parameters; rules for cloud/D2D do not establish its policy. No such transfer was exercised or pairing configuration verified here. Treat it as a future-platform qualification gap, not a demonstrated current export. [Android cross-platform transfer configuration](https://developer.android.com/identity/data/autobackup)
- **Final native artifacts:** inspect the owner-signed release's merged manifest and compiled XML, confirm both resource references and exact include/exclude rules, verify no backup agent or variant override changes them, and record the artifact hash. Do not infer this result from the current debug manifest.
- **Physical backup/restore and migration:** use fictional markers in each private store and relevant database sidecars; verify cloud backup/restore and OEM Android D2D do not transfer them. Include pending-command recovery behavior after restore, rather than treating an undecryptable copied record as an acceptable result. Repeat for supported iOS backup/device migration independently. Physical and OEM results are still unavailable.
- **Other extraction paths:** these OS backup rules do not govern explicit user exports, diagnostic/log capture, app snapshots, a debuggable build's authorized `run-as`, root access, or forensic acquisition. Each remains subject to its separate release/privacy controls. This audit creates no blanket extraction-resistance claim.

No new backup plugin or configuration change is proposed for this build. The source-contract regression checks below precede final-artifact inspection and fictional physical-device backup/restore tests. Any later app-wide zero-backup policy should be an explicit owner-reviewed change with both cloud and D2D rules; changing only the manifest flag would leave the documented OEM caveat unresolved.

## Source regression checks

[production-backup-policy.test.ts](../../../../apps/mobile/tests/production-backup-policy.test.ts) adds **4 tests** using the existing Expo XML parser and Node test runner, with no new dependencies. They check the installed and lockfile-pinned SecureStore 58.0.3 resources/configuration; legacy, cloud and D2D rules; fixed Android protected directories and fail-closed callers; iOS exclusion write/readback source; and device-only key/recovery options. Predicate controls deliberately remove the exclusion or whitelist and confirm that previously excluded data becomes eligible. These controls exercise the test's interpretation of the inspected rules, not an OS backup transport.

Actual commands run from `D:\projects\BetweenUs\apps\mobile` on 2026-11-17:

```powershell
node --import tsx --test tests/production-backup-policy.test.ts
npm run typecheck
npm run lint
```

Final targeted result: **4/4 PASS**, zero skipped; mobile typecheck and lint both exited **0**. The tests read source/library files and do not import native storage implementations, execute CNG, inspect a signed APK, or perform backup/restore. Root retains the final full-mobile regression and native qualification work.
