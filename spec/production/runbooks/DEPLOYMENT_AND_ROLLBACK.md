# Deployment and rollback — unexecuted procedure

Prepared 2026-11-16. No hosted staging/production resource, domain, secret, signing identity or deployment is approved/configured by this document. The following sequence is a reviewable future procedure. Run no remote command until the owner records the target, budget and authorization; do not create credentials to make this checklist appear complete.

## Admission record before staging

Release lead records: exact reviewed commit and migration hashes; provider account/project/region; environment name; data classification (synthetic staging first); approved budget/limits; credential custodian; legal/state/age/consent decisions; reviewed origins/redirects; operator and rollback owners; backup/restore evidence. Default public enrollment, actual child data, report promises, push transport and unreviewed lifecycle execution remain off.

1. Reproduce the complete local gate from [local validation](LOCAL_AND_CI.md). Review migration dependencies and every security override, including nullable assignment checks. Do not ship a partial migration list or a `.pending` file as though applied.
2. Obtain owner authorization for a distinct synthetic staging project. Record its exact ID/region and validate every CLI/API target before remote actions. Do not reuse the current local status file, fixture credentials or database as production. Plan and privately review dry-run migrations using the pinned CLI's current help/documentation; the actual target-dependent commands and credentials are deliberately not guessed here.
3. Configure managed server secrets out of band. Mobile receives only reviewed HTTPS API/auth endpoints and a publishable key. Service keys, push access tokens, SMTP credentials and signing keys remain server/owner-controlled. Confirm CORS and redirect/deep-link allowlists match the exact signed application scheme and approved origins, with no wildcard recovery callback.
4. Apply reviewed schema changes serially with an independent backup/rollback plan. Check migration history/checksums, private schemas/RLS/grants, no raw publication, current-session authorization and default-closed policies before seeding fictional staging identities.
5. Build `npm run build` in `services/backend/`, review generated API bundle and supply-chain hashes, then deploy only to the explicitly approved staging target. `supabase/functions/api/index.ts` is a future hosted entry point with `syntheticLocal:false`; it is not a deployed resource. Review origin/env validation and readiness behavior rather than assuming the local adapter is production hosting.
6. Run adversarial staging HTTP/SQL/Auth/worker tests with fictional people: direct Data API RPCs as well as Edge routes, forged roles/objects, cross-family/external contacts, block/revoke races, MFA cleanup, private cases, child finance exports and check-in skip privacy. Verify no content/credentials in logs or traces. Do not test a real child's journal.
7. Qualify SMTP/recovery, device push and operational reporting separately. Provider acceptance does not establish device delivery/reading; a database operator fixture does not establish staffed support. Keep those features off when their gate is unverified.
8. Only after independent reviews, physical/signed device qualification and full lifecycle/recovery work may the owner approve a production target/cohort and exact enabling policy changes. Record activation/rollback time, reviewers and safe communications. Draft store text or free-tier availability is not approval.

## Rollback / containment decision tree

For authorization/privacy doubt, stop admission and external delivery first; preserve evidence privately and use the incident procedure. Turning off registration alone does **not** stop existing sessions or direct PostgREST RPC access. Quarantine the relevant Data API/Edge paths through reviewed infrastructure controls, revoke affected managed sessions/authority and stop push/worker leases. Keep public/offline safety information available. Never weaken consent/block/session checks to restore availability.

For an application regression with a healthy compatible database, roll back only to a known reviewed, signed artifact whose API/vault schema compatibility is demonstrated. Do not roll back before the security fixes or redeploy a debug artifact. Unknown/newer vault schemas fail locked; never erase or downgrade a vault to make an older app launch.

For a schema/data problem, prefer an independently reviewed forward fix under restricted admission. Do not run `db reset`, truncate the shared ledger, disable immutability/RLS, restore old credentials or roll database history backward on a live service. Financial history is append-only; valid corrections are compensating domain events. Any migration that destroys data needs an approved preservation/restore plan and exact scope.

If restoration is necessary, restore into isolated infrastructure, not over the only surviving copy; reapply deletion/revocation tombstones before any user or worker access. Verify authority and financial reconciliation, then perform an owner-approved cutover. See [recovery](RECOVERY_AND_BACKUPS.md). No rollback or restore drill has been executed for this production foundation.

Completion evidence: target IDs, source/artifact/migration hashes, who authorized each action, non-content request/event references, gate states before/after, signed-device smoke results, remaining blockers and reviewer sign-off. Exclude private payloads and credentials.
