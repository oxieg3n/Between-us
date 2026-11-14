# Mobile foundation decision record

Date: 2026-11-14. Status: local fictional-data prototype; no backend selected or connected.

## Audit

The requested `D:\proejcts\BetweenUs` directory did not exist and was cloned from `https://github.com/oxieg3n/Between-us`. The separate `D:\projects\betweenus` launch workspace was empty. The cloned repository was clean on main; work proceeds on `feature/mobile-foundation`.

Existing `docs/`, root redirect, `design/branding/app-icon.svg`, screen map and product specifications are preserved. No kickoff `brand/` package was supplied. Local Ponytail and design-principles skills are available. The repository has no UI-App-Design-Agent-Guide.md, Prompt Sensei installation, ui-ux-pro-max or humanizer.md. Relevant methodology is applied without adding plugins/hooks or changing global configuration.

Node 26.13.0, npm 11.20.0 and Git 2.56.0.windows.4 are available. Java, adb and emulator were not found on PATH; ANDROID_HOME and ANDROID_SDK_ROOT were unset during the initial shell audit. Subsequent inspection found an Android SDK under `%LOCALAPPDATA%\Android\Sdk`, Android Studio under `C:\Program Files\Android\Android Studio`, and a `Pixel_10` AVD. Absolute-path adb invocation works, initially with no connected device. Native verification is pending emulator/device execution, not blocked by an absent SDK. Use per-session environment configuration instead of changing global configuration. Do not report an Android test as passed until actually performed; the final QA report records the outcome.

## Application boundary

Use `apps/mobile/` as an independent npm package with its own lockfile. Expo + React Native + TypeScript + Expo Router provide one Android/iOS codebase and a web preview. Use the template's compatible dependency versions and Expo install checks rather than guessing native package versions. Official [create-expo-app guidance](https://docs.expo.dev/more/create-expo/) and [Router introduction](https://docs.expo.dev/router/introduction/) describe the setup. The resolved version is recorded in `apps/mobile/package.json` and its lockfile.

Keep a local communication module inside the application. There is only one consumer, so a shared `packages/communication/` package and workspace orchestration are not justified yet. Use memory-only state, fictional author IDs and explicit contact states. No AsyncStorage, journal files, backend, telemetry or external AI requests. Native platform memory, screenshots and developer tools are outside the prototype's privacy guarantee.

The shared design system belongs in `design/`; security design belongs in `spec/security/`; task contracts belong in `agents/`. The existing Pages demo remains independent. App UI, domain rules and focused tests have separate file owners; dependency and native-test operations are serialized by the master.

## Backend options for Phase 2

These are design assessments, not configured services or a compliance determination. Authentication proves account control; none of these services alone proves a family relationship, safe adult identity or consent.

| Option | Strengths | Security/operations work still required | Cost drivers |
| --- | --- | --- | --- |
| Workers + D1 + managed OIDC identity | API-level permission enforcement and relational contact/consent records; Durable Objects can coordinate WebSocket sessions | Own authorization on every route and event; identity integration, retries, abuse queues, notifications and operational support. D1 is not a journal encryption or end-user identity system. | Worker requests/CPU, D1 rows read/written/storage, realtime object activity, identity-provider users/messages and notification delivery |
| Supabase Auth + Postgres + Realtime | Integrated account/session system, relational permissions and row-level security; fewer separately managed components | Deny-by-default RLS and realtime authorization; service-role isolation, family verification, consent and abuse operations. Keys available to privileged backend processes require explicit controls. | Compute/storage, active users, realtime traffic, egress, backups and email/SMS |
| Firebase Auth + Firestore + FCM | Managed authentication, database listeners and mobile notification ecosystem | Rules and server authorization tests; model relational consent/contacts carefully, revoke access correctly and manage trusted server code separately from client rules | Database reads/writes/listeners, auth/SMS, storage, functions and egress |

Workers/D1 may fit an API-centric team; Supabase may reduce relational backend assembly; Firebase may reduce mobile delivery integration. This is an inference from the documented capabilities. No winner is selected before evaluating actual family/contact authorization tests and the reviewed journal threat model.

Official references checked: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [Supabase Auth](https://supabase.com/docs/guides/auth), [Postgres RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Realtime](https://supabase.com/docs/guides/realtime), [Supabase pricing](https://supabase.com/pricing), [Firebase Auth](https://firebase.google.com/docs/auth), [Firestore Rules](https://firebase.google.com/docs/firestore/security/get-started), [FCM](https://firebase.google.com/docs/cloud-messaging), and [Firebase pricing](https://firebase.google.com/pricing). Recheck prices/quotas at selection; no fixed monthly estimate is meaningful without active families, message volume, region, retention and support requirements.

## Next implementation sequence

1. Complete fictional local workflows and tests; test Android hardware and accessibility before treating the foundation as native-validated.
2. Review the threat model and child-safety/consent design with qualified reviewers; decide jurisdictions and age policy. Approve a narrowly scoped provider evaluation using synthetic accounts only.
3. Spike managed authentication and deny-by-default family/contact authorization in an isolated local/test environment. Test adversarial cross-family access and revocation before real messaging.
4. Review journal storage separately: key custody, device lock, recovery, backups, deletion, export, multi-device and shared-device threats. Select reviewed libraries/protocols; do not invent encryption or promise end-to-end encryption prematurely.
5. Add real messaging, abuse operations, notification delivery receipts/retries and timezone-aware check-ins only after authorization, consent and operational readiness pass.
6. Owner approval is required before credentials, paid connections or production deployments. Real children's data additionally requires completed security/privacy and child-safety review.
