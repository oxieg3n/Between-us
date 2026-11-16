# Dependency review — 2026-11-15

Scope: `apps/mobile`, after the optional native-model dependencies were installed by the master. This review read package metadata, installed callers, upstream documentation and npm audit output. It did not change dependencies, lockfiles, app source, Git state or Android processes.

The initial audit and license table below are historical observations. The master subsequently applied the scoped minimatch remediation and, in r3, removed the unused Noble hashing dependency in favor of Expo FileSystem's existing native digest API. Later outcomes are appended at the end; the original eight findings are not the current remediated audit result.

## Observed audit

`npm audit --json` reported **8 moderate, 0 high and 0 critical** findings. These are eight affected package entries tracing to one advisory, not eight independently identified vulnerabilities:

| Entry | Installed version | Path to finding |
| --- | --- | --- |
| `minimatch` | `10.2.6` | Direct advisory |
| `@expo/fingerprint` | `0.21.10` | Depends on minimatch `^10.2.6` |
| `expo` | `58.0.25` | Depends on fingerprint |
| `@typescript-eslint/typescript-estree` | `8.72.2` | Depends on minimatch `^10.2.2` |
| `@typescript-eslint/parser` | `8.72.2` | Depends on typescript-estree |
| `@typescript-eslint/utils` | `8.72.2` | Depends on typescript-estree |
| `@typescript-eslint/type-utils` | `8.72.2` | Depends on estree/utils |
| `@typescript-eslint/eslint-plugin` | `8.72.2` | Depends on type-utils/utils |

The reviewed advisory is [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249): attacker-controlled glob preprocessing can amplify work at optimization level 2 or higher. Its affected range is `>=7.0.0 <11.0.1`; the installed 10.2.6 is included. This is a denial-of-service finding, with no confidentiality or integrity impact identified by that advisory.

The inspected fingerprint source constructs matchers with `{ dot: true }`, leaving optimization at its default of 1; `build/Options.js` explicitly documents why this advisory's level-2 path is not exposed by fingerprint configuration. The inspected typescript-estree caller uses `minimatch(filePath, pattern, { dot: true })`. Both process project/tooling paths and configuration; this app does not pass journal or financial text to them. This narrows the observed exposure without changing npm's affected-version result or proving the entire dependency graph safe.

`npm ls minimatch @noble/hashes llama.rn expo-file-system --all --json` completed without an invalid dependency tree. Other ESLint/import/react consumers retain minimatch 3.1.5, outside this advisory's affected range. This observation does not mean older major versions are universally free of security issues.

## Minimal remediation candidate

Current registry metadata still lists fingerprint 0.21.10 and typescript-estree 8.72.2 as latest, with the same 10.x ranges. No compatible 10.x patch for this advisory was found. npm's proposed forced Expo 52 downgrade would replace the approved SDK 58 architecture and is unsuitable.

The master can evaluate this **narrow override**, preserving Expo and ESLint versions and leaving minimatch 3.x consumers alone:

```json
{
  "overrides": {
    "@expo/fingerprint": {
      "minimatch": "11.0.8"
    },
    "@typescript-eslint/typescript-estree": {
      "minimatch": "11.0.8"
    }
  }
}
```

11.0.8 is the current npm release checked here, with [the official tagged package metadata](https://raw.githubusercontent.com/isaacs/minimatch/v11.0.8/package.json) and [upstream tag](https://github.com/isaacs/minimatch/releases/tag/v11.0.8) agreeing. It supports Node `20 || >=22`; the actual environment uses Node 26.13.0. It preserves CommonJS and ESM entry points. The named `minimatch` function and `Minimatch` class properties/methods used by the two inspected callers (`pattern`, `negate`, `match`) remain in the [11.0.8 source](https://raw.githubusercontent.com/isaacs/minimatch/v11.0.8/src/index.ts).

This crosses a major version. The [upstream README](https://raw.githubusercontent.com/isaacs/minimatch/v11.0.8/README.md) describes a different, nonrecursive matching implementation; its package adds `@isaacs/nonrecursive-glob-match` and brace-expansion 5.x. Source-level API compatibility is not proof of all pattern semantics. Pinning only 11.0.1 would omit later 11.x fixes; upstream's [11.0.7 release notes](https://github.com/isaacs/minimatch/releases/tag/v11.0.7) describe another performance regression fix.

After a master-controlled package/lock update, verify:

1. `npm ls` shows 11.0.8 only under the two targeted consumers and no invalid edges; rerun `npm audit --json` to record the actual remaining findings.
2. Run typecheck, lint, unit tests and Expo Doctor. Lint exercises the existing TypeScript ESLint integration.
3. Exercise fingerprint path-ignore matching: ordinary directories, dotfiles, globstar, negated exceptions, braces and Windows path normalization. Compare expected inclusion/exclusion rather than only checking that the package imports.
4. Run web and Android exports, and the normal native app verification. A dependency audit alone does not validate the build.

The override was **recommended, not applied or tested by this reviewer**. If compatibility fails, retain the working SDK 58 tree, record the precise tooling exposure and track an upstream-supported update; do not force a downgrade or conceal the advisory count. Remove temporary overrides once supported upstream ranges adopt the patched major.

## Added dependency licenses and native supply chain

| Dependency at initial review | Pin inspected | License checked locally | Review note |
| --- | --- | --- | --- |
| `llama.rn` | `0.13.0-rc.11` | MIT | Release candidate; native code and downloaded artifacts require additional review |
| `@noble/hashes` | `2.4.0` | MIT | Historical incremental SHA-256 dependency; **removed in r3**. Its inspected Node engine was `>=20.19.0`; no install hook. |
| `expo-file-system` | `58.0.13` | MIT | SDK 58-compatible API; already present transitively, now an explicit app dependency |
| Optional SmolLM2-360M-Instruct GGUF | Pinned publisher revision/hash | Apache-2.0 in publisher repository | Weights are not committed; retain required notices when distributing a release |

The package `LICENSE` files agree with these npm metadata licenses. Sources: [llama.rn](https://github.com/mybigday/llama.rn), [Noble hashes](https://github.com/paulmillr/noble-hashes), [Expo SDK 58 FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/), and [publisher GGUF repository](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF). This is not a complete license audit of all transitive native libraries; review bundled notices before release.

The inspected llama.rn package has a `postinstall` script that downloads native artifacts from its versioned GitHub release. Its installed manifest includes SHA-256 values for Android JNI libraries and the iOS framework; the downloader hashes downloaded archives before installation. This adds build-time network/supply-chain dependencies, even though model inference itself runs locally. npm lockfile integrity and artifact hashes do not replace source, binary or release-signing review.

Release-candidate risks remain: evolving native/JSI APIs, ABI and toolchain compatibility, native memory-safety exposure when parsing model files, cancellation/cache-cleanup behavior and physical-device thermal/memory performance. The master's isolated emulator proof can support the exact tested build; it cannot certify iOS or a physical Android device. Keep the exact pin and repeat native verification before changing it.

## Application data boundary

The reviewed application adapter uses a local model URI. Its only model-setup network request is an explicit download from a fixed, publisher-revision-pinned Hugging Face weight URL, followed by exact size and SHA-256 verification. Journal prompts, outputs and finance records are not included in that URL or request. The adapter disables native logging, calls no session save API, clears context data between requests and serializes cancellation before release. These are inspected application controls, not an independent audit of every native binary.

Only optional model assets and the approved appearance preference persist. Private journals, drafts, financial events, prompts and generated messages remain in memory. No cloud inference, payment provider credentials, real money transfer, paid API or production backend was added by this review.

## Checks actually performed

- npm audit JSON and targeted dependency tree listing.
- Current registry versions, version constraints, engine requirements, exports, licenses and package integrity metadata.
- Installed fingerprint/estree minimatch call sites and installed native-artifact downloader/manifest.
- Official advisory, minimatch tagged source/release/package documentation and added dependency sources.

No package install, override trial, native build, Android session, physical-device benchmark or expensive regression suite was run by this reviewer. The master records any subsequent remediation and test result in the final build report.

## Master remediation

The master applied the two exact scoped overrides to minimatch `11.0.8`, retaining the supported Expo SDK rather than applying npm's forced downgrade. `npm audit` now reports zero vulnerabilities. Two compatibility tests exercise the named APIs, ignored dependency/cache paths, negation and TypeScript source patterns from each actual caller's resolved dependency. Both pass. TypeScript, lint, Expo Doctor 20/20 and Expo install compatibility checks pass at this checkpoint; final full regression/export/native outcomes are recorded in `BUILD_REPORT.md`.

Keep this override pinned and reviewed until upstream callers adopt a patched compatible range. The current Node 26 host satisfies the new dependency's engine requirement. No global package or Codex configuration changed. Native builds compile the reviewed pinned runtime source; `RNLLAMA_SKIP_POSTINSTALL=1` avoids unused prebuilt-artifact downloads. The optional model remains a separately verified, explicit asset download.

## r3 integrity-path correction and dependency removal

Real r2 main-app testing completed the optional model download, SHA-256 verification and native load, but exposed an approximately nine-minute verification delay on the emulator. The original bounded JavaScript/Noble implementation occupied the JS thread during hashing. The actual [r2 model-ready screenshot](../qa/journal-intelligence/1115-model-ready-r2c-20261115/light/model-ready.png) is retained as provenance, not a claim that the delay was acceptable or that integrated journal generation passed.

The master changed r3 to `await file.digest("SHA-256")` using the already-installed `expo-file-system@58.0.13`, and removed the now-unused direct `@noble/hashes` dependency. The [SDK 58 FileSystem digest API](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/#digestalgorithm) returns an asynchronous lowercase hexadecimal digest. Inspected Android/iOS implementations stream 64 KiB chunks through standard MessageDigest/CryptoKit hashing off the JavaScript thread and close resources on completion or error. No custom local module, external crypto dependency, paid service or model-content network processing was added.

Exact asset size, pinned digest and operation-version checks remain before loading; cancellation invalidates the result after the native hash returns. Only the fixed optional model asset is processed. Journal prompts and financial records remain outside this file-hashing path.

At this documentation checkpoint, r3 native hash timing/load verification and integrated generation are pending. No measured speedup, physical Android validation or iOS runtime pass is claimed. The final r2 audit had zero findings; r3 post-removal audit/regression results belong in the master's final QA/build report. The earlier Noble license/package metadata remains above solely to document the removed implementation.
