# Open Letter core visual QA — r5

Status: **all 26 core originals reviewed; four comparison sheets verified**. The [capture manifest](capture-manifest.json) now records `completed: true`, `error: null`, 13 light records and 13 dark records. The initial light checkpoint was written while dark capture was in progress. Later supplementary evidence is linked below with its own r7 source/build identity; this r5 report does not declare the whole application passed.

## Capture identity and integrity

| Item | Recorded value |
| --- | --- |
| Build | `1115-FamilyEnvelopes-Journal-r5` |
| Source HEAD | `afca46fa881b6c17b40c2c32bee9d97cd45c3554` |
| Branch / root | `feature/mobile-foundation` / `D:\Projects\BetweenUs` |
| Tracked app source | Clean in manifest; tracked diff SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Emulator | Pixel_10; `sdk_gphone16k_x86_64`; Android 17 |
| Resolution / density | 1080 x 2424 original PNG pixels; physical density 420 |
| App / device | `com.oxieg3n.betweenus` / `emulator-5554` |
| Capture method | Actual ADB screencap/pull by the serialized root operator |
| Local model requested in this core run | No; journal model evidence belongs to its separate run |

The reviewer individually inspected all 13 light and all 13 dark originals and independently recalculated every SHA-256 value and PNG IHDR dimension. All 26 matched the manifest and 1080 x 2424. No original was edited, cropped, rescaled or overwritten. Metadata above comes from the native capture manifest; this reviewer ran no Git or ADB commands.

## Light originals reviewed

| Original | Pixels | Independently verified SHA-256 |
| --- | --- | --- |
| [appearance-settings.png](core/light/appearance-settings.png) | 1080 x 2424 | `9becb36b5f04f2718f7850212d6f774b7f4dd54e2a61cb7522598e5b144ba52a` |
| [child-home.png](core/light/child-home.png) | 1080 x 2424 | `a67eeaf6a1afcea38ae52ceb8cec1049e0822051025483cccb274d3ab54d7878` |
| [journal-overview.png](core/light/journal-overview.png) | 1080 x 2424 | `2eb2b7f943c084177466213a155222825eb7730f4680a760cecb5d9408e4dcac` |
| [journal-editor.png](core/light/journal-editor.png) | 1080 x 2424 | `2705b5f963fefcb38d961d8e43caa44443cbd2bd520d3f78afb3b358ce76e097` |
| [journal-reflection.png](core/light/journal-reflection.png) | 1080 x 2424 | `74e12342d7c6cb08251035aebb79c85ad707082ff73b748768b1db89c5168d60` |
| [conversations.png](core/light/conversations.png) | 1080 x 2424 | `acad5521be7a2fa802723bb9075b66a80fc424e44d9ef3f298a9c0e199d606c4` |
| [active-conversation.png](core/light/active-conversation.png) | 1080 x 2424 | `c406651e41c95910aeaf21407596df7da9e3aba2c215e5d9ff709231e30f9d9b` |
| [my-circle.png](core/light/my-circle.png) | 1080 x 2424 | `dafb3ad69dac240331ab05b71b583f57772459020877e74b462e04cc6b490ef1` |
| [parent-home.png](core/light/parent-home.png) | 1080 x 2424 | `ae0fe681ccc894a183878e8f8dc8795d09cd5f5d47192979504fd829eacf75d0` |
| [parent-contacts.png](core/light/parent-contacts.png) | 1080 x 2424 | `be2640a69108678b524dff3b861b50e7135a49aefeb63b16b62873af81ecc68b` |
| [checkin-scheduler.png](core/light/checkin-scheduler.png) | 1080 x 2424 | `9b76cf4510181d6be5f40ae70e66d1c4247f8436404c089092f85046bb08d7b6` |
| [checkin-scheduler-preview.png](core/light/checkin-scheduler-preview.png) | 1080 x 2424 | `a5425ecdb69c0dda03a3f026f8364d1f6588c18f1d038473b1e3d4a5f67c1694` |
| [child-checkin.png](core/light/child-checkin.png) | 1080 x 2424 | `f29d315d21892000f97b5f3b72969a2320734e3ba3aa4cba4ae2665286cacda3` |

## Observed visual results

Home gives the editorial headline and **Talk to someone** clear priority. Parent and child copy differ without changing navigation. The exact approved symbol remains compact in the header. Ivory, Ocean Blue, restrained Peach and Deep Slate form a consistent light theme; the screenshots do not use a pastel-card dashboard or decorative gradients.

Journal overview has a clear New entry action, visible author-role privacy wording and a readable entry list. The saved editor uses one quiet writing surface with a visible disabled **Saved in this session** state. Text wraps without missing glyphs or clipped lines in the inspected viewport. The reflection area remains below writing rather than covering it.

Conversations use an ordinary recipient row and identifiable preview/time. The active conversation distinguishes incoming and outgoing bubbles, labels simulation, and keeps the empty composer and disabled Review action above bottom navigation. These keyboard-closed images do not establish keyboard avoidance.

My Circle uses contact rows with recognizable names, relationship and connection state. Parent contact detail clearly says an invited connection cannot receive messages and that approval alone does not establish identity/acceptance. This is visual evidence of the boundary wording, not a performed authorization test.

The scheduler separates recipient, question and day/time choices. Its preview clearly shows Friday at 17:00, simulated delivery and **Save example schedule**. The child check-in visibly offers Write my response, Can we talk?, Answer later and Skip without a score or penalty. This run has not yet demonstrated an actual Save or Skip action.

Appearance shows all three options with the captured theme selected through a border/fill and explicit Selected wording. Headers, back controls, settings access, bottom labels and the Android gesture area remain visible. No overlapping fixed navigation controls or missing brand/font glyphs were observed in the 26 images at the recorded size. Partial scroll content is listed below rather than treated as a fully reviewed control.

## Findings and follow-up evidence

| ID | Finding | Effect / follow-up |
| --- | --- | --- |
| C1 | Reflection framing stops after **You choose the person**; source label, actual draft and prepare actions are below this viewport. | Additional lower-panel capture is needed in both themes. This image alone cannot verify the displayed suggestion. |
| C2 | Parent contact detail shows the invited boundary and a partially visible Block control; remaining management/report/removal controls are below the fold. | Capture the scrolled controls and relevant confirmation later. No failure to scroll or manage was established by this review. |
| C3 | Home shows the **Small tasks, personal plans** heading near the bottom, while the Chores & Goals action is below the initial viewport. | Discoverability refinement: review placement during usability testing. A supplementary lower-Home image should show the actual entry action. |
| C4 | My Circle's in-person practice action begins at the viewport edge below the visible contact list. | A scrolled capture is needed to review the complete action; this is not proof of a persistent overlap. |

The long-form screens require scrolling. Their partial viewport content is documented rather than cropped away. No source fix or recapture was performed by this reviewer. These were the original r5 findings. The r7 supplement update below closes C1/C2/C4 framing gaps; C3 remains open. No full-screen redesign was established by the original framing gaps.

## Dark originals reviewed

| Original | Pixels | Independently verified SHA-256 |
| --- | --- | --- |
| [appearance-settings.png](core/dark/appearance-settings.png) | 1080 x 2424 | `769b9b416faeb7c195a49a0610cce819b98ac079fc66efc39604c5516be9a836` |
| [child-home.png](core/dark/child-home.png) | 1080 x 2424 | `17bf8bb251d26d08efaa63fb46ca433868e6c5e5f22dcd8706bbe098ada9b5e8` |
| [journal-overview.png](core/dark/journal-overview.png) | 1080 x 2424 | `8d78c72aaddb48266513e2e7267dd0f8acde0f5b4cac89a5f145978c42f900ea` |
| [journal-editor.png](core/dark/journal-editor.png) | 1080 x 2424 | `4d80f8f5289a63334daa77b8f3e23334c8b72f2b5b3acf533e07384bc3768bbc` |
| [journal-reflection.png](core/dark/journal-reflection.png) | 1080 x 2424 | `90f57276c3172cd5d0ff5e22137e1b79791b5a61c07d7097facaa1ea8d11cf62` |
| [conversations.png](core/dark/conversations.png) | 1080 x 2424 | `0a67d2ec4d00ebfdc38fde10317702f6cd62ceda12ab3ca225e6c79e04770dbe` |
| [active-conversation.png](core/dark/active-conversation.png) | 1080 x 2424 | `6aba3b076c72f5edcc83949aff3a09ed4a0f45eecc6f044592f606cffbbe8dc2` |
| [my-circle.png](core/dark/my-circle.png) | 1080 x 2424 | `0cc0d94985a09a2984d03373ba146c86ffde5c32f16b3c8bd85636a583a1bdc6` |
| [parent-home.png](core/dark/parent-home.png) | 1080 x 2424 | `94e9813afe3bd48ee19840c4dd5de5c5db2514b72dacd665ca5fe3c28c70ddc8` |
| [parent-contacts.png](core/dark/parent-contacts.png) | 1080 x 2424 | `5d3e3c9be9f724aadd20c7bced253e0e58f677f03d378066c9c3e0d42dad917c` |
| [checkin-scheduler.png](core/dark/checkin-scheduler.png) | 1080 x 2424 | `af4b84fd4720922321d2862ee41d8fbb1e26a02cb97da5d96118c1726253cb4a` |
| [checkin-scheduler-preview.png](core/dark/checkin-scheduler-preview.png) | 1080 x 2424 | `325d090ff6895465c448315a2428ef18f43c72e792890a151fb4bac089ab1822` |
| [child-checkin.png](core/dark/child-checkin.png) | 1080 x 2424 | `eb913701d286118f7aaca8f54cafcce77df8d176bb05dd7e45bc455aebba5aa5` |

Night Harbor preserves the same page hierarchy and navigation, with soft slate backgrounds, slightly lighter writing/form surfaces, pale primary text and restrained Mist actions. Inputs, message bubbles, day selectors, schedule preview and Appearance controls all use the dark theme. The ivory backing behind the approved symbol preserves its dark outlines; it is intentional brand presentation. No unrelated white form panel or light-theme chat bubble was observed. These are visual observations, not measured contrast certification.

The dark scheduler preview shows every day choice, selected Friday, 17:00, the simulated preview and the complete Save example schedule button. The dark child check-in exposes all response choices, including Answer later and Skip. The parent contact view and reflection have the same below-fold evidence gaps as light.

## Full-viewport comparisons

Generated with the existing `apps/mobile/scripts/open-letter-comparisons.ps1` after the completed manifest was checked. Each sheet is **2256 x 2606**, with light on the left and dark on the right. Each original viewport remains **1080 x 2424**: left origin (32, 150), right origin (1144, 150). An independent System.Drawing pixel-buffer comparison checked every pixel in both embedded viewports against its original; all eight comparisons passed. Labels and margins are outside the captured viewports. The four sheets were also visually inspected.

| Sheet | Original screen | PNG SHA-256 |
| --- | --- | --- |
| [home-side-by-side.png](core/comparisons/home-side-by-side.png) | Child home | `68449332afe9e77b69d139497a65b4f1bf61ac603de8a21ab6bab682ee6796f5` |
| [journal-side-by-side.png](core/comparisons/journal-side-by-side.png) | Journal editor | `9a81e6ae887c2e14f56d2b635f9eec18396aeb613684c303bb8fc49a05e78ed8` |
| [conversation-side-by-side.png](core/comparisons/conversation-side-by-side.png) | Active conversation | `2b999c952a8a2a64e6b1055d2f401a5f6824251dd7a12fd05ec853d2db9c90d7` |
| [navigation-overview.png](core/comparisons/navigation-overview.png) | My Circle and navigation | `27fd98e23838589408a29c39899fce1552ade42c82563a7ae3f34a3c91f0f7a9` |

The pairs retain similar fictional content; native status-bar times and simulated message timestamps differ because the themes were captured sequentially. No original screenshot was altered to align these differences. Original hashes were rechecked after comparison generation.

## Build and test scope

These remain **r5** captures of source `afca46fa881b6c17b40c2c32bee9d97cd45c3554`. The master reported a separate r5 finance-entry crash involving Hermes Intl formatting of BigInt. A subsequent r6 money-format compatibility fix does not change these core layouts, but its finance and usability tests must be reported against r6. Successful capture of these core pages does not establish that the r5 financial screens worked.

## Later r7 supplement evidence

The [r7 core supplement review](../1115-r7-core-supplement/VISUAL_QA_REPORT.md), source `8c89c899ada444dcb4a543a377f780e9b61db0ed`, independently inspected and verified 22 actual 1080 x 2424 PNGs in both themes. It closes C1's missing reflection source/first draft/prepare view, C2's lower parent controls and removal-confirmation framing, and C4's complete Circle practice-action framing. Those are later r7 screenshots; the original r5 PNGs and four comparison sheets remain unchanged.

C3 remains open. The two r7 files named home-finance-entry still show the initial viewport and do not expose the Chores & Goals label despite the manifest description. Phone discoverability remains polish work and true lower-Home phone evidence is still needed. The supplement also records actual native Skip and parent Save, with neutral skip feedback, simulated notification disclosure and the child's new fictional invitation. It does not prove real scheduled delivery. See the supplement for the precise per-finding boundaries and screenshot links.

The separate r7 live-density editor privacy-label P2 remains open in the [native usability report](../1115-r7-native-usability/QA_REPORT.md). No r8 correction or targeted retest is claimed here.

## Validation boundary

This reviewer performed visual inspection and file-integrity checks only. TalkBack speech, keyboard-open behavior, focus order, text scaling, reduced motion, small/large phone/tablet layouts, actual Save/Skip and destructive confirmations were not tested here. The root operator is responsible for supplementary captures and real interaction tests separately. Browser checks and earlier reports retain their own source/build provenance; they are not relabeled as tests of these captures.
