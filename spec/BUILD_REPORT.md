> Historical foundation report. The current Open Letter build is `1114-OpenLetterRedesign-r3` (0.2.2). See [the current development report](OPEN_LETTER_BUILD_REPORT.md) and [native visual QA](qa/open-letter/VISUAL_QA_REPORT.md).

# Between Us mobile foundation session

Date: 2026-11-14. Location: `D:\proejcts\BetweenUs`. Branch: `feature/mobile-foundation`. No push, merge, production publishing, service connection, credentials or global Codex changes.

## Built

An independent Expo SDK 58 package under `apps/mobile`, using TypeScript, React Native and Expo Router. Shared native buttons, visible focus treatment, scalable text, 48dp controls, Safe Harbor light/dark/system themes and exact approved symbol. Home screens and local navigation differ by role. A square icon export fixes the original symbol's rectangular dimensions for Expo config; standalone launcher masking remains untested.

Both roles can create, revisit, edit and delete their own fictional journals. Optional on-device fixed topic rules suggest only conversations with user-chosen trusted people. The composer starts separately and never imports journal text. Messages support response preferences, minimal talk requests, parent starters, explicit review/edit, simulated sends, reply examples and conversation do-over. In-person preparation works without an app connection.

Parents directly add/remove people and approve requests. Children request additions and can block/report. Connection status distinguishes requested, approved, invited, accepted, verified, blocked and removed; new contacts remain unable to message. Sending rechecks acceptance, verification and revocation. Only seed fixtures represent completed simulated checks. Parent and child share this small demo circle for inspection; production needs a reviewed per-person/per-family membership model.

Parents create example recurring check-ins with a child preview. Children can respond via review, ask to talk, set aside or skip without reminders or penalties. Everyday conversation starter and parent responses are available. Safety information and preparation for another safe adult never need parental approval.

## Real versus simulated

Real local functionality: controls, navigation, journal CRUD, opt-in rules, role-separated journal views, contact state changes, review, memory-only threads, skip/later behavior and themes.

Simulated: accounts, verified connections, invitation/approval delivery, message delivery, scheduling, notifications and reports. No real login, encryption, persistence, backend, AI journal companion, telemetry or third-party content processing. Demo role switching is not security: a device user can select either fictional account; editors/drafts are cleared on switch. Reload loses data. Use fictional information only.

## Validation

- TypeScript strict check and ESLint passed.
- Eight domain unit tests passed, including all contact-status/flag combinations, revocation and unauthorized management denial.
- Chrome mobile-viewport workflow passed journal create/edit/delete, role isolation, no journal copy, message edit/review/simulation/reply, parent management, child request/approval, check-in skip, dark appearance and in-person safety preparation.
- Axe WCAG 2 A/AA scan passed on the dark safety screen. Initial missing page title defect was fixed and retested.
- Expo dependency version check passed. Expo Doctor passed 20/20 after fixing icon dimensions.
- Web static export and Android Hermes bundle export passed. These are bundle checks, not APK builds.
- Pixel_10 AVD booted Android 17. Compatible Expo Go installed through Expo CLI. Actual application launch and `scripts/android-smoke.ps1` passed. Screenshots: `spec/qa/android-child-home.png`, `android-child-journal.png`, `android-parent-journal.png`; web screenshots also included.
- Git comparison against `origin/main` confirms `docs/` and root `index.html` unchanged.
- npm audit reports eight moderate findings through minimatch, Expo fingerprint and TypeScript ESLint tooling. No high/critical findings at this check. The suggested forced Expo downgrade is not applied; resolve compatible upstream updates before production.

Not performed: standalone Android APK/Gradle build, iOS runtime, full TalkBack/VoiceOver audit, 200% system font testing, launcher masking at small sizes, security penetration testing or real delivery. Browser computer-use host was unavailable; reproducible Playwright software tests ran against local Chrome instead.

## Source changes

`apps/mobile/`: application, themes, communication/model rules, Expo configuration, lockfile, unit/UI tests and Android smoke script. `AGENTS.md` and six `agents/` contracts define scope and ownership. `design/MOBILE_SYSTEM.md`, `spec/MOBILE_ARCHITECTURE.md`, `spec/security/BOUNDARIES.md`, `spec/MOBILE_QA.md`, this report and screenshots document decisions/evidence. README adds exact Windows and Android startup commands. All changes are local feature-branch commits; inspect `git log --oneline -2` for their identifiers.

## Next work and approvals

1. Finish native keyboard/back, large text, screen reader and small-icon QA; test iOS and produce a local standalone Android build with a supported JDK.
2. Review child safety, identity, consent, family membership, verification/revocation, abuse handling and object authorization before provider selection. Backend comparison includes Workers/D1, Supabase and Firebase; none selected.
3. Review journal encryption/key recovery, retention, backups and account switching independently of family administration. Never use parent admin rights as journal access rights.
4. After owner approval, evaluate synthetic-only auth/backend integration, delivery and notifications. Paid services, credentials and production deployments require explicit approval. Real children's data requires reviewed architecture and security/child-safety readiness.

Start with the exact PowerShell commands in the root README. For native smoke testing while Expo is open in the emulator: `powershell -NoProfile -File .\scripts\android-smoke.ps1` from `apps/mobile`.
