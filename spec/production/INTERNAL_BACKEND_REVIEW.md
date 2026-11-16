# Internal backend security review

Historical review through010. Root subsequently applied [migration012](../../services/backend/supabase/migrations/202611160012_receipt_lock_order.sql) and passed its actual four-connection lock-order regression in the final11-scenario integration suite. Finding1 below describes the original snapshot and is resolved in the current local source; provider delivery remains disabled. See the [current delivery receipt](DELIVERY_RECEIPT.md) and [security ledger](SECURITY_REVIEW.md).

2026-11-16. Source review of the active identity, communication, finance, privacy, external-contact, notification-receipt and check-in implementations through migration `202611160010_checkins.sql`. This is an internal review, not independent security certification or authorization for hosted resources or real child data.

What this change does: The backend uses managed Auth identities and current database sessions, private tables and narrowly granted RPCs for family and contact authority. The server applies the existing finance engine with atomic commits and returns role-scoped views; notification delivery and privacy execution remain separately gated.

## Must fix

1. **High: receipt batches can deadlock with cross-family contact operations.** [Receipt leasing](../../services/backend/supabase/migrations/202611160009_notification_receipts.sql#L49), especially lines 49–55; [relationship locking](../../services/backend/supabase/migrations/202611160008_external_contacts.sql#L52).

   - **What this is:** `api.lease_notification_receipts` processes up to 20 relationships in anchor-family order and calls `lock_contact` separately for each. Each call locks that relationship's complete family set in sorted order, but the transaction retains the locks from earlier relationships.
   - **Problem:** Per-relationship ordering does not provide a global order for the batch. With family UUIDs ordered A < B < Z, a valid first contact can have anchor B and endpoint families B/Z, followed by a contact with anchor Z and endpoint families A/Z. The receipt transaction holds Z before requesting A; a concurrent send, block or revoke on the second contact can hold A while waiting for Z. PostgreSQL must abort one transaction as a deadlock victim. This is an availability defect, not evidence of a permission bypass or leaked message body. Provider delivery is currently disabled, so it is a blocker before enabling that worker rather than a claim of a live incident.
   - **Fix:** Snapshot the bounded candidate IDs, acquire the union of `contact_family_ids` for the entire snapshot in ascending order before acquiring any contact/pair or receipt-row lock, then process that same snapshot with the existing current-authorization checks. The dispatch batch already follows this pattern in [migration 008](../../services/backend/supabase/migrations/202611160008_external_contacts.sql#L536). Add a two-connection receipt-versus-send/block regression test; the present [receipt fixtures](../../services/backend/supabase/tests/notification_receipts.test.sql#L29) use one family and do not exercise this ordering.
   - **If we skip it:** An enabled receipt worker can abort concurrent contact operations or lose a complete polling batch under ordinary cross-family use. Repeated overlapping batches can repeatedly delay receipt processing until leases expire or retry limits are reached.

   Deterministic reproduction to implement in the root's database harness:

   1. Create three synthetic families with UUID order A < B < Z and two valid, accepted, independently verified external relationships. C1 has anchor B and bound families B/Z; C2 has anchor Z and bound families A/Z. Give both due, permitted provider receipts.
   2. In connection T1, pause receipt leasing after it has locked C1's B and Z families and before it locks C2.
   3. In connection T2, start an authorized send/block/revoke on C2. It locks A and then waits for Z.
   4. Resume T1. It waits for A while retaining Z, completing the deadlock cycle. The fixed implementation must acquire A before B/Z and allow both transactions to finish without a deadlock; the eventual send/receipt decision must still respect any committed block or revocation.

## Scope and evidence

The pass traced `services/backend/src/{api,finance,privacy,notifications,local-server}.ts`, active migrations 001–010, their relevant callers and synthetic tests. It checked guardian-managed enrollment for all child/teen accounts, trusted registration intent binding, metadata stripping, managed-session checks, raw-table and function grants, nullable case authorization, independent operator scopes, cross-family approval/consent, blocking and queued-delivery checks, finance retry/idempotency and child projection, reauthentication/MFA, privacy holds, check-in privacy and provider-worker gates. A search of app imports found no service-role secret imported into the mobile app.

No additional critical/high finding was established in those paths. This is bounded source-review evidence, not proof that every interleaving or provider behavior is safe. The existing fix for nullable case readers in 005 and actual GoTrue metadata handling in 006/007 were treated as current behavior, not reported again as open defects.

The root reported 413 passing pgTAP assertions across seven files and two passing managed-Auth/HTTP scenarios at review start. Those are integration results supplied by the root; this reviewer did not rerun SQL, services, native tools or test commands. The lock-order reproduction above is a code-established schedule and has not yet been executed. Existing unit tests validate neutral payloads, fresh authorization, disabled transport, retry/backoff and sanitized errors, but do not establish multi-transaction receipt lock ordering.

The already tracked identity-resource quotas/account-management work, complete provider/backup deletion, hosted credentials/transport, legal and child-safety review, physical-device verification and independent security review remain release gates. They are not newly discovered critical/high findings in this report. No journal or private-draft backend path was added or approved.

## Prepared remediation

The root accepted finding 1 and assigned its bounded fix. Pending [migration 012](../../services/backend/supabase/migrations/202611160012_receipt_lock_order.sql) replaces receipt leasing with a single bounded candidate snapshot, globally sorted family-union locks, stable relationship order and a fresh due/status check under each receipt-row lock. TTL, attempts, current authorization, neutral lease projection and service-only grants are preserved. It does not enable delivery.

The new [real-Postgres integration test](../../services/backend/tests/integration/receipt-locks.test.ts) checks the necessary lock-order property without modifying production helpers. Four database connections create guarded local `.test` fixtures, hold only the B/Z relationship key, start actual receipt leasing, observe its advisory-lock wait, and verify that an independent attempt to acquire family A fails. Under the old function it succeeds. The test then releases the blocker, requires both authorized receipt leases and their exact neutral keys, rolls back lease mutations, erases its fixtures and restores the original push policy. It uses no provider HTTP call. Only exact local API/loopback Postgres ports and existing synthetic-only policies are accepted.

Neither the pending migration nor the test was executed by this reviewer. The root must review, activate and apply 012 serially, run the integration test and existing regressions, and record actual outcomes. Source preparation does not close finding 1.

Verdict: apply and verify fix 1 before enabling provider receipt processing. Preserve the existing closed public-enrollment, real-child-data and delivery gates while the root integrates and verifies the fix.

Not checked: execution of the proposed two-connection deadlock reproduction, hosted provider behavior, real credentials or child data, physical devices, and any migration after 010.
