# Neutral Expo push transport

Date: 2026-11-16. Status: server-side foundation code with fake-HTTP unit evidence only. Live transport defaults disabled, credentials are not configured and delivery is not operational. No push was sent, no Expo/FCM/APNs credentials were created, no scheduler/worker endpoint was deployed and migration 009 was not executed by this helper.

## Provider and privacy contract

Official Expo documentation was checked on this date. The HTTPS send endpoint is `https://exp.host/--/api/v2/push/send`; receipts use `https://exp.host/--/api/v2/push/getReceipts`. A ticket means Expo accepted a request; a successful receipt means handoff to FCM/APNs, not delivery to a device or a person reading it. Expo recommends checking receipts after 15 minutes and clears them after 24 hours. `DeviceNotRegistered` requires stopping sends to that token; rate limits and temporary service errors need bounded backoff. Enhanced push security adds a server Bearer access token. [Expo sending/receipts/security](https://docs.expo.dev/push-notifications/sending-notifications/).

Permission, project-bound Expo token registration, configured platform credentials and a compatible native build are prerequisites. The current Expo setup guidance supports approved device/emulator combinations, but this project still requires its own physical Android/iOS evidence. [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo FAQ](https://docs.expo.dev/push-notifications/faq/).

The project deliberately uses a small `fetch` adapter rather than adding another SDK. Its endpoints are fixed HTTPS URLs, redirects are refused, response bodies are capped at 64 KiB and requests abort after eight seconds. Private provider error messages/SQL/native details are never returned or logged. The only allowed notification is:

```json
{
  "to": "an approved registered Expo token",
  "title": "Between Us",
  "body": "Open Between Us to check for updates.",
  "data": { "invalidationId": "opaque outbox UUID" },
  "ttl": 300,
  "priority": "normal"
}
```

No names, message text, journal text/titles/IDs, unsent drafts, financial amounts/matching activity, report/case details, emotional scores, badges/counts, family/contact/recipient identifiers or deep-link paths enter the payload. This is a neutral prompt to open the app and reauthorize a fetch, not a delivery or read receipt. The token itself is sensitive routing data: private service-only lease results must never be attached to logs, analytics or user-visible API responses. Do not send device tokens or journal content to a browser client to drive this worker.

## Activation and integration

`services/backend/src/notifications.ts` exports `createExpoPushTransport(configuration)` and `createNotificationWorker({serviceClient,transport})`. Configuration is server-only:

```ts
{
  enabled?: boolean;          // false by default
  ownerApprovalId?: string;  // explicit reviewed owner setup reference
  projectId?: string;        // approved Expo project UUID
  credentialsReady?: boolean;
  accessToken?: string;      // server enhanced-push-security token
}
```

All five conditions must be supplied and valid before transport will process work. Merely passing `enabled:true` performs no lease or HTTP request. No credentials belong in `EXPO_PUBLIC_*`, a mobile bundle, fixture reports or repository files. `credentialsReady` is a reviewed configuration declaration, not a live credential probe or proof of actual delivery. The transport's internal `operational` property means configured permission to attempt requests; do not expose it as device-delivery verification. Existing user notification preference RPCs continue reporting `deliveryOperational:false` until root integration and actual device evidence justify a separately reviewed change.

Root must provision the owner-approved project, enable enhanced push security, configure correct Android FCM v1/iOS APNs credentials, obtain native Expo tokens for that project, validate opt-in/quiet-hour UX and register each token to the current own user/session. The opaque token string alone cannot prove its project or physical-device ownership. Existing registration prevents cross-user token reassignment; approved device-binding and project configuration must be reviewed together. Wrong project/credentials produce a permanent/configuration error and halt the remaining batch rather than retrying blindly.

The worker requires a server `service_role` client exposing only the intended RPC interface. Never instantiate it from a mobile session or add a public lease/send handler. This change does not install a timer, cron, Edge entry point, package dependency or resource. Root owns entry-point, migration promotion, deployment policy and scheduler integration after review. Global `communication_policy.push_delivery_enabled` remains false; this migration never enables it.

## Bounded dispatch and receipt lifecycle

- `dispatch(limit=20)` leases at most 20 jobs through existing `lease_notifications`; validates the whole returned shape, exact neutral copy, metadata and supported Expo token grammar; calls `authorize_notification` immediately before each external send, with no intervening queue/database await. Each notification is sent separately and serially. A malformed/private payload causes a fixed `invalid_batch` error before any send.
- Accepted tickets use new `record_notification_ticket`, atomically changing the outbox to `provider_accepted` and persisting the private ticket/receipt job. Repeating the same ticket/dispatch lease is idempotent; changed tickets or leases conflict. No extra message body or provider error blob is stored.
- HTTP 429/408/5xx, timeout, malformed/truncated/oversized response or per-device rate errors complete the existing SQL lease as `retry`. SQL owns retry times and the existing five-attempt cap; there is no in-process retry loop or unbounded sleep. Other HTTP errors are permanent; credential errors halt the batch. `DeviceNotRegistered`/invalid token results use the SQL invalid-token path, which revokes the device under its authorization rules.
- `pollReceipts(limit=20)` uses separate service-only receipt lease/authorization/completion RPCs. The first lookup is due 15 minutes after ticket acceptance. It passes only an opaque ticket ID to Expo. Missing/transient receipts retry their receipt job, at most eight attempts and no later than 24 hours; they never resend the original notification. Success is named `provider_received`, with `deviceDelivered:false` and `read:false` throughout.
- Every receipt lookup rechecks current session/account/device/contact/notification authorization. A blocked, acknowledged, revoked or otherwise ineligible job is suppressed rather than looked up. A valid `DeviceNotRegistered` receipt revokes exactly its registered device. No family or message metadata goes to the receipt endpoint.
- Dispatch and receipt batches share an in-process busy guard, run serially and stop starting new work after 45 seconds. A final eight-second request may still settle after that threshold. Unprocessed SQL leases expire after their existing 60-second lease and can be reclaimed later. Database leases, not the in-process flag, govern multiple worker instances.
- `purgeReceipts(limit=20)` removes at most 20 receipt rows older than 24 hours, including private ticket IDs, without contacting Expo. Root must schedule this cleanup even while push transport is disabled; it is deliberately available independently of transport readiness. Outbox/message retention remains governed by the separately reviewed privacy lifecycle.

Returned batch summaries contain counts and fixed statuses only. They never contain tokens, tickets, messages, author IDs or provider/raw database errors. A notification receipt never calls `ack_message` and cannot prove device receipt, reading, contact safety or consent.

There is an unavoidable gap between a successful local authorization transaction and an external provider request. A block/sign-out after dispatch cannot retract a neutral alert already accepted by Expo/FCM/APNs. A crash or connection loss after provider acceptance but before its ticket is durably recorded can lead to a later duplicate neutral notification; exactly-once delivery is not claimed. Ticket persistence failure stops the batch and must be monitored using content-free error codes. Never work around this gap by putting private content in notifications or treating a lost receipt as permission to share it.

## Pending migration and test evidence

`202611160009_notification_receipts.sql.pending` creates a private RLS-enabled receipt table and these service-only functions:

| RPC | Purpose |
| --- | --- |
| `record_notification_ticket(uuid,uuid,text)` | Atomic acceptance/ticket record with changed-replay denial |
| `lease_notification_receipts(int)` | Bounded due-job leases, expiry and current authorization |
| `authorize_notification_receipt(uuid,uuid)` | Immediate receipt-lookup authorization |
| `complete_notification_receipt(uuid,uuid,text)` | Fixed outcomes, bounded retry and invalid-device revocation |
| `purge_notification_receipts(int)` | Bounded 24-hour ticket metadata removal |

No receipt table or RPC is exposed to `anon`/`authenticated`; privileged access remains inside security-definer functions with pinned search paths. Root must promote/review/apply migration 009 before executing `supabase/tests/notification_receipts.test.sql`. That SQL test source covers denied client access, atomic/idempotent tickets, delayed polling, metadata-minimal leases, block-after-lease denial, provider versus device receipt, token revocation and bounded purge. It has **not been executed** by this helper and must not be listed as passed.

Actual source checks: full backend TypeScript check passes; `node --import tsx --test tests/notifications.test.ts` passes 11 tests. Every enabled transport in those tests receives a clearly synthetic injected HTTP function. Tests cover disabled/unconfigured no-op, strict payload rejection, immediate authorization ordering, token rejection/revocation outcome, bounded errors/timeouts, provider receipt classification, serialization/time budget and sanitized storage failure. No test used the default live fetch to send a push.

Still unavailable/unverified: approved Expo project/access token, FCM/APNs credentials and native tokens; SQL migration execution and concurrency tests; deployed worker/scheduler; signed Android/iOS push permission/token lifecycle; actual platform transport/receipt handling; quiet hours on physical devices; lock-screen preview/accessibility; token changes/reinstall/sign-out/block races; provider outage/retry drills; operational monitoring and independent child privacy/security review. Keep public delivery claims and the delivery policy disabled until the owner approves those gates.
