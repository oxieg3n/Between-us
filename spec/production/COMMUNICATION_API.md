# Communication and safety RPC contract

2026-11-16. Implemented source: `services/backend/supabase/migrations/202611160002_communication.sql.pending`, staged for root review/serialized application. Tests: `supabase/tests/communication.test.sql`. Source and tests are not an executed-pass claim; the root records actual migration/pgTAP/integration results. Synthetic development only; no real child data, hosted resources, public enrollment or staffed-response promise is authorized.

The Ponytail skill guided a private-table/RPC implementation using the existing identity helpers. No package or alternative backend was added. All `api` functions below pin their definer search path. Authenticated functions derive the current UID from `app_private.actor()` and recheck current account/session; ordinary messaging additionally requires `account_usable`. Client-supplied roles/author IDs/verification flags never grant authority. No backend journal/draft table or upload route exists.

## Contact lifecycle

This first SQL slice supports **existing members of the same authorized family**, including separate parent/child Auth identities. It does not yet enroll external friends, teachers, unrelated adults, or cross-family peers. Those need a separate reviewed invitation/age/authority design; the email RPC is not a stranger directory. A pair has one canonical relationship and one conversation. Revocation is terminal in this slice; no automatic reactivation or unblock endpoint is exposed.

Acceptance by both endpoints, guardian approval for each child endpoint, independent verification, current membership/consent/account and neither-direction blocking are all required. Guardian-managed child/teen enrollment from migration 001 applies at every supported age. An administrator's contact approval does not establish identity, relationship safety or consent. Verification expires after 90 days in this technical slice; the actual production method/expiry policy remains a review gate.

| Authenticated RPC | Result / behavior |
| --- | --- |
| `request_contact(p_family_id uuid, p_recipient_email text) -> jsonb` | `{"status":"requested"}` for unknown, unrelated, blocked and existing targets alike. Five requests/minute per caller. Internally requests only a current member of the caller's current family; requester acceptance is recorded, recipient must separately accept. No email-control verification claim. |
| `list_contacts() -> jsonb` | Array of authorized contact metadata: `id,familyId,a,b,aName,bName,acceptedByMe,bothAccepted,approvalA,approvalB,verified,revoked,canExchange`. Recipient sees their pending invitation; ordinary requester sees target only after both accept. Family guardians may see child-bound approval metadata they administer. Names are withheld until both accept. Does not return block edges or verification evidence. |
| `accept_contact(p_contact_id uuid) -> jsonb` | Endpoint-bound `status:accepted`; no acceptance on behalf of another account. |
| `approve_contact(p_contact_id uuid) -> jsonb` | Current family guardian only; approves child endpoints; `status:approved,verification:stillRequired`. Cannot erase a child's block. |
| `revoke_contact(p_contact_id uuid) -> jsonb` | Current participant or authorized family guardian; terminal revocation, queued/leased notifications suppressed. |
| `block_user(p_user_id uuid) -> jsonb` | Caller blocks a previously known contact. Private directional record denies **both** communication directions, suppresses pending notifications; no parent override. Other party receives no block-reason disclosure. |

Service-only `verify_contact(p_contact_id uuid,p_operator_id uuid,p_method text,p_evidence_ref text) -> jsonb`: only `service_role` can execute. The trusted handler must authenticate/bind the actual reviewing operator before supplying `p_operator_id`; never forward an untrusted ID under a service key. SQL additionally requires an active `verification` operator, usable account, not an endpoint or guardian of this family, completed acceptances/current approvals. Rejects checkbox/email/parent-approval methods. `synthetic_fixture` requires identity policy `local_synthetic`; other methods require `communication_policy.verification_policy_id`. Evidence is an opaque bounded reference, not identity documents. `consent` scope alone is insufficient. Removing verification operator authority invalidates new exchange checks.

All relationship mutations take the shared family advisory lock, then canonical-pair advisory lock, then row locks. Membership/consent revocation uses the same family lock in 001. One pair belongs to one family; lease batches sort by family/pair. Identity changes must continue respecting that order.

## Conversations, persistence and receipt semantics

| Authenticated RPC | Result / behavior |
| --- | --- |
| `create_conversation(p_contact_id uuid) -> jsonb` | Idempotently returns `{id,contactId,status:"ready"}` only while relationship is currently permitted. |
| `list_conversations() -> jsonb` | Caller-participant array `{id,contactId,peerId,canExchange}` scoped to current family membership. No last-message preview or receipt leakage. |
| `send_message(p_conversation_id uuid,p_body text,p_client_id uuid,p_response text) -> jsonb` | `{id,createdAt,status:"saved"}`; body 1–5000 characters and nonblank, response exactly `listen`, `reply`, or `talk`; server stamps sender/recipient/time. Caller cannot provide author/time. Thirty new messages/minute per sender. |
| `fetch_messages(p_conversation_id uuid,p_limit int default 50,p_before_id uuid default null) -> jsonb` | `{messages:[{id,senderId,body,response,createdAt,status}],nextBeforeId,canExchange,readReceipts:false}`; limit 1–100, most recent bounded page returned in chronological order. Use oldest returned `nextBeforeId` to request the previous page; null/empty messages ends traversal. Cursor must be a caller-visible record of this conversation; no cross-conversation lookup. Existing two-argument calls retain their defaults. |
| `ack_message(p_message_id uuid) -> jsonb` | Recipient-only while relationship is currently permitted: `{id,status:"acknowledged",readReceipt:false}`. Idempotently records recipient application receipt, never proof of reading. |

The sender/client UUID pair binds a logical command across conversations. An identical retry returns the same record/time; changed conversation/body/response raises `22023 idempotency conflict`. Authorization is checked before replay, so an old command cannot bypass a later block/revocation. A saved message is not a delivered message. Fetch makes currently permitted bodies available; only the recipient's explicit acknowledgment records application receipt. Sender projections always report their own record as `saved`, never the recipient's acknowledgment/read state.

After blocking/revocation, a current participant can retain their own sent text and already acknowledged received messages as evidence. An unacknowledged received body is no longer returned. New send, fetch of queued received bodies and acknowledgment all recheck both block directions and current permissions. No system retracts bytes lawfully fetched before a block or ensures a malicious client truly viewed what it acknowledges. If the caller's own membership/consent/session is revoked, ordinary messaging fetch is denied entirely.

`api.user_invalidations` contains only random `id` and the destination's `user_id`. It alone is added to `supabase_realtime` if that publication exists; all raw private tables remain unpublished. Authenticated SELECT RLS exposes own rows only. Realtime's cached session may emit an obsolete **content-free hint**, never a body/finance/report projection. Every resulting body RPC independently invokes the active-session helper. The root transport should subscribe only to this own-user surface and fetch fresh, with no broadcast/presence payload containing content. Hints are bounded to 20 stored rows/user and do not establish delivery/order/activity history.

## Confidential cases and privacy requests

Public report intake and staffing promises default OFF. Technical reports require both `communication_policy.synthetic_fixture_mode` and `deployment_policy.local_synthetic`, with a reserved `.test` reporter address; no ordinary domain bypass. Real intake additionally requires the separate report flags, real-data/operator policy and active approved safety operator. Even a technical success returns `staffedResponsePromised:false`, never emergency/help delivery.

| RPC / executor | Result / behavior |
| --- | --- |
| `submit_report(p_reported_user_id uuid,p_description text,p_message_id uuid default null)` / authenticated | Description 1–4000; reported account must be a known contact (or null); returns `{id,status:"saved",staffedResponsePromised:false}`. Only explicitly selected accessible/previously acknowledged message is copied as evidence; no journal/conversation attachment. Five submissions/minute. |
| `assign_report(p_report_id uuid,p_operator_id uuid)` / service only | Assigns an active usable independent `safety` operator. Rejects reporter, reported person, or reporter-family guardian even if that adult has a staff scope. Trusted service binds operator identity. |
| `get_report(p_report_id uuid)` / authenticated | Reporter or currently assigned independent active safety operator only; `{id,reportedUserId,description,selectedMessageBody,status,response,createdAt}`. No ordinary family-admin/report-subject/other-staff access. |
| `update_report(p_report_id uuid,p_status text,p_response text)` / authenticated | Assigned active independent operator only; status `open/triaged/closed`, response <=2000. No automatic alleged-guardian/contact notification. |
| `submit_privacy_request(p_kind text,p_subject_id uuid default null,p_description text default '')` / authenticated | `own_export/own_delete` only self; `parental_review/guardian_dispute` may reference own subject or a guardian-authorized child. Returns `{id,status:"review_pending",journalIncluded:false,completed:false}`. Records review work, does not perform export/deletion or adjudicate custody. |
| `assign_privacy_request(p_request_id uuid,p_operator_id uuid)` / service only | Independent active `privacy` operator. |
| `get_privacy_request(p_request_id uuid)` / authenticated | Requester or assigned active independent privacy operator only; scoped request/status/response, `journalIncluded:false`. |
| `update_privacy_request(p_request_id uuid,p_status text,p_response text)` / authenticated | Assigned independent privacy operator; `review_pending/in_review/closed`, response <=2000. Closing technical case is not a claim that data deletion/export occurred. |

Case access rechecks operator scope and independence on every read/update; a later staff revocation or guardian role cannot preserve case access. No report is disclosed through ordinary invalidations or notifications. This slice does not provide accountless real report intake, automatic triage, legal holds, deletion/export execution or emergency response. Identity `actor()` currently denies a consent-revoked child's active account, including case reads: a separately reviewed minimal case-access path is needed before real users. Public/offline safety information and seeking another safe adult must remain independent of login/guardian approval.

## Notification contract

`get_notification_preferences() -> jsonb` and `set_notification_preferences(p_enabled boolean,p_timezone text default 'UTC',p_quiet_start int default 22,p_quiet_end int default 8) -> jsonb` are authenticated/current-account only. Return own `{enabled,timezone,quietStart,quietEnd,deliveryOperational:false}`. Opt-in defaults false; timezone is validated against PostgreSQL names; quiet hours are integer hours, equal start/end disables the quiet interval. Opt-out suppresses queued/leased work.

`register_device(p_platform text,p_token text) -> jsonb` accepts `ios/android` and 20–4096 token characters, binds to caller/current managed session and returns only `{id,status:"registered",deliveryOperational:false}`. Maximum three active devices; five registrations/minute. Token hashes are unique; another account cannot claim an existing token. Token rotation/reassignment across users needs provider/client token renewal, not silent transfer. `revoke_device(p_device_id uuid)` is own-account only and suppresses pending work. Managed session deletion cascades token/outbox deletion. Provider tokens never appear in authenticated client list/RPC output.

Only service role can call:

- `lease_notifications(p_limit int default 20) -> jsonb`: bounded batch 1–50, deterministic family/pair lock order, 60-second UUID lease, max five attempts and 24-hour message notification lifetime. Current contact, both blocks, account/consent/session/device, opt-in and push policy are rechecked. Quiet-hour work waits another hour. Transactional quotas cap enqueue work at 20/user/hour and 500/global/hour; no automatic paid upgrade.
- `authorize_notification(p_outbox_id uuid,p_lease_token uuid) -> boolean`: worker calls immediately before external transport; lease and current authority must still hold. A block/revocation can suppress already leased work. An unavoidable external transport race may still produce a neutral obsolete notification; it cannot supply message bytes.
- `complete_notification(p_outbox_id uuid,p_lease_token uuid,p_outcome text) -> jsonb`: outcome exactly `accepted/retry/invalid_token/failed`. Valid current lease required. Transient failure backs off exponentially, max one hour/five attempts; invalid token is revoked. `accepted` means `provider_accepted`, with `deviceDelivered:false,read:false`. Receipt has no provider error text/payload slot for accidental content logging.

Lease rows contain `{id,leaseToken,deviceId,platform,token,payload}`. Payload is fixed: title `Between Us`, body `Open Between Us to check for updates.`, data only random `invalidationId`. No name, message/body/response, journal text, report or finance/matching data. The service adapter must not log tokens or private message parameters. SQL has no FCM/APNs credentials and does not deliver to a provider or a physical device. Actual worker transport, credentials, platform/device receipt evidence and owner approval remain separate gates.

## Error and integration notes

`42501` is generic denial/unavailable; do not convert it into account-existence or block-direction explanations. `22023` is bounded input/idempotency validation; `54000` is a retry-later quota. Mobile must map the three response enums deliberately and keep the exact reviewed body separate from local journals. Report/privacy descriptions are deliberately submitted server content; private unsent drafts are never uploaded automatically.

Required root validation includes applying complete 001/002/003 serially, pgTAP file, concurrent block/send/withdraw/lease requests, current-session HTTP tests, stale-Realtime content-free behavior, and root worker delivery tests. Auth/privacy/helper contract changes must be reviewed with these callers. Physical push and staffed safety response are not established by SQL or synthetic fixtures. Retention jobs, backup/deletion/export execution and broad external-contact enrollment remain release work, not hidden claims of completeness.
