# P3 native interaction evidence

2026-11-16. Build `1116-ProductionFoundation-p3`, app `0.4.1`, Android version code `3`. Branch `feature/production-foundation`; final application source `0c2d325`, [delivery receipt](../../../production/DELIVERY_RECEIPT.md). Fictional local accounts only. This is scoped emulator evidence, not physical-device, accessibility, cryptographic or release certification.

## Device and artifact

- Existing **Pixel_10**, serial `emulator-5554`, Android 17 / API 37, x86_64, 1080×2424, density 420, software GPU. A single emulator was used serially.
- Installed debug APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, **125217918 bytes**, SHA-256 `5FBBC33431E84B401B0FBEA137E646A3D3D6BF1EAB8767C180E1F811F4DFE594`.
- This classic debug APK loads current JavaScript from verified canonical Metro8081. Its hash identifies the native shell, not an embedded release JavaScript bundle. The final source receipt separately identifies the tested application code.
- Own API8787 and managed local Auth54321 were running. No hosted project, public enrollment or external payment was used. ADB reversals were restored to the ordinary same-port mappings after fault injection.

## Actual interaction results

| Check | Observed result |
| --- | --- |
| Red bundle error / black screen | Corrected the supported developer-menu bundle location to localhost8081, started verified canonical Metro and cold-restarted only the app after readiness. Actual branded Home and navigation were observed. No data wipe, private preference rewrite or unrelated process termination. |
| Production identity | Separate fictional parent Sam and child Alex signed in through managed local accounts. Guardian-only controls and ordinary child navigation were exercised. These fixtures do not establish lawful guardian identity or consent. |
| Explicit approved send | Approved command protected in a separate SQLCipher outbox before network submission; server save and terminal cleanup observed. The probed file was not a plaintext SQLite header and did not contain the fictional message text. This is not a forensic guarantee. |
| Lost response / process death | Local proxy forwarded the send but discarded its successful response. Outcome remained unknown; Home/Journal remained navigable. After force-stop/cold restart, explicit Find → Review original → Retry completed recovery. SQL showed exactly one message and one client UUID. No automatic send or recipient-device/read claim. |
| Journal after outbox use | Enrolled the author's separate journal, unlocked, typed, observed confirmed autosave, explicitly saved, used local communication-only suggestions and observed background lock. Synthetic emulator fingerprint only. |
| Offline local writing | Following a full online account proof and device unlock, injected HTTP503 for local Auth/RPC through an emulator-only proxy. Writing remained editable through an **84-second** outage; explicit save confirmed locally. Restored normal network mapping. Ordinary two-minute inactivity later locked the journal. This did not test an absolute 15-minute native expiry. |
| Selected-page review | Fresh online verification and device authentication revealed the selected saved page, including the offline fixture entry, as in-memory JSON. No file, clipboard or share destination was created. This is not a completed portable backup/export. |
| Whole own-store deletion | Typed DELETE and completed fresh device authentication. App confirmed journal/private-draft/key deletion; journal directory file count was zero. Previously shared messages and approved-send storage remained separate. |
| Hot text scaling | Initial Activity recreation lost unsent words; later Fabric text stayed visually stale. Both failures were investigated. Final host-only workaround grew the measured heading 92→112px at font scale2 while retaining words. Focused typing at1.3 and final **1→2→1** round trip retained words/focus and accepted continued typing. Unique host generations additionally reject old callback ABA in unit tests. |
| Display-density changes | Initial small-phone Help/nav and tablet nav labels clipped. Adding display scale to native text-host keys corrected viewed retests across the three profiles below. Initial PNGs remain available. |

Synthetic device authentication is **not** physical biometry qualification. A temporary emulator-only PIN/fingerprint was set up for these fictional storage tests; after the author's store was explicitly erased, the test credential was cleared successfully. No PIN or account secret is included in this report or its captures.

## Size and keyboard scope

The same emulator was temporarily resized to small phone720×1280/density320, large phone1440×3120/density480 and tablet1600×2560/density240. [Initial metadata](device-sizes/interaction-results.json), [retest metadata](device-sizes/interaction-retest.json) and [visual report](VISUAL_QA_REPORT.md) preserve actual dimensions, screenshots and limits. Original1080×2424/density420/font1.0 was restored. This is Home-focused responsive evidence, not a physical device matrix or every-screen certification.

A small-screen keyboard interaction then exposed a separate real defect: Android chat supplied no KeyboardAvoidingView behavior, so Review remained under the visible IME. A mere enabled UIAutomator node did not prove usability. Commit `0c2d325` moves keyboard avoidance to one shared measured frame for production screens, using padding on both platforms and the actual custom-header offset, following [Expo keyboard guidance](https://docs.expo.dev/guides/keyboard-handling/). The chat also uses a compact recipient heading and more composer space while typing. Earlier automation attempted partially offscreen contact rows; the corrected procedure scrolls them into view before tapping.

**Corrected native keyboard interaction passed:** on720×1280/density320, `mInputShown=true`, the full writing field occupied `[32,386][688,490]` (104px /52dp), Review occupied `[32,552][688,650]`, and an actual tap opened the explicit Send reviewed message controls. No Send action was performed. [Recorded metadata](device-sizes/keyboard-results.json). The original field had been partly clipped and Review had remained at948–1046px beneath the keyboard; this was fixed rather than hidden in a screenshot. Original display/density/font settings were restored afterwards. Full mobile type/lint and260 tests passed after this correction.

## Evidence and remaining qualification

[Actual native images/comparisons](VISUAL_QA_REPORT.md) include light/dark nonprivate surfaces. Android capture protection stays enabled on Journal, active chat and message review. These screens were interacted with but not captured; no mockup or generated substitute was used.

Still unverified: physical Android/TalkBack, physical biometrics and recovery, native absolute offline-lease expiry, comprehensive orientation/IME/composition pressure, real device push, signed embedded Android release, macOS/iOS/VoiceOver and final backup/restore behavior. Automated self-review is not independent security or accessibility certification.
