# Production foundation architecture

## Financial checkpoint continuation

Current build **1116-FinanceCheckpoints-r3 /0.6.0 /Android code5**, on `feature/staging-release-qualification`. The [checkpoint qualification report](staging/FINANCE_CHECKPOINT_REPORT.md) and [release matrix](staging/FINAL_RELEASE_QUALIFICATION.md) give the current implementation, measured scope and open gates; the original foundation decision below remains historical context.

Ordinary financial operations start from a validated versioned checkpoint plus a bounded hot tail, retaining the unchanged **128 visible/32 private events per child**. Internally sealed read-only books avoid repeated sibling replay; mutable input is never accepted as a cache proof. Checkpointing does not delete accepted source events, permanent UUID/entity identities or older immutable archive versions. The active-work bounds remain **100 hot occurrences/32 hot payouts**; other bounded collections and source-connected obligations can still require capacity review.

Fully settled connected components move into immutable visible capsules with exact earning, original allocation and payment provenance. Fully invalidated parent matching history has a separate private archive and bounded exact summaries. Private matching cannot determine visible retirement eligibility; child projections/exports exclude raw books, private sources, hashes and parent-only commitments. Parent history and correction lookups recheck current role/family/session authority.

A correction hydrates the exact source-bound archived component, removes its folded basis once, applies the existing integer-cent command and appends new audit history. SQL commits event, command identity, checkpoint, archive/residency changes and role-safe activity/projection capture atomically under the original authorization and CAS/family-lock rules. Failed writes roll back together; verified retries retain their original identity. No automatic deletion, limit increase, financial transfer or journal synchronization is introduced.

Current local qualification includes **295 mobile units/type/lint, 151 backend units/type/build, 21/21 managed integration scenarios with the latest rerun PASS, 1,222 SQL assertions/26 files, fresh installation through migration 031 and 397 actual restored assertions PASS**. Final r2 native/browser checks remain in progress. Settled-pattern longevity and local runtime/restore tests do not qualify unlimited open work, the finite 500 MB Free database, hosted concurrency, legal/operator decisions, physical devices or release signing.

## Preserved foundation decision

Decision: 2026-11-16. Baseline `c301148536db955525d429600323bfbf39f751e3`, branch `feature/production-foundation`. This is the implementation contract and threat-model input before persistent service development, not legal approval or production certification. Fictional local integration is authorized; public enrollment is not.

## Selected system

Use one Supabase backend: managed Auth, PostgreSQL, restricted RPCs/row policies, Edge Functions and content-free Realtime. Develop against the official local stack first. `services/backend/` is an ordinary independent npm package, not a replacement mobile app or monorepo framework. `apps/mobile/` retains Expo 58/React Native/Router and the approved Open Letter components. See [provider comparison](BACKEND_COMPARISON.md) and [cost analysis](COST_ANALYSIS.md).

Cloudflare Workers/D1/Durable Objects were evaluated seriously; they supply useful free SQL/coordination but require a separate consumer identity integration and more authorization/operations assembly. Firebase Functions requires billing-enabled Blaze. Supabase reduces that assembly and supplies PostgreSQL transaction primitives. Its Free plan's inactivity pause, lack of automatic backups and testing-only default SMTP mean free local development is not a production availability/cost guarantee. No hosted project or paid plan is created.

SMTP and FCM/APNs are necessary delivery transports, not additional authoritative family backends. Local email is captured by the local stack. Hosted SMTP, push credentials, domain ownership and store accounts remain external gates. No cloud AI or financial API is introduced.

## Trust and data domains

| Domain | Authority and access |
| --- | --- |
| Identity/session | Supabase Auth owns password verification, email ownership, JWT issuance, refresh/recovery. Client role flags have no authority. Active Auth session/account is rechecked by SQL helpers. |
| Family/consent | Private PostgreSQL records; memberships and child ownership derive from authenticated UID. Parent administration cannot grant journal access. VPC, guardianship and accepted contact verification are separate recorded decisions. |
| Messages | Participant-only authenticated RPCs, verified current relationship, both block directions, idempotent sends, server time. New delivery is reauthorized; already received history is distinguished from undelivered queued messages. |
| Finance | Reuse the r12 TypeScript domain on the server. Private append-only events and aggregate revisions are committed atomically with compare-and-swap and command identity. Only role-safe projections leave the server. No client clock, raw ledger, hidden revision counter or parent-only matching data in a child response. |
| Journal/drafts | Separate per-author on-device SQLCipher vault and keys. No journal table, upload route, AI provider or family-admin export of journal text. See [storage contract](JOURNAL_STORAGE.md). Device-only storage does not resolve legal review by itself. |
| Notifications | Neutral outbox events, owner/session-bound device tokens, preferences/quiet hours, bounded retries and receipts. Journal text, names, message bodies and hidden match activity never enter previews. Delivery is not operational until actual provider/device verification. |
| Reports/privacy requests | Restricted reporter/assigned operator access. Family administrators and reported parties receive no automatic report disclosure. Public intake promises disabled until an approved operator and response process exist. |

Raw tables live in `app_private`; only explicitly granted functions/views in `api` are exposed. All tables have RLS enabled and direct public writes are denied. `service_role` is server-only. Every SECURITY DEFINER function pins its search path and validates the active caller/object. Storage buckets are private if introduced. There is no public directory of children or open social chat.

## Identity and policy flow

Owner clarification: target the broadest reviewed U.S. availability and younger pre-teens as well as teens. Exact eligible ages/states remain review gates. **Every child/teen account requires an authorized guardian to initiate setup together with the child, regardless of age.** This is a server invariant, not an optional switch for older teens. There is no child self-signup or shared family password. The child accepts their own account and sets a distinct credential; guardian administration does not provide their journal key or an impersonation control. Any legally required teen consent is additional to guardian-managed product enrollment. Public/offline safety information never depends on that enrollment or a guardian's permission.

Age routing precedes personal-data entry. Public enrollment defaults off in the database and release configuration. Local synthetic signup is restricted to reserved test addresses and local seed configuration. An approved registration/child-enrollment intent binds account purpose, recipient, expiry and consent record; client-supplied metadata cannot grant a guardian role. Parent email verification proves account control, not legal guardianship. Child accounts have independent Auth identities/credentials; no role toggle in a production session. Child creation/consent, invitation acceptance, relationship verification and account activation are distinct gates.

Guardian invitations are expiring, single-use, recipient-bound random tokens stored as hashes. Consent decisions carry notice/policy versions, purpose/scope, method/evidence reference, verifier and withdrawal/revocation timestamps. Only approved verification operators can finalize evidence; a parent's checkbox cannot self-verify. Unsafe/disputed guardianship suspends relevant authority and routes a confidential case without informing the alleged unsafe person. Safety information and preparation for another safe adult are public/offline capabilities.

The unresolved launch states/ages, legally adequate VPC/age assurance, journal parental-rights conflict, retention and safety operator are documented in [child privacy requirements](CHILD_PRIVACY_COMPLIANCE.md). The software keeps those gates closed rather than treating this document as authorization.

## Transactions and delivery

Financial commands receive a server-derived actor/child scope and server UTC time; logical command IDs are idempotent and request fingerprints bind retries. A trusted server reads the private aggregate, applies the existing domain, then calls a privileged commit transaction that locks the aggregate, rechecks current session/membership and compares its revision. Conflicts retry internally against fresh state. Events append, never overwrite. Child responses contain only `financeView` and never reveal internal revision, hidden events or a parent projection. Child invalidations are emitted only when that child's visible projection changes.

Message creation, block and revocation serialize on the same relationship lock. Delivery/fetch validates current account/session, acceptance, verification, membership/consent and both block edges again. A client acknowledgment records actual receipt; provider acceptance is not device delivery or reading. Previously delivered evidence can remain available to its participant for reporting, while queued/new bodies cannot cross a revoked relationship. No system can retract bytes already lawfully received before a block.

Supabase caches Broadcast/Presence authorization for a connection; therefore private bodies and financial projections are never broadcast. Only opaque per-user content-free invalidations are eligible, and each subsequent fetch uses current authorization. Raw messages/ledger/report tables are not published. Reconnection/expired sessions and block-before-delivery are tested independently from mobile buttons.

## Device storage, recovery and offline behavior

Use established SQLCipher via the SDK 58 SQLite plugin and platform SecureStore, not a custom cipher/envelope. Check `cipher_version` before writes and key each connection before schema access. Vault unlock requires the enrolled author/session and approved device protection; biometric failure is not permission to reset or create an empty vault. No guardian recovery path provides journal keys. Loss/invalidation of the device key may permanently lose local journals. Shared-device author isolation, hardware key behavior and backup exclusions require their own validation before release.

Auth secrets never use AsyncStorage/plain files; the client adapter handles native protected storage failures and clears session/draft memory on sign-out/revocation. Offline journal access grants no family/backend permissions. Financial actions never falsely succeed offline; retryable operations retain their identity. Remote revocation takes effect on reconnection/online checks and cannot instantly reach an offline device. Private journal and financial queues use separate storage/security domains.

## Deployment, controls and review

Local, staging and production have separate projects/secrets, policy records, origin/redirect allowlists and signing identities. Local stack/seed commands are guarded against non-loopback targets. No synthetic consent or staff fixture may be enabled in a release. Production configuration fails on missing HTTPS, legal/retention/operator approvals or private keys in public variables. The inactive CI template prepares migrations, authorization/concurrency/integration tests and app checks; installation requires owner workflow permission and dispatch requires quota approval. Deployment is manual and owner-approved. No main/Pages workflow is changed.

Implement bounded payloads/pagination, transactional rate/budget counters, request IDs without content logs, health/readiness checks, security-event metadata, backup/restore drills, deletion/export jobs and rollback runbooks. Quota budgets reject expensive work before exhaustion; notification delivery defaults disabled and no service silently upgrades a plan. See [security review](SECURITY_REVIEW.md) and release checklist as they evolve.

Primary references: [Supabase local stack](https://supabase.com/docs/guides/local-development/cli/getting-started), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Edge authentication](https://supabase.com/docs/guides/functions/auth), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [ASVS 5](https://asvs.owasp.org/), [MASVS](https://mas.owasp.org/MASVS/), [Expo 58 SQLCipher](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/), [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).
