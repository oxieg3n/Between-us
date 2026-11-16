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

The verified GitHub Pages configuration serves the repository root on `main`. Its root `index.html` redirects to `docs/`. Feature-branch pushes do not change that configured source.

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

The existing Expo SDK 58 / React Native / TypeScript / Expo Router app lives in `apps/mobile/`. Build: **1115-FamilyEnvelopes-Journal-r12**, version **0.3.0**. The approved logo, Open Letter design, Safe Harbor/Night Harbor themes and four destinations (Home, Journal, Chats, Circle) remain intact. The public Pages demo above is a separate, unchanged deliverable.

Both fictional roles retain private journals, reviewed conversations, My Circle, optional Open the Door check-ins and independent safety information. Home now opens Chores & Goals: parent assignment/review/budgets, approved earnings, multiple savings goals, fixed/percentage rules, parent-held envelopes, surprise matching, payout holds, manual records and auditable corrections. Matching starts **off**; a parent explicitly enables the illustrative 100%, $20 per child/calendar month, Surprise/manual-reveal rule. Hidden pledges never enter child projections or progress.

Optional journal ideas work before saving and after a pause when the author opts in. The native build can explicitly download/load a pinned, hash-verified 369 MiB local language model; unsupported builds use labeled local conversation templates. All drafts remain editable and require recipient selection and review. No private writing goes to cloud inference. This is a communication tool, not a therapist.

Use **fictional information only**. Journals, drafts, contacts, schedules, messages and finances remain in process memory and disappear on reload. Appearance is the only persisted preference; optional licensed model assets are the additional approved stored files. Model prompts/KV sessions are cleared, not saved. The role selector is a demo inspector, not authentication. No real money moves, no provider balances are read, and no message, report or notification is delivered.

### Canonical workspace

The complete original repository is verified at `D:\projects\BetweenUs` (`/mnt/d/projects/BetweenUs` in WSL). Relocation is **COMPLETE**; the deprecated root is absent. An old ADB server held its final empty-directory handle and was restarted safely. See [relocation evidence](spec/mission/WORKSPACE_RELOCATION_RESULT.md). Keep all Git operations at this root and preserve the owner's untracked diagnostic.

### Windows PowerShell: Android app

Use the installed Android Studio SDK/JBR and one Pixel_10 emulator. The first native build compiles the optional runtime and can take several minutes. No cloud build or paid service is required.

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

The pinned runtime currently builds from source; the skip flag avoids unnecessary prebuilt-artifact downloads. SDK 58 recreates native folders by default; `--no-clean` applies configuration incrementally and retains local build caches. The app-scoped config plugin keeps native object paths short on Windows without a junction or global settings change. Generated `android/`, `.native-build/` and model weights are not committed.

For a later session with the installed APK, start Metro in one window:

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npx expo start --localhost --port 8082
```

In another window, set the SDK path as above and launch:

```powershell
adb reverse tcp:8082 tcp:8082
adb shell monkey -p com.oxieg3n.betweenus -c android.intent.category.LAUNCHER 1
```

On Android 17, allow the requested local-network permission in this test emulator so React Native can reach Metro. It comes from the framework debug manifest; release builds do not use Metro. If a development build uses the wrong bundle location, open its React Native developer menu and set `127.0.0.1:8082`, then restart that app. Do not change global firewall/security settings. `npx expo run:android --port 8082` supplies the matching build port automatically.

Open Profile & settings -> On-device conversation ideas for optional model setup. It needs at least 1 GiB free storage. Download is explicit and contains no journal text. Physical-device model and iOS validation remain separate release gates; emulator diagnostics do not establish hardware performance. Expo Go cannot load the custom inference module and uses the fallback.

### Browser preview and checks

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npm run web
```

Run checks from the same app directory, with browser/native tests serialized:

```powershell
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

Browser tests use installed Chrome and port 8081. They exercise private drafts, role boundaries, review/simulation, contacts, check-ins, both themes, finance calculations at the UI and accessibility scans. These do not certify native screen-reader behavior.

### Actual Android evidence

With the tested native app and Metro running, from the repository root:

```powershell
Set-Location 'D:\projects\BetweenUs'
python .\apps\mobile\scripts\capture-mission.py --app-package com.oxieg3n.betweenus --port 8082 --theme both --section all
```

This navigates real Android controls, resets fictional memory per theme, verifies the build and saves original ADB PNGs plus hashes/device/source metadata in new timestamped folders. Earlier screenshots are preserved. See [mission progress](spec/mission/PROGRESS.md), [current build report](spec/mission/BUILD_REPORT.md), [finance screenshots](spec/qa/chores-goals/), [journal screenshots](spec/qa/journal-intelligence/) and [historical Open Letter QA](spec/qa/open-letter/VISUAL_QA_REPORT.md). Run all emulator/ADB operations under one operator.

Targeted native interaction and blocking checks use the same installed app:

```powershell
python .\apps\mobile\scripts\native-mission-checks.py --section interaction --theme both
python .\apps\mobile\scripts\native-mission-checks.py --section blocking --theme both
```

After explicitly downloading the model in the app, capture accepted native journal output in both themes with:

```powershell
python .\apps\mobile\scripts\capture-mission.py --app-package com.oxieg3n.betweenus --port 8082 --section journal --theme both --require-local-model
```

This loads only the existing verified asset and fails if the displayed result is a template fallback. Ordinary unsupported-device behavior still uses the labeled fallback. The separate runtime probe's **Run verified local model** button deliberately prints JSON from one fixed fictional prompt and emulator timings; the journal interface is in the main **Between Us** application under Journal -> Find words to share.

This machine also exhibited corrupted host-rendered frames and a System UI ANR during global display/font stress. Those failed captures are preserved, and dark 200% acceptance remains open. The current task restarted only the existing Pixel_10 AVD with a per-launch software renderer, without editing its configuration or wiping data. If the emulator is stopped and the same graphics workaround is needed, launch it in a separate PowerShell window before opening the app:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_10 -gpu swiftshader -memory 4096 -no-snapshot-load -no-snapshot-save
```

Use the existing `F:\Android` AVD home shown above. Do not start a second emulator alongside it. Software rendering is a troubleshooting workaround, not proof that the earlier instability is resolved. Ordinary phone tests and global configuration stress are reported separately.

### Financial and production boundaries

Family Savings Envelopes is a virtual household ledger, not a bank or custodian. Cash App, Venmo and cash/manual choices are parent-managed handoffs. Copying a summary or opening an official provider guide never marks a payout paid. Partial payments and child receipt acknowledgments remain family-reported, never provider-confirmed. External provider eligibility and fees apply; Between Us does not automate transfers or link accounts. See [payment bridge](spec/NO_COST_PAYMENT_BRIDGE.md) and [ledger model](spec/ALLOWANCE_LEDGER.md).

Real use remains gated on identity/consent, authorization, secure storage/key recovery, abuse operations, native accessibility and hardware validation. No backend is selected or deployed. See [production release gates](spec/mission/PRODUCTION_RELEASE_GATES.md), [architecture](spec/MOBILE_ARCHITECTURE.md), [security boundaries](spec/security/BOUNDARIES.md), [finance boundaries](spec/security/FINANCE_BOUNDARIES.md) and [dependency review](spec/mission/DEPENDENCY_REVIEW.md). Paid services, credentials, real child data, production deployment and merging to main require separate approval.
