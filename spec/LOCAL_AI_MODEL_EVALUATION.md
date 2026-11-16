# Local model evaluation — 2026-11-15

Status: the master completed a genuine **Android emulator native-inference proof**, an r4 diagnostic flow and the final frozen r5 **both-theme accepted native starter → explicit recipient → review** capture. The app pins `llama.rn@0.13.0-rc.11`. Physical Android and iOS operation remain unvalidated. The local deterministic fallback remains available. No model weights belong in Git. Earlier pending-status notes below retain their original checkpoint meaning; later evidence is appended chronologically.

## Verified baseline and runtime comparison

App package: Expo `~58.0.25`, React Native `0.88.1`, React `19.3.0`. These are the inspected package values, not assumptions about compatibility. Expo's [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) and [custom native code guide](https://docs.expo.dev/workflow/customizing/) require a development build for a native library absent from Expo Go.

| Candidate | Primary-source finding | Decision for this prototype |
| --- | --- | --- |
| React Native ExecuTorch | npm latest inspected: `0.11.0`, MIT. Peers include worklets `>=0.10.0 <0.14.0` and blob-util `>=0.24.11`; background-downloader is optional. The published compatibility table documents up to RN 0.86 / Expo 57; it does not prove RN 0.88 / Expo 58 support. Uses exported `.pte` models. | Larger additional dependency surface. Do not silently force a worklets/Reanimated version into this app. Keep as alternative until a version-matched native proof succeeds. |
| llama.rn | npm latest inspected: `0.13.0-rc.11`, MIT; this is a release candidate. Requires New Architecture from 0.10, offers Expo plugin, GGUF loading, constrained JSON generation and Android arm64/x86_64 build targets. Current package peers accept any RN version, which is not a compatibility guarantee. | Selected for the experimental adapter after an isolated SDK 58/RN 0.88 Android x86_64 probe compiled, loaded and generated text. Main-app native validation and physical arm64 testing remain required; it is not a production-support claim. |
| Android ML Kit / Gemini Nano | Official direct model access is beta, through AICore on a supported device. Hardware model, RAM/OS/AICore version and foreground/quota state affect availability. A Pixel_10 AVD name does not make an emulator a physical Pixel 10 with Gemini Nano. | No eligible physical Android device is attached in the master's initial audit. No custom native bridge or automatic cloud fallback. Retest hardware availability before choosing it. |
| Apple Foundation Models | Native Apple framework, available from iOS 26 on eligible Apple Intelligence devices. Runtime availability must be checked. Current documentation also describes cloud model options; this project permits only explicit on-device operation. | Windows/Android environment cannot validate an iOS runtime. No iOS model claim or cloud route. |

Sources: [ExecuTorch compatibility](https://raw.githubusercontent.com/software-mansion/react-native-executorch/main/docs/docs/05-other/01-compatibility.mdx), [ExecuTorch package metadata](https://raw.githubusercontent.com/software-mansion/react-native-executorch/main/packages/react-native-executorch/package.json), [llama.rn README](https://github.com/mybigday/llama.rn), [Android build targets](https://raw.githubusercontent.com/mybigday/llama.rn/main/android/build.gradle), [ML Kit GenAI device support](https://developers.google.com/ml-kit/genai), [direct model access](https://developers.google.com/ml-kit/genai/prompt/android), [Apple Foundation Models](https://developer.apple.com/documentation/foundationmodels), [Apple availability API](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel/availability-swift.property).

## Small proof-of-concept model candidate

The publisher's [SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct) and [GGUF repository](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF) list Apache-2.0. The model is primarily English and may produce inaccurate or biased text; its small size is not evidence of child-safe output.

| Item | Pinned candidate |
| --- | --- |
| Repository | `HuggingFaceTB/SmolLM2-360M-Instruct-GGUF` |
| Repository revision | `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f` |
| File | `smollm2-360m-instruct-q8_0.gguf` |
| Quantization | Q8_0, 360M parameters |
| File bytes | `386404992` (about 369 MiB) |
| SHA-256 from publisher LFS metadata | `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201` |

Use a pinned-revision HTTPS download, verify its complete SHA-256 before loading, keep weights outside Git, and show download/storage requirements before an optional download. File size is not peak RAM: reserve additional runtime/KV-cache memory and temporary download space. A 1–2 GiB free-memory/1 GiB free-storage test budget is a provisional engineering target, not a measured requirement or support promise. Keep context small, use CPU first, and benchmark rather than assuming a GPU/NPU exists.

## Proof and benchmark record

The initial domain-only checkpoint did not install a runtime or download weights. The master subsequently performed the following serialized native proof on 2026-11-15. Evidence: [probe report](qa/journal-intelligence/native-probe-20261115/REPORT.md), [raw result JSON](qa/journal-intelligence/native-probe-20261115/emulator-result.json), [actual Android screenshot](qa/journal-intelligence/native-probe-20261115/emulator-result.png).

| Measurement / environment | Actual result |
| --- | --- |
| Host RAM queried | `34290872320` bytes, about 31.9 GiB |
| Probe framework/toolchain | Expo 58, React Native 0.88, Android Studio JBR 25, Gradle 9.4.1 |
| Runtime | `llama.rn@0.13.0-rc.11` |
| Native target | Pixel_10 AVD, Android 17, x86_64, 1080×2424; **not physical hardware** |
| Probe APK | `82636017` bytes, built in an external scratch project |
| Successful probe build | 12 minutes 1 second after moving the scratch build to a short path to resolve a Windows MAX_PATH failure |
| Model | Pinned 386,404,992-byte GGUF above; downloaded and independently checked against the publisher SHA-256, then pushed into the probe's app-owned external-files location |
| Probe-reported cold initialization | 5,691 ms |
| Three generation samples | 1,448 / 800 / 726 ms |
| Three-sample median / observed maximum | 800 / 1,448 ms; **not a physical-device p95** |
| Post-run memory reported by master | PSS 200,357 KiB; RSS 307,760 KiB, measured **after context release**, not peak inference memory |
| Physical-device cold load, median/p95, peak memory | **Not measured; no physical test device attached** |
| iOS build/runtime | **Not tested in this Windows/Android environment** |

The screenshot and JSON both show the same three completed local outputs. The owner also independently pressed the probe's run button and observed results. Initial probe launch used the wrong Metro location (8081 instead of 8083); selecting `127.0.0.1:8083` through Change Bundle Location and restarting corrected the redbox before successful measurement.

The probe generated a minimal `draft` object for a fictional award example. It did **not** exercise the app's complete `suggestions` envelope, safety validator, recipient workflow, opt-in/download manager, cancellation or final Send review. Raw probe latency is therefore not integrated journal-engine performance, and its output is not an accepted journal suggestion. Main-app APK build, native model download/inference validation, both-theme screenshots and full regression testing are separate integration work still pending at this report update.

This emulator result establishes a working native compatibility proof for the tested build target. It does not satisfy the mission's supported physical-device operational/latency evidence requirement. Keep all unmeasured fields explicit rather than substituting estimates.

## Next safe native test

1. Preserve the pinned runtime/model provenance and required MIT/Apache-2.0 notices. The isolated x86_64 proof has passed; verify the complete main app and its native artifacts independently.
2. Exercise the experimental model manager's explicit optional download, complete SHA-256 verification, storage/error handling and local load. Keep the model outside Git and never attach journal text to a download request.
3. Generate schema-constrained JSON for the fictional fixture corpus inside the actual journal flow. Pass every result through `validateModelOutput`; measure acceptance/fallback rates and end-to-end latency, rather than reusing the probe numbers.
4. Check cancellation, role/entry change, foreground/background, memory pressure, offline airplane mode, native logging and prompt/KV-cache cleanup.
5. On a supported physical device, measure cold load, at least 20 warmed generations (median/p95), process-memory change and peak usage, thermal behavior and low-memory failure. Record device/OS/ABI/model/runtime/hash/build identifier.
6. Only then enable the optional adapter, with truthful availability/download UI. Unsupported, failed or invalid-output cases continue to use the implemented local conversation templates.

No paid service, credentials or cloud inference is needed for this path. Device support, output safety and native validation remain engineering gates rather than provider billing gates.

## Main-app r2 setup and r3 native integrity correction

This section adds later evidence without changing the isolated-probe measurements above.

The real r2 Between Us Android app completed its explicit download, full asset verification and native load. The [actual model-ready screen](qa/journal-intelligence/1115-model-ready-r2c-20261115/light/model-ready.png) displays “Experimental on-device model loaded.” The reviewer inspected that existing PNG; the master captured it through the real emulator. The master also independently checked the downloaded file's SHA-256 through ADB against `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`.

That successful setup exposed a performance defect: the r2 JavaScript incremental SHA-256 loop took approximately nine minutes for the 386,404,992-byte asset on the emulator. The master's read-only progress observation showed 191,889,408 bytes read at 19:23:49 after download completion around 19:19, with the JavaScript thread heavily occupied. This was progressing verification, not a stalled download. The slow setup/reload path was unsuitable even though it eventually produced the correct hash and loaded the model.

Build `1115-FamilyEnvelopes-Journal-r3` replaces that loop with the existing SDK 58 API:

```ts
const digest = await file.digest("SHA-256");
```

The [official SDK 58 FileSystem reference](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/#digestalgorithm) specifies a Promise resolving to a lowercase hexadecimal digest. Installed `expo-file-system@58.0.13` source confirms bounded native streaming: Android dispatches to `Dispatchers.IO` and uses `java.security.MessageDigest` with a 64 KiB buffer; iOS uses CryptoKit `SHA256` with 64 KiB FileHandle reads on the asynchronous native queue. Android closes its input stream through `use`; Swift closes its handle and scoped access through `defer`. These are source inspections, not an iOS execution result.

The manager still uses only its fixed private model-asset paths. It checks exact size and the operation version before hashing, checks the version again after the native call, and compares the resulting size/hash with the pinned metadata before loading. The digest API has no AbortSignal; a cancelled setup must discard the completed hash instead of loading. No journal text, model prompt, network request, custom crypto implementation or new local Expo module is involved. The now-unused Noble hashing dependency was removed.

| Later checkpoint | Evidence/status |
| --- | --- |
| r2 real main-app download, verification and native load | Completed; model-ready PNG linked above |
| r2 JavaScript hashing latency | Approximately nine minutes in master's emulator observations; defect identified |
| r3 native hash implementation | Integrated through existing Expo FileSystem; no new native module/dependency |
| r3 hash timing and main-app load | Pending actual native verification; no speedup number claimed yet |
| Integrated journal generation, validator acceptance and reviewed sharing | Pending; a model-ready screen alone does not establish them |
| Physical Android benchmarks and iOS runtime | Not performed; previous release gates remain open |

The master will append measured r3 results after the real run. Neither the isolated probe nor r2 model readiness should be relabeled as accepted integrated journal output.

## r4 retained asset, reload and accepted journal review proof

The subsequent r4 setup corrected download cleanup so the finalized model remains available after setup. The master verified **386,404,992 bytes retained** at 2026-11-16 00:41:56 UTC (2026-11-15 19:41:56 America/New_York), after the real explicit download and cleanup. The [r4 model-ready screenshot](qa/journal-intelligence/1115-model-setup-r4-20261115/light/model-ready.png) records the actual loaded state.

The master then force-stopped/restarted the actual app and selected **Load downloaded model**, without requesting another download. [The reload screenshot](qa/journal-intelligence/1115-r4-journal-native/light/optional-model-loaded.png) again shows the experimental model loaded. The [capture actions](qa/chores-goals/1115-r4-journal-native/capture-actions.json) record the tap at 00:44:53.853511 UTC and loaded-screen capture at 00:45:06.395839 UTC: approximately **12.5 seconds end to end**. This includes UI automation/polling, native hashing, model loading and screenshot work. It is not an isolated hash, inference, cold-start or physical-device benchmark; do not compare it numerically with the probe's 5,691 ms initialization measurement as if they measured the same operation.

The following three original Android screenshots were inspected individually by the reviewer:

| Evidence | What is visible |
| --- | --- |
| [Accepted journal starter](qa/journal-intelligence/1115-native-model-review-proof/light/journal-suggestion-complete.png) | The app labels the result **On-device model · review these words**. The fictional award starter asks to talk about something to celebrate and requests listening first; no diagnosis, treatment, problem-solving instruction or invented specific event appears in the displayed wording. |
| [Recipient choice](qa/journal-intelligence/1115-native-model-review-proof/light/recipient-choice.png) | Separate editable words appear in the composer; Alex still has a **Choose** control. A recipient has not been silently selected. |
| [Review](qa/journal-intelligence/1115-native-model-review-proof/light/review.png) | After the deliberate Alex selection, review shows **To Alex**, the exact separate starter and **Just listen**. The screen explains that no journal entries or other drafts are attached. **Simulate send** remains an available action, not a completed send. |

The [proof manifest](qa/journal-intelligence/1115-native-model-review-proof/capture-manifest.json) records actual ADB screencap/pull PNGs at 1080×2424 on emulator-5554 / Android 17, build `1115-FamilyEnvelopes-Journal-r4`, source HEAD `193b1bb04f5db2a0b06756aad218c514136e4450`, and **tracked source dirty**. Its actions show Prepare separate words → Alex → Review my words, ending with the review capture. No Send action was activated in this proof. PNG hashes were checked against the recorded manifest during documentation review.

This was a diagnostic typing-recovery run with experimental Journal `autoCorrect={false}` and `spellCheck={false}` props, not a frozen-source final r4 or r5 acceptance run. The master is integrating r5's `autoCorrect={false}` writing/form behavior while removing the extra spell-check flags. Final r5 native captures and broader interactions remain pending. Preserve these r4 images and manifest as diagnostic provenance rather than silently retagging them.

The main-app evidence now demonstrates one accepted native-model starter reaching intentional recipient selection and explicit review on the emulator. It does not establish a complete corpus acceptance rate, keyboard/IME correctness on the final build, both-theme coverage, actual Send behavior, offline/cancellation/background performance or physical-device readiness. Physical Android benchmarks and all iOS runtime/accessibility validation remain unperformed.

## Final frozen r5 both-theme integrated evidence

This checkpoint supersedes the earlier pending-r5 statements without changing their diagnostic provenance. The final [r5 journal visual QA report](qa/journal-intelligence/1115-r5-journal-native-v2/VISUAL_QA_REPORT.md) records **12 actual native Android PNGs**, six Safe Harbor and six Night Harbor, from frozen clean source `afca46fa881b6c17b40c2c32bee9d97cd45c3554`, build `1115-FamilyEnvelopes-Journal-r5`. The [manifest](qa/journal-intelligence/1115-r5-journal-native-v2/capture-manifest.json) reports `completed: true`, `error: null`, `tracked_source_dirty: false`; the reviewer independently matched every original PNG's SHA-256 and 1080×2424 dimensions.

The actual Pixel_10 / Android 17 x86_64 flow loaded the retained, verified local model and captured the overview, exact fictional journal editor text, accepted on-device wording, unselected recipient choice and explicit review in each theme. These are native ADB screenshots, not browser renderings or generated mockups. The prior dirty r4 screenshots remain separate diagnostic evidence.

| Observed step | Safe Harbor | Night Harbor |
| --- | --- | --- |
| Optional native model loaded | [Loaded](qa/journal-intelligence/1115-r5-journal-native-v2/light/optional-model-loaded.png) | [Loaded](qa/journal-intelligence/1115-r5-journal-native-v2/dark/optional-model-loaded.png) |
| Exact fictional writing | [Editor](qa/journal-intelligence/1115-r5-journal-native-v2/light/journal-editor.png) | [Editor](qa/journal-intelligence/1115-r5-journal-native-v2/dark/journal-editor.png) |
| Accepted native suggestion | [On-device source](qa/journal-intelligence/1115-r5-journal-native-v2/light/journal-inline-suggestions.png) | [On-device source](qa/journal-intelligence/1115-r5-journal-native-v2/dark/journal-inline-suggestions.png) |
| Recipient intentionally unselected | [Choose](qa/journal-intelligence/1115-r5-journal-native-v2/light/journal-recipient-choice.png) | [Choose](qa/journal-intelligence/1115-r5-journal-native-v2/dark/journal-recipient-choice.png) |
| Separate message review | [Review](qa/journal-intelligence/1115-r5-journal-native-v2/light/journal-message-review.png) | [Review](qa/journal-intelligence/1115-r5-journal-native-v2/dark/journal-message-review.png) |

Both accepted results are explicitly labeled **On-device model · review these words**. The full starter remains identical from suggestions through separate composition to Review: “Can we talk about something I want to celebrate? I'd like you to listen first.” The author deliberately selects Alex; Review shows **To Alex**, the exact starter, **Just listen**, the explanation that journal entries/drafts are not attached and an explicit **Simulate send** control. The capture stops before Send. The displayed wording does not copy the private paragraph or give diagnosis, treatment or instructions for solving the underlying issue.

This closes the pending frozen r5 both-theme integrated capture requirement for the tested fictional example. It does **not** convert the three isolated-probe timings into integrated benchmarks, establish corpus acceptance/clinical safety, verify physical arm64/iOS support or certify native cache zeroization. The later [r7 native usability run](qa/chores-goals/1115-r7-native-usability/QA_REPORT.md) separately records actual keyboard, save/revisit and reviewed simulated-message interactions; it is not a new model-performance benchmark. Physical-device cold/warm median/p95/peak-memory/thermal tests, offline/cancellation/background stress and qualified child-safety review remain open release gates.

## R12 integrated journal confirmation - 2026-11-16

Build `1115-FamilyEnvelopes-Journal-r12`, runtime source `8607573e37dadd66ede3bb368389e0a2531ef6d8`, clean installed Android x86_64 debug APK SHA-256 `34716578ABD1C9DCB9C255C9993E66F3B00BB532B29AC7DE953095302C8FB6E9`.

The current main app loaded the retained pinned asset without another download, typed/saved the fictional award entry through native EditText, and displayed accepted **On-device model** wording in both Safe Harbor and Night Harbor. The author deliberately tapped Prepare separate words, selected Alex and reviewed the separately composed celebration starter. No Simulate send action occurred. Full journal text was not copied into that message.

[Actual evidence and independent review](qa/journal-intelligence/1116-r12-journal-native/VISUAL_QA_REPORT.md): twelve originals, six/theme, all SHA-256/IHDR/links verified; both completed manifests have no error and clean runtime-source provenance. Action logs independently confirm two existing-model loads, both accepted native-source markers, explicit Alex selection and no Send.

This is a repeated functional example on a Pixel_10 Android 17 x86_64 emulator at 1080 x 2424/density 420/font scale 1, using the task-local SwiftShader launch. It is not a physical-device performance, safety-corpus, peak-memory, thermal, p95 or iOS qualification. The unsupported/invalid-output local-template fallback remains tested by unit/browser checks and visibly used in the separate core screenshots. No cloud inference, saved prompt/session, real child data or payment occurs.

The owner's Run verified local model screen is the separate fixed-fictional-prompt runtime diagnostic: its JSON and three timing samples confirm that probe execution, not the final journal UX or physical-device latency. The integrated flow above uses the main Between Us app.
