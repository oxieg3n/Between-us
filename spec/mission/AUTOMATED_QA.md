# Automated mission QA

Run: 2026-11-15, after the master reported the native build gate cleared.

- Canonical command directory: `D:\projects\BetweenUs\apps\mobile`.
- Branch: `feature/mobile-foundation`.
- Source commit observed at start: `c681aafa3911084cfbd5fe0da7c8ce2db4d220db`.
- Build: `1115-FamilyEnvelopes-Journal-r1`, app 0.3.0.
- These checks run against the current working tree; documentation and the package lock were uncommitted at the initial status inspection.
- This agent owns only this report during the QA run. It does not change source, dependencies, Git state, Android or ADB.

## Serial checks

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Exit 0, no errors, two warnings in `src/finance-state.tsx` |
| `npm test` | Passed, 66 tests, 0 failures/skips |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Passed, 16 tests using one worker, 1.9 minutes |
| `npx expo-doctor` | Passed online, 20/20 checks, exit 0 |
| `npx expo install --check` | Passed, dependencies up to date, exit 0 |
| `npm audit` | Passed, 0 vulnerabilities, exit 0 |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web` | Passed, five web bundles and three static routes, exit 0 |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android` | Passed, 1,301 modules, one 3 MB Hermes bundle and 27 assets, exit 0 |

Browser checks use port 8081 with one Playwright worker. Native Metro on 8082 is outside this run. Browser tests, diagnostics and exports are serialized; no simultaneous native build or emulator test is authorized for this check window.

Lint warnings: line 29 has an unused `eslint-disable` for `react-hooks/exhaustive-deps`; line 32 reports `calendarDay` as an unnecessary `useMemo` dependency. Source remains frozen; these are reported to the master rather than silently changed. The 66 unit tests include 37 finance cases, journal output/safety/cancellation, native adapter lifecycle/error handling, contact permissions and two scoped minimatch caller-compatibility checks.

The 16 browser scenarios passed without retries or skips: appearance-only persistence, accessible light/dark screens, selected weekly weekdays and first-date fallback, prospective matching eligibility, partial funding/reveal, invalid funding/date/cancel handling, parent review/retry, shared matching cap, payout holds/partial settlement/acknowledgment/cancellation, percentage allocations and future rules, guarded parent routes, author isolation, unsent-writing warnings, Circle/check-in management, phone/tablet keyboard access, journal recipient/edit/review, unsafe-parent exclusion and stale-generation cancellation. Browser accessibility assertions are supporting evidence, not native TalkBack or VoiceOver verification.

All required commands above completed serially by 2026-11-15 18:46:30 -05:00. HEAD was still `c681aafa3911084cfbd5fe0da7c8ce2db4d220db` at the final inspection; port 8081 had no listener after Playwright shut down its server. No failed command, test retry or source/package correction occurred during this QA run. Export outputs were generated in ignored `apps/mobile/dist`; these are bundle/static-export checks, not a store release or deployment. `npm audit` reports the advisory database result at this checkpoint, not a guarantee of security or native-library compatibility.

Remaining automated-check observations: the two lint warnings listed above. Native runtime, model-generation quality/performance, actual device accessibility and release security gates remain separately tracked. No iOS runtime test was performed here.

## Native evidence boundary

The master reported a successful native debug APK build, installation and actual onboarding on Pixel_10 / Android 17 before this run. This agent did not perform or independently verify those native actions. Native interaction tests, screenshots, device sizes, keyboard checks and local-model measurements belong in the master's separate native QA report.

## Final r2 regression run

This section preserves the earlier r1 results above as historical evidence. The master froze application source for this separate final run on 2026-11-15.

- Build: `1115-FamilyEnvelopes-Journal-r2`.
- Full HEAD at start: `e5433521bd46c051a584702e24855a92702e1586`.
- Source and tests include uncommitted r2 changes and the new local-model browser scenario; HEAD alone does not identify that complete working tree.
- Working-source aggregate SHA-256 at start: `6f9125c8131fa0cea54123306693fbf24bd714424615eecbbbc96721ea162f86` (73 files).
- Aggregate method: recursively include all files under `apps/mobile/src`, `tests`, `e2e`, `assets`, plus existing `package.json`, `package-lock.json`, `app.json`, `playwright.config.ts`, `tsconfig.json`, `eslint.config.js`, `metro.config.js`, `babel.config.js`; sort relative POSIX paths, form `path:SHA256(file bytes)` lines with LF and final LF, then SHA-256 those UTF-8 bytes.
- Command directory remains `D:\projects\BetweenUs\apps\mobile`. Only this report is writable by this QA agent; no ADB, emulator, native build, package edits or Git mutation are performed.

| Command | Actual final r2 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings or errors |
| `npm test` | Passed, exit 0, 66 tests, 0 failures/skips |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Passed, exit 0, 17 scenarios using one worker, 1.8 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |

The two lint warnings recorded in the historical r1 section are absent in this r2 run. Expo/Node startup emitted environment-only `NO_COLOR`/`FORCE_COLOR` warnings and messages that no native app was connected to the browser server; these are not ESLint findings or a claim about native-runtime testing. All 17 browser scenarios passed, including the new unsupported-build local-model explanation and working private-writing fallback. Browser tests do not prove on-device model inference or replace native accessibility testing.

The final r2 check window completed at 2026-11-15 19:16:54 -05:00. The 73-file working-source aggregate and full HEAD still matched their starting values exactly. No source, dependency or test fix was applied during this run; each required passing command ran once. Playwright shut down its 8081 browser server, leaving zero listeners. The frozen-source/resource gate is released to the master for the remaining native checks and integration. No native or iOS runtime result is claimed by this automated QA run.

## Final r3 regression run

Separate source-frozen run requested after the master replaced the slow JavaScript model-file hash path with the installed SDK 58 file digest API and removed the unused Noble dependency. Earlier r1/r2 evidence remains above.

- Start: 2026-11-15 19:29:31 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r3`, app 0.3.0.
- Full HEAD: `5bbd9e912eff49e15e8b13af9428bb6bccdc7020`.
- Working-source aggregate: `2e9b9e28dddc43f61e988a9e2a27b5dade73ca6a653a864954a554c7fd1e98e1`, 73 files, using the r2 aggregate method above. The run includes uncommitted r3 working changes.
- Commands use the canonical mobile directory. This agent edits only this report; no ADB, emulator, native build, source/package edits or Git mutation.
- The master explicitly permits browser QA on port 8081 while its separate incremental native APK build runs. This agent serializes its checks and uses one Playwright worker, with no native UI interaction.

| Command | Actual r3 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, 66 tests, 0 failures/skips |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Passed, exit 0, 17 scenarios, one worker, 1.8 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |

Completed at 2026-11-15 19:32:39 -05:00. HEAD and the 73-file aggregate still matched the starting values exactly; all seven required commands passed on their first run. ESLint produced no findings; browser startup still emitted the environment-only `NO_COLOR`/`FORCE_COLOR` notices. Port 8081 had zero listeners after Playwright exited. The r3 frozen-source gate is released. No r3 exports, native model-inference, native accessibility or iOS runtime result is claimed in this run; those remain the master's separate verification responsibilities.

## Final r4 regression run

The master requested a new frozen-source run after native QA found that `File.move` mutates the source file's URI, allowing cleanup to delete the finalized model file. The fix captures the original temporary URI and cleans up only that path. A meaningful regression covers successful download, download failure and failure after the move. Earlier results remain historical, not evidence that this subsequently discovered native defect was absent.

- Start: 2026-11-15 19:36:40 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r4`, app 0.3.0.
- Full HEAD at start: `f65a319731da6dd860b9a49b282be66a69afd98f`.
- Working-source aggregate: `82e6bfcba6004ea2ef18e1dffe8ff526e9de323857d95ec90afb4cf2071b76a1`, 73 files using the previously documented method, including uncommitted r4 changes.
- The master permits its separate incremental APK build during serial browser QA; this agent uses only browser port 8081 and edits only this report. No native, package, source or Git operations are performed by this agent.

| Command | Actual r4 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, 67 tests, 0 failures/skips; includes finalized-file cleanup regression |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Passed, exit 0, 17 scenarios, one worker, 1.8 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |

Completed at 2026-11-15 19:40:15 -05:00. Full HEAD and the 73-file aggregate matched their starting values exactly. All seven required commands passed once, with no source/package correction, retry or skip. ESLint had no findings; browser startup emitted only the already documented environment color notices and native-app connection notices for its web server. Port 8081 had zero listeners after Playwright shut down. The r4 source gate is released. The new cleanup regression passes in the unit environment; actual finalized-file retention and model generation on Android require the master's separate native verification. No r4 export or iOS runtime check was performed in this bounded run.

## Current r4 artifact exports

Separate bounded artifact run requested after the master committed r4 source at `193b1bb`. The earlier r1 exports remain historical. These commands run serially from the canonical mobile directory with two Metro workers and `EXPO_OFFLINE=1`; this agent does not run ADB, native builds, further regression checks, source/package edits or Git operations.

| Command | Actual result |
| --- | --- |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Passed, exit 0; five web bundles, three static routes; web 841 modules and server renderer 904 modules |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Passed, exit 0; 1,297 modules, 27 assets and one 3 MB Hermes bundle (`entry-d0c8205f377c5daa31f0883eea158ffe.hbc`) |

Both current r4 exports completed successfully with the installed CLI's `--max-workers 2` option. Outputs are ignored files in `apps/mobile/dist`. Only the two requested exports ran; no additional regression, native or Git checks were performed. Startup color-environment notices were nonfatal. The export resource gate is released to the master for heavy native capture. These results verify bundle generation, not deployment or successful on-device language-model generation.

## Final r5 regression and artifact run

Separate frozen-source run after the master applied `autoCorrect={false}` to writing inputs/shared fields to mitigate the native text-entry corruption observed during Android QA. The master reports actual Android local-model suggestion, recipient choice and review evidence separately; this automated run does not substitute for those native captures.

- Start: 2026-11-15 20:01:05 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r5`, app 0.3.0.
- Working-source aggregate at start: `bebebd53b80919115d6134f0d75fd3061916de5ba7abd07163652c7ce71dc995`, 73 files using the documented aggregate method.
- Source remains frozen during the run. This agent edits only this report and ignored export outputs. No source, package, Git, ADB or native build operations are performed. The master permits its separate APK build while this agent serializes its checks and uses one browser worker.

| Command | Actual r5 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, 67 tests, 0 failures/skips |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Passed, exit 0, 17 scenarios, one worker, 2.0 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Passed, exit 0; five bundles, three routes, 848 web modules and 903 server-renderer modules |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Passed, exit 0; 1,297 modules, 27 assets and one 3 MB Hermes bundle (`entry-43be1b1aed4397c6d2cfe7b8d269533c.hbc`) |

Completed at 2026-11-15 20:06:31 -05:00. The 73-file aggregate matched the starting r5 value exactly. All nine requested commands passed on their first run, with no test retries, failures or skips and no source/package fixes during the run. ESLint reported no findings; nonfatal Expo/Node environment color and browser-server native-connection notices remained. Port 8081 had zero listeners. The r5 source/resource gate is released for the master's final native captures. This agent performed no native input, inference, accessibility, iOS or Git verification; the master's actual Android evidence remains separate.

## Final r6 regression and artifact run

Separate frozen-source run after native Android r5 revealed that Hermes supports BigInt arithmetic but its Intl formatter rejects BigInt input. The reviewed fix converts only the bounded whole-dollar quotient to Number, retaining BigInt cent remainder and integer finance calculations. A new regression simulates the rejecting formatter and verifies exact zero, ordinary and maximum-safe amounts, restoring Intl in `finally`. Prior passing browser/unit results did not establish Hermes Intl compatibility; the native defect remains recorded by the master.

- Start: 2026-11-15 20:32:46 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r6`, app 0.3.0.
- Working-source aggregate at start: `de110101b9fbdccf108c2a525394c200fd48498daad919ec31b3ee9519de3868`, 73 files using the method documented above.
- This QA agent writes only this report and ignored export outputs. No source, package, Git, ADB or native operations are performed. The master permits its separate incremental APK build while these commands run serially. Actual native UI checks await this gate release.
- Existing r5 native screenshots retain their true r5 labels. The master will capture affected finance/native usability on r6; this automated run does not relabel historical evidence.

| Command | Actual r6 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, 68 tests, 0 failures/skips |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Passed, exit 0, 17 scenarios, one worker, 1.9 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Passed, exit 0; five bundles, three routes, 849 web modules and 904 server-renderer modules |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Passed, exit 0; 1,297 modules, 27 assets and one 3 MB Hermes bundle (`entry-3d40bbacf2d21fef312a96982912c50a.hbc`) |

Completed at 2026-11-15 20:38:07 -05:00. The 73-file source aggregate remained exactly `de110101b9fbdccf108c2a525394c200fd48498daad919ec31b3ee9519de3868`. All nine requested commands passed on their first run. No tests failed, retried or skipped; ESLint reported no findings. Nonfatal Expo/Node color-environment notices were emitted. Port 8081 had zero listeners. This agent made no source/package corrections or Git/native operations. The r6 source/resource gate is released for the master's actual native finance and usability verification. The formatter regression is a meaningful simulation of the native limitation; it does not itself establish an Android runtime pass.

## Final r7 regression and artifact run

Separate frozen-source run after the master registered a reviewed local Expo plugin adding only `density` to MainActivity's configuration-change handling. The change preserves the other flags and leaves font scaling enabled. A new native-configuration regression joins the suite. Actual unsaved-writing retention across a native density change and 200% native text checks are the master's subsequent responsibilities, not proven by this automated run.

- Start: 2026-11-15 21:37:58 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r7`, app 0.3.0.
- Working-source aggregate at start: `baaf2c49a54bcbe9e42c3cc670d82f686d16826803930b2396584206ef7d4aa3`, **76 files**.
- For r7 the documented aggregate method additionally includes `apps/mobile/plugins/` and any root `app.config.js`/`app.config.ts`, so the native-configuration implementation is covered. Included plugins are `plugins/with-adaptive-display.js` and `plugins/with-short-native-paths.js`. The prior hashes retain their original methods/provenance.
- This agent writes only this report and ignored exports. No source/package/Git/ADB/native operations are performed. The master permits its separate APK build while these commands run serially; browser QA uses one worker on port 8081.
- Existing r6 financial and r5 core/journal images retain their true build labels. The master reports their layouts unchanged in r7; this run does not relabel those screenshots as newly captured r7 evidence.

| Command | Actual r7 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, 69 tests, 0 failures/skips; includes adaptive-display configuration regression |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Passed, exit 0, 17 scenarios, one worker, 2.1 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Passed, exit 0; five bundles, three routes, 849 web modules and 904 server-renderer modules |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Passed, exit 0; 1,297 modules, 27 assets and one 3 MB Hermes bundle (`entry-abfeab38c3035edc8b91f3c667bb0d9a.hbc`) |

Completed at 2026-11-15 21:44:05 -05:00. The 76-file source aggregate, including both local plugins, remained exactly `baaf2c49a54bcbe9e42c3cc670d82f686d16826803930b2396584206ef7d4aa3`. All nine required commands passed on their first run, with no failures, retries, skipped tests or source/package corrections. ESLint had no findings; nonfatal Expo/Node color notices and browser-server native-app connection notices were emitted. Port 8081 had zero listeners. The r7 source/resource gate is released. Actual Android density-change draft retention, cold-session 200% text, keyboard, spoken accessibility and iOS checks are outside this automated sign-off and must be reported from their separate native evidence.

## Final r8 regression and artifact run

Separate frozen-runtime-source run after the master integrated a suggestion-caption correction and an opaque ID helper, including message ID generation. The runtime source stays frozen; native capture-driver scripts may change independently and are not part of this runtime-source aggregate.

- Start: 2026-11-15 22:34:16 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r8`, app 0.3.0.
- Working-source aggregate at start: `4cdca9bb6f0d08ff710beff8f0120e132138ea36ffd6cbe70461ecaed195ed54`, **79 files** using the r7 method, including source/new ID files, tests, browser scenarios, assets, both local plugins and existing app/package/tool configs.
- This agent writes only this report and ignored export outputs. No app/package edits, Git, ADB or native build operations are performed. All nine requested commands run serially, with one browser worker and two export workers.

| Command | Actual r8 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, actual count 72 tests, 0 failures/skips; includes independent UUID entropy, fail-closed generation and hidden/private-event interleaving cases |
| `$env:EXPO_OFFLINE='1'; npm run test:ui` | Initial run exit 1: 16 passed, 1 failed, 4.2 minutes; failure preserved below |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Deferred by master pending the next frozen revision |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Deferred by master pending the next frozen revision |

### Initial r8 browser failure and investigation

The first full run failed `appearance.spec.ts:53` after 90 seconds while waiting for the Journal tab immediately after reloading a saved fictional journal entry. The scenario had already completed earlier theme/navigation actions and saved the entry. All other 16 scenarios passed. The original artifact remains in ignored `apps/mobile/test-results/appearance-appearance-pers-90a69-n-accessible-in-both-themes/error-context.md`; diagnostic/rerun outputs use separate temporary directories so it is not overwritten.

The configured initial run did not capture a screenshot, console trace or page snapshot for this timeout. Repeated Expo reload/native-app connection notices occurred while capture-driver edits were permitted. This is a correlation, not a proven cause. The master subsequently froze both runtime source and drivers and requested a traced targeted appearance run followed by a clean full-suite rerun. No application fix or timeout increase is applied by this QA agent, and the initial failure will remain reported even if the reruns pass.

The unchanged appearance scenario then passed with tracing enabled: `npx playwright test e2e/appearance.spec.ts --trace on --output <temporary diagnostic directory>`, exit 0, one test, 14.1 seconds (28.7 seconds total). Its trace is preserved under `D:\GameDev\Temp\BetweenUs-r8-appearance-20261115-224002`. Separately, the master found an actual native density/viewport defect and directed this agent to defer the clean full-suite rerun and exports until the next source freeze. The targeted pass does not erase the initial failure or establish a native pass.

Inspection of that targeted trace found no browser console errors, page-error events, failed Playwright actions or HTTP error responses. Its only console entries were React DevTools informational notices. The previously observed late-reload timeout was not reproduced on this diagnostic run; the original run lacks the instrumentation needed to prove its cause. Repeated server notices alone are insufficient to establish a reload-race diagnosis.

R8 checkpoint ended at 2026-11-15 22:42:34 -05:00. The 79-file runtime-source aggregate still matched `4cdca9bb6f0d08ff710beff8f0120e132138ea36ffd6cbe70461ecaed195ed54` exactly, and browser port 8081 had zero listeners. The master identified its frozen code commit as `1b20fbb188d05cc11dcbacab62b0861b0af29786`; this agent did not execute Git operations. TypeScript, lint, 72 unit tests, audit, Doctor and SDK compatibility passed. The initial full browser run failed once, the traced targeted scenario passed, and the requested later full rerun/exports are explicitly deferred to the next frozen revision. **R8 is not a clean completed nine-command gate.** No app, package or test source was changed or relaxed to obtain the diagnostic pass. Browser resources are released while the master investigates the separate native viewport defect.

## Final r9 regression and artifact run

The master froze both runtime source and capture drivers for this separate full gate after adding reviewed native density-change layout handling and two native-configuration regression cases. This run preserves the initial r8 failure and targeted diagnostic history above. A passing configuration/unit/browser gate will not substitute for the master's actual native viewport and unsaved-draft checks.

- Start: 2026-11-15 22:45:20 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r9`, app 0.3.0.
- Starting runtime-source aggregate: `91fb63c1ed9448d0875efb82995ec72f7e11cb6c81878a66f7f473fd17719f9e`, 79 files, using the same plugin/config-inclusive method as r8.
- The master permits its separate serial native build during this QA window. This agent serializes its nine commands and edits only this report and ignored test/export output. No app/package/test changes, Git or native/ADB operations are performed.

| Command | Actual r9 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, actual count 74 tests, 0 failures/skips; includes native remeasurement/lifecycle and invalid-template configuration cases |
| `$env:EXPO_OFFLINE='1'; npm run test:ui -- --trace retain-on-failure --output <temporary r9 directory>` | Passed, exit 0, all 17 scenarios, one worker, 2.5 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Passed, exit 0; five bundles, three routes, 850 web modules and 900 server-renderer modules |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Passed, exit 0; 1,298 modules, 27 assets and one 3 MB Hermes bundle (`entry-2444ebde9e9ca8fc28ad4c8d3fc288b3.hbc`) |

Completed at 2026-11-15 22:51:38 -05:00. The 79-file runtime-source aggregate remained exactly `91fb63c1ed9448d0875efb82995ec72f7e11cb6c81878a66f7f473fd17719f9e`. All nine requested r9 commands passed once, including a fresh full 17-scenario browser suite with unchanged tests/timeouts and separate temporary output at `D:\GameDev\Temp\BetweenUs-r9-browser-20261115-224627`. No tests failed, retried or skipped on r9; the initial r8 failure and diagnostic trace remain preserved above. ESLint had no findings; nonfatal Expo/Node color notices were emitted. Port 8081 had zero listeners, and both export processes had completed. This QA agent changed no runtime/package/test source or Git/native state. **The automated/browser/export resource gate is released.**

Separate native evidence remains decisive: the master initially reported a strict r9 geometry failure before its first capture, then reported three manual tablet/phone samples with correct full geometry without restarting, while an export-related Refreshing bar was visible. This reviewer did not operate or independently verify those native probes and does not assign a definitive cause. The master will preserve the initial failure and run the strict native workflow again only after this resource gate release, using bounded waits for valid complete geometry. These passing automated results do not themselves sign off native density retention, keyboard behavior, 200% text or spoken accessibility.


## Final r11 regression and artifact run

The master explicitly released this gate after freezing the r11 runtime. Native controllers and captures were paused throughout; the master stopped its Metro servers on ports 8082/8083 before this run. This QA agent ran the required nine commands sequentially, used one browser worker and two export workers, and edited only this report and ignored generated outputs. No source/package/test changes, Git operations, ADB commands or native builds were performed by this agent.

- Start: 2026-11-16 00:58:47 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r11`, app 0.3.0.
- Master-reported frozen runtime commit: `f0c888a924df362b0841dd9fc568db6d1e8cc59d`; tooling-only driver commit: `4442c48`. These commit identities were supplied by the master, not obtained through Git operations in this run.
- Master-reported APK SHA-256: `8D338023B2DD4792C23ABA3ABF1B75517B31E4D8D106308F4C457C733EB1F6F5`. This agent did not build, install or independently hash that APK.
- Independently computed starting runtime-source aggregate: `64a0359f9090363b608f1a90798f44de7be1f83561ef31ae81156263919eb625`, **79 files**, using the same plugin/config-inclusive method as r8/r9. Native driver scripts and generated Android files are outside that runtime-source aggregate.
- Browser output: `D:\GameDev\Temp\BetweenUs-r11-browser-20261116-0059`, with `retain-on-failure` tracing. Prior failed-run evidence was not overwritten.

| Command | Actual r11 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, actual count 74 tests, 0 failures/cancellations/skips/todos |
| `$env:EXPO_OFFLINE='1'; npm run test:ui -- --trace retain-on-failure --output 'D:\GameDev\Temp\BetweenUs-r11-browser-20261116-0059'` | Passed, exit 0, all 17 scenarios, one worker, 2.4 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks; no issues detected |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Passed, exit 0; five bundles, three static routes, 850 web modules and 905 server-renderer modules |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Passed, exit 0; 1,298 modules, 27 assets and one 3 MB Hermes bundle (`entry-b8f6df628c16e2a061c7af6a61d48c76.hbc`) |

Completed at 2026-11-16 01:03:31 -05:00. The 79-file runtime-source aggregate matched the starting value exactly: `64a0359f9090363b608f1a90798f44de7be1f83561ef31ae81156263919eb625`. All nine commands passed on their first run with no test retries, failures or skips. ESLint had no findings. Nonfatal Node color-environment warnings (`NO_COLOR` ignored because `FORCE_COLOR` is set) and Expo browser-server notices that no native apps were connected were emitted; they are not concealed as warning-free command output. Port 8081 had zero listeners after completion, and both export processes had exited. **The automated/browser/export resource gate is released.** No extra checks or reruns were performed.

This automated gate does not establish a native usability or production-readiness pass. Before the run, the master reported a host-GPU PNG corruption issue, a cold boot using SwiftShader on the same Pixel_10 AVD, and a SystemUI ANR recovered through the standard Wait action. The master reported valid r11 light-theme four-size/draft/roundtrip/UUID and light 200% evidence; r11 dark 200% was explicitly not passed, and further global density/font stress was paused as an environment limitation. This agent did not operate or independently verify those native probes. Ordinary-phone native flows/captures, spoken accessibility, iOS and the existing production security/release gates remain separate requirements. Historical failures and the earlier native limitations remain preserved rather than being relabeled by this passing gate.


## Final r12 regression and artifact run

The master explicitly released exclusive QA resources after freezing r12. Both Metro servers were stopped and native controllers/builds/ADB activity remained paused throughout this gate. The master performed documentation/static review only. This agent ran all nine requested commands sequentially, with one browser worker and two export workers, and wrote only this report and ignored/temporary generated outputs. No source/package/test changes, Git operations, ADB commands or native builds were performed by this agent.

- Start: 2026-11-16 01:22:52 -05:00.
- Build: `1115-FamilyEnvelopes-Journal-r12`, app 0.3.0.
- Master-reported frozen code commit: `8607573`. The commit identity was supplied by the master, not obtained through Git operations in this run.
- Master-reported APK SHA-256: `34716578ABD1C9DCB9C255C9993E66F3B00BB532B29AC7DE953095302C8FB6E9`. This agent did not build, install or independently hash that APK.
- Independently computed starting runtime-source aggregate: `189973cfa2432096335e69c06f873ba55402a133ce6b725f3e9e6e480883dcd1`, **81 files**, using the same plugin/config-inclusive method as r8/r9/r11. Native drivers/generated Android files are outside this aggregate.
- Browser output: `D:\GameDev\Temp\BetweenUs-r12-browser-20261116-0123`, with `retain-on-failure` tracing. Earlier failures and their artifacts remain preserved.

| Command | Actual r12 result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no warnings/errors |
| `npm test` | Passed, exit 0, actual count 84 tests, 0 failures/cancellations/skips/todos |
| `$env:EXPO_OFFLINE='1'; npm run test:ui -- --trace retain-on-failure --output 'D:\GameDev\Temp\BetweenUs-r12-browser-20261116-0123'` | Passed, exit 0, all 19 scenarios, one worker, 2.1 minutes; no failures/retries/skips |
| `npm audit` | Passed, exit 0, 0 vulnerabilities |
| `npx expo-doctor` | Passed online, exit 0, 20/20 checks; no issues detected |
| `npx expo install --check` | Passed, exit 0, dependencies up to date |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform web --max-workers 2` | Passed, exit 0; five bundles, three static routes, 849 web modules and 905 server-renderer modules |
| `$env:EXPO_OFFLINE='1'; npx expo export --platform android --max-workers 2` | Passed, exit 0; 1,298 modules, 27 assets and one 3 MB Hermes bundle (`entry-712dab25a49a23cafa131e75cae35d83.hbc`) |

The 84-test count includes six author-owned/bidirectional-block domain cases, three final-message-factory cases and one journal recipient/model-denial case in addition to the prior 74. The two new browser scenarios passed for both child and parent blocking: switching demo accounts cannot simulate an incoming message through either author's block, while safety and in-person practice remain available. This statement records the actual automated scenarios; it does not substitute for native execution or authenticated server-side authorization.

Completed at 2026-11-16 01:26:17 -05:00. The 81-file source aggregate matched its starting value exactly: `189973cfa2432096335e69c06f873ba55402a133ce6b725f3e9e6e480883dcd1`. All nine commands passed on their first run, without retries, skipped tests, source fixes or relaxed timeouts. ESLint had no findings. Node emitted nonfatal color-environment warnings (`NO_COLOR` ignored because `FORCE_COLOR` is set); these are not represented as warning-free command output. Port 8081 had zero listeners after completion, and both export processes had exited. **The entire automated/browser/export resource gate is released.** No extra checks or reruns were performed.

R12 native capture/blocking verification is the master's next separate task. This run does not claim actual native blocking, 200% dark-mode, OS density/font stress, spoken TalkBack, iOS or production readiness. The previously recorded native failures and environment limitations remain factual history rather than being superseded by these passing automated checks.
