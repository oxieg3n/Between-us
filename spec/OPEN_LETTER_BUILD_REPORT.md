# Open Letter mobile development report

Build: `1114-OpenLetterRedesign-r3`. App version: `0.2.2`. Branch: `feature/mobile-foundation`. Current UI source commit: `1e640665d01d854a7245f40b42237e00e8582a01`. Evidence commits follow that source commit; the native capture manifest identifies the exact source used.

## What changed

The existing Expo SDK 58 / React Native / TypeScript / Expo Router application was redesigned in place. The public Pages demo, original assets and earlier commits are preserved. Source remains one independent mobile package; there is no new backend or monorepo framework.

Phones now have Home, Journal, Chats and Circle bottom navigation, with contextual check-ins and scheduling. A navigation rail appears at tablet widths. Nested screens have Back; account and appearance controls live in the header. Home has a greeting, an editorial “Some things are easier to write” heading, one main conversation action, restrained secondary links and at most two relevant items. No feature-card dashboard, scores or streaks were introduced.

Safe Harbor and Night Harbor use semantic tokens and native serif headings with readable system sans body text. These OS fonts render locally; no remote font service or unlicensed font file is bundled. The approved symbol is unchanged; an Ivory backing retains its dark outlines on Night Harbor. Paper treatment is limited to writing, review and selected prompts.

Journal overview and editor support create/revisit/edit/delete, saved-entry confirmation, retained unsaved drafts across tabs and confirmation before replacement/account switching. Optional local reflections are available only after saving, do not copy entry text, and require deliberate recipient choice. Chats use divided recipient rows, previews, timestamps, participant-filtered threads, grouped incoming/outgoing bubbles and a composer above the keyboard. Optional helpers, editable starters, response preferences and explicit review remain intact.

Circle uses a contact list and details, parent direct management, child requests, simulated status/acceptance/verification gates and confirmed removal/blocking. Parents create, preview, edit and remove example day/time schedules; children may respond, postpone or skip without penalty. Little Conversations, in-person preparation, safety, onboarding and settings are implemented.

Only the appearance preference persists, using one AsyncStorage key. Follow device appearance is default; Light and Dark apply immediately. Read/write failure feedback and retry are present, and queued writes cannot show a stale earlier save error after the latest selection succeeds. Journals, drafts, contacts, schedules and messages remain memory-only.

## Agent responsibilities and integration

| Agent | Completed responsibility |
| --- | --- |
| Master | Audit, skill inspection, state/navigation integration, appearance persistence, Home/settings/onboarding/safety, check-ins/scheduler, source review, build/version control, final native checks and handoff |
| Open Letter design | Theme/UI primitives/icons, both design documents, Circle/contact screens, independent native visual review and selected-state fix |
| Journal/security | Journal screens/helper tests, privacy/permission review, dependency assessment, native capture harness and screenshot/comparison evidence |
| Messaging/QA | Conversation/list/composer/review screens, participant/timestamp tests, browser workflow/accessibility/responsive tests and updated native smoke script |

Files were partitioned. Package changes and integration were owned by the master. One native operator used ADB at a time; no parallel emulator instances were launched. Delegated source was reviewed before integration.

## Design documents

- `design/OPEN_LETTER_DESIGN_SYSTEM.md`
- `design/SCREEN_SPECIFICATIONS.md`
- `design/OPEN_LETTER_VISUAL_REVIEW.md`

UI/UX Pro Max, Prompt Sensei and the named UI-App guide were not found in the project, installed skill roots, plugin cache or searched home skill directories. No replacements, plugins, hooks or global Codex configuration were installed. The approved specification governed the work; relevant local Ponytail, design-principles, design catalog, taste-skill scope and Humanizer guidance were inspected/applied as documented. Website-specific rules were not imposed on native UI.

## Automated verification

- Strict TypeScript and ESLint passed.
- 13 unit tests passed: communication gates, journal dirty/saved status, role exclusions, participant filtering, timestamp handling and send-time revocation.
- Five browser tests passed: journal CRUD/unsaved protection/author separation, no-copy reflection and deliberate recipient selection, reviewed messaging/replies, account-switch warning, circle administration/requests/block/report, schedule create/edit/remove, skip/later/restore, in-person safety, appearance-only persistence, and responsive keyboard navigation.
- Six axe WCAG 2 A/AA scans passed across Home, Journal and Settings in both themes. The appearance scan was repeated after visual fixes. This is not whole-app or native screen-reader certification.
- Browser sizes 320x640, 430x932 and 960x1280 kept all navigation destinations reachable, had no horizontal overflow and allowed keyboard traversal title → body → Save.
- Expo compatible dependency check passed; Expo Doctor passed 20/20.
- Web, Android Hermes and iOS Hermes exports passed. iOS bundling is not iOS runtime testing or a signed native release.
- Original symbol SHA-256 matches the mobile copy, and Git comparison confirms `docs/` and root `index.html` unchanged.

## Native evidence and visual QA

Actual Android screenshots, comparisons, action/hash manifest, capture provenance, source SHA and detailed observations are recorded in [`qa/open-letter/VISUAL_QA_REPORT.md`](qa/open-letter/VISUAL_QA_REPORT.md). Required PNGs are full-resolution captures from the running Expo Go application on Pixel_10 / Android 17 at 1080x2424. They are not web renders or generated mockups.

Four visual defects were found in the initial capture review and corrected: selected schedule days lacked a visible treatment, and the compact mark needed an Ivory backing on the dark canvas. The later native keyboard screenshot exposed an IME obstruction missed by accessibility bounds alone. Moving keyboard avoidance around the complete shell keeps the composer and Review above Gboard; real Review taps with the keyboard open pass in both themes. Large-text review also led to constraining journal privacy labels to wrap in their rows. Initial screenshots are archived under `baseline-ed96bd1/` and `baseline-0707b12-r2/`; final required screens are recaptured from the r3 source. Expo Go developer-menu/FAB interference was a harness obstruction and was dismissed using the official development flags before final captures.

The final native device/smoke outcomes and any remaining limitations are in the visual QA report. The corrected R3 device run passed true process-restart appearance persistence; native Home/Journal navigation at 320x640, 411x923, 480x1040 and 960x1280 dp; 200% font inspection; a full input and Review above the visible Gboard frame; actual Review tapping with IME open; Back retaining the draft; re-review and simulated send; and nested Android Back. These sizes were overrides on the same Pixel_10, not separate physical devices. Original size/density/font settings were restored. `scripts/android-smoke.ps1` passed build identification, both role homes, journal author exclusion, editor and contextual check-ins; results are under `qa/open-letter/smoke/20261114-184819/RESULT.txt`. Screenshots alone do not prove interaction behavior. A first keyboard check exposed why: accessibility bounds remained findable behind the IME. The revised native test correlates full control rectangles with the actual visible IME frame and then taps Review while the keyboard is open. Initial harness setup failures and actual pre-fix photos remain archived, with corrected outcomes recorded separately. TalkBack/VoiceOver speech/focus audit, standalone launcher masking/32-48-64 recognition, signed APK build and iOS runtime remain separate release checks.

## Security and dependencies

Added SDK-compatible AsyncStorage 2.2.0 solely for non-sensitive appearance and react-native-svg 15.16.0 for readable UI icons. Neither changes the journal/network boundary. No credentials, paid services, AI provider, analytics or production service was introduced.

npm audit still reports eight moderate findings, no high or critical findings at this check. They propagate from minimatch through Expo fingerprint and TypeScript ESLint. A patched minimatch major does not fit current dependency ranges; forced Expo SDK 52 downgrade was rejected as an inappropriate fix. An isolated scoped-major compatibility evaluation remains future work. See `spec/security/OPEN_LETTER_REVIEW.md` and `spec/security/PRODUCTION_SEQUENCE.md`.

Accounts, verification, invitation delivery, sending, reports and notification delivery are simulated. A role selector is not authentication: someone operating the fictional inspector can select either account. There is no encryption or secure persistent journal storage. Do not enter real children's information.

## Source control and next phase

- `ed96bd1`: Open Letter interfaces, appearance persistence, regression coverage and design/security documentation.
- `6604b2d`: visible selected choices and r2 build/version update.
- `0707b12`: approved logo contrast and flexible header wordmark.
- `1e64066`: native keyboard avoidance, viewport scroll handling and scalable privacy labels (r3).
- QA/evidence and handoff commits follow these; use `git log --oneline` for final identifiers.

Review the native comparisons before design approval. Next finish native screen-reader/physical-device/iOS/standalone-icon checks; then approve a synthetic-only identity/consent/contact authorization experiment. Journal key custody/recovery/storage needs a separate reviewed design. Real messaging, operational abuse handling and neutral notifications follow authorization testing, not the other way around. Paid services, credentials, real children's data and production deployment remain gated as described in the security documents. No merge or production publishing is authorized by the development-branch push. Tablet navigation currently stretches its four target regions over the rail height; it is readable/reachable but compact grouping remains a polish item. The configured icon was also inspected at actual 32/48/64 pixel asset sizes; this does not establish standalone Android mask/crop behavior.

## Exact Windows PowerShell commands

```powershell
Set-Location 'D:\proejcts\BetweenUs\apps\mobile'
npm ci
npx expo start --clear
```

For Android, start the emulator once in a separate shell:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
emulator -avd Pixel_10
```

Then in the application shell:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
npm run android
```

Validation (from `apps/mobile`):

```powershell
npm run typecheck
npm run lint
npm test
npm run test:ui
npx expo install --check
npx expo-doctor
npx expo export --platform all
powershell -NoProfile -File .\scripts\android-smoke.ps1
python .\scripts\native-device-checks.py
```

Capture/comparison helpers require the latest app open in the emulator and serial access to ADB:

```powershell
python .\scripts\capture-open-letter.py --help
python .\scripts\capture-open-letter.py
powershell -NoProfile -File .\scripts\open-letter-comparisons.ps1
```

The capture harness protects existing evidence unless explicit recapture is requested. Comparisons retain original screenshot pixels and place labels outside the phone viewport. Do not run concurrent emulator QA processes.

Native device-check reruns create timestamped `responsive/runs/` evidence by default, preserving the checked-in captures. `--replace` is reserved for an explicitly documented recapture. Non-app startup diagnostic images and raw OS/XML dumps stay local; actual app defect images, measurements, action logs and final PNGs are included for review.
