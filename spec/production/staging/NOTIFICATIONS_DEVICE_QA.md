# Notification and device qualification

2026-11-16. **PHYSICAL PUSH: NONE / NOT RUN. HOSTED PUSH: NONE / NOT RUN.** No actual FCM/APNs/Expo provider send or receipt, device token collection, physical banner, tap or device-delivery result is established here. Local queue/token/lease/receipt/privacy/quiet-hour tests and native package/permission source review do not establish any of those outcomes. No delivery SLA, background guarantee, read receipt or staffed response is promised.

[Hosted results](HOSTED_STAGING_TEST_RESULTS.md), [email qualification](AUTH_EMAIL_DELIVERY.md), [security handoff](INDEPENDENT_REVIEW_HANDOFF.md), [supported-device requirements](../SUPPORTED_DEVICES.md) and [operations](OPERATIONS_AND_INCIDENTS.md) govern the separate gates. Push carries a neutral invitation to refresh authorized state. Journals, unsent drafts, reflection prompts, report details, private match terms and message bodies must never enter a notification or its logs.

## Actual evidence and its limits

| Evidence | Actual scope | Does not prove |
| --- | --- | --- |
| `services/backend/tests/notifications.test.ts`, `notification-cycle.test.ts`, `finance-notifications.test.ts` | Local unit transports/fixtures: neutral payload validation, bounded worker phases, failure/unknown accounting, fresh authorization and exact safe count output | Live provider configuration, acceptance, provider receipt or physical arrival |
| SQL `notification_receipts`, `domain_notifications`, `finance_notifications`, `resource_guardrails` and related communication tests | Local direct authority, token/queue lifecycle, preferences/quiet hours, lease/receipt handling, current source state and resource guard branches | Hosted enforcement or OS scheduling; a SQL token fixture is not a real device registration |
| Local immutable-bearer integration / lock tests | Root reported 17 integration tests passing after migration 026; current message/block/revocation and notification race behavior on local services | Hosted transport, provider races or revocation of a packet already handed to a provider |
| `push-registration.native.ts` and native configuration source | Explicit reviewed project UUID, native-only permission path, private Android lock-screen channel, bounded token shape and fixed failure message | Merged signed permissions/entitlements, actual OS prompt, provisioned FCM/APNs credentials or a usable real token |
| Root native Android emulator checks | APK 4 build/install and app screens; TalkBack remains PARTIAL as reported by Root and retained for the final device ledger | Physical push arrival, iOS, owner-signed release, spoken output or notifications accessibility pass |

The app has no approved push project in the current qualification. Default/incomplete worker configuration does no RPC/provider work. A successful registration UI must represent only a confirmed account-bound registration, not future delivery. Worker fields distinguish `providerAccepted`, `providerReceived`, `deviceDelivered:false` and `read:false`; the last two are deliberately not inferred from the first two.

## Required owner-controlled setup, not performed

Owner approval must name the exact synthetic project/build, provider account/project, two consenting adult-controlled physical platforms, allowable neutral test events, bounded send/receipt count, zero-spend ceiling, operator and stop/revocation plan. Each platform needs an eligible existing account and proper signing/provisioning/notification configuration. No eligibility or free entitlement is assumed. Any fee, paid account/add-on or unapproved external service is a blocker requiring an owner decision before action.

The owner supplies provider/service credentials directly to protected custody outside Git/chat, using the [hosted setup procedure](HOSTED_STAGING_TEST_RESULTS.md). Root reviews ACLs and process injection without printing values. The one-shot local runner reads these server-only names when explicitly authorized: `BETWEENUS_NOTIFICATIONS_ENABLED`, `BETWEENUS_NOTIFICATIONS_CREDENTIALS_READY`, `BETWEENUS_NOTIFICATIONS_OWNER_APPROVAL_ID`, `BETWEENUS_NOTIFICATIONS_EXPO_PROJECT_ID` and `BETWEENUS_NOTIFICATIONS_EXPO_ACCESS_TOKEN`. These names are not approval or proof of operational credentials. Its explicit `--run-approved-local` path can contact the provider and therefore needs separate owner authorization; it remains loopback-database-only. Default/`--dry-run` performs no credential/status lookup or send. There is no current hosted runner to enable by changing an environment variable.

Root reconciles the approved EAS project UUID with the app, provider, native package identifiers, signing profiles and installed artifact hash. Verify merged Android permissions and notification channel settings, and iOS entitlements/provisioning from the actual signed package. Never embed FCM/APNs/Expo server access credentials in a mobile bundle. Obtain a device token only through the explicit registration action on an approved adult-controlled test device; store it only in its protected account-bound path. Do not paste it in chat, reports, shell arguments or screenshots. No token is requested by this document.

Provider settings do not replace SQL gates. Any temporary synthetic push policy change requires a reviewed exact owner-authorized change, stays scoped to the isolated target and is returned to closed state after the window. Do not enable public enrollment/reports, bypass consent/contact/session checks or introduce an automatic schedule merely to obtain a banner. All child/teen fixtures remain guardian-managed; no 13+ shortcut or guardian journal access is permitted.

## Physical and provider matrix, all NOT RUN

Run on the exact approved installed Android and iOS artifacts, recording OS/build, artifact hash, tester and UTC time without device identifiers or tokens. Use neutral fictional events only; local fault injection covers high-volume/error branches, while any actual provider negative test must fit its approved low-volume window. Never fill a device/project quota or send repeated notifications to manufacture an outage.

| Case | Required positive/negative evidence | Current result |
| --- | --- | --- |
| First explicit registration; denied permission; cannot ask again; revoke in OS settings | Correct account, one deliberate prompt, denial/retry instructions without prompt loops or fabricated registration; browser unsupported honestly | NOT RUN |
| Account switch, sign-out, session revocation and token replacement/unregister | Token remains bound to current user/session; wrong/stale owner denied; no old-account reattachment after an async completion | NOT RUN |
| Foreground, background, locked device, process death, offline/reconnect and platform force-stop | Observe each OS state separately; document nondelivery/deferral and platform limits without promising background reliability | NOT RUN |
| Approved neutral event, provider send, provider receipt, visible arrival and tap | Correlate distinct stages; actual device observation and fresh authorized fetch after tap. A provider receipt is not device/read proof | NOT RUN |
| Lock-screen, notification shade, wearable/mirrored surfaces if supported, screen reader | Only reviewed neutral text; no private author/content/type inference, child name, match value or report detail. Validate audible output with the tester | NOT RUN |
| Quiet hours, disabled preference, timezone/midnight/DST and skipped check-in | No newly unauthorized send; bounded expiry/defer behavior, no catch-up flood, punishment, streak or nagging | NOT RUN |
| Contact block/remove/unverify, consent withdrawal, guardian/family change or account closure before dispatch | Current SQL reauthorization denies queued stale work immediately before transport; guardian relationship never authorizes another author's journal or confidential case | NOT RUN |
| State change after provider handoff | Record the admitted in-flight boundary: already handed-off bytes may arrive. Tap/fetch still checks current authority; no recall promise | NOT RUN |
| Expired/rotated/invalid device token, provider reject/timeout/rate limit and unknown acceptance | Sanitized failure category, bounded backoff/expiry, no privileged fallback or automatic flood; unknown partial effects stay unknown | NOT RUN |
| Worker overlap/crash/restart, duplicate event and delayed receipt | Lease ownership, idempotent source identity and bounded retry; inspect duplicate-banner behavior honestly without exactly-once claims | NOT RUN |
| Hidden finance change versus equivalent child-visible world | No new child notification/quota use from hidden-only projection change; separately assess aggregate timing/availability caveat | NOT RUN |
| Paused/unavailable project, stale/missing aggregate sample, 70% notification lease guard | Fail closed without dropping bookkeeping, claiming delivery or opening paid fallback; preserve safety resources | NOT RUN |
| End of test window | Disable approved provider work, revoke/unregister scoped test tokens/sessions as authorized, return policy closed and record any retained provider/device copies | NOT RUN |

## Safe result record and acceptance

For every case retain a non-secret approval reference, target/build hashes, platform/OS, exact synthetic scenario, expected result, observed registration/queue/provider/device/tap/fetch stages, timestamp, observer and redacted evidence reference. Capture neutral text only; no device token, bearer, callback link, raw provider request/response, personal identifier or private content may appear in tracked evidence. Notification absence requires a valid positive control and bounded observation window; it is not sufficient evidence by itself. An observer hearing the actual screen reader is required for spoken-output claims.

A receipt/API response alone cannot mark a device case PASS. Android and iOS require separate results; emulator/native source or Android evidence cannot fill the other platform. Record FAIL/PARTIAL/NOT RUN explicitly and preserve uncertainty after crashes or provider timeouts. A later block cannot retract a notification already accepted by a provider, nor erase a recipient's earlier copy.

Stop on wrong account/project/artifact, private-content leakage, missing custody/approval, unexpected spend, unbounded retries or authorization failure. Disable the narrowly scoped worker/provider authority through the approved incident procedure, preserve minimal evidence and re-test after review. Until actual authorized physical/provider evidence exists, notification delivery remains **NOT RUN** and cannot support a release claim.
