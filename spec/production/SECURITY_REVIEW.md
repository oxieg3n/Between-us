# Production threat model and verification ledger

Status: pre-implementation contract, 2026-11-16. Not independent certification. Authoritative design: [architecture](ARCHITECTURE.md). The r12 prototype and its historical QA remain intact. All production implementation/testing is synthetic/local until explicit release gates are satisfied.

## Threats and mandatory controls

| Threat | Boundary/control | Required negative test |
| --- | --- | --- |
| Forged role/family/child ID | Managed Auth JWT plus current SQL session/membership; no client domain-role authority | Change every scope field; cross-family object/RPC access denied |
| Stolen/revoked session | Expiry/refresh rotation, current Auth session existence, account/device revocation | Previously valid JWT fails after sign-out/revocation, including subscriptions/fetch |
| Guardian impersonation/consent shortcut | Separate verified notice/consent/relationship facts; operator authority cannot come from user metadata | Parent cannot mark own child/contacts verified or self-grant staff |
| Parent reads journal/draft | No backend journal route/table/key; author-local vault and separate draft protection | Parent export/alternate UID/role switch cannot retrieve author content |
| Block/revoke race or stale subscription | Common relationship locking, recheck at creation/fetch/ack, no broadcast bodies | Parallel block/send, queued delivery, old tokens, reconnect denied |
| Duplicate money/spending | Trusted r12 domain, row lock + revision CAS, idempotent request fingerprint, append-only events | Parallel approval/allocation, changed-body replay, reverse/partial payouts, UTC/month boundary |
| Surprise matching inference | Server-only raw ledger/revision; child DTO and notifications derived solely from visible changes | Equivalent worlds yield identical child payloads/errors/signals; no hidden count/version |
| Unsafe guardian sees report | Reporter/assigned operator policies; confidential evidence; no family-admin default | Reported guardian/other staff/cross-family reader denied |
| Notification privacy leak | Neutral payload only; current session/contact check, opt-in/quiet hours | No names/body/journal/match amounts; stale token/skip causes no delivery |
| Data retention/recovery leak | Approved finite policy, explicit export/delete, separate journal keys/backups | Withdrawal/revocation, deletion retry, expired export, retained audit scope and restore |
| Hostile model/file/input | Pinned licensed asset/hash, bounded validated output and cancellation, no content network/logs | Injection, unsafe people, malformed/oversized output, stale role/background response |
| Resource abuse/billing surprise | Bounded requests, transactional actor/global quotas, plan lock/manual deploy | Over-budget requests fail before work, no unbounded notification/retry loop |

## Standards and scope

Use OWASP [ASVS 5.0](https://asvs.owasp.org/) requirements for authentication, sessions, authorization, validation, cryptography, data protection, logging and configuration; map implemented evidence rather than claiming blanket compliance. Use [MASVS](https://mas.owasp.org/MASVS/) STORAGE/CRYPTO/AUTH/NETWORK/PLATFORM/CODE/RESILIENCE/PRIVACY groups for native vault, token custody, transport, backups, local inference and shared-device lifecycle. Third-party testing and legal/privacy review remain release gates.

## Data classification and keys

Authentication credentials/session tokens are secrets held by Auth/platform stores. Family/consent and messaging/financial data are sensitive server records with explicit object authorization, TLS and provider encryption-at-rest; this is not an E2EE claim. Journal/draft content and keys stay author-local and never join the family ledger, exports, notifications or model servers. Operators cannot silently recover journal keys. Local device compromise, OS keyboard behavior, forensic memory erasure and biometric multi-author limitations remain explicit risks needing hardware review.

## Initial gates

- Public enrollment, actual child information, verified-consent claims and staffed reporting promises OFF.
- Hosted service credentials/SMTP/push/signing unavailable until approved owner setup; complete local code/tests meanwhile.
- Physical Android/iOS, spoken accessibility, independent security review, hardware model/memory tests and legal/operational sign-offs unverified.
- Track every implemented test and unresolved finding in TEST_RESULTS.md/RELEASE_CHECKLIST.md; failed runs must remain distinguishable from passes.
