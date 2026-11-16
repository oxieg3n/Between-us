# R12 Open Letter native visual QA

Status: **48 genuine Android originals reviewed, 24 in each theme; four comparison sheets verified. No blocking visual defect found in this ordinary-phone core capture set.** This is a scoped visual review, not a whole-mission native, security or production-readiness declaration.

## Provenance and integrity

- Build: `1115-FamilyEnvelopes-Journal-r12`.
- Capture code: `8607573e37dadd66ede3bb368389e0a2531ef6d8`, branch `feature/mobile-foundation`. The [capture manifest](capture-manifest.json) records `tracked_source_dirty: false` and an empty tracked-source diff hash.
- Device: the existing Pixel_10 AVD, `sdk_gphone16k_x86_64`, Android **17**, `emulator-5554`; **1080 ? 2424**, physical density **420**. These are the manifest's device values; the reviewer did not operate ADB.
- App: `com.oxieg3n.betweenus`, Metro 8082. The native Settings footer visibly identifies r12 in both themes.
- Capture interval: 2026-11-16 07:06:36?07:31:26 UTC, from the manifest action log. Capture method is actual ADB `screencap -p` and pull of original PNG bytes. The master operated the native app; the reviewer independently inspected the resulting files.
- Manifest status: `completed: true`, `error: null`. Independent verification found exactly **48** originals, **24 light + 24 dark**, no missing or unlisted originals, matching SHA-256 values, valid PNG signatures and matching IHDR dimensions for every file. Original total: **7,827,767 bytes**.
- Manifest SHA-256 at review: `2088045e0a0c88b28d186228e9548b3840f5129d1f103cee972f8bb46e23b10e`.
- Every original was opened and visually inspected. Originals were not altered, cropped, resized or replaced. Only the four derived sheets and this report were written by this reviewer.

## Required screen coverage

Every requested category is present in both themes: child Home, parent Home, Journal overview, Journal writing editor, optional conversation reflection, conversation list, active conversation, My Circle, parent contact management, Open the Door scheduler, child check-in and appearance settings. Supplemental originals show the full lower contact controls and removal dialog, schedule preview and Save control, skipped check-in state, a saved schedule followed by its new child invitation, Circle practice action, build footer and actual scrolled Home finance entry. All 48 originals are linked with independently checked hashes below.

## Visual and state findings

The approved Between Us symbol remains visible in the compact top header. Editorial headings, ordinary readable body text, restrained borders and purposeful spacing match The Open Letter direction. The Home primary action is clear, while private writing and Circle are secondary. No pastel feature-card grid, invented score, streak or decorative chart appears. Home, Journal, Chats and Circle each have a visible icon/text label and distinguishable selected state. The bottom bar and system gesture area remain visible throughout this ordinary-phone set; nested pages show a top-left Back control.

Safe Harbor uses the light ivory/ocean hierarchy. Night Harbor uses slate backgrounds, differentiated elevated fields, pale text and mist actions; it is not a color inversion. Forms, message bubbles, appearance selection, modal confirmation, notifications and tab states follow the theme. There is no forgotten white form or illegible active primary action in the inspected dark originals. Disabled Saved/Review controls are deliberately muted; this review does not claim measured contrast compliance for every state.

The journal editor gives writing a large quiet surface. Both themes show the saved fictional school-project entry, visible private status, and the statement that sharing begins with separate words. The optional reflection explicitly says **local conversation templates / no AI model** and **a local model is not loaded for this request**. Its school wording invites a conversation and offers deliberate separate composition or in-person practice; it contains no diagnosis, treatment or automatic journal transfer. This run demonstrates the fallback view, not on-device model inference.

Chats show recognizable incoming/outgoing bubbles, a date separator, response preference, simulated timestamps and a composer with an explicit Review action. The conversation list says nothing is delivered. These are fictional seeded conversations, not evidence of actual network delivery. The keyboard is dismissed in these originals; composer keyboard avoidance is not newly proven by this set.

My Circle shows fictional Alex and invited Teacher Lee, with approval, acceptance and verification distinguished in copy. The invited teacher view says messaging is unavailable. The parent-only management screen visibly offers Block, Report and Remove; the actual removal confirmation explains loss of permission and renewed acceptance/verification. The action log shows Cancel immediately after that dialog, so the screenshot does not prove a removal was completed. Circle also retains a visible in-person conversation action and safety access. Names, school-project writing and cooking messages are fictional examples; no real personal contact details, credentials or payment accounts are visible.

Open the Door remains optional. The initial child view offers response, Can we talk, a quick response, Answer later and Skip. In both themes, the operator actually selected Skip and the resulting frame says **Skipped. You do not owe an answer** plus **no new check-ins**. The operator then saved the parent's example Friday 17:00 question and switched back to the child; the new invitation shows **What made you smile today?** with the same response/later/skip choices. The schedule and notifications remain explicitly simulated. This is in-memory state change, not timed background delivery.

## Framing, polish and corrections

- **C3 Home finance framing is closed for both themes:** [light](core/light/home-finance-entry.png) and [dark](core/dark/home-finance-entry.png) show the complete Chores & Goals button and fictional-amount explanation in the actual scrolled Home view. The entry still sits below the first viewport, so discoverability remains a nonblocking polish consideration.
- The first contact/scheduler frames intentionally stop before lower actions. The paired supplemental contact-action, removal-confirmation and scheduler-preview/save images expose those controls fully; they are not presumed visible from the first frame alone.
- The reflection's main invitation, separate composition and in-person action are readable in the initial/supplemental pair. The teacher's secondary recipient-selection control sits at/below the initial viewport edge and is not fully framed in the supplement. This is a limited evidence gap for that second option, not proof that the scrollable control is unreachable.
- In both `parent-checkin-saved.png` images, the top of the success banner is partly outside the scrolled viewport beneath the fixed header. The lower **simulated** line is visible, the manifest records the Save action, and the subsequent child screenshot independently shows the newly saved question. A top-aligned success capture would improve presentation; the current originals remain unchanged and the framing is disclosed.
- No app/source fix was needed for this set. A derived-sheet labeling correction replaced ambiguous **Android r12** with **Build r12**; the actual OS is Android 17. All eight embedded phone viewports were reverified after this correction.

## Comparison sheets

Safe Harbor is left and Night Harbor right. Each **2216 ? 2540** sheet contains both complete **1080 ? 2424** originals at native resolution, with labels outside the phone pixels. Original viewports are placed at `(16,100)` and `(1120,100)`. No screenshot pixels were resized, cropped or modified. All **eight** decoded ARGB pixel buffers extracted from the saved sheets matched their source originals exactly, before and after the label clarification. The four sheets were also visually inspected.

| Sheet | Screen | SHA-256 |
| --- | --- | --- |
| [home-side-by-side.png](core/comparisons/home-side-by-side.png) | Child Home | `71d2e9881eb82de03d92583b4c73c8b7dcd82fbb7355c0bfbfca904aa3ddc9d0` |
| [journal-side-by-side.png](core/comparisons/journal-side-by-side.png) | Journal editor | `67cd4733236d1f557ec951101f26ac4bc75840528909a9f3981bd0fce6d1d4cb` |
| [conversation-side-by-side.png](core/comparisons/conversation-side-by-side.png) | Active conversation | `db842f2304211cb9739e7908ec092c6a9933456cf3dbe3e1165f31fe39b34c29` |
| [navigation-overview.png](core/comparisons/navigation-overview.png) | My Circle and bottom navigation | `651a46408464dcf3d120ca1d62a694eda5e5d1c9f9fad39618e502823fb57769` |

## Original screenshot inventory

All entries below passed independent hash/signature/dimension checks and visual inspection. Each original is 1080 ? 2424. The links preserve the actual application and scroll state; the filename is not a promise that every control fits in one viewport.

### Safe Harbor / light

| Original | SHA-256 |
| --- | --- |
| [appearance-settings.png](core/light/appearance-settings.png) | `5518a2f820840b6225b6eec5ba4c292dfe6399feacdc4e0cdec7346e3c6d0136` |
| [child-home.png](core/light/child-home.png) | `64f65b2ac111e2f4d8c3d2706a6955471dae560c805e65c4213ca61b66c4c051` |
| [journal-overview.png](core/light/journal-overview.png) | `6b55d98971d00c80428af93f2b1156e87dde591f0080803bf98fe9799957524b` |
| [journal-editor.png](core/light/journal-editor.png) | `bd02fc7be6d0c1ea9514f9e237696fba45866010141ba594ca79f57f193cba9e` |
| [journal-reflection.png](core/light/journal-reflection.png) | `97381dc82ba12ffaa691b7dff9fee49210fb61c14a77fd923600e2305c0312a5` |
| [conversations.png](core/light/conversations.png) | `e61079e1ad65d7785431f96a5003c61462a5869c1e8d061646ca88c742ded846` |
| [active-conversation.png](core/light/active-conversation.png) | `534b9f0d36a0f9c0040d15b2dced27c7e657be7c58700ffe51fb975d91cd7c51` |
| [my-circle.png](core/light/my-circle.png) | `1fe2961c637335e6f26f9b9320c46143f7731c6e5b7dd18216eba8d161dff55e` |
| [parent-home.png](core/light/parent-home.png) | `9f0acb23cccefd4f8e052ca9afd508cad35a561c83da3377b9bb07d851207553` |
| [parent-contacts.png](core/light/parent-contacts.png) | `8631974c817c039a89cc7d3e9516c043c8dd0a5c57e2872b27b47e919f47d4d8` |
| [checkin-scheduler.png](core/light/checkin-scheduler.png) | `4d20fcd33334b7d7c41e8fa5e5c945c7d72544963c5b848f63e9e247e877bb25` |
| [checkin-scheduler-preview.png](core/light/checkin-scheduler-preview.png) | `fcde138b96f93cbff99e5340e338b41576188d48255d2f6dc8d89c183424a7c2` |
| [child-checkin.png](core/light/child-checkin.png) | `5c637139dc9eb509da3e9867bed50d2ae56720ff5e9d71d4e8a78ca04af2cff8` |
| [build-identifier.png](core/light/build-identifier.png) | `9dffead2c4fe29e137cb5830b83f1b22b8a7a5faa4496ae539a2b7622eafb07e` |
| [child-checkin-actions.png](core/light/child-checkin-actions.png) | `423345f13325a213c113bec5f2557664ac24e8f65a780487ad2439e51d056bd9` |
| [parent-contact-actions.png](core/light/parent-contact-actions.png) | `b4080794cad925dab9d26c9807c74a54d5d74ccbb7b456c6d9658bd40d4c3edb` |
| [contact-removal-confirmation.png](core/light/contact-removal-confirmation.png) | `ce11cc35fcebfd5b458fdf3d0483288b6e632e9da4d22b41f1cbd2e88ecb64e9` |
| [checkin-scheduler-save.png](core/light/checkin-scheduler-save.png) | `8a9a5d597fb20ef53091a40a9dd9ec1414fb8a2d672654b11ccc9065dac27af0` |
| [home-finance-entry.png](core/light/home-finance-entry.png) | `515c12290d0079013fc55bf77a4378b7a639f7725fc6822a22b01c3f14373fab` |
| [journal-reflection-complete.png](core/light/journal-reflection-complete.png) | `9464e146a4a538e87077df043dc17c02789277d020c5bd2fc975e0b9f7fe4864` |
| [circle-practice-action.png](core/light/circle-practice-action.png) | `186f3cf3d2d12aa782b8ae4510c3c1aec778261d4bc0499b10ea9a83421b8788` |
| [child-checkin-skipped.png](core/light/child-checkin-skipped.png) | `227fa3e0bb0ce8a58b9925fd72c149b2676bd7ad46820a0cba321dc6f8ff5c8a` |
| [parent-checkin-saved.png](core/light/parent-checkin-saved.png) | `72bd42e293ae72bfb6d9ba4fd18bca61cb30d08eef8a72197f709ee9af58b220` |
| [child-new-checkin.png](core/light/child-new-checkin.png) | `dfd633c8de8c77ff45b8691aef25bb904f2cff9206b82e760481941455d68eae` |

### Night Harbor / dark

| Original | SHA-256 |
| --- | --- |
| [appearance-settings.png](core/dark/appearance-settings.png) | `ee7cc3f71b2ead14b07e034e5ff7dd56e28c8130867994a4f9b377f138d34e0e` |
| [child-home.png](core/dark/child-home.png) | `c82719a4148c27c34d85831476fe5835a194c9067c68d798f5afe04145b68ba7` |
| [journal-overview.png](core/dark/journal-overview.png) | `323509e2bb31dbc4cb02b5617592aafa143f9aa1503acccc823b3eb2ef7d6f1b` |
| [journal-editor.png](core/dark/journal-editor.png) | `9d0b2fc128a0a7e73e03aeab661103aa3d8b640b992e09e26bcae497e5ca1247` |
| [journal-reflection.png](core/dark/journal-reflection.png) | `4284e990470be48d7d1d2dc2ee9bbb90e17794b3a9b4ac408def9600ff8b6521` |
| [conversations.png](core/dark/conversations.png) | `d284ead32e617a658406b04262daf9489db105b0c4ec2ec489265f1057a21eac` |
| [active-conversation.png](core/dark/active-conversation.png) | `efa28506e54cb5604f5efa9ddc469839bb670d67b7f2ea8433827c758add772b` |
| [my-circle.png](core/dark/my-circle.png) | `6bb3bedd8bd2f300221aa6550b691733050bc40d78b0614c6a42244c7150e896` |
| [parent-home.png](core/dark/parent-home.png) | `9984043376f4def5a6bbede85ce2ad6c7366c9c896cd6f2cf2f600c9b4356ae8` |
| [parent-contacts.png](core/dark/parent-contacts.png) | `663c5ec2f548fa09667f4ac0e5438703055dfe8cac784b22540c3d7ccfff8a17` |
| [checkin-scheduler.png](core/dark/checkin-scheduler.png) | `51e3de04897c4f6ccff0e2e80a1b9c3ab589817713a9961a21ab91b08f84984b` |
| [checkin-scheduler-preview.png](core/dark/checkin-scheduler-preview.png) | `aac60f75dcdcbfa68ecea5c46d0690f440aebf5db967b1d68bad481aeb8c7716` |
| [child-checkin.png](core/dark/child-checkin.png) | `cf0ee0a6a662bf56e50ee184f5e4030221d6fa0abf45eb3f62bae02a438c3ba2` |
| [build-identifier.png](core/dark/build-identifier.png) | `e62e53083d7a29dc6dd53a4d76e248cac9572441fb71bead87d2a7594ee853fe` |
| [child-checkin-actions.png](core/dark/child-checkin-actions.png) | `d214424efe5ea47ece0b4ce73f6a6b483ab6e6a066189f5d5c53cd3ad6e5601a` |
| [parent-contact-actions.png](core/dark/parent-contact-actions.png) | `5814f9273fefa5272d4a4d49c2b2e70607f6574807c65e7304419bf0eae5ac08` |
| [contact-removal-confirmation.png](core/dark/contact-removal-confirmation.png) | `c856ddb18f0047aaf3ce34a81a031bf1cec5b8e6f035f934f972d3bd2be89fda` |
| [checkin-scheduler-save.png](core/dark/checkin-scheduler-save.png) | `0486c94c30332d11b91d7a6e2d6d1de9b329ae8da8570d5b3fe25b38c545cc7e` |
| [home-finance-entry.png](core/dark/home-finance-entry.png) | `91c18bdcbca147aecf47d12b6ea3307043b320b82857393308aa834da200a3bf` |
| [journal-reflection-complete.png](core/dark/journal-reflection-complete.png) | `fa5ffcdafae6b17c26585c30e5643a320073a9d558b217f5f3001d5951e08f16` |
| [circle-practice-action.png](core/dark/circle-practice-action.png) | `3186eb59ab986a5421f43348e3a319bc434fe459594c4f3a3e8c35fdbed32de7` |
| [child-checkin-skipped.png](core/dark/child-checkin-skipped.png) | `7a77a442f40a14f6cbb30a2669624baee8cbe9ab186d1deb82edac567d8d8a78` |
| [parent-checkin-saved.png](core/dark/parent-checkin-saved.png) | `3935a4bdfbfc3998f6c5e12ec5c3685775e33e697173cbc61f1e661e7ce6b4a2` |
| [child-new-checkin.png](core/dark/child-new-checkin.png) | `7a61a4d68a901a33fce8149922e41b0fced77b435772071f2d4f836a7321bd18` |

## Scope and remaining release gates

No required screen category is missing from either theme in this core set. Screens requiring a blocking visual redesign: **none identified at this normal phone viewport and text scale**. The framing/polish issues above remain documented rather than edited out.

This review does not close dark 200% native text testing, live OS density/font stress, separate small/large/tablet device checks, physical hardware, spoken TalkBack, reduced-motion interaction review or iOS. It does not infer accessibility focus order, spoken labels, secure authentication, real identity verification, server authorization or private journal encryption from pixels. The role selector and verified fixture labels remain prototype controls/data. Real messaging, notifications, payments and production security/consent remain separate release gates. Previous failed native runs retain their original provenance; this successful ordinary-phone capture does not relabel them as passes.

Recommended next work is a physical-device/native accessibility pass, complete dark enlarged-text verification in a stable environment, and optional framing improvements for the saved-schedule banner and secondary reflection action. Continue production identity/consent/privacy review before any real children's information or services are connected.
