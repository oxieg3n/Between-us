# r5 native journal visual QA

Both-theme review complete: all twelve original Android screenshots inspected; no blocking visual defect found in this captured workflow. The combined manifest records `completed: true` and `error: null`.

| Provenance | Value |
| --- | --- |
| Build | `1115-FamilyEnvelopes-Journal-r5` |
| Frozen source HEAD | `afca46fa881b6c17b40c2c32bee9d97cd45c3554` |
| Branch / package | `feature/mobile-foundation` / `com.oxieg3n.betweenus` |
| Tracked app source | Clean; manifest records `tracked_source_dirty: false` and an empty source diff hash |
| Native environment | Pixel_10 AVD, Android 17, x86_64, density 420 |
| Original resolution | 1080×2424 for every reviewed PNG |
| Capture method | Actual ADB screencap and pull; no image alteration |

All twelve PNG SHA-256 values and original resolutions were independently checked against [capture-manifest.json](capture-manifest.json). All match. This is final frozen r5 evidence, separate from the earlier dirty experimental r4 diagnostic.

## Screens reviewed

| Screen | Safe Harbor | Night Harbor | Finding in both themes |
| --- | --- | --- | --- |
| Model loaded | [Light](light/optional-model-loaded.png) | [Dark](dark/optional-model-loaded.png) | Actual experimental loaded status, model-file/storage disclosure and clear **Write in My Journal** action. No physical-device or production-readiness claim. |
| Journal overview | [Light](light/journal-overview.png) | [Dark](dark/journal-overview.png) | Approved symbol and compact brand header, editorial heading, demo-role privacy status, obvious New entry action and readable fictional list. Journal is visibly selected; memory-only limitations remain explicit. |
| Journal editor | [Light](light/journal-editor.png) | [Dark](dark/journal-editor.png) | Exact title `Fictional award example` and complete fictional award paragraph. No duplicated fragment or missing initial F. Quiet writing surface and saved/private-in-memory feedback. |
| Inline ideas | [Light](light/journal-inline-suggestions.png) | [Dark](dark/journal-inline-suggestions.png) | Actual **On-device model · review these words** label, full celebration request and visible sharing/practice/adjust/dismiss actions. Conversation-only wording, without diagnosis, advice or invented event details. |
| Recipient choice | [Light](light/journal-recipient-choice.png) | [Dark](dark/journal-recipient-choice.png) | Separate editable message is fully visible. Alex's row says **Choose** before the intentional tap recorded for each theme. Chats is selected; nothing sends automatically. |
| Message review | [Light](light/journal-message-review.png) | [Dark](dark/journal-message-review.png) | **To Alex**, complete starter and **Just listen** together. The no-journal-attachment explanation and explicit Simulate send control remain visible; capture stops before Send. |

The full starter is identical in both themes and remains consistent from ideas through the separate composer to Review: “Can we talk about something I want to celebrate? I'd like you to listen first.” It does not reproduce the private award paragraph. Both source actions explicitly record `on-device-model`; no actual delivery or automatic sharing is shown.

## Layout and brand observations

Safe Harbor surfaces, Ocean Blue actions, Deep Slate text, serif display headings and restrained paper borders form a consistent Open Letter interface. There is no generic feature-card grid. Back/settings controls and all four labeled bottom destinations remain visible. Journal selection changes to Chats for composition/review. Text wraps without horizontal clipping in these viewports.

Night Harbor preserves the same hierarchy and spacing with slate backgrounds, subdued elevated editor/message surfaces, pale readable text and Mist primary actions with dark labels. There are no forgotten light editor or review panels. The approved logo's small ivory backplate remains intentional; the rest of the dark interface is not a simple color inversion. Source labels, recipient choice, privacy copy and selected navigation remain visually distinguishable. This is a visual contrast review, not a numerical WCAG contrast certification.

Minor follow-ups: the model setup's lower Load control extends below the initial viewport and requires scrolling. Review's secondary **Edit my words** action sits close to the fixed navigation edge; its label is visible, but this screenshot cannot establish the full touch-target bounds. Verify these lower controls in the separate native interaction run. The saved editor screenshot has no keyboard open, so it cannot certify keyboard avoidance.

## Remaining checks

- Screenshots alone do not certify TalkBack order/announcements, focus behavior, touch-target geometry, text-scaling or contrast measurements.
- Native keyboard, editing/revisit, Back behavior, smaller screens, tablet and 200% text require the actual interaction checks recorded separately by the master.
- One accepted fictional native-model example is not a model safety benchmark, physical-device support result or complete adversarial corpus evaluation. Unsupported/invalid cases still require truthful fallback tests.

No PNGs, app source, Git state or Android state were changed by this review.
