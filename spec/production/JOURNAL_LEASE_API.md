# Metadata-only journal session lease

2026-11-16. Migration024 is pending root review/application. It adds no journal table, upload, content log, credential, provider or deployment. The lease describes a bounded **already-unlocked** own-device writing lifetime; it grants no offline login/unlock or messaging/finance/server authority.

## Exact API

`api.get_journal_session_lease()` accepts no arguments and returns exactly:

```typescript
{issuer:string,subject:string,sessionId:string,remainingMs:number}
```

`issuer` matches the existing reviewed `account_management_policy.auth_issuer`, including `/auth/v1`. `subject` and `sessionId` are the actual current authenticated author and managed session. `remainingMs` is a positive integer at most900000, floored to the earlier of15minutes, signed JWT expiration and current managed-session `not_after`. A child is additionally capped by the earliest currently qualifying verified-consent expiry; no qualifying consent denies issuance. A missing/exhausted lease is denied with42501; zero never grants a new lifetime.

The function reuses `get_verified_session` / `app_private.actor`, requires current `account_usable`, rejects malformed/non-numeric/nonfinite expiration and rechecks the actual managed session owner. Remaining time comes from database `clock_timestamp()` after session locking, not transaction-start `now()`, a device wall clock or caller-supplied timestamps. Child consent uses the same active child/membership, current parent guardian, verified/nonwithdrawn/nonrevoked constraints as `account_usable`, with expiry checked against current database time. That consent query adds no row/advisory family lock after the managed-session lock, avoiding a new lock-order dependency. Multiple valid consents use their earliest expiry conservatively. No author/session/role/expiry input can choose another person's lease. Parent guardianship grants only the parent's own lease; a parent's journal lease does not require a child's consent. Issuer configuration remains default closed until separately reviewed by the owner.

Execution is granted only to `authenticated`; `anon`, `public` and `service_role` are explicitly revoked. Missing JWT actor/session, wrong issuer, wrong signed role, expired/deleted session, pending/closed/suspended account or currently revoked child consent denies issuance. User metadata cannot promote authority. PostgREST/Auth continues to verify the bearer signature; the SQL test claim fixtures do not represent signature-forgery support.

## Client integration boundary

Root owns the client request and device overlay. Request this metadata with the **exact same candidate JWT** used for online author verification, then repeat the existing unchanged-token/account-epoch and author/issuer/session checks. Anchor the client monotonic deadline at **request START before the complete online proof and device authentication/unlock**. All proof, network and biometric time consumes that budget; do not add another15minutes when a response arrives or when unlock finishes.

Only an already unlocked vault may continue own in-memory offline writing until that deadline and the separate shorter local inactivity/device protections permit. The lease is memory-only: never persist it, recover it after process restart, use a device wall clock to extend it, mint a new offline unlock, or renew from a cached context/token. Background/account/session changes retire the capability; foreground resume needs fresh online proof and the reviewed device unlock flow. Expiry covers/locks private writing under the client policy. It cannot authorize a queued share, financial action, network export or another author's journal.

A server cannot communicate immediate revocation while a device is offline. This lease deliberately bounds that uncertainty to its remaining lifetime; a later online lease request repeats current authority checks. It is no promise of durable saving or irreversible memory erasure. Existing author-local cipher/key/device protections, background handling, privacy review and real-device release gates remain.

## Source verification

The migration has an explicit whole-file `BEGIN`/`COMMIT`, pinned SECURITY DEFINER search path and narrow final grant. The prepared transactional pgTAP suite covers DTO/grants/noargs,15-minute cap, JWT/session/child-consent shortening, exact issuer/session ownership, metadata role spoofing, malformed/missing/nonfinite claims, DB-clock JWT and consent expiry inside a long-lived transaction, distinct child authority, withdrawn consent, inactive identities and managed-session deletion. Root alone applies and executes SQL; these tests and native offline/unlock behavior remain unrun by this author. No client, vault, mobile, service, Git or native operations were changed here.
