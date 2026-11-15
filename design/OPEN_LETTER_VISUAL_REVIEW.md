# Open Letter visual design review

Final build under review: `1114-OpenLetterRedesign-r3`. Frozen application source: `1e640665d01d854a7245f40b42237e00e8582a01`. R2 source was `0707b124ebf53b676f24fb637a6c28bb002f8436`; its evidence is archived under `spec/qa/open-letter/baseline-0707b12-r2/`. Initial baseline source was `ed96bd13a7c2ad312bc973a1e0920df93d851c3b`, archived under `baseline-ed96bd1/`.

Status: all 36 final R3 Android captures were inspected: 24 required screens, two scheduler previews and ten supplemental action/build captures. All four regenerated comparison sheets were also inspected. No remaining blocking visual defect was identified in the observed states. The prior keyboard-open and 200% font failures are visibly corrected in their fresh R3 evidence. One nonblocking tablet rail refinement remains documented below.

This is a read-only design review of actual Android captures. It supplements the execution record in `spec/qa/open-letter/VISUAL_QA_REPORT.md`; it does not replace native interaction testing or accessibility testing.

## Review criteria

- Home has a short greeting, editorial phrase and one clear conversation action. Secondary writing, circle and contextual check-in choices remain quieter.
- Journal overview is a readable list. The editor gives writing most of the space, with an obvious Save action and visible prototype privacy wording. Paper treatment remains selective.
- Chats use understandable people, previews and message bubbles rather than feature cards. Incoming/outgoing contrast, composer reachability and selected navigation remain clear.
- Circle uses rows and meaningful relationship/status labels. Parent management controls remain discoverable without resembling a dashboard.
- Check-ins communicate invitation and choice. Skip/later controls remain readable; scheduling never implies real delivery.
- Safe Harbor and Night Harbor retain the same hierarchy, margins and interaction meaning. All visible layers and inputs follow the current theme.
- Native serif headings render correctly. Body text, wrapping, icon labels and metadata remain legible. Look for clipping, overlap, missing glyphs and overlong word breaks.
- The compact approved symbol remains recognizable. Interface borders stay quiet. No pastel-card grid, excessive pills, shadows, gradients or ornamental motion is introduced.
- Top and bottom safe areas, Back controls and persistent four-tab navigation are visible where applicable. Keyboard and large-text concerns require additional actual interaction evidence.

## Observed evidence

The initial native onboarding capture at [initial-native.png](../spec/qa/open-letter/initial-native.png) was inspected. The serif heading renders, body copy wraps without visible clipping, the approved logo appears, and both fictional-role actions are visible. This single preliminary capture cannot establish the quality of the required 24-screen theme set.

## Inspected required captures

| Capture | Result and observed limits |
| --- | --- |
| [Safe Harbor appearance settings](../spec/qa/open-letter/light/appearance-settings.png) | Editorial serif renders correctly. Controls, explanatory copy, theme names, selected label, Back and four bottom labels are visible and legible. No visible clipping or overlapping content. The open composition and divided preference rows avoid a feature-card grid. Native scroll indicator is visible in this captured state; it does not obscure labels. Persistence behavior is outside still-image evidence. |
| [Safe Harbor child Home](../spec/qa/open-letter/light/child-home.png) | Greeting and approved main phrase have clear hierarchy. Talk to someone leads; private writing/circle remain quiet. The check-in uses one restrained peach rule. Home selected state and approved compact symbol are visible. Recent conversation continues below this viewport and requires scrolling. |
| [Safe Harbor journal overview](../spec/qa/open-letter/light/journal-overview.png) | Entry list, preview, privacy wording and New entry read clearly. Serif heading and sans-serif entry text are distinct. No card grid or obvious clipping. |
| [Safe Harbor journal editor](../spec/qa/open-letter/light/journal-editor.png) | Writing dominates a single quiet paper surface. Title, body, saved state and privacy text are visible. Saved action is intentionally disabled; its lower contrast must not be copied to active controls. Keyboard behavior is not established by this keyboard-hidden capture. |
| [Safe Harbor journal reflection](../spec/qa/open-letter/light/journal-reflection.png) | Suggestion remains conversation-only and user-chosen. Primary separate-word preparation and quiet in-person/dismiss actions are distinct. This is a scrolled viewport; the preceding paragraph ends above its top edge. No visible overlap in the reflection itself. |
| [Safe Harbor conversations](../spec/qa/open-letter/light/conversations.png) | Editorial heading, one new-conversation action and a single divided contact row give a clear hierarchy. Preview, time and fictional-delivery wording are legible. |
| [Safe Harbor active conversation](../spec/qa/open-letter/light/active-conversation.png) | Incoming/outgoing alignment and bubble contrast are clear. Participant identity, simulated timestamps, composer and Review action are visible. Composer stays above the bottom navigation in this state. A keyboard-open capture and native interaction test are still needed for keyboard claims. |
| [Safe Harbor My Circle](../spec/qa/open-letter/light/my-circle.png) | Relationship/state labels and names are readable in a clean divided list. One request action leads. Fictional-check explanation is visible. Circle selected state is distinct; no feature-tile grid. |
| [Safe Harbor parent Home](../spec/qa/open-letter/light/parent-home.png) | Parent greeting and copy remain age-neutral. Editorial phrase, leading talk action, secondary writing/circle choices and contextual check-in preserve the child Home hierarchy. |
| [Safe Harbor parent contact details](../spec/qa/open-letter/light/parent-contacts.png) | Identity, relationship and invited-state restriction are clear and readable. The screen makes no real-verification claim. Management controls continue below this viewport; this image alone does not evidence Remove or its confirmation. |
| [Safe Harbor check-in scheduler](../spec/qa/open-letter/light/checkin-scheduler.png) and [preview](../spec/qa/open-letter/light/checkin-scheduler-preview.png) | Question, recipient, time and preview read clearly. R3 recapture verifies Friday has a distinct Ocean outline/label and soft fill, matching the preview. Recipient selection is also clear. The lower [Save capture](../spec/qa/open-letter/light/checkin-scheduler-save.png) now shows the complete Save action and preview together. |
| [Safe Harbor child check-in](../spec/qa/open-letter/light/child-checkin.png) | Question and response action lead. No-penalty wording and later/skip choices are visible. Clear typographic hierarchy, no performance dashboard. |
| [Night Harbor appearance settings](../spec/qa/open-letter/dark/appearance-settings.png) | Slate canvas, elevated controls, text and selected wording are readable. The selected mode now has a clear Mist outline/label and soft fill. No forgotten white input surface. |
| [Night Harbor child Home](../spec/qa/open-letter/dark/child-home.png) | Main action and typography preserve light-mode hierarchy. Restrained peach rule remains readable. The compact Ivory backing now preserves the unchanged symbol's dark details. |
| [Night Harbor journal overview](../spec/qa/open-letter/dark/journal-overview.png) | Entries, preview, private status, controls and selected Journal navigation remain clear. No theme leakage observed. |
| [Night Harbor journal editor](../spec/qa/open-letter/dark/journal-editor.png) | Elevated slate paper is distinct from the canvas; writing and labels remain readable. Saved control remains visibly inactive. |
| [Night Harbor journal reflection](../spec/qa/open-letter/dark/journal-reflection.png) | Content and quiet/primary actions retain the same hierarchy and readability as light mode. No light-theme panel remains. |
| [Night Harbor conversations](../spec/qa/open-letter/dark/conversations.png) | Row name, preview, time and primary action remain legible. Selected Chats state is visible. Corrected logo backing keeps its details distinct. |
| [Night Harbor active conversation](../spec/qa/open-letter/dark/active-conversation.png) | Incoming slate and outgoing Mist bubbles are distinct. Sender metadata and composer labels are readable. Current composer sits above navigation with no overlap. |
| [Night Harbor My Circle](../spec/qa/open-letter/dark/my-circle.png) | List rows, relationship/state labels and Circle selection are clear. No generic card grid or unintended light fields. Corrected logo backing is consistent with the other top-level screens. |
| [Night Harbor parent Home](../spec/qa/open-letter/dark/parent-home.png) | Editorial phrase, parent greeting, leading conversation action and quiet secondary choices retain the Safe Harbor hierarchy. No glowing accent or dashboard treatment. |
| [Night Harbor parent contact details](../spec/qa/open-letter/dark/parent-contacts.png) | Identity, invited status and messaging restriction are readable on slate. No real-verification claim. Lower management controls require the supplemental viewport for visual review. |
| [Night Harbor scheduler](../spec/qa/open-letter/dark/checkin-scheduler.png) and [preview](../spec/qa/open-letter/dark/checkin-scheduler-preview.png) | Recipient, question and time fields use appropriate dark surfaces. Friday is clearly selected with Mist border/label and soft fill; preview matches it. Simulated Save action remains obvious. |
| [Night Harbor child check-in](../spec/qa/open-letter/dark/child-checkin.png) | Question and reply action lead; later/skip and no-penalty wording remain readable. No accidental light-theme component is visible. |

## Findings and resolution

1. **Resolved: weekday selected state.** Baseline controls lacked a visible distinction. The authorized shared-button fix adds semantic soft fill, primary border/text and 2 dp border; primary filled actions retain priority. Final r2 scheduler previews and appearance captures visibly verify the fix in both themes. Natural weekday wrapping changed from five/two to four/three; every label remains readable and the current day is clear. Baseline images are archived intact.
2. **Resolved: evidence coverage.** The required parent identity/status viewport naturally leaves lower management actions offscreen. Additional [light actions](../spec/qa/open-letter/light/parent-contact-actions.png), [dark actions](../spec/qa/open-letter/dark/parent-contact-actions.png), [light removal confirmation](../spec/qa/open-letter/light/contact-removal-confirmation.png) and [dark removal confirmation](../spec/qa/open-letter/dark/contact-removal-confirmation.png) were captured and inspected. Block, Report, Remove and safety access are readable. Confirmation title, explanation, Confirm and Cancel are legible within each themed dialog, without visible clipping or overlap.
3. **Resolved: compact logo on Night Harbor.** The baseline symbol's deep-blue person, near-black heart and outlines blended into the canvas at header size. A compact Ivory backing now preserves those details behind the unchanged approved asset. Final r2 dark Home, Chats and Circle captures visibly verify the fix. The backing is an intentional brand surface, not a theme leak.
4. **Nested header checked:** the top-right settings gear is visibly present on the final light and dark journal-editor and active-conversation images. No source fix is justified for the suspected absence.
5. **Resolved in observed R3 states: keyboard and large-text failures.** Native keyboard-open testing found an obstruction that standard screenshots did not cover. A journal privacy label also needed large-text wrapping. The corrective photos and evidence limits are detailed below; both fixes are visibly verified for those states.

## Comparison sheets

Inspected the final regenerated R3 [Home](../spec/qa/open-letter/comparisons/home-side-by-side.png), [journal](../spec/qa/open-letter/comparisons/journal-side-by-side.png), [conversation](../spec/qa/open-letter/comparisons/conversation-side-by-side.png) and [navigation](../spec/qa/open-letter/comparisons/navigation-overview.png) comparisons. Each labels Safe Harbor on the left and Night Harbor on the right, presents matching screen/content and includes the full phone viewport. They make the consistent hierarchy and intentional surface differences easy to compare. The original captures remain the source evidence; comparison sheets do not replace interaction tests.

No required standard-viewport capture is missing. Final R3 lower contact-action/confirmation images were re-inspected in both themes. All labels and dialog actions remain legible without visible overlap.

The additional [light scheduler Save](../spec/qa/open-letter/light/checkin-scheduler-save.png) and [dark scheduler Save](../spec/qa/open-letter/dark/checkin-scheduler-save.png) images fully display the selected weekday, time, child preview and Save example schedule action. This closes the light preview's viewport-coverage gap through actual scrolling, without altering the original images.

Also inspected [light check-in actions](../spec/qa/open-letter/light/child-checkin-actions.png), [dark check-in actions](../spec/qa/open-letter/dark/child-checkin-actions.png), [light build identifier](../spec/qa/open-letter/light/build-identifier.png) and [dark build identifier](../spec/qa/open-letter/dark/build-identifier.png). Later/skip choices are clear and the account view visibly reports `1114-OpenLetterRedesign-r3` with appropriate simulation/privacy limits. Other device sizes, large-text and keyboard checks are recorded separately by native QA; this design review does not claim to have performed those interactions.

## R3 native keyboard and font findings

The original standard screenshots did not establish keyboard-open behavior. Later native QA exposed that Gboard covered the conversation input and Review action. The [archived R2 keyboard image](../spec/qa/open-letter/baseline-0707b12-r2/responsive-r2/conversation-keyboard.png) visibly shows this defect. An accessibility tree containing an offscreen control is insufficient evidence that a person can reach it.

**Keyboard fix visually verified:** the fresh [R3 keyboard image](../spec/qa/open-letter/responsive/conversation-keyboard.png), [light keyboard stability image](../spec/qa/open-letter/keyboard-fix/light-keyboard-stable.png) and [dark keyboard stability image](../spec/qa/open-letter/keyboard-fix/dark-keyboard-stable.png) show the entire input and Review button above visible Gboard. Multiline words, focus border, selected navigation and the keyboard coexist without overlap in those observed states. The operating-system keyboard appearance is separate from the app theme. Native tap-to-review, Back draft retention and simulated-send outcomes are recorded in [the native result JSON](../spec/qa/open-letter/responsive/native-device-results.json), rather than inferred from these still images.

**Large-text fix visually verified:** the fresh [200% Home](../spec/qa/open-letter/responsive/font-scale-200-home.png) and [200% Journal](../spec/qa/open-letter/responsive/font-scale-200-journal.png) images show wrapped readable headings/body text, usable large actions, all four destination labels and the full journal privacy phrase. The previous journal privacy row had insufficient wrapping space. The R3 correction closes that finding for the captured viewport; additional content continues below the scroll boundary, which is expected. These photos do not establish every control in every screen at 200%.

The master recorded four Android viewport overrides on one Pixel_10 AVD, rather than four separate hardware devices, in the native result JSON. This read-only design review inspected the keyboard/large-text photos named above; it did not perform ADB interactions.

## R3 responsive visual checks

Also inspected the fresh Home and Journal photographs at [small Home](../spec/qa/open-letter/responsive/small-home.png) / [Journal](../spec/qa/open-letter/responsive/small-journal.png), [standard Home](../spec/qa/open-letter/responsive/standard-home.png) / [Journal](../spec/qa/open-letter/responsive/standard-journal.png), [large Home](../spec/qa/open-letter/responsive/large-home.png) / [Journal](../spec/qa/open-letter/responsive/large-journal.png), and [tablet Home](../spec/qa/open-letter/responsive/tablet-home.png) / [Journal](../spec/qa/open-letter/responsive/tablet-journal.png).

The small phone wraps headings naturally and retains the primary action and all four bottom labels. Standard and large photographs retain hierarchy without visible text overlap. Tablet content keeps a readable measure and uses a labeled side rail. No blocking clipping or overlap was identified in these captured states.

One nonblocking tablet refinement remains: rail items divide the full screen height equally, producing a very tall selected container and widely spaced icons. A future pass could group compact rail items nearer the top while retaining generous touch targets. This aesthetic refinement does not invalidate the native navigation checks.

The configured approved icon was also inspected at actual 32, 48 and 64 pixel raster sizes in [asset-size-preview.png](../spec/qa/open-letter/icons/asset-size-preview.png). The paired people, speech shapes and harbor curve remain identifiable; the small heart becomes simpler at 32 px. This sheet is an asset preview, not an Android app screenshot, and does not test a standalone launcher mask or crop.

## Limits

Still images cannot prove TalkBack focus order, persistent theme loading, keyboard/back behavior, draft-loss protection, blocking enforcement or delivery. Use the master's interaction tests and native QA record for those results. Expo Go images do not validate standalone launcher masking or iOS rendering.
