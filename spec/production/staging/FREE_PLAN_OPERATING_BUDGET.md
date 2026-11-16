# Supabase Free operating budget

Reviewed 2026-11-16. Supabase Free is the selected backend. **LOCAL implementation and estimates only; hosted project remains unprovisioned.** Owner spending authorization is $0. No automated upgrade, paid fallback, cloud inference, SMS or financial transfer is implemented. Existing hardware, storage, domain ownership, labor and specialist review still have costs.

## Current published limits

| Resource | Free allowance | Scope / practical limit |
| --- | --- | --- |
| Database | 500 MB | Per project; shared CPU / 500 MB RAM |
| Active Free projects | 2 | Check eligibility/ownership before any creation |
| Auth | 50,000 MAU | Organization usage |
| Uncached / cached egress | 5 GB / 5 GB | Independent pools; cached allowance cannot fund RPC or dump downloads |
| File storage | 1 GB | Uploads remain disabled in this implementation |
| Edge Functions | 500,000 invocations | Organization monthly usage |
| Realtime | 2 million messages; 200 peak sockets | Monthly messages shared; validate actual project connection settings |
| Realtime bursts | 100 messages/sec; 100 joins/sec | Per project; average monthly use does not prove bursts fit |
| Functions runtime | 256 MB, 2 CPU sec/request, 150 sec wall time | Hosted limits; no inference on the server |

Sources: [current pricing](https://supabase.com/pricing), [billing scope and allowances](https://supabase.com/docs/guides/platform/billing-on-supabase), [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [function limits](https://supabase.com/docs/guides/functions/limits). Recheck the actual organization before approval. Most quotas aggregate staging plus production and other projects; do not budget each project a separate organization allowance.

Free can pause after low database activity over seven days; the current guide gives a **one-year** dashboard resume window. This is not an availability SLA or substitute for owner-controlled recovery copies. Read pause-warning email, record who resumes the project, and show honest outages; do not fabricate keepalive traffic. [Current pause rules](https://supabase.com/docs/guides/platform/free-project-pausing).

Free excludes managed automatic daily backups and PITR. Use approved encrypted off-platform logical exports and real restore proof; a complete recoverability inventory and named operator are required. [Backup recommendations and exclusions](https://supabase.com/docs/guides/platform/backups), [local recovery work](BACKUP_RESTORE_DRILL.md). Target RPO/RTO remain owner decisions; a four-export/month capacity assumption does not approve a seven-day RPO or establish any RTO.

## Repeatable model

Code: `services/backend/src/free-plan.ts`, exported `estimateCapacity(families, overrides?)`. Defaults: four accounts/family, 30-day month, ten messages/day at 4,096 stored bytes with 30-day history; six finance commands/day at 1,536 combined stored bytes over a **365-day growth horizon**; 65,536 identity/consent bytes/family; two check-ins and twelve notifications/day at 512 bytes with 30-day history; 0.1 cases/month at 8,192 bytes over six months; 1.5x index/row overhead plus 40 MB fixed database reserve. These sizes, horizons and periods are assumptions, not measurements or approved deletion policy. Finance history is not deleted at the forecast horizon. Legal holds, retained shared history and growing aggregate snapshots can increase use.

Each account assumes 40 Edge calls and 100 KB app egress/day, with 1.1x retry reserve. Ten percent of accounts are active simultaneously with 1.25 sockets each. Each message/finance/check-in mutation reserves three metered hints, covering fan-out conservatively rather than claiming the exact current publisher shape. [Actual Realtime metering](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages).

Four full database-equivalent logical exports/month are added to uncached egress; the ratio may be increased, never discounted below one in the model. App traffic includes a planning allowance for Auth/RPC/functions/Realtime; operator must measure all transports and avoid double-counting actual dashboards. The fixed overhead and backup ratio need measurement. Logical dumps are not automatically compressed to a fraction of database size. [Unified egress definition](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

| Families | Database MB at horizon | Uncached GB/month incl exports | Edge invocations/month | Realtime messages/month | Peak sockets | MAU |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 113.2 | 0.585 | 52,801 | 17,820 | 5 | 40 |
| 100 | 771.7 | 4.407 | 528,000 | 178,200 | 50 | 400 |
| 500 | 3,698.6 | 21.394 | 2,640,000 | 891,001 | 250 | 2,000 |
| 1,000 | 7,357.2 | 42.629 | 5,280,000 | 1,782,001 | 500 | 4,000 |

Rounded-up numeric counts can include one extra request from conservative floating-point ceiling. Under these assumptions, 100 families exceed database and invocation quotas; 500/1,000 also exceed egress/concurrency. Ten families is a candidate for measured synthetic qualification, **not proven hosted capacity**. At 500 MB, a daily full export can consume 15 GB/month before app traffic; four exports consume 2 GB. A stricter recovery objective must fit the same egress budget or return an exact owner decision; never silently skip backups or upgrade.

No burst throughput, transaction latency, CPU/RAM, schema bloat, cold start, held-report volume or restore qualification follows from these arithmetic estimates. Measure `pg_total_relation_size` by data/index class, actual query/write rates, exported bytes, queue lengths and provider aggregate usage on an authorized synthetic project; adjust inputs and reserve usage for every project in the organization. No child details are needed to measure those resources.

**Separate application viability blocker:** current p3 `services/backend/src/finance.ts` caps each child's visible event history at **128**, hidden history separately at **32**, with bounded occurrence/goal/rule/payout/payment collections. This is an application guard even when provider usage is low. With two children/family, six commands/family/day, a 10% hidden-command fraction and one event/command, evenly distributed history reaches visible capacity after about **47.4 days** and hidden capacity after **106.7 days**. Uneven use, existing history and commands emitting multiple events can stop earlier; these are illustrative empty-history estimates, not promised duration. The 365-day forecast is a prospective cost horizon **beyond current supported application capacity**. Dashboard JSON/HTML explicitly exposes this blocker. No history deletion, cap increase or unbounded ledger is authorized by the model. Root owns any separately reviewed bounded-ledger work; retain this source-bound p3 inventory until new code and longevity evidence supersede it.

### Actual local finance capacity benchmark — 2026-11-16, before optimization

`scripts/finance-capacity-benchmark.mjs` and four focused tests exercise the existing engine directly, leaving backend/SQL limits unchanged. Reproduce from the backend package:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node --import tsx .\scripts\finance-capacity-benchmark.mjs --output .local\staging\finance-capacity
if ($LASTEXITCODE -ne 0) { throw 'Finance benchmark failed.' }
node .\node_modules\tsx\dist\cli.mjs --test tests/finance-capacity-benchmark.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Finance benchmark checks failed.' }
```

Actual [tracked aggregate-only report](finance-capacity/before-hoist.json), generated **2026-11-16T19:58:25.956Z**, SHA-256 **`ad4bbf03b642b00b3773d10b42d48e5f696b0593998b90dac8b8da757b8cc1a4`**. Original output and companion Markdown remain in `services/backend/.local/staging/finance-capacity/`. Runtime: Node **26.13.0**, Windows x64, AMD Ryzen 7 2700X, 16 logical CPUs. Twenty measured samples per actor/profile/size after three warmups; twenty rows total. No database, HTTP, provider, device, real family data or credential was used.

Each independent attempt round-trips fresh input JSON, calls actual `applyFinanceCommand`, both actual parent/child `financeView` projections, and serializes the resulting state. Report includes each component, median/p95 wall milliseconds, Node process CPU milliseconds, bytes and sampled process RSS. This conservative in-process pipeline excludes Auth/network/SQL and concurrency. Parent probe configures a plan; child probe edits a goal or creates one for empty state.

The fictional workflows span calendar 2026 with unique chronological command IDs and safe integer cents. This simulates a year ending December 31; it does not claim that the current SQL server accepted future-dated records. Actual engine builds the substantive prefix: chore assignment/submission/approval, automatic savings, goals, manual payout/payment/acknowledgment, hidden matching/funding and household saving/transfers. Known effect-free edits/transfers/configuration extend finite large fixtures, then both role projections fully replay/validate them. Fixture preparation is excluded from measured timings. The stress profile retains current collection ceilings (100 occurrences, 32 goals, eight rules, up to 32 payouts, one payment/payout); it does not pretend to be 365 separate daily chores. Every fixture passed integer conservation and exact child-projection equality against a world with hidden-only events removed. This is bounded functional evidence, not proof of timing noninterference or arbitrary histories.

| Existing events | Household p95 pipeline / Node CPU ms, worst actor | Stress p95 pipeline / Node CPU ms, worst actor | Household / stress state bytes |
| --- | --- | --- | --- |
| 0 | 0.52 / 0 | 0.42 / 0 | 102 / 102 |
| 128 | 8.08 / 16 | 113.83 / 125 | 35,126 / 58,184 |
| 512 | 19.52 / 32 | 204.33 / 218 | 139,830 / 184,850 |
| 1,024 | 36.78 / 48 | 340.52 / 359 | 279,400 / 324,397 |
| 4,096 | 346.57 / 391 | 1,303.91 / 1,298 | 1,117,032 / 1,161,517 |

Zero Node CPU readings at submillisecond sizes reflect Windows process-accounting resolution, not free execution. Whole-process sampled RSS reached **402.8 MiB** during the 128-event stress rows, while later stress rows ranged roughly 199–236 MiB. Rows share one process and retained native/GC memory; RSS includes fixture preparation and the tsx/Node runtime. This is neither per-request memory nor a measured Edge isolate peak. It **cannot qualify the hosted 256 MB limit** or justify a monotonic event-to-memory bound. Node CPU also cannot establish the hosted two-CPU-second allowance. The 4,096-event stress result leaves too little unmeasured runtime/concurrency headroom for a blind Free-tier increase.

Source hashes were stable before/after the run: engine **`991d1a62c72174d37d88a1289b48b7aeac5719985d6e504d4de8179d87b10398`**, types **`1d2d6d6f0cd817f9008ecdfda21660b587ce15f77949af80b186298479e7de41`**, calendar **`63006abd19e84ac8e4de972de71d5e9c41b9a01948af2bd5a5a62531296b5202`**, backend finance **`e6c2cdbeb350287f49a2e51914a29a4da68a6d320ba518df47e8fc12c76a4ecf`**, benchmark script **`0587506126208e17bde8d7732a58a8b60976094cf8fbdaa71948dad1b333812a`**. Both package manifests and lock hashes are recorded in the JSON report. These identify this local snapshot; later source/cap changes require new evidence.

Engineering recommendation: first remove the identical `localDate(c.at, zone)`/new-Intl work repeated for each date inside the replayed assignment loop, preserving validation and authorization; rerun the same source-hashed benchmark. Then consider a finite synthetic-staging event envelope with explicit aggregate bounds and adversarial tests, rather than raising per-child caps alone: 512 visible + 128 hidden events across twelve children could create **7,680 aggregate events**, beyond this 4,096-event measurement. Visible and hidden budgets must remain independent so hidden activity cannot consume a child's visible quota. A per-family hard envelope also needs sibling/privacy review and multi-child worst-case measurements. Do not call a candidate Node result hosted qualification.

The unchanged 100-occurrence and 32-payout ceilings remain independent longevity limits even if event replay becomes faster. A year of daily chores/per-task payouts cannot fit those collections. Sustainable archive/checkpoint work requires a reviewed replay format retaining source lots, idempotency identities, caps/months, payment/reversal provenance and hidden matching, with transactional migration/restore proof; deleting old financial audit events or resetting history is not an acceptable shortcut. No checkpoint, archive or cap change is implemented by this benchmark. Four focused tests and backend typecheck pass; this subsection records actual measurements without approving production capacity.

#### Identical post-hoist comparison

Root hoisted the unchanged command/zone date calculation once per `assign_chore` and `edit_chore`; no role, amount, event shape or cap changed. The identical benchmark script SHA above produced a separate [tracked aggregate-only report](finance-capacity/after-hoist.json), generated **2026-11-16T20:02:43.879Z**, SHA-256 **`361a9a2971a76f29fa79120d5b7757da15a249b88fcb4dd109959858170b30e3`**. Original output remains in `.local/staging/finance-capacity-after/finance-capacity.json`. New engine SHA: **`4d285d415ba50338c8abb437458f5f64d5b9068dbdea2708bed34b4efa0262bc`**; other source/manifest hashes remain in that report. Both reports and exact original benchmark source copies are preserved locally; neither run was overwritten.

| Stress events | Before / after pipeline p95 ms, worst actor | Before / after Node CPU p95 ms, worst actor |
| --- | --- | --- |
| 128 | 113.83 / 76.80 | 125 / 109 |
| 512 | 204.33 / 261.99 | 218 / 219 |
| 1,024 | 340.52 / 698.84 | 359 / 484 |
| 4,096 | 1,303.91 / 1,736.84 | 1,298 / 1,625 |

The 128-event stress row improved, while larger observed p95 values rose. These are sequential shared-machine runs with scheduling, GC/native allocation and measurement noise, not a controlled causal performance experiment; **no overall speedup is established**. The hoist removes identical pure work, but the long history/collection replay remains the major qualification problem. Sampled whole-process stress RSS still reached approximately 305 MiB after the change, which cannot establish the hosted 256 MB memory gate. All replay, integer and exact child hidden-world checks still passed. Hosted CPU/memory qualification remains untested, and the larger results strengthen the decision to retain finite current limits rather than blindly raise them.

#### Full twelve-child aggregate — actual current and prospective comparison

The extended script's `--family` mode measures the **whole aggregate**, rather than multiplying one-child timing. It first constructs a twelve-child fixture at each unchanged 128-visible/32-hidden budget: **1,920 total events**, 100 occurrences, 32 goals, eight rules and 32 payouts **per child simultaneously**. Each child has seven approved earnings, 32 manual payout/payment records, eight child acknowledgments, matching and 31 private funding events. Prefix business operations are created through the actual engine; there is no real transfer or backend cap override.

The separately labeled prospective fixture has **512 visible/128 hidden per child**, totaling **7,680 events**; all collection ceilings stay unchanged. This is a hypothetical measurement mode, not admission configuration or a supported capacity promise. Remapped unique fictional subject/event/reference IDs are interleaved chronologically. All twelve parent totals reconcile exactly; first/last child projections pass full hidden-event equivalent-world checks and exclude peer identifiers. Three-child focused tests additionally exercise every child's role. Financial amounts and raw DTO/content are not stored in the tracked reports.

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node --import tsx .\scripts\finance-capacity-benchmark.mjs --family --output .local\staging\finance-capacity-family
if ($LASTEXITCODE -ne 0) { throw 'Whole-family finance benchmark failed.' }
```

Actual [tracked whole-family report](finance-capacity/family-current-and-prospective.json): **2026-11-16T20:09:10.689Z**, SHA-256 **`6d3b300cbc2cd541b48591497a038cbed8232b2f73828c5695534602f29c794e`**. Same Node/Windows hardware and post-hoist engine SHA above; extended benchmark script SHA **`10cc5dc96d81aaa27b35f9418903fa4e38c132f54177d808f23a09f507fb50bb`**. Four rows, each twenty measured samples after three warmups. Every command attempt freshly parses the complete family, uses actual apply and both selected-child role projections, then serializes the complete resulting state. The current-cap probe intentionally tries one extra pure-engine operation to measure its cost; actual backend admission would reject it at the unchanged cap.

| Per-child budgets | Actor | Pipeline median / p95 ms | Node CPU p95 ms | Aggregate bytes | Maximum sampled whole-process RSS MiB |
| --- | --- | --- | --- | --- | --- |
| Current 128 / 32 | Parent | 256.90 / 314.37 | 360 | 677,660 | 273.7 |
| Current 128 / 32 | Child | 271.01 / 904.20 | 562 | 677,660 | 301.6 |
| Prospective 512 / 128 | Parent | 1,990.33 / 2,223.61 | 2,155 | 2,757,512 | 315.0 |
| Prospective 512 / 128 | Child | 1,926.03 / 2,093.58 | 2,109 | 2,757,512 | 312.9 |

**Decision: retain existing finite caps.** The prospective twelve-child case already exceeds two seconds of **Node** process CPU before unmeasured HTTP/Auth/SQL/concurrency; it is counterevidence to a blind per-child increase. Node CPU is not a direct hosted Edge result, so no hosted pass or precise Edge failure is asserted. Current-cap timing/RSS also cannot qualify Free's 256 MB isolate or deployment availability. Safe current operation and any future larger envelope still require actual isolated hosted resource measurements once authorized.

The unresolved long-term replay/archive/checkpoint design is an **internal engineering release gate**, not merely an owner credential or external approval blocker. It must preserve role privacy, cross-family/session authority, integer/source-lot accounting, hidden matching, immutable financial audit and idempotent recovery through migration and restore. This benchmark adds no scoped-book optimization, cap change, archival format or deletion. Six focused benchmark tests plus backend typecheck pass. Root owns final integrated tests and source/build freeze; assisting-agent checks are not independent certification.

## Operator dashboard and circuits

From a PowerShell terminal:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node .\scripts\free-plan-dashboard.mjs --sample --output .local\staging\budget-sample
if ($LASTEXITCODE -ne 0) { throw 'Offline budget sample failed.' }
Start-Process .local\staging\budget-sample\dashboard.html
```

Sample usage is zero by construction and labeled `synthetic-sample`. `--input .local\staging\aggregate-usage.json --output .local\staging\budget-review` accepts **only** `{plan:'free', projectAvailable:boolean, collectedAtMs:number, metrics:{databaseBytes,uncachedEgressBytes,cachedEgressBytes,storageBytes,monthlyActiveUsers,edgeInvocations,realtimeMessages,peakRealtimeConnections,realtimeMessagesPerSecond,channelJoinsPerSecond}}`, with every metric a finite nonnegative number. Use JSON double quotes in the actual file. Extra fields, strings, names, IDs, content, amounts and tokens reject without echo. The script performs no telemetry/network collection; supplied values are labeled operator-supplied/unverified. Missing, future, over-15-minute-old or non-Free inputs fail closed in `assessUsage`.

Engineering defaults, pending owner operating approval:

| Band | Aggregate utilization | Operator decision returned by pure module |
| --- | --- | --- |
| Normal | Below 50% | Foreground/background/new-family work allowed for review |
| Warning | 50% to below 70% | Investigate trend and next export; foreground remains allowed |
| Restricted | 70% to below 90% | Stop new-family admission and background work; review remaining budget |
| Unavailable | At least 90%, stale/invalid input or provider unavailable | Stop mutations/background/admission; retain safe reads and offline safety resources |

The pure module returns **decisions, not enforcement** and has no RPC, telemetry, database or network side effects. Separately, migration `202611160026_resource_guardrails.sql` implements the database circuit below for root's serialized application/qualification. Edge-only controls cannot stop direct RPC use. Provider meter lag means sampled decisions alone are not a hard resource cap. Keep operational totals restricted to authorized operators and return generic client unavailability; per-child counters or hidden finance activity must not become a side channel.

### Database circuit (migration 026)

Private singleton policy defaults enforced, with maximum 15-minute sample age and thresholds that cannot be raised past 50/70/90. Service-only `api.record_resource_sample(jsonb)` accepts the same exact ten-metric schema, rejects unknown/missing/string/negative/unsafe values, future/stale clocks and older replacement samples; server `pg_database_size(current_database())` replaces submitted database bytes. A strict table constraint and defensive band validator also reject partial restored/privileged rows. `api.resource_status()` is service-only and content-free. Client JWT metadata grants no policy/sample authority. No provider feed is configured or assumed; unknown metrics must not be supplied as zero. Hosted growth remains unavailable until an authorized operator supplies genuine fresh aggregates.

At 90% or missing/stale/unavailable sample, named BEFORE INSERT guards reject ordinary profile/family/child/membership/enrollment/contact/conversation/message/device/check-in/finance growth, and finance aggregate mutations are guarded too. Service-role and SECURITY DEFINER RPC writes execute the same triggers. Exact no-op updates and already-saved message/finance replay remain distinct from new mutation. All client failures use fixed SQLSTATE **PT503** and a generic temporary-unavailability message; no count, family ID or hidden amount leaves the guard.

At 70%, queued/preleased notification dispatch is refused; notification INSERT, suppression, receipt reconciliation and existing bookkeeping remain recorded rather than silently dropped. A dispatch already leased before the sample changed cannot be recalled. Existing queue/worker quotas still bound critical-path bookkeeping; an operator must review the reserve needed during outage. This is sampled backpressure, not an exact concurrency reservation, hard egress limit or provider billing guarantee.

Deliberate exceptions preserve authenticated reads, message acknowledgments, child skip/defer, blocking, existing consent withdrawal/revocation, account/session/device revocation, confidential report storage, own privacy request/export/delete/reauth/hold paths, audit and opaque invalidation hints. Their existing permission, operational gate, retention and rate checks remain intact. Excluding report storage does not enable public intake or staffing. Resource logic takes **no family/session/relationship row or advisory locks**; sampling writes only its own singleton, avoiding a new lock-order edge inside existing transactions.

Only the trusted server `deployment_policy.local_synthetic=true` permits existing isolated local fixtures to bypass sample enforcement; it is never derived from Auth metadata and must be false for hosted qualification. Root owns actual migration/test results; peer source review is not executed SQL or an independent audit. Aggregate global resource exhaustion can affect timing/availability across users; operator-only metrics avoid direct disclosure but do **not** prove absolute equivalent-world noninterference for all shared-storage thresholds. Independent review must assess that residual risk without adding child-specific counters or quota errors.

At the local 026 checkpoint, root reported migration application, **74 targeted resource SQL assertions PASS**, the full **1,025 assertions / 21 files PASS**, and **17 actual local integration scenarios PASS**. The first resource-test attempt stopped after 43 passes because its independent verifier lacked the separate verification scope; only the fictional fixture was corrected, and root reran it successfully. These counts overlap the foundation suites and are not added to historical totals. No hosted/provider telemetry, enforcement, SMTP or recovery qualification follows from those local results; final source/build and later integrated results belong to root's release receipt.

Existing API JSON limit is 8,192 bytes; ordinary pages are bounded, server workers use batches of 20, and retry loops remain finite. `OPERATION_LIMITS` records conservative ceilings for integration; it does not replace existing SQL authorization, request-specific limits, idempotency or protected mobile outbox limits. Never delete committed history to restore quota headroom. Safety, block/revocation and privacy containment need an explicitly reserved, reviewed control path during degradation.

Daily when active: assigned operator reviews content-free aggregate quota/burst/queue health, pause notices and backup success; weekly: compare projected next month plus all exports, test restore freshness and confirm Free plan/no add-ons. **Operator and backup cover remain UNASSIGNED / BLOCKED: OWNER.** Unknown values are not zero. A pause/zero-capacity event blocks financial mutation and leaves sends uncertain until receipt resolution; local journal access follows its existing bounded lease. No automatic retry/send/upgrade is authorized. [Incident ownership](OPERATIONS_AND_INCIDENTS.md), [email gate](AUTH_EMAIL_DELIVERY.md).

Local evidence: nine focused Free-plan/tool tests and backend typecheck passed on 2026-11-16; sample JSON/HTML and offline plan generated. Root records final integrated source identity and checks. Hosted quotas, alert delivery, operator response, real monitoring and capacity remain **UNTESTED / BLOCKED: OWNER**.
