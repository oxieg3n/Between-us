# Android local-model proof — 2026-11-15

Result: **native text generation succeeded in an isolated Android emulator probe**. This is runtime compatibility evidence, not a production, physical-device or integrated journal-engine acceptance result.

## Evidence and provenance

- [Original Android screenshot](emulator-result.png), 1080×2424 PNG, captured by the master from the running native probe. The image was inspected without alteration.
- [Raw result JSON](emulator-result.json), containing the probe-reported cold initialization and three local generation samples.
- PNG SHA-256 independently recomputed from repository bytes: `442cd1c3c02f5caf151c3c9198a126cfeac54f981c1a53c9124eb594f4e51442`.
- The owner independently pressed **Run verified local model** and observed the probe results.

The probe is a separate scratch application, not the Between Us production interface. Its source/APK were built outside the repository; no claim is made that this screenshot depicts the complete mobile application's journal UI.

| Item | Observed / recorded value |
| --- | --- |
| Emulator | Pixel_10 AVD, Android 17, x86_64; no physical hardware |
| Resolution | 1080×2424 |
| Framework | Expo 58 / React Native 0.88 |
| Build tools | JBR 25 / Gradle 9.4.1 |
| Runtime | `llama.rn@0.13.0-rc.11` |
| Scratch probe APK size | 82,636,017 bytes |
| Successful build duration | 12m 1s |
| Model file | `smollm2-360m-instruct-q8_0.gguf`, 386,404,992 bytes |
| Publisher repository revision | `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f` |
| Verified model SHA-256 | `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201` |

The master downloaded the public model, checked its complete file hash against the publisher metadata and pushed it to the probe's app-owned external-files location. The model ran locally; no hosted journal inference or financial API was involved. Model weights remain outside Git.

## Measurements

| Measurement | Value |
| --- | --- |
| Probe-reported cold initialization | 5,691 ms |
| Generation 1 | 1,448 ms |
| Generation 2 | 800 ms |
| Generation 3 | 726 ms |
| Three-sample median | 800 ms |
| Observed sample maximum | 1,448 ms |
| Post-release PSS, reported by master's native measurement | 200,357 KiB |
| Post-release RSS, reported by master's native measurement | 307,760 KiB |

Memory was sampled **after the context was released**, not at peak inference. Three emulator samples do not establish p95 latency, thermal behavior, low-memory support or physical-phone performance. The JSON records timings/output; the post-release memory and build details are the master's separate serialized test observations.

Each run returned the same fictional award-related `draft` object. That minimal probe output was not passed through the app's complete suggestion contract or journal safety validator. Do not report these timings as validated journal-engine performance or count the three outputs as accepted application suggestions.

## Defects corrected during the proof

1. The first scratch build encountered Windows MAX_PATH constraints. The master moved the probe build to a shorter scratch root and rebuilt successfully.
2. Initial native launch pointed at Metro 8081 while the probe server used 8083, producing a redbox. Changing the actual bundle location to `127.0.0.1:8083` and restarting resolved it before the successful capture.

## Main-app and release gates

After this proof the main app pins the same runtime and is integrating experimental model setup. At this report update its APK build, actual model-manager download/hash/load path, integrated journal generation, cancellation, native role/recipient safety, offline operation and new light/dark screenshots remain separate work for the master to verify.

No supported physical Android device is attached; iOS native testing is unavailable in this Windows environment. Before claiming operational device support, test a physical arm64 device, at least 20 warmed generations, median/p95 latency, cold load, peak memory, low-memory failure, background cancellation and the full adversarial fictional fixture corpus. Keep a clearly labeled deterministic fallback on unsupported or failed requests.

Retain runtime/native-code MIT and model Apache-2.0 provenance/notices, review release-candidate stability and downloaded binary integrity, and complete the journal privacy/identity/consent review before real children's data. No cloud fallback, credentials, production deployment or actual money movement is authorized by this proof.

See [local model evaluation](../../../LOCAL_AI_MODEL_EVALUATION.md) for runtime alternatives, publisher references and the wider implementation boundary.
