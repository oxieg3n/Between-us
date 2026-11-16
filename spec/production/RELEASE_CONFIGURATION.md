# Release signing and dependency inventory

Prepared 2026-11-16. This is release preparation source, not authorization to generate credentials, sign/distribute a build, connect hosted services or collect real child data. No existing app/package/native configuration was changed by this helper.

## Android signing plugin

The new [withProductionSigning.cjs](../../apps/mobile/plugins/withProductionSigning.cjs) uses Expo's installed `withAppBuildGradle` mod. It supports the reviewed Groovy template, locates `android > buildTypes > release` with comment/string-aware brace matching, and replaces its default debug signing with `signingConfig null`. Debug signing stays unchanged. A single managed block is replaced idempotently; an ambiguous template, duplicate release block or custom signing directive/configuration fails prebuild for owner review.

Expo documents `withAppBuildGradle` as a string modification of the generated app Gradle file, and its local release guide requires an upload signing configuration for the release bundle. This plugin adds a stricter missing-material gate instead of leaving an unsigned or debug-signed release fallback. Sources checked: [Expo mods](https://docs.expo.dev/config-plugins/mods/), [Expo local release builds](https://docs.expo.dev/guides/local-app-production/), [SDK58 reference](https://docs.expo.dev/versions/v58.0.0/), [Android app signing](https://developer.android.com/studio/publish/app-signing).

The plugin JavaScript never reads an environment variable, password, keystore or private key. It writes only Gradle provider references and generic failure text. At owner build time, Gradle reads these four settings, preferring the process environment and otherwise the same named Gradle project property:

| Setting | Requirement |
| --- | --- |
| `BETWEENUS_RELEASE_STORE_FILE` | Readable existing absolute keystore path outside this repository; cannot be the configured debug keystore or named `debug.keystore` |
| `BETWEENUS_RELEASE_STORE_PASSWORD` | Nonblank owner-supplied store password |
| `BETWEENUS_RELEASE_KEY_ALIAS` | Nonblank owner alias; cannot be `androiddebugkey` |
| `BETWEENUS_RELEASE_KEY_PASSWORD` | Nonblank owner-supplied key password |

Only a complete, readable, non-debug configuration creates `signingConfigs.betweenUsOwnerRelease` and assigns it to release. Missing, partial or invalid material leaves release signing null. Every app task whose name contains `release` depends on `verifyBetweenUsOwnerSigning`; that task checks that the owner configuration is still selected and throws a generic error if material is unavailable or signing was replaced. Aggregate assemble/build requests include the guarded release tasks. Ordinary debug tasks do not depend on the guard, and malformed owner paths are caught without breaking debug configuration. Product-flavor templates require separate owner review and are refused rather than allowing an unreviewed flavor-specific signing override.

This is not a cryptographic certificate inspection: AGP must still verify the actual keystore, password, alias and signing operation. Renaming a debug key does not make it an approved owner key. The owner must verify the final certificate fingerprint, upload/app-signing identity and artifact signature separately. Android distinguishes upload keys from the app signing key used for distributed installs; configuration alone is not Play enrollment or store acceptance. [Android signing and key ownership](https://developer.android.com/studio/publish/app-signing), [React Native release signing](https://reactnative.dev/docs/signed-apk-android).

Keep signing material out of `EXPO_PUBLIC_*`, mobile environment files, app config, generated source, command arguments, reports and Git. Prefer privately injected process environment values for one approved owner build. The provider fallback supports existing owner-local Gradle properties but this task creates no such file and changes no global configuration. Do not pass passwords with `-P` on a visible command line, dump Gradle properties or publish raw build logs/build scans. Use `--no-configuration-cache` for owner signing checks/builds so cached configuration does not become an additional secret-bearing artifact. Gradle documents environment/property provider configuration in its [build environment reference](https://docs.gradle.org/current/userguide/build_environment.html).

## Root integration and checks

The root must add `./plugins/withProductionSigning.cjs` to the existing app plugin list, preferably after other app-Gradle modifiers, then run the reviewed serialized Android prebuild without dependency installation. No helper edited `app.json` or an existing generated native file. Future native-template or plugin changes require another source review; this plugin refuses unreviewed custom release signing rather than overwriting it.

Root-only example commands, **not executed by this helper**:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile'
node .\node_modules\expo\bin\cli prebuild --no-clean --platform android --no-install
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile\android'
.\gradlew.bat :app:verifyBetweenUsOwnerSigning --no-configuration-cache
```

With no owner material, the final command must fail with the generic closed-signing message. The root separately verifies that a debug task still builds and that release tasks depend on this guard. After explicit owner authorization and private credential provisioning, the root can run the approved release bundle task with configuration caching disabled, verify embedded JavaScript/assets, inspect the signing certificate and preserve a redacted artifact/hash record. No credential was generated, requested through a tool, loaded, tested or written here.

The current native debug package still requires Metro and the local launch procedure. A signing plugin does not replace production Auth/API endpoints, disable development cleartext endpoints by itself, establish offline bundle behavior or satisfy physical-device/security/legal/operations gates. The r12 demo, journal privacy boundaries and fictional-only local testing remain separate from production distribution.

## iOS owner gate

No iOS signing setting or entitlement was changed. Release requires the owner's approved Apple team/account, bundle identity, distribution certificate/private-key custody, provisioning profile and reviewed Xcode archive/export configuration on an appropriate macOS/Xcode environment. The owner must verify entitlements, embedded bundle, distribution method and the signed archive before any submission. Windows/Android evidence cannot certify these. [Expo local iOS releases](https://docs.expo.dev/guides/local-app-production/#ios), [Apple beta/release distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).

## Offline inventory and license status

The new [release-inventory.mjs](../../services/backend/scripts/release-inventory.mjs) reads the existing mobile/backend v3 npm lockfiles, matching installed package metadata and top-level LICENSE/NOTICE/COPYING metadata. It writes only [SBOM.json](release/SBOM.json) and [DEPENDENCY_LICENSES.md](release/DEPENDENCY_LICENSES.md). It does not read private environment files, execute packages, fetch registries, install dependencies, scan application source/model weights/binaries or perform a vulnerability audit.

Regenerate from the canonical root after an owner-reviewed lock or installed-metadata change:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
node .\services\backend\scripts\release-inventory.mjs
```

The current output contains 992 SPDX2.3 components, 981 npm lock locations and 881 distinct name/version/declared-license groups. All `licenseConcluded` values are `NOASSERTION`; declarations are metadata evidence, not legal conclusions. Lock archive integrity is recorded without claiming installed-byte verification. Development, optional and platform-specific entries are included, so this is a dependency metadata inventory rather than the final built-artifact SBOM. Package relationships and SPDX IDs passed a local consistency check; a full external SPDX validator was not run.

The one npm declared-license gap is `node-forge@1.4.3`, whose raw metadata says `(BSD-3-Clause OR GPL-2.0)`. The conservative generator preserves that raw expression in the package comment and emits `NOASSERTION` rather than choosing/upgrading a license identifier. Its installed LICENSE path/hash is recorded for owner review. This is not a claim that the dependency is unlicensed or incompatible.

The root/mobile/backend first-party license grants remain `NOASSERTION`. `apps/mobile/LICENSE` contains an Expo MIT template notice; it does not establish a blanket license for application code, branding or weights. Observed vendored llama.cpp/codec.cpp MIT and OpenCL-Headers Apache2.0 notices are recorded, while ggml, SQLCipher, SQLite3 and Hermes standalone/native version/license composition remain explicit `NOASSERTION` gates. Do not infer full native redistribution rights from an npm wrapper's MIT declaration.

`llama.rn@0.13.0-rc.11` remains a release-candidate compatibility/supply-chain review gate. Its downloaded native artifacts, Maven/Gradle dependencies, CocoaPods, platform frameworks, crypto libraries and final bundled fonts/assets require an artifact-specific inventory. The optional r12 SmolLM2 Q8_0 entry records the public evaluation's pinned revision, 386404992-byte size, Apache2.0 declaration and SHA256; no model file or new publisher notice was fetched. The owner must check current model provenance and carry the required full license/NOTICE for any approved redistribution. A pinned hash or successful emulator inference does not close licensing, hardware or child-safety review.

## Validation performed

Static Node checks passed for sample and installed-template transformation, repeat-application equality, preservation of debug signing, removal of release debug signing, refusal of custom/duplicate/unbalanced managed configurations, and registration through the installed Expo `withAppBuildGradle` API. No native file was written or Gradle/prebuild invoked. Mobile typecheck and lint passed. The offline generator ran successfully; generated component IDs, relationship targets and `NOASSERTION` conclusions passed local consistency checks.

Actual generated-native task wiring, missing-key release failure, valid-owner signing, debug build continuation, certificate inspection, release APK/AAB content, iOS signing, final artifact licenses/notices and any vulnerability audit remain for the root/owner. No source/Git/native/service operation outside this task's assigned files was performed.
