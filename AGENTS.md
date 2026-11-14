# Between Us engineering instructions

Read `spec/JOURNAL_AND_CIRCLE.md`, `spec/MOBILE_ARCHITECTURE.md`, and `spec/security/BOUNDARIES.md` before changing behavior. Role-specific task contracts are in `agents/`; the master assigns explicit file ownership and reviews integration.

## Preserve the project

- Work in `D:\proejcts\BetweenUs` (intentional spelling), on a feature branch. Never force-push, merge to main, or publish without owner approval.
- Preserve `docs/`, root `index.html`, approved brand assets and repository history. The GitHub Pages prototype is a separate deliverable.
- Keep the mobile app in `apps/mobile/`. Prefer ordinary Expo/React Native components and local modules over additional frameworks or workspace tooling.
- Use the existing logo and official tagline with the approved Open Letter direction, Safe Harbor light theme and Night Harbor dark theme. See `design/OPEN_LETTER_DESIGN_SYSTEM.md`. No unapproved rebrand or corporate theme.

## Prototype boundaries

- Fictional data only. Journals, drafts and simulated messages remain in memory. The owner-approved exception is the appearance preference (system/light/dark), stored under one local key. No content persistence, analytics, network content processing, AI provider, credentials or paid services.
- A role selector is a demo control, never authentication. Parent administration never grants access to another author's journal or unsent drafts.
- Only an explicit review action may share a separately composed message. Never copy journal text automatically.
- Local optional reflections may suggest a conversation; never diagnose, analyze emotions, give treatment or solve the underlying problem.
- Child contact approval is separate from invitation, acceptance and verification. Blocked/removed/unverified contacts cannot receive simulated in-app messages.
- Parent administrators manage contacts directly. Children request additions. Safety information and seeking another safe adult never require parental approval.
- Check-ins are optional invitations. No punishment, streaks, emotional scores or nagging for skipping.
- Clearly label messaging, verification fixtures, scheduling, notifications and reports as simulated. Do not claim encryption or real delivery.

## Working and validation

- Read relevant callers before editing. Make the smallest complete change; test nontrivial logic and permission branches.
- Delegate only bounded independent tasks, with file ownership, acceptance criteria and exclusions. Serialize package changes, Git integration, emulator/ADB operations and native builds.
- Run the mobile package's type, lint and test commands after integration; use real interaction checks where possible. Document unavailable checks honestly.
- Do not install plugins, hooks or change global Codex configuration. Owner approval is required before paid services, credentials, production deployments or collection of real children's data.
- Report files changed, commit, exact PowerShell start commands, actual checks and outstanding risks.
