# Bounded notification worker cycle

2026-11-16. The server-only `createNotificationCycle` composes the neutral Expo transport, service-only check-in producer, projected finance notification producer, dispatch worker and receipt worker. Migration023 is pending root serial application/review. No policy, provider credential, cron/deployment, paid resource, public endpoint or real push was enabled or executed by this task. Default operation is disabled.

## One-shot contract

`createNotificationCycle({serviceClient?,configuration?,request?,monotonicNow?,financeCursor?}).run(limit = 20)` accepts a trusted service-only API client and the existing `ExpoNotificationConfiguration`. The default `{}` configuration returns `status:"disabled"` with no cursor read/write, producer call, database lease or provider request. Missing service client or incomplete explicit provider configuration returns `not_configured`, also without work.

Operational transport requires all existing gates: `enabled:true`, `credentialsReady:true`, a nonblank owner approval reference, valid Expo project UUID and valid server-only enhanced-push access token. These are trusted owner-supplied settings, not account metadata or family-administrator authority. The flags do not prove that APNs/FCM credentials, legal/operational review or device setup have actually been completed.

An enabled call performs only these phases, strictly serially:

1. `api.produce_due_checkins({p_limit:limit})`.
2. Read the private finance scan cursor, run `createFinanceNotifications.produce({limit,afterChildId})`, and persist its next cursor if checked.
3. Existing `worker.dispatch(limit)`, using the finance wrapper's service client for current projection authorization.
4. Existing `worker.pollReceipts(limit)`, using the same wrapped client.

Scope/dispatch limits are integers1–20, checked before the first RPC. The financial producer reserves an event budget `max(8,limit)` (still at most20) so even a one-scope/one-dispatch call can atomically queue all eight current guardian targets without consuming a partial fanout. Finance `created` can therefore exceed a limit below8; check-in/dispatch/receipt limits remain unchanged. The due result must contain exactly `{status:"checked"|"disabled",created:integer0..limit,sent:false}`; a disabled result must have created0. Malformed/extra/private fields fail closed before any dispatch lease/provider send. A disabled check-in feature does not prevent separately authorized queued messages or other enabled domain events from being processed.

The existing transport/SQL retains neutral payloads, current consent/contact/session/device checks, feature/global opt-in policy, quiet-hour deferral, attempt limits, SQL lease ownership and shared quotas. The cycle changes none of these policies. Receipts only poll already due tickets; newly accepted tickets normally wait the existing15-minute delay and are not immediately redelivered. No phase automatically loops to exhaust a backlog.

The023 financial policies default OFF. Only reviewed operational transport enables the producer component at all; SQL independently requires the new feature and existing push policies. Scheduled reminders use actual due unpaid allowance from canonical child `financeView`; savings signals use first observed child-visible100% goal completion, with no historical baseline congratulations. Hidden revisions never become public fields or notification causes. Both dispatch and receipt authorization freshly reproject these sources; an unwrapped SQL authorization cannot bypass that check. See [domain notification definitions](DOMAIN_NOTIFICATIONS.md) for once-only/correction/baseline semantics. No finance command post-commit hook was added.

Pure cycles may inject `financeCursor:{read():Promise<string|null>,write(value):Promise<void>}`; the default cursor lasts only for that cycle instance. An external one-shot scheduler must persist it privately to avoid repeatedly scanning only the first20 children. Cursor operations start only after provider approval/configuration succeeds. A malformed cursor or failed write stops before dispatch; known producer counts remain available if SQL already completed.

One cycle instance rejects an overlapping call as `busy` without another RPC. This is an in-process guard, not distributed scheduler ownership. The deployment owner must serialize or deliberately review multiple job instances and rely on the existing transactional SQL lease/idempotency protections. A service client supplied by a hosted job must also enforce finite request/statement/lock timeouts; batch limits alone are not a wall-clock guarantee.

## Output and failure semantics

The result contains only `status`, `checkins`, `finance`, `dispatch`, `receipts`, `deviceDelivered:false`, `read:false`, and an optional `{stage,code}` error. Finance returns only `{status,checked,created,sent:false}`; its child UUID cursor is removed. Dispatch/receipt results are projected to the existing exact count/status fields. No device token, credential, ticket, cursor/invalidation/source ID, name, text, domain kind or selected recipient is returned.

`providerAccepted` means the provider ticket was recorded. `providerReceived` means a provider receipt reported handoff. Neither establishes device display, user receipt/read or actual money movement. The false device/read fields are never upgraded by this cycle.

Disabled/not-configured/busy cycles have null phase results because they did no work. During an error, earlier completed phases retain their validated counts, the failing phase remains null and later phases do not run. A failed batch may have partial SQL/provider effects before failure; null is deliberately **unknown**, not an invented zero count. The owner retries another bounded cycle using existing lease/ticket semantics. Raw SQL/provider/transport exceptions never enter the summary or CLI output.

## Local-only CLI

The new `services/backend/scripts/notification-cycle.mjs` is directly runnable with the existing installed Node/tsx/Supabase dependencies. No package script change is required for review; root may add a convenience command separately.

Safe default/dry-run commands:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node .\scripts\notification-cycle.mjs
node .\scripts\notification-cycle.mjs --dry-run
```

Both return a disabled summary **before** inspecting any credential environment variable, reading `.local/status.json`, importing the service client/TypeScript runner, leasing SQL work or making HTTP requests. Unknown/mixed flags fail without echoing arguments or reading credentials. There are no CLI arguments for secrets or arbitrary URLs.

The only operational flag is `--run-approved-local`. It reads these server-process environment settings only after that deliberate flag:

| Variable | Required owner value |
| --- | --- |
| `BETWEENUS_NOTIFICATIONS_ENABLED` | Exactly `1` |
| `BETWEENUS_NOTIFICATIONS_CREDENTIALS_READY` | Exactly `1`, after platform/provider setup has actually been reviewed |
| `BETWEENUS_NOTIFICATIONS_OWNER_APPROVAL_ID` | Bounded opaque owner review reference; no private content |
| `BETWEENUS_NOTIFICATIONS_EXPO_PROJECT_ID` | Actual approved Expo project UUID |
| `BETWEENUS_NOTIFICATIONS_EXPO_ACCESS_TOKEN` | Private valid server token, injected privately, never an Expo public variable or argument |

Missing/invalid configuration returns `not_configured` before reading status or cursor. Approved configuration reads the existing ignored `.local/status.json` and requires exact API `http://127.0.0.1:54321` plus loopback Postgres port54322/database `postgres`, without query/hash. It creates a server-only client for exposed `api`, with no session persistence/auto-refresh and a20-second request-header timeout. Provider sends retain the existing fixed HTTPS endpoints,8-second abort and bounded response handling. The wrapper is a single cycle, not a daemon.

Approved local runs exclusively create `.local/notification-finance-cursor.lock`, then read/write `.local/notification-finance-cursor.json` as bounded `{version:1,afterChildId:UUID|null}`. Writes use an own random temporary file, flush/close and rename; the cursor is never printed or treated as a credential. Files request owner-only POSIX mode where supported; Windows file ACLs remain the server owner's responsibility. Missing cursor starts at null. A malformed/oversized/non-file cursor is preserved and rejected. An existing lock is never deleted automatically: after a crashed process, the owner must verify that no worker owns it before reviewing/removing that specific stale lock. No blanket filesystem/process cleanup occurs. The helper removes only its own lock on normal completion. Default/dry-run touches none of these files.

After explicit owner authorization, private credential injection and separate reviewed local policy enablement, the owner may invoke:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node .\scripts\notification-cycle.mjs --run-approved-local
```

This task supplied no real values and did not execute that command. A failed summary sets process exit code1. Output is only the sanitized JSON summary; status/configuration files and errors are not dumped. The CLI cannot target a hosted project, cannot enable push/domain/check-in policy and cannot obtain a user's consent/device preference for them. Locally authorized synthetic SQL policy does not authorize a real provider send by itself.

## Hosted integration and remaining owner actions

The pure TypeScript cycle can be imported by an independently reviewed private server job. The owner must approve the hosted project/provider setup, APNs/FCM project/platform credentials, enhanced push security, secret custody/rotation, SQL migrations/default-closed policies, feature enablement, opt-in device enrollment, free-tier/spend controls and actual native delivery behavior first. Provision an approved service-only client and validated configuration **only on that server**. Never place service keys/access tokens in mobile bundles, account RPC parameters or a public HTTP trigger.

No hosted invocation endpoint or scheduler was created. The owner must choose/review a private invocation mechanism and finite concurrency/frequency/timeouts, record redacted count-only operational evidence, and handle disabled/failed/busy summaries. Credentials, cron/deployment/accounts/physical-device operations remain external gates requiring owner authorization; the source does not claim they exist.

Existing receipt purge, privacy/domain/check-in retention, legal-hold review and provider/backup erasure remain separate bounded jobs. This cycle does not run privacy operator workflows or claim deletion completion. Projected milestones require023 and its separate default-off policy; no phase promises physical delivery. See [domain notifications](DOMAIN_NOTIFICATIONS.md) and the existing notification/privacy contracts.

## Verification

Nine focused cycle tests, six financial projector tests and eleven existing transport tests pass (26 total): disabled/incomplete zero RPC/HTTP/cursor access, exact serial limit20 phases and count-only output, malformed/bounded due schema denial, independently disabled production with ordinary dispatch, overlapping instance calls, serial failure/unknown partial-count semantics, cursor advancement/corruption/write failure, financial projection/authorization, minimum-eight fanout reservation at limit1 and CLI default/dry-run zero configuration/status-port access. Provider transport is injected fake fetch; no real HTTP/provider/SQL/local service was exercised. Scoped strict TypeScript and CLI syntax checks passed. Cursor filesystem behavior,023 PostgreSQL capacity/export/hold assertions and the new two-connection hold/observation retention regression remain unexecuted here. No dependency was installed or changed.

Root owns final package integration, managed Auth/Postgres regressions, actual local approved dry/operational invocation and all hosted/native evidence. Default-disabled source checks do not establish configured push delivery or staffed operations.
