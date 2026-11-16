# Device qualification matrix

Updated 2026-11-16, candidate `1116-ProductionFoundation-p3` / app `0.4.1`. Backend additions: `467c530`; authenticated mobile integration: `07e333e`; final keyboard source: **`0c2d325`**. Final documentation receipt/push pending. **No production supported-device list is approved.** Local emulator runtime evidence covers scoped account/storage/font/density/keyboard flows. Physical Android/ARM64, iOS, release signing, hardware biometry/restore and device push remain unverified. R12 evidence stays historical.

Do not infer a minimum Android/iOS version from a source SDK label. The release lead must extract actual minimum/target OS versions and ABIs from the final generated/signed artifacts, reconcile them with Expo/native dependencies, then qualify the promised range. `supportsTablet:true` is configuration intent, not an iPad/tablet test result.

| Candidate environment | Required qualification before listing as supported | Current status |
| --- | --- | --- |
| Android ARM64, proposed minimum supported OS | Signed release-like install; protected account storage, strong biometric vault access, wrong-key/cancel/lockout, small screen/keyboard/large text, low memory, offline/reconnect, contact/consent revoke | Not run |
| Android ARM64, current supported OS | Same plus background/process kill, screenshots/Recents, notification permissions/quiet hours/token rotation, manufacturer backup/device transfer | Not run |
| Android low-resource hardware | Cold/warm model timings, median/p95/peak memory/thermal, cancellation, foreground cover, validated fallback; disk-full/corrupt asset and vault behavior | Not run; no RAM/performance promise |
| Android physical tablet | Orientation/resizing, split screen, large text/spoken accessibility, shared-device isolation and native keyboard flows | Not run |
| Android x86_64 emulator/debug | Scoped runtime and three density-profile retests below; final source/artifact report still needed | Local runtime passes with synthetic emulator fingerprint; not a consumer-device or hardware-security support claim |
| Physical iPhone, proposed minimum and current iOS | Release-like signing, Face ID, background/app-switcher/screenshot behavior, Keychain reinstall/loss, backup exclusion, privacy reauth, messages and financial UI | Not run |
| Physical Touch ID iPhone/iPad if supported | Strong biometric/key access and cancellation/invalidation, large text/VoiceOver, orientation and shared-device ownership | Not run |
| Web browser | Reviewed account/communication/finance UI, keyboard/zoom/accessibility and current-session behavior; protected journal unavailable without supported native vault | Final post-keyboard production 16/16 passed in 1.7 minutes; demo 19/19 passed in 2.1 minutes. Web send recovery explicitly memory-only. Spoken/native accessibility not certified. |

## Current scoped native observations

Root reported guarded own-package cold start after ready Metro resolving black/red startup; actual outbox response-loss force-stop/cold-restart recovery with exactly one client UUID/message; ciphertext header not SQLite/no fixture plaintext in the probed file; and journal enrollment **after** outbox use in distinct directories. Journal autosave, explicit save, local reflection and background lock passed using **synthetic emulator fingerprint only**, not physical strong-biometric qualification.

Hot font follow-up passed on the emulator: 1.0→2.0 grew the heading **92→112 px**, with the same words; focused 1.3 composer retained focus/accepted text. The wrapper now keys only native Text/controlled TextInput hosts on `useWindowDimensions()` **fontScale and scale**, with unique attached-host incarnations, never Root/Journal/controllers. No font arithmetic/clamping or persisted plaintext copy. Wider IME/device/accessibility qualification remains open.

Root passed the scoped 84-second 503 outage with already unlocked Journal editing/confirmed local Save, normal two-minute idle lock, fresh online/device proof for selected readable review, and typed own-vault erase with native file count 0. Synthetic emulator-only PIN was cleared. **Absolute lease expiry was not tested natively**; pure lease/SQL coverage is distinct. [Latest ledger](TEST_RESULTS.md). The [visual report](../qa/production/p3/VISUAL_QA_REPORT.md) inventories **30 themed originals, 15/theme**, six resize originals, six comparison pairs and two contact sheets; protected Journal/chat/Review are excluded. `FLAG_SECURE` stays on; files do not certify accessibility.

The small Android chat test initially put Review below the IME. Source `0c2d325` uses shared padding with measured native top coordinates and a compact chat header while the keyboard is visible. The final 720×1280/density 320 case showed the entire textbox (104 px / 52 dp) and Review (98 px), and an actual tap reached **Send reviewed message without sending**. [Keyboard evidence](../qa/production/p3/device-sizes/keyboard-results.json). Native iOS keyboard behavior remains untested. Android/iOS Hermes and six-route static web exports passed; JS export is not native iOS runtime evidence.

## Density profiles on one emulator — original failure and viewed retest

Initial small Home clipped Help/navigation; initial tablet-shaped Home clipped navigation. After the display-scale host-key fix, root viewed readable Home/full navigation on all three profiles below. [Original and retest PNGs/results](../qa/production/p3/device-sizes/) remain preserved.

| Pixel_10 profile | Size / density | Viewed result |
| --- | --- | --- |
| Small | 720×1280 / 320 | Full readable Home/Help/navigation |
| Large | 1440×3120 / 480 | Full readable Home/navigation |
| Tablet-shaped | 1600×2560 / 240 | Full readable Home/navigation |

Original **1080×2424 / density 420 / font 1.0** restored. These are window-manager profiles on one Pixel_10, not physical small/large/tablet devices, every-screen acceptance or spoken-accessibility qualification. Root refreshed the API and verified Home after the latest guarded cache-cleared Metro launch; observed PID 39240 is session provenance, not a permanent process identity.

## Native source inventory — not final artifact proof

Read-only observation on 2026-11-16: the generated Android main manifest declares `INTERNET`, `USE_BIOMETRIC` and `USE_FINGERPRINT`, with explicit removal directives for external-storage read/write, microphone recording, overlay and vibration permissions. The main source did not declare `POST_NOTIFICATIONS` at that snapshot. Dependency merging and later source changes may change the final artifact; extract the complete merged permission list from the candidate APK/AAB, justify every permission and test denial/revocation. There is no established physical notification permission/delivery result. No camera, contacts, location or microphone requirement should be invented for the product.

The observed application had `allowBackup=true` with SecureStore-specific backup/data-extraction rule references. That flag alone proves neither journal inclusion nor exclusion. Inspect the final rules and every vault/SQLite WAL/SHM, key, temporary export and device-transfer path, then demonstrate exclusion and failure behavior on actual hardware. SQLCipher configuration and a biometric permission declaration do not prove strong hardware-backed authorization or key invalidation on each supported device.

The initial generated Android release type referenced debug signing; that earlier observation is superseded. The production signing plugin removes the debug-release fallback and fails closed without reviewed owner signing material; root observed the actual missing-signing Gradle guard fail as expected. Debug runtime passes and a protective guard refusal are not signed-release evidence. Owner-controlled keys/profiles, final certificates/embedded assets/manifests and physical qualification remain blocking checks.

Native managed-Auth callback work is in progress: the intended app callback is `between-us://auth/callback`, with exact redirect allowlist, PKCE callback handling and explicit mail templates to reconcile. Manual code verification/recovery was tested only through local mail capture. Native cold/warm callback, malicious/mismatched redirect, cancellation, account-switch and physical-device recovery have not been qualified.

## Cross-device release exercises

Use fictional content and credential fixtures only until the owner approves real-data research. Never reuse a real child's journal to test security. Record device model, OS/build, ABI, app/backend commit, theme/font/keyboard, exact steps/result and original evidence hashes.

- Sign in as independent guardian/child accounts, background/revoke/switch authors, and ensure old UI handlers and async completions cannot dispatch another author's words under the new account. Guardian setup applies to every child/teen age; no role toggle or shared password.
- Exercise accepted/verified/approved external and family contacts, both-direction private blocks, stale review/send/fetch/ack/subscription, and offline retries. Queued bodies cannot cross a later block or revoked consent.
- Verify author-local journal/draft key custody and binding, wrong-key access, unsupported cipher/biometric failure, background cover, two-minute lock, restoration exclusions and interrupted delete/export. Missing keys must not create an empty replacement. A guardian cannot decrypt/export private writing; device/key loss can be permanent.
- Check optional local model asset/license/hash, unsupported-device fallback, safe output validation, cancellation and no prompts/sessions/log/file persistence. Do not promise model availability or performance from an emulator build.
- Review check-in scheduling/timezones/DST, no catch-up/skip signal, exact separately edited answer preparation and root Review/Send. Background delivery remains unverified.
- Test TalkBack/VoiceOver, hardware/software keyboard, focus order, screen-reader labels/errors, 200% text, safe-area/small screen and both approved themes. Saving screenshots alone is not an accessibility pass.
- Verify neutral push on an actual opted-in device, permission denial, token/session reassignment and provider-acceptance versus device acknowledgment. No private text/names/financial matches in previews. No active provider transport is established.

If required device protection cannot be established, the vault fails closed and explains why writing is unavailable; do not weaken hardware/key protection to expand an unreviewed compatibility claim. Approve the product's fallback and age-appropriate wording before listing devices. Final support decisions belong to the owner with independent mobile-security and accessibility reviewers.

## Historical hot-font investigation before the current host-wrapper pass

The following failed snapshots and source investigation are retained as provenance. The current scoped native typography/focus pass is recorded above; it does not retroactively pass these earlier builds or qualify all hardware/IME combinations.

The root operator observed the p3 Android debug composer lose fictional unsent writing and return Home after a foreground system `font_scale` change from 1.0 to 1.3. After installing the manifest plugin, the same draft survived 1.0/1.3/1.0 changes, confirming the recreation fix in that emulator run. Settled Home heading bounds nevertheless remained unchanged across 1.5 and restored 1.0, so visible typography refresh is still a confirmed unresolved runtime defect for that build. Scale was restored after testing. These are bounded operator observations, not a supported-device approval.

`plugins/withWritingConfiguration.cjs` adds only `fontScale` to the reviewed MainActivity's existing `android:configChanges`, preserving keyboard/resize, density, theme, permissions and all other activities. Root owns app-config registration and regeneration/rebuild. The existing adaptive-display plugin now adds the narrow cache/measurement refresh described below to its already managed configuration callback. Neither change stores writing, changes background/idle/authentication locking or clamps font preferences.

Installed React Native 0.88.1 supplies a native layout path: MainActivity's existing override calls `super.onConfigurationChanged`; Expo's delegate forwards to React Native, whose `ReactHostImpl.onConfigurationChanged` refreshes display metrics and requests attached-surface layout. `enableFontScaleChangesUpdatingLayout` defaults true in installed Kotlin/C++ providers. `ReactSurfaceImpl.updateLayoutSpecs` passes current resource fontScale and Yoga invalidates measurable text when its multiplier changes. The manifest flag and existing requestLayout alone were insufficient in the operator's observed build, so this source path must not be described as an executed typography pass.

Installed `DeviceInfoModule` caches JavaScript fontScale and refreshes it only in its `onHostResume` implementation, whose audited body compares current resource scale and emits React Native's own dimension payload. The updated adaptive-display callback posts after `super`, obtains the current `reactDelegate.currentReactContext`, checks the same attached root/active React instance, refreshes `DisplayMetricsHolder` from the current Activity, and looks up **only** `NativeDeviceInfoSpec.NAME` through `ReactContext.getNativeModule(String)`. It invokes that module's cache refresh through its public `LifecycleEventListener` interface, then forces/requires remeasurement of the existing root and retains the existing current-root/stack-frame guards. It never calls Activity/ReactHost/ReactContext lifecycle methods, emits guessed dimensions, remounts React or sends AppState events.

This is an explicitly pinned RN 0.88 compatibility hook, not a general public cache-refresh API: `DeviceInfoModule` itself is Kotlin-internal, and no separate public font-cache refresh method exists in this installed source. Any React Native/Expo upgrade must re-review the exact DeviceInfo implementation, module identity/access, delegate timing and root layout path before retaining the hook. The new hook is unqualified until root rebuilds and demonstrates actual font growth/shrinkage, fresh JavaScript dimension scale and preserved unsent text; no visible-typography success is claimed here. [Pinned RN DeviceInfo source](https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/deviceinfo/DeviceInfoModule.kt).

Android documents that `configChanges` avoids recreation only for declared changes and requires the app to handle resource updates; it does not protect against process death or other recreation. See [Android configuration changes](https://developer.android.com/guide/topics/resources/runtime-changes), [fontScale manifest behavior](https://developer.android.com/guide/topics/manifest/activity-element#config), [React Native dimension updates](https://reactnative.dev/docs/usewindowdimensions) and [Expo config plugins](https://docs.expo.dev/config-plugins/plugins/).

After root registration and native rebuild, record Activity/process continuity, exact unsent text and recipient/response preservation, actual readable font enlargement/reduction and fresh dimension values at 1.0/1.3/2.0, keyboard-open scrolling/Back/Review, both themes and density changes. Independently background/idle/revoke/switch the account to prove existing concealment and clearing still apply; opening Android Settings may background the app and is not a foreground-preservation test. Do not infer process-kill recovery or private plaintext persistence. This helper performs only transform tests/type/lint, with no native/ADB/device operations.

Executed cache-hook follow-up checks: five writing-plugin transform tests and four adaptive-display tests pass (9/9), with full mobile `npm run typecheck` and scoped plugin/test ESLint. The new generated-source regression checks the exact DeviceInfo hook, guarded ordering, no host lifecycle calls, no root replacement and idempotent marker replacement. These are source checks, not Kotlin compilation or Android typography proof. This helper performed no native/ADB operations.

## Staging r1 qualification - 2026-11-16

Staging r1 actual device: Pixel_10 Android17/API37 x86_64/16KB emulator,1080?2424/d420. Debug0.5.0/code4, actual roles/themes, IME geometry, hot200% draft retention, viewport overrides, protected window and cold-start offline public help checked. TalkBack is PARTIAL; no physical ARM64/iOS/key-security/20-generation hardware/thermal/full native15-minute lease result. [Exact hardware/accessibility ledger](staging/HARDWARE_ACCESSIBILITY_QA.md), [native image evidence](../qa/production/staging-r1/). JavaScript iOS export does not establish native device support.
