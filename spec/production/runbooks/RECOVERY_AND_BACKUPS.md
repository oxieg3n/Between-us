# Recovery, backups and deletion tombstones — unverified

Prepared 2026-11-16. No hosted backup, disaster restore, deletion-tombstone replay or vendor erasure rehearsal is established. These are mandatory review/execution gates before real data; a local pgTAP pass does not close them. The owner must approve backup storage/provider, encryption/access, finite retention, recovery staff and budget first.

## Distinct recovery domains

| Domain | Intended recovery / limit |
| --- | --- |
| Managed account access | Verified managed Auth password/recovery/MFA plus reviewed family/guardian dispute process. Local email/recovery tests do not establish hosted deliverability or safe guardian support. |
| Device journal/drafts | Author-local SQLCipher keys, no server/guardian escrow or cloud sync. Lost device/key, app removal or biometric/key invalidation can mean permanent loss. Account reset/support cannot decrypt or silently replace a journal. |
| Server messages/contacts/check-ins | Approved finite backups with current authorization and deletion/revocation replay; no queued body, skipped-check-in indicator or report may become exposed through restoration. |
| Family financial history | Reconciled immutable events/commands/aggregate revisions. Restore preserves valid history and deduplication identity; it does not replay payments or reset hidden matching caps arbitrarily. |
| Reports/privacy jobs | Restricted reporter/assigned operator records and reviewed finite holds. Ordinary family admins or alleged unsafe people gain no access during recovery. `access_revoked` remains distinct from full erasure. |

## Proposed backup/restore rehearsal

1. Assign RPO/RTO, backup frequency, maximum retention/expiry and tested restore owner per data category; no values are approved today. Verify the chosen account's actual backup features/costs. Do not assume a free tier supplies automatic backups/PITR.
2. Inventory all primary/derived/index/cache/outbox/receipt/export/Auth/vendor copies and exclusions. Back up only approved necessary records, with access separate from ordinary support. Never dump credentials or private writing into source control, logs or an unreviewed export bucket.
3. Create a synthetic fixture set with active/withdrawn/deleted subjects, both-side blocks, old sessions/device tokens, pending invitations, acknowledged/unacknowledged messages, hidden matches, private report against a guardian, held records and expired artifacts. Record non-content fixture IDs/checksums privately.
4. Take an approved synthetic backup and record snapshot boundary/checksum/access/expiry. Revoke/delete selected subjects after that boundary. Preserve the subsequent deletion/revocation instructions in a separate durable, restricted replay source.
5. Restore into isolated access-denied infrastructure. Keep enrollment, Data API user access, realtime and workers unavailable until reconciled. Apply every deletion/revocation instruction after the snapshot boundary, including membership/consent, managed sessions, device tokens, queued sends, external invitations, check-ins, artifacts and provider receipts.
6. Run negative tests with pre-restore JWTs/invites/client operation IDs. No old authority may resurrect; no unacknowledged body may cross a block; no guardian report/hidden matching data may appear in child views, exports, notifications or error/count metadata. Verify ledger arithmetic/deduplication and timezone boundaries without transferring money.
7. Independently review results and missing vendor/device copies. Test actual expiry of the backup and downstream deletion on another restoration. Only the owner can authorize cutover; retain a known safe isolated copy until the reviewed recovery decision permits retirement.

## Tombstone requirements still to implement/verify

The current SQL performs concrete access revocation and bounded erasure, but does not establish a complete cross-provider/backup tombstone executor or full Auth/shared-ledger purge. Design a minimal, durable replay record with subject/scope, effective order/time, authorized basis, operation identity and completion per storage/provider, without copied message/report/journal bodies. Protect it independently so restoring an old database cannot erase the knowledge of later deletion.

Do not treat a hidden profile, cleared UI, queued deletion request, provider ticket or operator checkbox as erasure. Full deletion stays blocked until every retained category has a justified finite purpose or verified deletion, including immutable/shared financial references and Auth foreign keys. Generic public blockers must not reveal that a child has reported an alleged unsafe guardian. Restricted holds need lawful basis, exact scope, reviewer and finite review/expiry; they preserve necessary bytes, not product access.

Device vault deletion/export needs separate fresh author authentication and physical interruption/backup tests. A remote service cannot confirm erase on an unreachable device or revoke destination/recipient copies. Preserve permanent-loss and actual-limit explanations in the approved notices; counsel must resolve applicable parental rights without inventing a guardian master key.
