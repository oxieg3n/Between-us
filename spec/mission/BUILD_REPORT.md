# Between Us combined mission build report

Status: **r12 functional prototype and scoped native QA completed; source/evidence pushed and independently verified**. All nine automated checks passed: 84 units and 19 browser scenarios without failures/retries/skips. Current native evidence has 98 independently reviewed test originals across both themes: core 48, journal/model 12, blocking 14, keyboard/interactions 12 and cold-app 200% text 12. Two master-reviewed handoff originals bring the total to 100; four comparison sheets preserve eight exact viewports. Screenshot counts are not test-case counts. Both identified prototype security defects are corrected with the coverage stated below. Earlier failures and physical-device/iOS/spoken-accessibility limits remain explicit. This is not production-security certification.

| Item | Current verified value |
| --- | --- |
| Build identifier | `1115-FamilyEnvelopes-Journal-r12` |
| App version / Android package | `0.3.0` / `com.oxieg3n.betweenus` |
| Canonical workspace | `D:\projects\BetweenUs` |
| Mobile application | `D:\projects\BetweenUs\apps\mobile` |
| Feature branch | `feature/mobile-foundation` |
| Repository | [oxieg3n/Between-us](https://github.com/oxieg3n/Between-us) |
| Origin fetch/push URL | `https://github.com/oxieg3n/Between-us.git` |
| Frozen r12 runtime commit | `8607573e37dadd66ede3bb368389e0a2531ef6d8` |
| Clean-build status | Original Stack restored; clean prebuild removed diagnostic geometry logging before this APK |
| R12 Android build / installation | Android x86_64 debug BUILD SUCCESSFUL in 1 minute 5 seconds; installed on Pixel_10, ordinary-phone native checks/captures completed |
| R12 debug APK SHA-256 | `34716578ABD1C9DCB9C255C9993E66F3B00BB532B29AC7DE953095302C8FB6E9` |
| Source/evidence delivery commit | `061775da03d44b8f63c1332d2f0ca5738e74a883` |
| Verified evidence push / remote ref | Success, exact match `061775da03d44b8f63c1332d2f0ca5738e74a883`; [receipt](DELIVERY_RECEIPT.md) |

## Workspace and preservation

Relocation is COMPLETE. The entire repository, `.git`, ignored files and owner work are at the canonical root; the deprecated root is absent. The old ADB server held the vacated empty directory; restarting that server released its handle and the guarded helper succeeded. No unrelated process was terminated. See [relocation result](WORKSPACE_RELOCATION_RESULT.md).

All Git operations use the canonical root. The owner diagnostic `Scripts/Narrator-One-Time-Diagnostic-eb5cb0e.txt` remains intentionally untracked and excluded from commits, exports and screenshots. Final secret/unintended-file review and evidence-push clean-tree verification passed; see [delivery receipt](DELIVERY_RECEIPT.md).

The public GitHub Pages demo, root redirect and approved assets are preserved. The master verified through the installed GitHub client that Pages uses the legacy `main` root build, with no repository workflow. No main merge, Pages publication or Powered By website change is authorized. Pushing this feature branch does not change that configured Pages source.

## Implemented prototype functionality

### Chores, earnings and payout scheduling

Parents configure a weekly, biweekly or monthly allowance pool separately from a per-task, daily, weekly, biweekly or monthly payout reminder cadence. Chores support independent one-time/recurring occurrences, future reward edits, optional instructions and a completion-note requirement. Recurrence prepares an explicit bounded window; it does not run a persistent background scheduler.

Children submit their own occurrences. Parents approve, request another attempt, decline, cancel or expire them. Submission earns nothing; approval credits the frozen occurrence reward once. Budget checks reject oversubscription until the parent explicitly changes the allowance pool. In-app review status is simulated notification behavior.

The append-only event ledger uses safe integer USD cents, exact percentage rounding, source lots, operation IDs and UTC timestamps with a family IANA calendar. It preserves corrections and prevents earnings, goal earmarks and payout holds from spending the same cents twice. Family-local cadence calculations identify available amounts for a manually prepared payout batch. A parent can also prepare an explicit manual override.

### Savings and Family Savings Envelopes

Children can maintain multiple goals, edit targets/dates, allocate approved unpaid earnings by amount or percentage, and create fixed/percentage rules for future approvals. A percentage can be scoped to available earnings in the current allowance period. Transfers move existing earmarks; releases follow the parent's configured policy. Neither creates a new earning or second match. Goal cancellation preserves financial history.

Parents can declare that an earmarked amount is held and add a location label. These are family declarations, not linked account balances. Cash-out requests reserve eligible free cents; partial payments retain the remaining hold, cancellation releases only the unpaid remainder, and the child may acknowledge receipt. Payment-report corrections and earning reversals append compensating history.

The UI is a fictional Sam/Alex household fixture. The domain supports distinct children and tests sibling isolation; authenticated multi-child/family administration is a production work item, not an implemented identity service.

### Parent savings matching

The illustrative setup is 100% matching, a $20 calendar-month cap per child across eligible goals, a separate parent matching budget, Surprise and manual reveal. The rule starts **off** until a parent deliberately enables it. Configuration and eligibility changes are prospective.

An $8 allocation followed by $15 creates $8 and $12 commitments under the default cap. Hidden commitments, parent-only corrections and matching configuration are excluded from child projections and progress. Hidden promises do not alter the child's permitted own allocation or error messages. Equivalent-world regression tests cover this boundary.

Reveal and funding are separate. Revealed unpaid pledges remain plans; only revealed parent-reported funded contributions enter child-visible progress. Own savings and parent contributions stay separate. Funding supports partial parent reports, date/method/note and explicit confirmation. Reversals preserve reported payment history and create reconciliation obligations; a parent can record a correction or reported return. No action transfers or reclaims money.

### Free payment workaround

The parent payout workspace provides amounts, notes, holds and financial history, with explicit copy actions and verified public Cash App/Venmo setup pages. Age guidance keeps under-13 users away from Venmo Teen onboarding. Cash/manual remains usable without any provider account.

Parents complete any real-world action outside Between Us and record only a family declaration here. Opening a provider page or copying a summary never marks a payout paid. There is no credential capture, balance aggregation, guessed payment deep link, scraping or unsupported P2P API. External fees/eligibility still apply. See [payment bridge](../NO_COST_PAYMENT_BRIDGE.md).

### Intelligent Journal Conversation Engine

Manual **Find words to share** works before saving. **Conversation Ideas While I Write** is off by default and session-local per demo role. Opted-in pauses debounce for 1,200 ms; typing, entry/role changes, navigation, dismissal and opt-out cancel or invalidate stale work. The editor, Save action and unsaved-draft protections remain available.

At most two local suggestions offer contextual conversation wording. Optional Shorter, Simpler, More direct, More like me and Another way choices preserve the deliberate editing flow. The author chooses a person, edits separate words and reviews exact text before a simulated send or in-person practice. Journal text is never automatically inserted into an outgoing message in full.

The rules fallback is clearly labeled as local templates. Unsafe/blocked/removed recipient exclusions continue through composition, conversation composer, review and final send. Safety information and another-safe-adult preparation remain available without guardian approval. English heuristics can miss context or overexclude; they are not a guarantee of relationship safety or a clinical assessment.

The experimental native adapter is pinned to `llama.rn@0.13.0-rc.11` and an Apache-2.0 SmolLM2 360M Q8_0 model. Setup requires an explicit approximately 369 MiB download, at least 1 GiB free storage, exact byte/hash verification and local loading. SDK 58 FileSystem streams the SHA-256 natively. The adapter disables native logging, bounds generation/context size, constrains JSON output, applies the existing deterministic validator, serializes requests and clears native cache data before reuse/release. Invalid or unavailable generation falls back without cloud inference.

Model assets are the additional approved persisted files; prompts, outputs, journals, drafts and finance records remain in memory. The selected appearance is the only persisted preference. Expo Go/web do not provide the custom native runtime and retain the useful fallback.

### Existing features preserved

The approved logo, The Open Letter styling, Safe Harbor/Night Harbor themes, system/light/dark preference and four primary destinations remain. Chores & Goals is nested from Home. Role-specific journals, My Circle administration/requests, accepted-and-verified message gating, reviewed simulated conversations, optional check-ins, scheduling fixtures, skip/later behavior and privacy/safety access continue in the same application.

R12 separates author-owned block edges from parent-managed contact approval data. Either Sam/Alex directed block prevents new simulated messages in both directions, including a stale verified recipient captured before the block. The state updates its block reference synchronously, and the message factory requires the current block policy at final creation. Schedule saves also recheck it. Projected contacts, composer/review eligibility and journal recipient validation honor generic messaging unavailability; administrator approval/reverification cannot erase a child's independent block. Other safe contacts and in-person/safety preparation stay available. No unblock UI or real authentication was added.

## Real versus simulated

| Capability | What actually happens |
| --- | --- |
| Forms, navigation, drafts, journal CRUD, rules and finance arithmetic | Real local prototype interactions against fictional memory-only state |
| Ledger, approvals, allocations, matching, reveal and payout holds | Real deterministic in-process logic; no authenticated server or persistent account |
| Messages and connection verification | Simulated fixtures/delivery; nothing is delivered |
| Chore review notifications and check-in schedules | Local calculation/status only; notification delivery is simulated |
| Parent-held, paid, contributed or returned amounts | Parent/family reports; no independently verified provider balance or transfer |
| Copy and official-provider link actions | Real explicit clipboard/browser handoffs; no payment automation |
| Local template suggestions | Real deterministic offline rules; no language model is implied |
| Native language-model code | Isolated emulator proof and frozen r5 both-theme accepted native starter/recipient/review captured; physical-device performance and broader safety validation remain open |
| Appearance and optional model asset storage | Implemented local preference/model files; no journal/financial content persistence |
| Identity, consent, secure storage, reports and abuse response | Production requirements; role toggle and local report labels do not implement them |

## Automated and native verification

The [automated QA report](AUTOMATED_QA.md) preserves each run and its source aggregate. R5, r6 and r7 each passed all nine requested automated/export commands. R7 had 69 unit tests, 17 one-worker browser scenarios, zero npm audit findings, Expo Doctor 20/20, dependency compatibility and both web/Android exports. R8 passed type/lint, 72 units, audit, Doctor and compatibility, but its full browser run had one timeout and its exports were deferred. The unchanged targeted appearance test then passed with tracing and no console/page/network errors observed; the initial uninstrumented timeout's cause is unproven. R8 is not a completed clean nine-command gate.

All nine r9 commands passed, with 74 units and 17 browser scenarios without failures/retries/skips, zero npm audit findings, Doctor 20/20, SDK compatibility and both exports. Its 79-file source aggregate remained `91fb63c1ed9448d0875efb82995ec72f7e11cb6c81878a66f7f473fd17719f9e` through completion at 2026-11-15 22:51:38 -05:00. That automated success did not close the subsequent native viewport failure.

The separate r11 full gate passed all nine commands: 74 units, 17 browser scenarios without retries/failures/skips, zero npm vulnerabilities, Doctor 20/20, SDK compatibility and both exports. It completed 2026-11-16 01:03:31 -05:00 with unchanged 79-file aggregate `64a0359f9090363b608f1a90798f44de7be1f83561ef31ae81156263919eb625`. Those historical results remain separate from r12.

R12 then passed its own complete nine-command gate from **2026-11-16 01:22:52 to 01:26:17 Eastern (-05:00)**. The 81-file source aggregate stayed exactly `189973cfa2432096335e69c06f873ba55402a133ce6b725f3e9e6e480883dcd1`. All commands passed on their first run, with unchanged tests/timeouts, no retries/skips/source fixes, and native/build resources paused throughout. Nonfatal Node color-environment notices are retained in the QA record; clean lint does not mean every command emitted no notices.

| Current frozen r12 check | Observed result at this update |
| --- | --- |
| TypeScript | Passed, exit 0 |
| Lint | Passed, no warnings/errors |
| Unit tests | 84 passed, zero failures/cancellations/skips/todos |
| Browser scenarios | 19 passed, one worker, 2.1 minutes; no failures/retries/skips, including both bidirectional-block workflows |
| npm audit / Expo Doctor / dependency compatibility | Passed: zero vulnerabilities, 20/20 Doctor checks, dependencies up to date |
| Web and Android exports | Passed: five web bundles/three static routes; Android 1,298 modules, 27 assets and one 3 MB Hermes bundle |
| Android debug build/install | Passed; exact clean APK provenance above |
| Current Android native workflows | Both-theme core, native model, blocking, journal/keyboard/review, cold-app 200% text and appearance checks passed; normal device settings restored |
| Final r12 source aggregate equality / nine-command gate | Passed: unchanged 81-file aggregate above |
| Evidence push / clean tree apart from preserved diagnostic | Passed; receipt follow-up commit is verified in final session reply |

The native operator uses Pixel_10, Android 17, x86_64, normal resolution 1080 x 2424, density 420 and font scale 1.0. Historical responsive cases sequentially override one AVD; they are not separate physical phone/tablet tests. All linked original PNGs below are actual ADB captures. Comparison sheets derive only from those originals, without concealing defects.

| Completed evidence set | Actual outcome / limits |
| --- | --- |
| [R5 core visual QA](../qa/chores-goals/1115-r5-open-letter-core/VISUAL_QA_REPORT.md) | 26 originals, 13 per theme; all inspected and hashes verified. Four full-viewport comparison sheets. Core navigation, journal, chats, Circle, contacts, scheduler and child check-in represented. |
| [R5 native journal/model QA](../qa/journal-intelligence/1115-r5-journal-native-v2/VISUAL_QA_REPORT.md) | 12 originals, six per theme, clean frozen `afca46fa881b6c17b40c2c32bee9d97cd45c3554`. Actual loaded model, exact fictional writing, accepted on-device starter, explicit recipient and exact review. Capture stops before Send. |
| [R6 finance visual QA](../qa/chores-goals/1115-r6-family-envelopes/VISUAL_QA_REPORT.md) | 50 originals, 25 per theme; all inspected and verified. Completed manifest with `error: null`, source `2f151d15607240be2d36df1d05fa661640abd7f4`. |
| [R7 native usability QA](../qa/chores-goals/1115-r7-native-usability/QA_REPORT.md) | 56 originals: 27 light, 28 dark, one Follow Device; all hashes/dimensions verified, 20 representative images inspected. 17 functional cases and device restoration passed. Open P2 privacy-caption clipping required the r8 correction; this historical run does not close it. |
| [R7 core supplement QA](../qa/chores-goals/1115-r7-core-supplement/VISUAL_QA_REPORT.md) | 22 originals, 11 per theme; all inspected and verified. C1/C2/C4 framing gaps closed. Its C3 framing gap was later closed in both themes by the current r12 set below. |
| [R12 native bidirectional blocking](../qa/chores-goals/1116-r12-bidirectional-blocks/QA_REPORT.md) | 14 originals, all individually reviewed and independently SHA-256/IHDR verified. Completed/error-null manifest; four blocking cases across both authors/themes plus appearance persistence passed; original geometry/font restored with no errors. |
| [R12 native keyboard/interactions](../qa/chores-goals/1116-r12-native-interactions/QA_REPORT.md) | 12 originals, all individually inspected/hash/IHDR verified; five functional passes plus verified restoration. Exact child journal Save/revisit and actual IME/review/edit/simulated-send/native Back passed in both themes; appearance persistence passed. |
| [R12 Open Letter core](../qa/chores-goals/1116-r12-open-letter-core/VISUAL_QA_REPORT.md) | 48 originals, 24 per theme, all inspected and verified; completed/error-null clean-source manifest. All 12 requested screen categories, actual Skip, schedule Save/new child invitation and complete scrolled Home finance entry in both themes. Four comparison sheets verified. |
| [R12 cold-app 200% text](../qa/chores-goals/1116-r12-large-text-warm-software/QA_REPORT.md) | 12 originals, all independently reviewed/hash/dimension verified. Both theme cases, appearance persistence and restoration passed on warm SwiftShader; full Confirm/Cancel fit without scrolling. Historical failure is preserved, no root-cause or hot draft claim. |
| [Final owner handoff](../qa/chores-goals/1116-r12-final-handoff/QA_REPORT.md) | Two master-reviewed original Settings/Home frames, Follow Device selected, normal geometry/font and original power settings restored; AVD configuration hash unchanged. Not additional functional cases. |
| [R12 native journal/model](../qa/journal-intelligence/1116-r12-journal-native/VISUAL_QA_REPORT.md) | 12 originals, six per theme, all inspected/hash/IHDR verified at clean source8607573. Retained model load, accepted actual on-device source, separate celebration starter, intentional Alex choice and exact Review in both themes; no Send activated. |

The r6 native finance sequence completed in **both** themes: $23 approved earnings; own $8 and $15 goal allocations; $8/$12 parent promises under the shared $20 cap; deliberate reveal without changing unpaid progress; separate parent-reported $8 funding; a third $5 earning; a $5 cash-out hold; $2 partial payment report and child receipt acknowledgment; cancellation releasing only the unpaid $3; and retained history. Final partition: $28 earned = $23 earmarked + $3 available + $2 parent-reported paid, no remaining hold. No money moved or provider balance was verified.

The focused r12 native run used actual Circle/confirmation controls, switched to the peer demo account and verified Message draft/Review and new-check-in Save were disabled after either author's block in each theme. The child could still open safety information, prepare separate words for another trusted adult, review and keep them for practice without approval. Night Harbor survived a force-stop/relaunch, then Follow device was selected. This closes the reproduced blocking defect within the fictional in-memory prototype. It does not force an internal send or test a new block arriving between Review and Send; the final factory/current-reference branches are covered separately by unit tests and source review.

The current native interaction run independently passed exact child journal typing, Save and revisit in both themes. With the real IME visible at Y=1541, the draft bounds were [53,1098,767,1298] and Review [793,1168,1028,1297], fully above the keyboard. The operator tapped Review with the IME open, edited/reviewed, simulated Send and used Android Back to return to Review. The journal Save occurred after keyboard dismissal; this does not claim journal Save is always visible over the IME. Night Harbor's light Gboard is the OS surface, not a forgotten app theme. Appearance persistence and restoring Follow Device passed. No real message was delivered.

The 48 current core originals include all requested categories in both themes. Actual Skip yields "Skipped. You do not owe an answer" without a penalty, and the parent's saved fictional Friday check-in becomes the child's new optional invitation. Complete scrolled Home Chores & Goals controls close C3's evidence gap in both themes; the action's initial below-fold placement remains discoverability polish. Lower contact and scheduler controls are additionally framed. The saved-banner top and a secondary teacher option remain disclosed scroll-framing limits, not concealed defects.

The current model run loaded the retained asset twice without a new download, explicitly requested words and recorded accepted on-device source in both themes. The separate starter was "Can we talk about something I want to celebrate? I'd like you to listen first." Alex initially remained Choose, then was deliberately selected before exact Review; no Send was activated. This is successful native inference and validation for one fictional example, not arbitrary-output safety or physical-device performance proof.

The r7 functional cases cover small/standard/large/tablet navigation and goal Android Back in both themes; unsaved journal retention across live density change; cold-session 200% text and scroll-reachable Confirm/Cancel; exact journal typing, save and revisit; an actual IME with Review above it, edit/review and simulated send; and Night Harbor persistence after force-stop/relaunch followed by returning to Follow Device. Original size, density and font scale were restored and verified with zero errors. Hot font-scale draft restoration, physical hardware and spoken TalkBack were not tested. The privacy label visibly clipped in both retained-editor tablet frames despite functional state preservation; final targeted evidence is still required.

The preserved [r8 target manifest](../qa/chores-goals/1115-r8-density-and-references/capture-manifest.json) records `completed: false`, `RuntimeError: Native control/text not found: Home`, five original light PNGs and source `1b20fbb188d05cc11dcbacab62b0861b0af29786`. [Native results](../qa/chores-goals/1115-r8-density-and-references/native-check-results.json) record exact unsaved-text retention and tablet goal Back before the failure, plus verified device restoration with zero errors. The master observed an undersized 1464 x 1960 app root in the 1920 x 2560 viewport after the live transition; restoring the phone placed Home off viewport. The light privacy sentence was visible, but dark verification, complete viewport behavior and native UUID creation did not complete. Neither the earlier successful r7 cases nor this partial light result closes the r8 defect. The first r8 browser appearance/reload timeout is separately preserved in the [automated QA investigation](AUTOMATED_QA.md#initial-r8-browser-failure-and-investigation); reload notices correlate with it but do not establish a cause.

The reviewed r9 local plugin calls `super.onConfigurationChanged` first, then posts `requestLayout()` to the existing React root after configuration resources settle. It does not clear/recreate the React session, remount the form, disable text scaling or add persistence. Tests cover generation/idempotence/lifecycle and rejection of ambiguous existing handlers. The [first r9 target manifest](../qa/chores-goals/1115-r9-density-and-references/capture-manifest.json) records a strict geometry assertion failure before the first PNG. The master later observed correct full tablet/phone bounds in three manual settled samples without restarting; a Refreshing bar was visible in an actual diagnostic tablet screenshot. Those observations are a possible confound, not a proven explanation or a native pass.

After all browser/export/build resources were released, the master froze the harness at `5b2ae211b933f6da14bd395d5b596547ef77e8df`, restarted only the owned Metro process with a clear cache on port 8082, and ran the isolated [r9 v2 target](../qa/chores-goals/1115-r9-density-and-references-v2/capture-manifest.json). It still failed the strict return-to-phone geometry assertion after the full bounded 30-second wait, with five light originals preserved. [Results](../qa/chores-goals/1115-r9-density-and-references-v2/native-check-results.json) verify device restoration with zero errors. Native UUID creation was not reached. The isolated failure means concurrent exports/Refreshing alone do not explain the remaining viewport defect; neither earlier manual samples nor the completed nine-command gate closes it.

The [r10 native manifest](../qa/chores-goals/1115-r10-native-usability/capture-manifest.json) now records `completed: false` and the same strict return-to-phone geometry failure after its bounded 30-second wait. It contains 17 light originals spanning the four viewport classes. [Results](../qa/chores-goals/1115-r10-native-usability/native-check-results.json) preserve partial case outcomes and verified device restoration with zero errors. No dark workflow or native UUID smoke completed. Replacing the outer Stack with Slot/View did not fix the defect; the master restored only the root layout to the prior Stack bytes, retaining existing features and state. It is not presented as an accepted architectural change or a successful correction.

The subsequent temporary diagnostic APK logged only geometry, density and native-class metadata inside an owned generated MainActivity marker in ignored output; no words, record IDs or prompts were logged. Its measurements showed correct outer-root bounds but a shrunken inner native Screen density state. The [light candidate manifest](../qa/chores-goals/1115-native-screen-state-candidate/capture-manifest.json) records `completed: true`, `error: null` and ten original captures. That diagnostic candidate passed the full roundtrip, exact unsaved draft, native UUID creation, complete privacy caption and appearance checks. It retains its recorded r10 diagnostic identity and is not retagged as final r11 or both-theme acceptance.

Clean r11 retains the original Stack layout and adds an app-scoped refresh of existing native Screen state through its public `updateState(width, height, top)` after configuration/root layout. Guards limit it to attached, non-removing PUSH screens in ScreenStack, valid dimensions and the same current attached React root; Activity destruction is checked. No screen replacement, remount, persistence or third-party vendor patch is introduced. The master verified clean prebuild removed all temporary BUDisplay/probeDisplay instrumentation; a read-only scan of generated MainActivity also found no such markers or Log calls. Its APK provenance remains in the linked r11 native reports; the header above now identifies r12.

The first [r11 native attempt](../qa/chores-goals/1115-r11-native-usability/QA_REPORT.md) retained 20 light originals and six passed cases before an unproven Confirm lookup failure; the visible modal/later XML did show a valid Confirm control. The [r11 v2 attempt](../qa/chores-goals/1115-r11-native-usability-v2/QA_REPORT.md) retained 23 light originals and seven passed cases, including four viewport classes, exact unsaved draft, full strict roundtrip and an actual opaque UUID reference after private journal/hidden matching actions. It stopped later in a 200% navigation workflow. Restoration passed. Neither stopped run establishes a complete all-theme pass.

The separate [light 200% case](../qa/chores-goals/1116-r11-large-text-v3/QA_REPORT.md) passed readable navigation and reachable Confirm/Cancel, with actual cancellation. Dark startup then failed amid host graphics/screenshot corruption. After a cold boot using SwiftShader, the [dark retest](../qa/chores-goals/1116-r11-dark-large-text-swiftshader/QA_REPORT.md) stopped at a System UI ANR before dark build verification/200% setup; its unchanged original and restoration result remain preserved. The standard Wait action recovered the system. That r11 dark attempt is explicitly **not passed**, and the observed renderer/session changes do not prove its cause.

Four current r12 owner comparison sheets, with Safe Harbor left and Night Harbor right. Each is 2216 x 2540 with Build r12 labels; all eight embedded 1080 x 2424 viewports were independently verified pixel-for-pixel against their originals. Earlier r5 sheets remain unchanged in their historical folder.

- [Home](../qa/chores-goals/1116-r12-open-letter-core/core/comparisons/home-side-by-side.png)
- [Journal](../qa/chores-goals/1116-r12-open-letter-core/core/comparisons/journal-side-by-side.png)
- [Conversation](../qa/chores-goals/1116-r12-open-letter-core/core/comparisons/conversation-side-by-side.png)
- [Navigation](../qa/chores-goals/1116-r12-open-letter-core/core/comparisons/navigation-overview.png)

## Defects found and corrections

- **Slow model verification:** the first incremental JavaScript SHA-256 path took about nine minutes on the emulator. Existing SDK58 native `File.digest("SHA-256")` replaced it; exact size/hash/version checks remain. The unused hashing dependency was removed.
- **Moved model cleanup:** Expo `File.move` mutates the source URI; final cleanup could delete the completed asset. Cleanup now retains the original temporary URI. Success and failure regressions pass; real retained-file/restart/reload evidence is preserved in the [model evaluation](../LOCAL_AI_MODEL_EVALUATION.md).
- **Native input corruption:** actual writing tests observed duplicated/missing fragments. R5 disables autocorrection for writing/shared form fields, and the harness verifies focus, clearing and exact text. Both-theme r5 editor text and r7 save/revisit passed. The underlying IME/automation mechanism remains a hypothesis, not a proven cause. [Input regression](../qa/journal-intelligence/native-input-regression-20261115/REPORT.md).
- **Hermes currency crash:** r5 native finance hit `Cannot convert BigInt to number` although browser/unit checks passed. R6 converts only the safe bounded whole-dollar quotient to Number; arithmetic and cent remainder stay exact. The rejecting-Intl regression and actual both-theme financial flows pass. [Formatting regression](../qa/chores-goals/native-formatting-regression-20261115/REPORT.md).
- **Density restart:** the initial r6 tablet transition restarted to onboarding with a duplicate-linking warning. A narrowly scoped plugin handles only `density` in addition to existing MainActivity flags, without disabling text scaling. R7 retained exact unsaved drafts without that warning in both themes. Historical failure evidence remains in the [density regression](../qa/chores-goals/native-density-regression-20261115/REPORT.md); the completed r7 QA above is the later verification.
- **Privacy-caption clipping and live viewport:** r7 retained-tablet editor clipped "Just for you - nothing is shared." R8 confines the label correction to that stateless view. Its first target exposed a viewport regression; r9's queued root remeasurement and r10's reverted Slot experiment failed the return-to-phone test. Metadata measurements then isolated stale inner Screen density state. R11 refreshes the existing guarded PUSH Screen state; the clean r11 LIGHT strict tablet/phone, exact draft/full caption and native UUID case passed. R12 current normal-phone and cold-app 200% cases passed in both themes. A new r12 DARK tablet roundtrip was not run; historical responsive evidence retains its original build and limitations.
- **Hidden-activity ID metadata:** the shared sequential ID counter allowed visible references to reveal unseen allocation counts. Existing native Expo UUIDv4 and standard Web/Node crypto UUIDs replaced it, including message IDs. Deterministic delegation/interleaving tests, exact r11 light financial UUID evidence and current r12 native journal/message creation pass. The ID module is unchanged between those builds; no fresh r12 financial-format screenshot is claimed. Closed for the fictional prototype, with no authentication-token or production-privacy claim. [Security review](../security/FINAL_PROTOTYPE_REVIEW.md).
- **Reverse incoming after block:** the prior shared Contact status checked only the recipient. Child-blocks-Alex still allowed parent-to-Sam simulation, and the reverse also reproduced. R12 stores independent per-author edges, denies both directions at the factory with the latest block reference, and gates scheduling/journal/UI eligibility. The full 84-unit/19-browser gate, independent read-only source review and four both-theme native block cases passed. Closed for the fictional prototype; production server authorization/delivery revocation remain open. [Security review and limits](../security/FINAL_PROTOTYPE_REVIEW.md).

The initial eight moderate npm findings traced to a minimatch advisory. Scoped 11.0.8 overrides retain Expo58 and have caller-compatibility regressions; r5 through r9 audits found zero vulnerabilities. Zero npm findings is not a security certification. The native runtime remains a pinned release candidate. [Dependency/license review](DEPENDENCY_REVIEW.md).

The first native probe hit Windows MAX_PATH; a shorter scratch root enabled it. The main app's scoped native-path plugin avoids global changes. The isolated probe measured cold initialization 5,691 ms and three generations 1,448/800/726 ms; these are emulator samples, not integrated latency or physical-device p95. [Probe evidence](../qa/journal-intelligence/native-probe-20261115/REPORT.md) and [integrated model evaluation](../LOCAL_AI_MODEL_EVALUATION.md) preserve the distinction.

The final isolated r12 200% retry followed 86 stable ordinary-phone captures on the same warm SwiftShader AVD, with the model app force-stopped first. Both Home/navigation, goal and parent matching Confirm/Cancel cases passed; Cancel saved no rule. The controls already fit, so the three dialog views do not demonstrate scrolling. The report explicitly corrects the earlier driver description; future capture labels now say located/reachable controls. Original descriptions and failed evidence remain unchanged. Appearance survived a process restart, Follow Device was restored, and size/density/font restoration had zero errors. This closes the scoped cold-app DARK 200% case without proving a renderer/root-cause fix. Hot font-change draft retention, spoken accessibility, hardware and iOS remain separate gates.

The main app was returned to Sam Home at Follow Device. Original power settings were restored and queried (`screen_off_timeout=2147483647`, `stay_on_while_plugged_in=1`); normal 1080 x 2424/density 420/font scale 1.0 are verified. The AVD configuration SHA-256 remains `E0ABB4B4337204021E315C04B7887E369D97246A1608072B67D1C201C2A36652`. Metro remains available locally on port 8082; the runtime probe and its Metro server are stopped. No Codex restart is needed at the verified canonical root.

The staging whitespace check flags only the archived raw Android geometry log's 1,720 original CRCRLF records. Its bytes are intentionally preserved as captured (working/index SHA-256 both `bc8bad5bfef8f732b785ff6279e520a8c6a3c8306c341bb79ee47c79138e1339`); all other staged source/documentation paths pass the whitespace check. This is an explicit artifact-format exception, not an application test failure or a silent rewrite of diagnostic evidence.

## Contributors and changed areas

| Agent | Completed work |
| --- | --- |
| Master Control | Workspace relocation, app integration/navigation/UI, native setup/build plugins and runtime, all serialized Android operations, fixes and source control |
| Finance Domain | Financial domain, deterministic tests/specifications, permission/rounding review, caller compatibility and automated regression gates |
| Journal Engine | Contextual fallback/validation, model research/specifications, browser finance flows, native capture/check scripts, independent privacy review and ID correction candidate |
| Security/Payment/UX Review | No-cost payment guidance, boundaries/integration design, lifecycle tests, dependency/visual QA and native evidence review |

Implementation remains in `apps/mobile/`: `src/finance/`, `finance-state.tsx`, finance/journal/model screens, `journal-intelligence/`, local-model contract/native manager, platform ID helpers, existing state/navigation/theme components, tests/e2e, local plugins and scripts. Design/security/mission reports remain under `design/` and `spec/`. No public demo files were intentionally changed. The final delivery diff, evidence commit and preservation checks passed. The source/evidence push is independently verified in the [receipt](DELIVERY_RECEIPT.md); the receipt follow-up hash is supplied in the final session reply.

## Exact Windows PowerShell commands

Use one Android emulator/native operator. Coordinate browser checks separately when builds or tests share resources. These are reproducible launch/test commands; actual executed checks are listed above.

### Build and launch Android

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_AVD_HOME = 'F:\Android'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:JAVA_HOME\bin;$env:PATH"
$env:RNLLAMA_SKIP_POSTINSTALL = '1'
npm ci
npx expo prebuild --platform android --no-install --no-clean
npx expo run:android --device Pixel_10 --port 8082
```

Node 26.13.0, npm 11.20.0 and the installed Android Studio SDK/JBR were used in this environment. The runtime is built from source; the per-session skip flag avoids unnecessary prebuilt-artifact downloads. Initial native compilation can take several minutes. Generated `android/`, `.native-build/`, export outputs, model weights and APKs remain outside commits.

For an already installed APK, start Metro in one window:

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npx expo start --localhost --port 8082
```

In another PowerShell window:

```powershell
Set-Location 'D:\projects\BetweenUs'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_AVD_HOME = 'F:\Android'
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
adb reverse tcp:8082 tcp:8082
adb shell monkey -p com.oxieg3n.betweenus -c android.intent.category.LAUNCHER 1
```

On the Android 17 test emulator, allow the framework's requested debug local-network permission so it can reach Metro. If a development build points at another port, use its React Native developer menu to select `127.0.0.1:8082`, then restart that app. Do not alter global firewall/security settings.

Open Profile & settings → On-device conversation ideas for explicit optional model setup. Local templates remain usable without a download. Do not enter real personal information.

### Browser and automated checks

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npm run web
```

In the coordinated check session, stop any conflicting port-8081 preview first:

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npm run typecheck
npm run lint
npm test
npm run test:ui
npx expo install --check
npx expo-doctor
npm audit
npx expo export --platform web
npx expo export --platform android
```

Browser scenarios use installed Chrome, port 8081 and one Playwright worker. Browser accessibility checks support native review; they do not certify TalkBack or VoiceOver.

### Native workflow and capture reruns

With the current native APK and Metro running:

```powershell
Set-Location 'D:\projects\BetweenUs'
python .\apps\mobile\scripts\native-mission-checks.py --app-package com.oxieg3n.betweenus --port 8082 --theme both --section all
python .\apps\mobile\scripts\capture-mission.py --app-package com.oxieg3n.betweenus --port 8082 --theme both --section all
```

To require actual accepted native-model output during the journal capture, first complete the explicit model setup in the app, then run:

```powershell
python .\apps\mobile\scripts\capture-mission.py --app-package com.oxieg3n.betweenus --port 8082 --theme both --section journal --require-local-model
```

The capture scripts use real controls and ADB screenshots, verify the build, preserve previous run folders and write manifests. They reset fictional session data for test flows. Use one operator; inspect failures and images rather than treating saved files as a pass.

## Remaining prototype delivery and production gates

R12's full gate, clean APK installation, reviewed core/model/blocking/interaction evidence and both cold-app 200% cases passed. Both identified prototype findings are closed with the bounded coverage above. Source/evidence commit and feature-branch push succeeded and were independently verified, with the scan and preservation checks recorded in the [receipt](DELIVERY_RECEIPT.md). Historical failures and the unresolved original r8 timeout cause remain explicit. Initial Home discoverability, disclosed scroll framing and the enabled cash-out Request at zero free balance remain non-blocking polish; the domain rejects overspending. Failed runs and original screenshots stay preserved. The recorded evidence push is verified; this documentation follow-up is checked again before the final reply.

The prototype has no real authentication, family/age/consent verification, secure journal/finance persistence, encrypted key recovery, cross-device backend, operational messaging/notifications, report intake or provider-confirmed finance. Role switching is a fictional inspector. OS keyboards, process memory, screenshots and explicit clipboard exports are outside its confidentiality guarantees. No actual financial transfer is activated.

Physical Android cold/warm median/p95/peak-memory/thermal/offline testing, alternate IMEs, spoken TalkBack, macOS/iOS build and real-device VoiceOver remain unperformed. English heuristics and the small licensed model require broader adversarial and qualified child-safety review; a successful fictional example is not a safety benchmark. Native cache cleanup is requested/tested at the adapter boundary, not independently certified memory zeroization.

The next production phase is reviewed identity/consent and storage architecture, synthetic-account object-authorization tests, key/recovery/export/retention design, provider eligibility/reconciliation and staffed confidential abuse/safety operations. See [production release gates](PRODUCTION_RELEASE_GATES.md). Paid services, credentials, real child data, real transfers, deployment and main integration require the existing owner/security approvals; none is implied by this prototype report.

## Production-foundation continuation — 2026-11-16

This r12 report and its artifact/capture counts remain preserved prototype evidence. The separate `1116-ProductionFoundation-p3` candidate is app `0.4.1`, Android code `3` / iOS source build `3`, on `feature/production-foundation`. Root reported base HEAD `338630a` plus uncommitted UI changes; no final commit, signed release or publication is asserted. Release engineering remains incomplete, with native font/journal checks and final artifact/report work ongoing.

Read the [p3 production build handoff](../production/FINAL_BUILD_REPORT.md), [verification ledger](../production/TEST_RESULTS.md), [progress](../production/PROGRESS.md) and [exact debug Android launch](../production/ANDROID_LAUNCH.md). They distinguish current fictional/local managed-service evidence from r12 simulation and from unverified physical/iOS, hosted/push, signing, legal and operator release gates. The original prototype/public deliverable is unchanged by this documentation continuation.

## P3 verification follow-up — 2026-11-16, e77b725

The latest root-reported production checkpoint is `feature/production-foundation` HEAD `e77b725`, `1116-ProductionFoundation-p3` / `0.4.1`. Current local results are 926 SQL assertions across 19 files through 024, 55 backend units, 11 integration scenarios and mobile type/lint/256 units passed. Scoped emulator runtime now passes exact-send response-loss/cold-restart recovery, journal enrollment after outbox use plus autosave/save/reflection/background lock with synthetic fingerprint, and actual hot-font growth/words/focus/continued typing. There are 26 nonprivate screenshot files, 13/theme; no protected Journal/chat/Review capture bypass.

Latest full production browser rerun and actual native offline-Journal lease/export/erase are still pending; older 15/15 production and 19/19 demo runs are not the final-source result. The [current production handoff](../production/FINAL_BUILD_REPORT.md) and [test ledger](../production/TEST_RESULTS.md) retain exact limits, while [device/release gates](../production/SUPPORTED_DEVICES.md) remain open for physical/iOS/restore/signing/device-push/hosted/legal/operators. No final signed artifact, clean-tree delivery receipt, real data/transfer or public release is asserted. Original r12 evidence remains preserved above.

## Final local P3 follow-up — 2026-11-16

Latest local results: SQL 926/19 files through 024; backend 55 units/type/build and 11 integration; mobile 260/type/lint; Doctor 20/20, installed SDK check and both audits 0 vulnerabilities. Serial/cache-cleared production 16/16 (3.8 minutes) and demo 19/19 (2.1 minutes) passed; earlier concurrent-bundler startup failures remain private retained evidence. Scoped native 84-second outage/local Journal Save/normal idle lock/fresh readable review/typed fresh-biometric own erase passed, with journal file count 0 and synthetic emulator PIN cleared. Native absolute lease expiry was not tested.

Three viewed readable density retests on the same Pixel_10 followed recorded clipping; original 1080×2424/density 420/font 1.0 restored. [Current report](../production/FINAL_BUILD_REPORT.md), [test ledger](../production/TEST_RESULTS.md) and [original/retest size evidence](../qa/production/p3/device-sizes/) give the scope. Backend commit `467c530` records 023/024; final mobile/documentation delivery receipt is pending. The measured 125217918-byte classic debug APK hash is in the report; it needs verified current Metro JS and is not a signed embedded release. Historical r12/public demo remains unchanged; physical/iOS/push/hosted/signing/legal/operator gates remain open.

## Final source and keyboard receipt - 2026-11-16

Authenticated mobile integration is `07e333e`; final keyboard source is **`0c2d325`**, build `1116-ProductionFoundation-p3` / app `0.4.1`. Root reported mobile **260 units/typecheck/lint PASS after all fixes**, final post-keyboard production browser **16/16 PASS in 1.7 minutes**, demo **19/19 PASS in 2.1 minutes**, and Android/iOS Hermes plus six-route static web exports **PASS, exit 0**. SQL 926/19 files, backend 55/type/build and 11 integration results retain their scope. JS export does not establish native iOS or signed-release qualification.

The small Android IME defect was reproduced, then the measured-top padding fix passed: full 104 px / 52 dp textbox, 98 px Review, and an actual Review tap reached Send reviewed message **without sending**. Original emulator profile/font restored. Latest visual inventory is **30 themed originals, 15/theme**, six resize originals, six comparison pairs and two contact sheets; protected private screens were not captured. Earlier failures and pending snapshots above remain historical. Native absolute Journal lease expiry, physical/iOS/restore/signing/push/hosted/legal/operator gates remain open; release engineering is incomplete. Final documentation commit/push remains root's receipt. [Production ledger](../production/TEST_RESULTS.md), [handoff](../production/FINAL_BUILD_REPORT.md), [keyboard evidence](../qa/production/p3/device-sizes/keyboard-results.json).

## Verified production feature delivery ? 2026-11-16

Origin feature/production-foundation verified at920cf3cceb7e3fbe460e01f64e550da1e6c079bb; tested application source0c2d325. Source/reports/actual native images pushed successfully after preserving CI as an inactive owner-installable template (credential lacks workflow scope). Original unpublished commit e271973 retained locally at backup/production-workflow-e271973. Working tree clean apart from intentionally preserved diagnostic; docs/index and r12 history unchanged. No main merge, force push, CI execution, real-child enrollment or production deployment. See [final delivery receipt](../production/DELIVERY_RECEIPT.md).
