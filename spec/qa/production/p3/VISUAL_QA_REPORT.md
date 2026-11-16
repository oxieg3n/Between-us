# Production p3 visual evidence

2026-11-16. All 30 supplied originals have been visually inspected: 15 Safe Harbor/light and 15 Night Harbor/dark. Their pixels match the screen labels; none is a stale Home capture. The final child Home comparison uses only the settled font 1.0 pair, with matching typography and unobstructed navigation. Earlier Home captures remain regression evidence. `conversations.png` shows the conversation **list**, not an active protected conversation. The [source manifest](SCREENSHOT_MANIFEST.json) records dimensions and SHA-256 hashes.

Root supplied capture provenance: build `1116-ProductionFoundation-p3`, HEAD `e77b725`; Pixel_10, API 37 / Android 17, x86_64, 1080 x 2424, density 420. These identifiers were not independently queried during this organization task. The p3 label is visible in the list and Appearance captures. Data shown is fictional; no credentials are visible.

Subsequent owner-reported source receipts are `07e333e` for preceding native changes, `467c530` for backend changes and `0c2d325` for the final measured keyboard-frame fix. The original screenshot provenance remains unchanged. See Root's [native interaction report](NATIVE_QA_REPORT.md) for the separate device checks and their limits.

## Comparisons

Every pair places **light on the left, dark on the right**. Original 1080 x 2424 viewport pixels, including Android status/navigation bars, are copied unscaled; labels sit outside the frames. No originals were replaced, cropped, retouched or generated. Root approved System.Drawing as a lossless composition fallback because neither installed Python interpreter had Pillow; no package was installed.

- [Child Home and navigation](comparisons/home-child.png): settled font 1.0 sources only.
- [Parent Home and navigation](comparisons/home-parent.png).
- [Child Circle](comparisons/circle-child.png): available alternative to capture-protected Journal, explicitly labelled Circle.
- [Conversations LIST](comparisons/conversations-list.png).
- [Profile and Appearance](comparisons/appearance.png).
- [Child finance overview](comparisons/finance-child-overview.png).

The [light contact sheet](comparisons/contact-sheet-light.png) and [dark contact sheet](comparisons/contact-sheet-dark.png) include all 30 themed sources as labelled overview thumbnails. Only these thumbnails are reduced; use originals or full-resolution pairs for detail. Both updated sheets and the new Home pair were visually inspected. All original hashes remained unchanged during composition.

## Findings and evidence limits

| Finding | Evidence and next action |
| --- | --- |
| Brand adaptation issue: the approved symbol has a conspicuous white square backplate in Night Harbor. | Visible throughout the dark set, including [Appearance](dark/appearance-settings.png) and [settled child Home](dark/child-home-settled.png). Root was notified. Review its dark-theme presentation while preserving the approved symbol; no asset was altered here. |
| Earlier child Home captures are unsuitable for the final theme comparison. | The original [dark child Home](dark/child-home.png) has larger typography and partially obscured Continue-with-Sam text compared with [light](light/child-home.png). The intermediate font 1.0 [dark capture](dark/child-home-current.png) has a real LogBox warning toast over navigation. These originals remain unchanged; the [settled pair](comparisons/home-child.png) resolves both comparison limitations without retouching. |
| Scheduler captures use different scroll offsets. | [Light](light/checkin-scheduler.png) shows the upper editor; [dark](dark/checkin-scheduler.png) additionally shows all weekday buttons, 17:00 and America/New_York. Both are genuine editor screens, but they cannot establish position-by-position theme parity. |
| Several lower form/card controls are outside the captured viewport. | Circle, contact addition, chores and scheduler views show part of their scroll content. Full-viewport capture is intentional; scrolling reachability cannot be inferred from these stills. |

Visible text, buttons and selected theme/tab treatments are distinguishable in the inspected frames. No red bundle error or failed ReactHost black screen appears in this set. Root separately observed recovery from the earlier red/black loading outage; that earlier failure remains part of the QA history.

Root reports an actual hot-font 2.0 change increased heading height from 92 to 112 px without losing the same draft or focus. The final 1-to-2-to-1 font-scale round trip retained words and focus and accepted appended text. This task did not rerun those interactions. The Home resize evidence below covers three profiles on one emulator; it does not establish all-screen behavior or a full accessibility pass.

### Home resize checks

All six actual before/after PNGs were visually inspected. Root resized the single Pixel_10 emulator rather than testing three physical devices, then restored 1080 x 2424, density 420 and font scale 1.0. These extra sources are recorded separately in the manifest and are outside the 30 themed-source count.

| Profile | Before | Retest | Visible result |
| --- | --- | --- | --- |
| Small phone: 720 x 1280, density 320 | [PNG](device-sizes/small-phone-home.png) | [PNG](device-sizes/small-phone-home-retest.png) | Before: Help reads only "Hel" and navigation is cut off. Retest: all four navigation labels and Help are readable. One reviewer perceived an extra glyph beside Help; Root's repeated direct inspection did not corroborate it and no separate text node surfaced. This remains an unconfirmed subjective concern, not a proven runtime defect or handoff blocker. |
| Large phone: 1440 x 3120, density 480 | [PNG](device-sizes/large-phone-home.png) | [PNG](device-sizes/large-phone-home-retest.png) | Help, all navigation labels and Home content are readable in both captures. |
| Tablet: 1600 x 2560, density 240 | [PNG](device-sizes/tablet-home.png) | [PNG](device-sizes/tablet-home-retest.png) | Before: navigation label text is clipped. Retest: Home, Journal, Chats and Circle are fully readable. Main content remains a bounded central column. |

The [initial interaction results](device-sizes/interaction-results.json) report all navigation labels even when the initial small/tablet pixels clip them, demonstrating why the screenshots matter alongside UI metadata. The [retest results](device-sizes/interaction-retest.json) record the revised bounds. Root attributes the repaired clipping to stale native text across density changes and reports adding display scale to the adaptive text-host identity. Source changes were outside this task.

Root then found a separate real small-screen chat keyboard defect: with the IME visible, Review occupied y=948-1046 beneath the keyboard, and tapping did not reach review. Root reports correcting the shared measured frame with padding on both platforms and a compact chat header while typing. In the final actual 720 x 1280 / density 320 check, the IME was visible, the full text field was at `[32,386][688,490]` (104 px / 52 dp high), and Review was at `[32,552][688,650]`. An actual tap reached the **Send reviewed message** controls; no send was performed. Words also survived the density change. The [keyboard result JSON](device-sizes/keyboard-results.json) records keyboard visibility, bounds, review reached and `messageSent: false`; Root's [native report](NATIVE_QA_REPORT.md) supplies the interaction context. All original screen size, density and font settings were restored.

This keyboard evidence is metadata plus owner-observed interaction, not a new private-screen capture. The image inventory remains **30 themed PNGs plus 6 Home resize PNGs**. Comprehensive keyboard/orientation/accessibility qualification, physical devices and native public-release readiness are not established.

Root also reports separate native checks: an 84-second loopback 503 outage left the already-unlocked Journal editable and local Save confirmed; normal routing was restored; normal two-minute inactivity locked the journal. After fresh online biometry, Root confirmed the saved offline entry through its selected own saved page in memory. Whole-vault deletion required typed `DELETE` plus fresh biometry, then the native journal file count was 0. The synthetic emulator PIN was cleared after vault deletion. No entry or PIN value is reproduced here. Native absolute lease expiry was not tested; unit/SQL coverage does not substitute for that check. Physical biometry remains unverified.

Owner-reported broader checks are 16 production browser tests passing in 3.8 minutes, 260 mobile tests plus type/lint passing, Expo Doctor 20/20, install check passing and zero findings in both npm audits. These are reported checks, not an independent security certification. The reported final debug APK SHA-256 is `5FBBC33431E84B401B0FBEA137E646A3D3D6BF1EAB8767C180E1F811F4DFE594`. This debug build requires Metro; JavaScript is not an embedded signed release. These results and the APK hash were supplied by Root, not rerun or independently measured during screenshot organization.

## Original screen inventory

| Label | Light original | Dark original | Actual visible screen |
| --- | --- | --- | --- |
| Child Home, settled font 1.0 | [PNG](light/child-home-settled.png) | [PNG](dark/child-home-settled.png) | Alex greeting, matching typography and complete navigation; final comparison sources. |
| Child Circle | [PNG](light/my-circle.png) | [PNG](dark/my-circle.png) | People you choose; My contacts selected, Sam contact card. |
| Conversations | [PNG](light/conversations.png) | [PNG](dark/conversations.png) | List heading, new/refresh/recovery actions and Sam conversation preview; Chats selected. |
| Appearance | [PNG](light/appearance-settings.png) | [PNG](dark/appearance-settings.png) | Profile & appearance with the matching theme selected, account/privacy and notification actions. |
| Child envelopes | [PNG](light/child-envelopes.png) | [PNG](dark/child-envelopes.png) | Alex's financial plans, manual-record disclaimer, fictional $15.00 earnings and section choices. |
| Child chores | [PNG](light/child-chores.png) | [PNG](dark/child-chores.png) | One thing at a time, completion-note field and approved fictional chore card. |
| Child check-in | [PNG](light/child-checkin.png) | [PNG](dark/child-checkin.png) | An open door, optional invitation controls, no new invitations and local question section. |
| Child contact request | [PNG](light/child-contact-request.png) | [PNG](dark/child-contact-request.png) | Circle Add/request selected; known-person introduction; lower fields below viewport. |
| Parent Home | [PNG](light/parent-home.png) | [PNG](dark/parent-home.png) | Sam greeting, writing/contact actions, guardian check-in wording and Home navigation. |
| Parent Circle | [PNG](light/parent-circle.png) | [PNG](dark/parent-circle.png) | People you choose; Alex contact card, My contacts selected. |
| Parent contacts | [PNG](light/parent-contacts.png) | [PNG](dark/parent-contacts.png) | Circle Add/request selected; known-person introduction; parent-specific controls not visible in this viewport. |
| Parent check-in overview | [PNG](light/checkin-overview.png) | [PNG](dark/checkin-overview.png) | No saved schedules, private child skip explanation and New check-in schedule action. |
| Parent scheduler | [PNG](light/checkin-scheduler.png) | [PNG](dark/checkin-scheduler.png) | A question, not an obligation editor with Alex recipient and question; differing scroll offsets. |
| Child Home, original regression | [PNG](light/child-home.png) | [PNG](dark/child-home.png) | Alex greeting and Home tab; dark typography mismatch retained as provenance. |
| Child Home, font 1.0 / intermediate | [PNG](light/child-home-current.png) | [PNG](dark/child-home-current.png) | Matching Home layout; dark warning toast overlaps navigation, excluded from final pair. |

## Protected and historical evidence

Journal, active conversation and Review are intentionally capture-protected through the native privacy/FLAG_SECURE path. Their absence is not a blank replacement screenshot or evidence of a failed render. No capture bypass was attempted and no protected pixels were fabricated. Their appearance and protected interactions require Root's separate permitted device observation; the Circle pair above is expressly an alternative available screen.

The two existing files under `regressions/` remain untouched historical stale-font evidence: [parent Home](regressions/parent-home-stale-font.png) and [Appearance](regressions/appearance-stale-font.png). They are excluded from the 30 themed-source count and comparison selection. The older `child-home.png` and intermediate `child-home-current.png` files remain untouched at their original paths, included in the inventory and contact sheets as regression evidence.

### Additional historical p1/p2 inspection

Before the preserved evidence handoff, all **11 additional PNGs outside p3** were opened and visually inspected individually: nine p1/light and two p2/light. No entered passwords, access/session/verification tokens, private keys, unrelated screens or apparent real personal data were visible. Content was consistent with the known fictional Sam/Alex fixtures: a generic saved fixture message, synthetic financial amounts and fictional conversation labels/identifier suffixes. This is a visual inspection of the supplied captures, not an independent verification of data origin.

| Historical set | Individually inspected originals |
| --- | --- |
| p1/light: 9 PNGs | [Parent Home](../p1/light/parent-home.png), [parent contacts](../p1/light/parent-contacts.png), [My Circle](../p1/light/my-circle.png), [family envelopes](../p1/light/family-envelopes.png), [conversation list](../p1/light/conversations.png), [check-in scheduler](../p1/light/checkin-scheduler.png), [check-in overview](../p1/light/checkin-overview.png), [Appearance](../p1/light/appearance-settings.png), [active conversation](../p1/light/active-conversation.png). |
| p2/light: 2 PNGs | [Parent Home](../p2/light/parent-home.png), [conversation list](../p2/light/conversations.png). |

The p1 financial selector contains clipped fixture-label text, and its scheduler capture shows only the beginning of the editor. The p1 active-conversation image visibly contains a generic saved fixture message and an empty composer; it is historical evidence, not evidence that the current p3 protected chat can be captured. All 11 originals remain unchanged and are excluded from the p3 counts, comparisons and manifest.

This task only organized existing images and recorded their limits. It ran no ADB/emulator commands, app/service operations, source edits, Git commands or automated tests.
