# Current Android design review

Current application: **1115-FamilyEnvelopes-Journal-r12**, branch `feature/mobile-foundation`, runtime code commit `8607573`. R12 closes a reproduced incoming-message bypass after one fictional author blocked the other. It also denies new check-in schedules for that exchange, preserves author-owned blocks across parent contact administration and excludes unavailable journal recipients.

All evidence below contains actual Android ADB captures, original PNG hashes and fictional examples. Earlier images retain their original build identifiers. A browser render, generated image or diagnostic probe is never presented as the mobile application.

| Evidence | Original screenshots | Scope and limits |
| --- | --- | --- |
| [R12 cold-app 200% text](../chores-goals/1116-r12-large-text-warm-software/QA_REPORT.md) | 12 | Both themes: Home/navigation, goal, full matching Confirm/Cancel, appearance persistence and verified restoration; warm SwiftShader OS, not hot draft retention |
| [Final handoff](../chores-goals/1116-r12-final-handoff/QA_REPORT.md) | 2 | Main app on Sam Home, actual Follow Device; original power settings restored and AVD configuration hash unchanged; not extra functional cases |
| [R12 accepted native journal](../journal-intelligence/1116-r12-journal-native/VISUAL_QA_REPORT.md) | 12, 6/theme | Existing verified model asset loaded; actual accepted On-device output, explicit recipient and exact Review without Send; all originals independently reviewed |
| [R12 core visual review](../chores-goals/1116-r12-open-letter-core/VISUAL_QA_REPORT.md) | 48, 24/theme | All twelve required categories, actual schedule Save/new child invitation, neutral Skip, complete contact/removal controls, scrolled Home finance entry and four current comparison sheets |
| [R12 bidirectional blocking](../chores-goals/1116-r12-bidirectional-blocks/QA_REPORT.md) | 14 | Four actual author/theme block cases, messaging and new-schedule denial, safe-adult practice, preference restart persistence; all originals reviewed |
| [R12 native interactions](../chores-goals/1116-r12-native-interactions/QA_REPORT.md) | 12 | Both-theme exact journal typing/Save/revisit, IME-open Review, edited words, simulated Send, native Back and preference persistence; originals reviewed |
| [Core visual review, r5](../chores-goals/1115-r5-open-letter-core/VISUAL_QA_REPORT.md) | 26, 13/theme | All twelve required core categories plus scheduler preview; approved logo, editorial hierarchy, light/dark |
| [Journal native-model review, r5](../journal-intelligence/1115-r5-journal-native-v2/VISUAL_QA_REPORT.md) | 12, 6/theme | Accepted native wording, explicit recipient selection and exact Review without Send |
| [Family Savings Envelopes, r6](../chores-goals/1115-r6-family-envelopes/VISUAL_QA_REPORT.md) | 50, 25/theme | Chores, approval, goals, shared $20 cap, reveal/funding separation, partial reported payout, history |
| [Native usability, r7](../chores-goals/1115-r7-native-usability/QA_REPORT.md) | 56 | Four viewport overrides on one AVD; writing/keyboard/review/Back and preference persistence; historical caption issue documented |
| [Core supplement, r7](../chores-goals/1115-r7-core-supplement/VISUAL_QA_REPORT.md) | 22, 11/theme | Complete contact/removal controls, reflection/practice, neutral Skip, actual schedule Save/new child invitation |
| [Clean r11 viewport checks](../chores-goals/1115-r11-native-usability-v2/QA_REPORT.md) | 23 | Seven LIGHT cases passed, including strict tablet/phone roundtrip, exact draft and opaque UUID; overall run failed later and is not a both-theme pass |
| [R11 large-text attempt](../chores-goals/1116-r11-large-text-v3/QA_REPORT.md) | 6 | LIGHT 200% case passed; DARK capture corrupted; overall failed with device overrides restored |
| [SwiftShader retry](../chores-goals/1116-r11-dark-large-text-swiftshader/QA_REPORT.md) | 1 | Actual System UI ANR obstructed DARK startup; no functional pass; overrides restored |

R12 targeted ordinary-phone blocking and interaction checks passed with independently reviewed evidence above. All 48 current core originals and four derived comparison sheets are independently verified. The accepted-model recapture also passed both themes, with all twelve originals independently verified. The isolated current 200% retry also passed in both themes after 86 stable ordinary-phone captures on warm SwiftShader. Twelve font originals are independently verified. Together with two master-reviewed handoff images, current evidence contains 100 original Android captures and four derived comparisons. See the [build report](../../mission/BUILD_REPORT.md) and [automated gate](../../mission/AUTOMATED_QA.md) for actual outcomes. No further stress run is needed for this scope. The scoped r12 cold-app DARK 200% case is now passed; prior corruption/ANR evidence remains preserved and the underlying cause is unproven.

## Full-viewport comparisons

These four sheets use the current r12 originals: Safe Harbor left, Night Harbor right, labels outside both complete 1080 x 2424 viewports. No scaling/cropping or pixel alteration hides defects. Each 2216 x 2540 sheet contains both full 1080 x 2424 viewports, with no resizing/cropping. All eight embedded decoded pixel buffers were verified against the originals. Earlier r5 sheets remain preserved in the historical core report.

- [Home](../chores-goals/1116-r12-open-letter-core/core/comparisons/home-side-by-side.png)
- [Journal](../chores-goals/1116-r12-open-letter-core/core/comparisons/journal-side-by-side.png)
- [Active conversation](../chores-goals/1116-r12-open-letter-core/core/comparisons/conversation-side-by-side.png)
- [My Circle/navigation](../chores-goals/1116-r12-open-letter-core/core/comparisons/navigation-overview.png)

## Defects and remaining review gates

Native QA corrected Windows object-path length, slow JavaScript model hashing, moved-file cleanup, observed text-entry mismatch mitigation, Hermes BigInt currency formatting, density-triggered Activity recreation and stale native Stack frames. R11 uses public state updates on the existing attached PUSH Screen; no screen replacement, private-content persistence or vendor patch. Original Stack navigation is retained. Clean LIGHT roundtrip evidence verifies a readable complete journal privacy caption and UUIDv4 reference after private/parent activity. The later current r12 warm-software run establishes the scoped cold-app 200% cases in BOTH themes. It does not establish physical-device, spoken accessibility or hot font-change draft success.

The capture harness also rejected a real stale-accessibility-dump hazard using unique files and three bounded regression tests. Existing failed runs are preserved, including the reverted r10 navigation experiment. Host-GPU corruption and the later cold-boot System UI ANR remain observed historical failures. Neither reproduced in the completed warm r12 campaign; their root cause is still unproven.

Finance discovery is below the first standard-phone viewport, a nonblocking polish item. The r7 intended Home-finance photos did not actually show the control. Genuine r12 supplemental captures now show the complete Home finance button/explanation in BOTH themes, closing that framing gap. The core report retains nonblocking framing limits: the secondary teacher starter is not fully framed, and the saved-schedule banner begins above the scrolled viewport; action logs and the new child invitation separately confirm Save. Physical model benchmarks, hot font-change draft preservation, TalkBack and iOS remain unperformed. Browser axe checks and screenshots cannot certify those capabilities. See [production gates](../../mission/PRODUCTION_RELEASE_GATES.md).
