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

The separate Expo SDK 58 / React Native / TypeScript app lives in `apps/mobile/`. Current synthetic candidate: **1116-ProductionFoundation-p3**, app **0.4.1** (Android code 3 / iOS source build 3), on `feature/production-foundation`. The approved logo, Open Letter design, Safe Harbor/Night Harbor themes and Home/Journal/Chats/Circle navigation remain. The public Pages prototype above is unchanged; the isolated r12 mobile demo is also retained.

Production mode uses actual **local** managed Auth, scoped family/consent/contact checks, persisted server messages and the authoritative household finance ledger. Guardian-managed setup is required for every child/teen. Journals/protected drafts remain author-local; explicit Send approvals use a separate SQLCipher recovery outbox on the native build. An interrupted command retains its original ID and requires visible review and explicit retry. Web interrupted-send recovery is memory-only. These are fictional local tests, not a public enrollment service, real verification approval, E2EE claim or recipient-device delivery guarantee.

Use **fictional information only**. Public enrollment/real-child data, actual money transfers, provider-linked balances, hosted operations, staffed report promises and device push remain disabled/unapproved. Cash/manual/provider-named payments are family-reported ledger records, never automated transfers. Optional on-device conversation ideas never send private writing to cloud inference and always require separately edited wording, permitted recipient selection and Review. The demo role selector is an inspector, not authentication.

### Canonical workspace and Android launch

Work from `D:\projects\BetweenUs` (`/mnt/d/projects/BetweenUs` in WSL). Relocation is complete; the deprecated directory is absent. Keep Git operations at this canonical root and preserve the owner's diagnostic and historical QA. See [relocation evidence](spec/mission/WORKSPACE_RELOCATION_RESULT.md).

With the existing Pixel_10 emulator, current debug APK, local Supabase/Auth and API ready, use the guarded launcher:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
.\Scripts\Start-ProductionAndroid.ps1 -Serial 'emulator-5554'
```

It verifies this feature checkout, loopback configuration, the selected emulator/package and owned Metro on **8081**, refusing unrelated listeners. Newly started Metro uses `--clear` for stale demo/production bundle cache; it does not wipe app/vault data. The helper never installs tools, rebuilds, chooses 8082 or kills a port. Child-only `CI='false'` keeps Expo 58 watching; redirected logs stay noninteractive. See [ANDROID_LAUNCH](spec/production/ANDROID_LAUNCH.md) for readiness and old 8082 developer-menu recovery.

Only when an intentional cold restart is needed:

```powershell
.\Scripts\Start-ProductionAndroid.ps1 -Serial 'emulator-5554' -RestartApp
```

**`-RestartApp` discards unsaved in-memory work.** It stops only the verified app package after all launch checks; durable records are not wiped. Do not clear app data, reinstall, remove vaults or edit app-private settings to fix Metro. One operator owns emulator/ADB/build activity.

For exact first-time local stack/status/seed/fixture/API commands and private log handling, use [LOCAL_AND_CI](spec/production/runbooks/LOCAL_AND_CI.md). The launcher does not start those services. Never copy ignored status/fixture credentials into chat, source or public Expo settings. Native modules require the custom debug build; Expo Go cannot provide the protected storage/inference implementation.

### Browser modes and validation

Production UI uses port **8081** and the ignored local fictional fixture. Reuse an already verified production Metro only explicitly:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile'
$priorQaReuse = [Environment]::GetEnvironmentVariable('BETWEENUS_REUSE_QA_METRO', 'Process')
try {
    $env:BETWEENUS_REUSE_QA_METRO = '1'
    npm run test:production-ui
    if ($LASTEXITCODE -ne 0) { throw 'Production browser checks failed.' }
} finally {
    [Environment]::SetEnvironmentVariable('BETWEENUS_REUSE_QA_METRO', $priorQaReuse, 'Process')
}
```

Without that opt-in the production test configuration owns its own 8081 server and refuses a conflicting listener. Root must verify both project identity and production fixture/environment before reuse; a ready port alone is insufficient. The isolated r12 suite starts **demo mode on 8084**, with no server reuse:

```powershell
npm run test:ui
```

Ordinary mobile checks are `npm run typecheck`, `npm run lint` and `npm test`. Backend SQL/managed-Auth checks, serial test ownership and manual-only CI are documented in the [runbook](spec/production/runbooks/LOCAL_AND_CI.md). Do not infer a native, hosted or screen-reader pass from browser/unit results.

### Build evidence and remaining release gates

See [production progress](spec/production/PROGRESS.md), [actual checks](spec/production/TEST_RESULTS.md), [p3 build handoff](spec/production/FINAL_BUILD_REPORT.md) and [release checklist](spec/production/RELEASE_CHECKLIST.md). The [historical r12 mission report](spec/mission/BUILD_REPORT.md) and its 8082 capture commands remain provenance for that older build, not current launch instructions. Root records final source/artifact identity and later native outcomes; release engineering remains incomplete.

Android debug transport/build has passed locally. Native release cleartext is denied; the signing plugin removes the generated debug-release signing fallback and fails closed without reviewed owner signing material. Root observed that missing-signing guard fail as expected. **No signed release is established.** Physical Android/biometry/backup restore, iOS, spoken accessibility, device push, hosted configuration, legal age/state/consent/journal-rights review and trained report operators remain release gates. Keep journal/chat/Review capture protection enabled; do not bypass `FLAG_SECURE` for screenshots.

Family Savings Envelopes is a virtual household ledger, not a bank or custodian. See [payment bridge](spec/NO_COST_PAYMENT_BRIDGE.md), [ledger model](spec/ALLOWANCE_LEDGER.md), [production architecture](spec/production/ARCHITECTURE.md), [security review](spec/production/SECURITY_REVIEW.md) and [privacy review](spec/production/CHILD_PRIVACY_COMPLIANCE.md). No main merge, publication, paid service, real child information or actual transfer is authorized by these instructions.
