# Local model evaluation — 2026-11-15

Status: domain adapter contract and tested deterministic fallback implemented. No operational native model is claimed. Native compatibility proof and supported physical-device benchmark are separate gates; no model weights or new native dependency were added by this workstream.

## Verified baseline and runtime comparison

App package: Expo `~58.0.25`, React Native `0.88.1`, React `19.3.0`. These are the inspected package values, not assumptions about compatibility. Expo's [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) and [custom native code guide](https://docs.expo.dev/workflow/customizing/) require a development build for a native library absent from Expo Go.

| Candidate | Primary-source finding | Decision for this prototype |
| --- | --- | --- |
| React Native ExecuTorch | npm latest inspected: `0.11.0`, MIT. Peers include worklets `>=0.10.0 <0.14.0` and blob-util `>=0.24.11`; background-downloader is optional. The published compatibility table documents up to RN 0.86 / Expo 57; it does not prove RN 0.88 / Expo 58 support. Uses exported `.pte` models. | Larger additional dependency surface. Do not silently force a worklets/Reanimated version into this app. Keep as alternative until a version-matched native proof succeeds. |
| llama.rn | npm latest inspected: `0.13.0-rc.11`, MIT; this is a release candidate. Requires New Architecture from 0.10, offers Expo plugin, GGUF loading, constrained JSON generation and Android arm64/x86_64 build targets. Current package peers accept any RN version, which is not a compatibility guarantee. | Preferred *proof-of-concept candidate* because the app needs only short text generation. It is not yet selected as an operational production dependency. Review/install in isolated probe, build SDK 58, then validate one exact model. |
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

At this workstream checkpoint:

- Host memory queried: `34290872320` bytes (about 31.9 GiB).
- No ADB operations were performed by this agent; the master serializes emulator/native work.
- Native runtime installed by this workstream: none.
- Model downloaded/executed by this workstream: none.
- Physical-device cold start, median/p95 generation time, peak memory and output acceptance rate: **not measured**.
- iOS compilation/runtime: **not tested**.

The master must append any isolated development-build proof result here. An emulator can establish whether the native module compiles and loads and can run a local file, but it cannot satisfy the mission's supported physical-device operational/latency evidence requirement. Do not replace missing measurements with estimates or call templates a language model.

## Next safe native test

1. Pin/review one runtime's exact npm tarball, install script, native artifacts, Expo plugin and licenses in an isolated probe. Avoid modifying the functional app until it compiles with SDK 58/RN 0.88.
2. Verify the chosen GGUF hash; initialize locally with small context and no network prompt transport.
3. Generate schema-constrained JSON for the fictional fixture corpus. Pass every result through `validateModelOutput`; measure acceptance and fallback rates as well as latency.
4. Check cancellation, role/entry change, foreground/background, memory pressure, offline airplane mode, native logging and prompt/KV-cache cleanup.
5. On a supported physical device, measure cold load, at least 20 warmed generations (median/p95), process-memory change and peak usage, thermal behavior and low-memory failure. Record device/OS/ABI/model/runtime/hash/build identifier.
6. Only then enable the optional adapter, with truthful availability/download UI. Unsupported, failed or invalid-output cases continue to use the implemented local conversation templates.

No paid service, credentials or cloud inference is needed for this path. Device support, output safety and native validation remain engineering gates rather than provider billing gates.
