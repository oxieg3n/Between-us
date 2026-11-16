# Open Letter core supplement visual QA - r7

Status: **all 22 original PNGs independently reviewed and verified**. C1, C2 and C4 screenshot-framing gaps are closed to the extent described below. **C3 remains open**: the two files named `home-finance-entry.png` do not actually show the Chores & Goals control, despite their manifest description. Home discoverability remains polish work as well. This report does not close the separate P2 live-density privacy-label defect.

## Capture provenance

| Item | Recorded value |
| --- | --- |
| Build | `1115-FamilyEnvelopes-Journal-r7` |
| Source HEAD | `8c89c899ada444dcb4a543a377f780e9b61db0ed` |
| Branch / root | `feature/mobile-foundation` / `D:\projects\BetweenUs` |
| Tracked app source | Clean; empty tracked diff SHA-256 in manifest |
| Native environment | Pixel_10, `sdk_gphone16k_x86_64`, Android 17, density 420 |
| Original viewport | 1080 x 2424 pixels for every PNG |
| App / device / Metro | `com.oxieg3n.betweenus` / `emulator-5554` / 8082 |
| Run | `section: supplement`, `completed: true`, `error: null`, 11 light and 11 dark originals |
| Local model requested | No; this run displays the local-template fallback |
| Evidence | [Manifest](capture-manifest.json) and [actual control actions](capture-actions.json) |

The reviewer inspected all 22 original images and independently calculated their PNG dimensions and SHA-256. **22/22 match the manifest and 1080 x 2424**. The visible settings footer identifies r7 in each theme. These are actual native screenshots captured by the serialized master operator, not generated artwork. No image, source or device state was changed by this review. The earlier [r5 core set and comparison sheets](../1115-r5-open-letter-core/VISUAL_QA_REPORT.md) retain r5 provenance.

## Framing findings

| Prior finding | Current status | Evidence and boundary |
| --- | --- | --- |
| C1: reflection source, starter and prepare action below viewport | Closed for this framing gap | Both [light](core/light/journal-reflection-complete.png) and [dark](core/dark/journal-reflection-complete.png) show the complete first starter, explicit local-template/no-model source and full Prepare separate words action. Dark is scrolled farther and also exposes in-person preparation and another teacher starter. Light does not show every lower option; this closure is for the originally missing source/first draft/prepare evidence, not the entire suggestion library or a send. |
| C2: lower parent management actions and confirmation not captured | Closed for framing | Both [light](core/light/parent-contact-actions.png) and [dark](core/dark/parent-contact-actions.png) show complete Block, Report and Remove controls. Both removal dialogs show full explanation, Confirm and Cancel. The actions record Remove followed by Cancel; this run does not claim a completed contact deletion, report or block. |
| C3: Home financial entry below initial viewport | Open: polish plus remaining phone framing gap | Both [light](core/light/home-finance-entry.png) and [dark](core/dark/home-finance-entry.png) still show the initial Home viewport. Only the section heading and the top of the button surface appear above fixed navigation; the Chores & Goals label/control is not visible. The manifest's scrolled-view description is inaccurate for these two PNGs. A true lower-Home phone capture is still needed. The entry is visible in the separate tablet Home image, but that does not fix phone discoverability. |
| C4: Circle practice action partially outside viewport | Closed for framing | Both [light](core/light/circle-practice-action.png) and [dark](core/dark/circle-practice-action.png) fully expose Prepare an in-person conversation and Privacy & safety above navigation. This shows the complete action, not a performed practice workflow. |

No existing original was replaced to hide the C3 framing mismatch. The master was notified so a later, separately identified capture can supply missing phone evidence. The P2 privacy-copy clipping seen during the r7 live-density transition remains open in the [native usability report](../1115-r7-native-usability/QA_REPORT.md); no targeted r8 correction or retest is asserted here.

## Visual and interaction observations

The approved symbol, readable editorial headings, four labeled destinations, Safe Harbor colors and Night Harbor slate surfaces remain consistent. Parent action and modal labels wrap without truncation in these inspected viewports. Dark controls, selected day, preview surfaces and removal dialog follow the dark palette. No forgotten light form panel or new blocking theme defect was observed. This is a visual review, not numerical contrast certification or spoken accessibility testing.

Long screens scroll beneath the fixed header; the partial earlier content at the upper edge of lower captures is expected viewport framing, not a cropped source file. The full parent controls, scheduler Save and Circle practice action are above navigation. The local reflection explains that no model is loaded and displays conversation-only wording about school; it does not offer diagnosis, advice or instructions to solve a situation. Prepare separate words remains explicit. Nothing in this screenshot set proves broad model safety or actual message delivery.

Additional check-in evidence closes the earlier lack of actual native Save/Skip demonstration. The action log records Skip in each theme; the result says `Skipped. You do not owe an answer.` and shows no new check-ins or catch-up obligation. It also records a parent Save example schedule; the screen confirms saving while explicitly labeling notifications simulated. Switching to the child shows `What made you smile today?`, Friday 17:00, and optional Write, Can we talk?, Answer later and Skip controls. This is a shared in-memory fixture, not scheduled delivery or a persistent notification service.

| Supplement view | Light | Dark | Observed result |
| --- | --- | --- | --- |
| Build footer | [PNG](core/light/build-identifier.png) | [PNG](core/dark/build-identifier.png) | r7 identifier and memory-only/demo disclosures visible |
| Child check-in choices | [PNG](core/light/child-checkin-actions.png) | [PNG](core/dark/child-checkin-actions.png) | Response/later/skip choices fully visible |
| Parent contact controls | [PNG](core/light/parent-contact-actions.png) | [PNG](core/dark/parent-contact-actions.png) | Complete administration/safety controls |
| Removal confirmation | [PNG](core/light/contact-removal-confirmation.png) | [PNG](core/dark/contact-removal-confirmation.png) | Complete explanation and both actions; Cancel performed |
| Scheduler lower view | [PNG](core/light/checkin-scheduler-save.png) | [PNG](core/dark/checkin-scheduler-save.png) | Friday/time/preview/full Save control visible |
| Home entry attempt | [PNG](core/light/home-finance-entry.png) | [PNG](core/dark/home-finance-entry.png) | Intended entry remains below this viewport; C3 open |
| Local reflection | [PNG](core/light/journal-reflection-complete.png) | [PNG](core/dark/journal-reflection-complete.png) | Source, first complete starter and explicit prepare action |
| Circle practice action | [PNG](core/light/circle-practice-action.png) | [PNG](core/dark/circle-practice-action.png) | Complete practice/safety actions |
| Actual Skip result | [PNG](core/light/child-checkin-skipped.png) | [PNG](core/dark/child-checkin-skipped.png) | Neutral confirmation and no catch-up demand |
| Actual parent Save result | [PNG](core/light/parent-checkin-saved.png) | [PNG](core/dark/parent-checkin-saved.png) | Saved confirmation; notifications explicitly simulated |
| Child's new invitation | [PNG](core/light/child-new-checkin.png) | [PNG](core/dark/child-new-checkin.png) | New fictional question and optional response choices |

## Review limits

This supplement uses a standard viewport on one Android AVD. It does not replace physical-device, iOS, spoken TalkBack/VoiceOver, focus, full text-scaling, reduced-motion or keyboard testing. The separate native-usability run records its actual interaction scope. Parent roles and connection verification remain fictional; report controls are not operational reporting. Confirming a screenshot's hash does not validate an inaccurate description or imply a functional pass. Remaining actions are C3 phone entry framing/discoverability and the separately tracked live-density privacy-label retest.

## Original integrity ledger

All 22 rows were visually inspected and independently verified. Original resolution and hash are preserved below.

| Original | Pixels | SHA-256 |
| --- | --- | --- |
| [core/light/build-identifier.png](core/light/build-identifier.png) | 1080 x 2424 | `75459d0c636d1d95f0318eae23afb1ad085841a9c1333e48d008a5e172d17105` |
| [core/light/child-checkin-actions.png](core/light/child-checkin-actions.png) | 1080 x 2424 | `501d133a082a0e4f2eeda37657ec7ae406b3e174c230a59d7098a75cc54f1ec1` |
| [core/light/parent-contact-actions.png](core/light/parent-contact-actions.png) | 1080 x 2424 | `8d13babc9655fef6d79c9aa286d793a7a399e91324eed552b55056aa6bbf00d0` |
| [core/light/contact-removal-confirmation.png](core/light/contact-removal-confirmation.png) | 1080 x 2424 | `e2882e8a8a308bab36229916a4215228af207b45a6712e15d98c0fa02c8f328e` |
| [core/light/checkin-scheduler-save.png](core/light/checkin-scheduler-save.png) | 1080 x 2424 | `801c187cbced45c66c812faacae532f5cbc76d02d47c534adedcb12906ae90b5` |
| [core/light/home-finance-entry.png](core/light/home-finance-entry.png) | 1080 x 2424 | `27fe45b2e79ec898a5ea01336a7bb6416a1439e0545fb2518f6e733d378ea4d3` |
| [core/light/journal-reflection-complete.png](core/light/journal-reflection-complete.png) | 1080 x 2424 | `4e0c276e9f4e5317f8f5ae00fe0e0ec244def1dbedd405fc3b54c952d6587308` |
| [core/light/circle-practice-action.png](core/light/circle-practice-action.png) | 1080 x 2424 | `759272284e3f5e9d01e8608b407aca19d3ec2f13e00103666b47fa8111bd03a9` |
| [core/light/child-checkin-skipped.png](core/light/child-checkin-skipped.png) | 1080 x 2424 | `13bbe1c1f480568ced473b9ffb88c4786abd691a29ba9c0c3c69b8c2f1570e8a` |
| [core/light/parent-checkin-saved.png](core/light/parent-checkin-saved.png) | 1080 x 2424 | `edc51bcb1906f1542e85c14164b64be54b29186c07cd1011b3c5cae00416f86d` |
| [core/light/child-new-checkin.png](core/light/child-new-checkin.png) | 1080 x 2424 | `55a5abd4f8ee3d2e0aeda31ecf3d97a9a9954f63fc4e39b4ee7c1074e1b452b4` |
| [core/dark/build-identifier.png](core/dark/build-identifier.png) | 1080 x 2424 | `6edf0ea7cb9861dced46d36d50fc5699fba831123b42ab1099be142ee92dc04e` |
| [core/dark/child-checkin-actions.png](core/dark/child-checkin-actions.png) | 1080 x 2424 | `57208591fc1998a7ca436a54bde5eae0702f23d6502775a2a8aeb6ef6e6545f0` |
| [core/dark/parent-contact-actions.png](core/dark/parent-contact-actions.png) | 1080 x 2424 | `1de50b9064535c557e916d076575b5d9884fbeb3345c8681d1b724f64cecc098` |
| [core/dark/contact-removal-confirmation.png](core/dark/contact-removal-confirmation.png) | 1080 x 2424 | `4b448d8ee3cd0e1ba830381116c77547fa977278065c5a72933bed21eafeacb7` |
| [core/dark/checkin-scheduler-save.png](core/dark/checkin-scheduler-save.png) | 1080 x 2424 | `6f8513117e1d993dea165980563176f0103fb90898a4803651a3c981c294adf1` |
| [core/dark/home-finance-entry.png](core/dark/home-finance-entry.png) | 1080 x 2424 | `84af077ce8d1e1910af6dfc40d74d448c29621a063a9a1fd7c75f07a7f370f78` |
| [core/dark/journal-reflection-complete.png](core/dark/journal-reflection-complete.png) | 1080 x 2424 | `8c4893251834be7278924e44e0f499436d4d6f57d05b6ba9997f947eb11731dd` |
| [core/dark/circle-practice-action.png](core/dark/circle-practice-action.png) | 1080 x 2424 | `9bbaef48e22197837b088db42bb50d6e2d102b595109e1d6a4148fda11a4d510` |
| [core/dark/child-checkin-skipped.png](core/dark/child-checkin-skipped.png) | 1080 x 2424 | `bc497c9c5658a5c13e3619b5a1cc45110c1c0e5446f69bba28e2848140be6296` |
| [core/dark/parent-checkin-saved.png](core/dark/parent-checkin-saved.png) | 1080 x 2424 | `d4226aadbecc7fa1999afa76ae011d21f363638f4546374dc36d2224dcdb3ae0` |
| [core/dark/child-new-checkin.png](core/dark/child-new-checkin.png) | 1080 x 2424 | `f2bffc4e38aa94738c208ce5b886fde3c9f4a342ab8251585d2f64599af3bcc0` |
