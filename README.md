# Between Us

**when it's hard to find the words, start here**

A welcoming product concept that helps kids and parents find their words and build confidence talking to people they trust.

## [Open the interactive demo](https://oxieg3n.github.io/Between-us/)

The current **v2.0 design prototype** was redesigned from the ground up around three connected tools:

- **My Journal:** Private, role-specific entries, held only in this browser tab's memory during the demo. A small rule-based on-device matcher can *optionally* suggest talking with someone. It offers **no psychological advice, diagnosis, or treatment**.
- **My Circle:** Parents, guardians, siblings, approved friends, teachers, and trusted adults. A demo-only parent approval workflow for additional contacts.
- **Open the Door:** Parent-created gentle check-ins; children can respond, write their own words, or skip without pressure. Parent- and child-initiated conversations include an explicit review step before entering a **simulated** message thread.

The visual direction uses the **Safe Harbor palette** and approved Between Us logo. The demo is responsive across mobile and desktop and requires no build step or services.

### Pages publishing

The site is served by GitHub Pages from `main:/docs`. A root `index.html` redirects to `docs/` when needed.

### Project structure

- `docs/index.html`: web demo entry point
- `docs/styles.css`: design system and responsive styles
- `docs/app.js`: client-only demo navigation and state
- `docs/assets/`: approved logo and small app icon
- `spec/JOURNAL_AND_CIRCLE.md`: product rules, privacy boundaries, and requirements
- `spec/WORKFLOW.md`: earlier v1 design exploration, preserved as history

### Important privacy notice

This is **not** a functioning, secured communication app. There is no real authentication, encryption, persistent journal storage, messaging delivery, notification scheduling, or contact verification. All content is illustrative. Anything you type remains in tab memory and is lost on refresh; **do not enter private or identifying information** in the public demo.

A future production release needs age-appropriate consent, verified contacts, moderation and reporting, abuse prevention, securely stored and access-controlled journal entries, strong encryption, and well-designed paths to seek another trusted adult when a parent is unsafe.

Built with care by [Powered By Oxieg3n](https://poweredby.oxieg3n.com/).

## Open Letter mobile application

A fictional, memory-only Expo SDK 58 / React Native / TypeScript / Expo Router application lives in `apps/mobile/`. The original Pages demo is unchanged. Both roles have journals, local conversation prompts, My Circle, composition/review, simulated conversations, optional check-ins and safety information. The approved symbol is preserved. The Open Letter interface uses Safe Harbor light and Night Harbor dark themes, with Home, Journal, Chats and Circle navigation. Build: `1114-OpenLetterRedesign-r3` (app version 0.2.2).

### Canonical local directory

As of 2026-11-15, the repository must live at `D:\projects\BetweenUs` on Windows (`/mnt/d/projects/BetweenUs` in WSL). If your earlier working copy is in `D:\proejcts\BetweenUs`, follow [Workspace relocation addendum](spec/WORKSPACE_RELOCATION_ADDENDUM.md) **before** launching Codex, Metro, an emulator build or making further Git pushes.

All future push commands must originate from the verified `D:\projects\BetweenUs` Git checkout. Moving the entire existing folder preserves the Git history and origin; do not reclone over or discard local commits.

### Windows PowerShell startup

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npm ci
npx expo start --clear
```

Run `npm run web` for a browser preview. Use fictional information only. Journals, contacts, drafts and messages reset on reload. Only the appearance preference persists locally; Follow device appearance is the default. Role switching warns before clearing unsaved editors/drafts and is a demo inspection control, not authentication. No real messaging, reporting, encryption, identity verification, notification delivery, analytics, external AI, or server storage is implemented.

### Android testing

Start the emulator in one PowerShell window:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
emulator -avd Pixel_10
```

In another PowerShell window:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npm run android
```

Expo CLI opens compatible Expo Go. A physical test phone needs access to Metro and an Expo Go version supporting SDK 58; run `npm start` and scan its QR code. If the store version is incompatible, use Expo's official matching client download or a reviewed development build. Native Gradle/APK builds require a supported JDK; the bundled Android Studio JBR is Java 25 and has not been validated for building. iOS native builds require macOS; iOS runtime is untested.

### Validation

```powershell
npm run typecheck
npm run lint
npm test
npm run test:ui
npx expo install --check
npx expo-doctor
npx expo export --platform web
npx expo export --platform android
```

UI tests use installed Google Chrome at 390 × 844, with a local Metro server on port 8081. They exercise journal, message, contact, schedule, skip and appearance flows, including six axe scans across Home, Journal and Settings in both themes. This is not whole-app accessibility certification. Native Android evidence and theme comparisons are in [`spec/qa/open-letter/`](spec/qa/open-letter/). The [visual QA report](spec/qa/open-letter/VISUAL_QA_REPORT.md) records capture provenance and remaining limits.

Parents add/remove contacts directly and approve child requests. New contacts cannot message: approval alone establishes neither acceptance nor identity. Seed verification is fictional. Review is required before simulated sends; journal text is never copied automatically. Children can skip check-ins without penalty or seek another safe adult without approval.

See [architecture/backend comparison](spec/MOBILE_ARCHITECTURE.md), [security boundaries](spec/security/BOUNDARIES.md), [Open Letter design system](design/OPEN_LETTER_DESIGN_SYSTEM.md), [QA checklist](spec/MOBILE_QA.md), and [Open Letter session results](spec/OPEN_LETTER_BUILD_REPORT.md). No backend is selected. Real use requires reviewed identity, consent, authorization, storage/key recovery, abuse operations and notification design. Paid services, credentials and production deployment require owner approval.

### Native evidence and smoke checks

With the app open in Expo Go, run these from `apps/mobile`:

```powershell
powershell -NoProfile -File .\scripts\android-smoke.ps1
python .\scripts\capture-open-letter.py
powershell -NoProfile -File .\scripts\open-letter-comparisons.ps1
```

The capture script navigates the actual Android UI through ADB. It records actions, hashes, source commit and build identifier; comparison sheets use those original PNGs. Existing capture protection and recapture options are described by `python .\scripts\capture-open-letter.py --help`. Run emulator tasks serially. `python` uses only the standard library; comparison generation uses Windows System.Drawing.
