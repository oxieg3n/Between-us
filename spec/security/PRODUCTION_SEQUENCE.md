# Production readiness sequence after Open Letter

The redesigned client is a fictional-data prototype, not a secure family messaging service. Source-level privacy checks and UI tests are useful but do not establish authenticated authorization. Do not connect services or collect real family information during this phase.

## Decisions before an identity spike

The owner and qualified privacy/child-safety reviewers need to establish launch jurisdictions, age ranges and assurance policy, verifiable consent, relationship disputes, unsafe-guardian support, account recovery and who operates confidential reports. Parent family administration must never imply access to journals or unsent writing.

Use the existing backend comparison in MOBILE_ARCHITECTURE.md to evaluate a synthetic-only authenticated vertical slice. Workers/D1 requires an identity integration and server-side permission checks; Supabase and Firebase also require explicit object and subscription authorization. None proves that an invited adult is safe or authorized merely because they control an email account. No provider has been selected.

## First bounded backend experiment

After owner approval for credentials/services, create an isolated test environment with fictional identities. Implement a single contact relationship and reviewed message flow. Derive author and family from server authentication rather than client role flags. Require approval where appropriate, acceptance, independent verification, block/revocation checks at review/send/delivery/subscription, replay protection and bounded retries. Test an adversarial client changing object IDs, roles and family memberships. Keep journals outside this first server slice.

## Journal storage is a separate review

Decide device locking, local key storage, multi-device access, account switching, shared-device behavior, recovery, deletion/export, backups, retention and privileged operator access. Evaluate established reviewed libraries/protocols; never invent encryption. Key recovery cannot silently give guardians access to another person's journal. Avoid sensitive crash logs, push content, analytics, screenshots and app-switcher previews. Do not label storage encrypted or private from everyone before implementation and independent testing establish that claim.

## Delivery and operations

Only after identity/authorization and abuse response are reviewed, add real messaging, neutral push notifications, timezone-aware scheduling, delivery failures/retries and status semantics. A skipped check-in must not produce surveillance, escalation or repeated reminders. Reporting needs a staffed confidential intake and tested response procedures before a real report button can promise help. Explain the actual visibility and retention policy in language children can understand.

## Dependency work

The current audit identifies eight moderate findings propagated from minimatch. Its patched major does not fit the installed Expo fingerprint and TypeScript ESLint dependency ranges. Follow compatible upstream releases; if a scoped major override is evaluated, compare filesystem matching behavior and exercise fingerprint/build/lint tooling in isolation before adopting it. Do not force Expo from SDK 58 to SDK 52 to silence audit output. Re-run audit and software supply-chain review before introducing a real backend or production build.

## Release gate

Require tested native accessibility/keyboard/large text, device matrix, independent security review, operational abuse readiness, and owner approval for paid services, credentials and production deployment. Evidence from Expo Go is not a signed standalone APK or an iOS runtime test. UI theme persistence stores one non-sensitive preference; no journal persistence is authorized by that exception.
