# Backend cost and free-tier analysis

Reviewed against official documentation: **2026-11-16**. Prices below are USD public list prices, excluding tax, labor, domains and outside delivery/identity providers; recheck before any owner-authorized provisioning. No account was inspected, paid plan enabled, credential supplied or cloud resource created. Scope is a free local synthetic-data foundation, not a production operating-cost promise. See [backend decision](BACKEND_COMPARISON.md).

## Current spend decision

Choose local Supabase for the spike: hosted service spend **$0**, with existing-machine/container runtime resources and engineering time still required. Container images and local databases use disk; keep them restricted to fictional fixtures and never expose the development stack publicly. The mobile prototype must not quietly switch to persistent backend data. Local runtime checks are reported separately by the integration owner. [Supabase local development](https://supabase.com/docs/guides/local-development).

## Supabase: preferred, with clear hosted limits

| Hosted Free dimension | Published allowance or restriction |
| --- | --- |
| Database / API | 500 MB database per project; unlimited API requests subject to resource limits |
| Identity | 50,000 monthly active users |
| Transfer / files | 5 GB egress; separately 5 GB cached egress; 1 GB file storage |
| Project lifecycle | Two active free projects; pause after one week of inactivity |
| Realtime monthly / concurrency | 2 million messages; 200 peak connections |
| Edge invocation allowance | 500,000 invocations |

These are service allowances, not a tested Between Us user capacity. Billing quotas are generally organization-wide; database size is per project. [Pricing](https://supabase.com/pricing), [Billing scope](https://supabase.com/docs/guides/platform/billing-on-supabase).

Free Realtime also permits 100 messages/second and 100 channel joins/second, with 256 KB Broadcast payloads. Edge Functions have 256 MB memory, 2 seconds CPU/request and a 150-second Free wall-clock limit; there are at most 100 functions/project. Functions are not a place for journal inference. [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [Function limits](https://supabase.com/docs/guides/functions/limits).

Free has no automatic backups or PITR. Supabase recommends regular CLI exports and off-site backups; an export procedure, secure retention and a restore rehearsal remain operator work, and real data exports require their own approved handling. Upgrading for backup/availability needs is a future owner decision. [Backups](https://supabase.com/docs/guides/platform/backups).

**Email is the first practical hosted blocker.** Default Auth SMTP sends only to project-team addresses, currently at 2 messages/hour, with no delivery SLA; it is not a public signup/recovery service. Use the local email catcher for synthetic tests. Public use needs separately approved SMTP account/domain setup and credentials; no external email provider or free allowance is assumed here. Do not disable verification/recovery requirements to avoid this gate. [Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Supabase says Free incurs no charges; exceeded allowances can lead to notification/grace/restriction, not unlimited free capacity. Stay on Free, avoid paid add-ons and monitor usage before admitting a synthetic hosted cohort. Pro starts at $25/month, includes $10 compute credit for one Micro instance; additional compute/projects and overages can add cost. Pro spend cap covers selected usage, while compute, PITR and other explicitly selected add-ons are excluded. A spend cap is not a universal invoice ceiling. [Cost controls](https://supabase.com/docs/guides/platform/cost-control), [Pricing](https://supabase.com/pricing).

If a future paid-plan decision is approved: published overages include $0.09/GB uncached egress above 250 GB, $0.00325/MAU above 100,000, $2/million Edge invocations above 2 million and $2.50/million Realtime messages above 5 million. These are future cost drivers, not authorization to upgrade. [Billing allowances](https://supabase.com/docs/guides/platform/billing-on-supabase).

## Cloudflare: meaningful free capacity, more assembly

| Workers Free component | Published allowance / implication |
| --- | --- |
| Workers | 100,000 requests/day; 10 ms CPU/invocation |
| D1 | 5 million rows read/day; 100,000 rows written/day; 5 GB total storage |
| D1 database limits / recovery | 10 databases; 500 MB/database; seven days Time Travel |
| SQLite Durable Objects compute | 100,000 requests/day; 13,000 GB-seconds/day |
| SQLite Durable Objects storage | 5 million row reads/day; 100,000 row writes/day; 5 GB total |

Workers and DO requests are separately metered; do not count one combined pool. Free DO is SQLite-backed only. Relevant over-limit operations fail; daily DO limits reset at 00:00 UTC. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

D1 reads measure scanned rows, so missing indexes can consume quota without many API calls; indexed writes also cost rows written. Realtime DO duration includes idle objects that cannot hibernate; use WebSocket hibernation in any future spike. A DO limit is not an end-user identity quota. Consumer identity, account recovery, relationship verification and transactional email need additional reviewed work/providers. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Access identity integration](https://developers.cloudflare.com/cloudflare-one/faq/authentication-faq/).

Paid Workers has a $5/month minimum; its included request/CPU amounts and D1/DO storage/compute overages are separate dimensions. D1 Paid includes 25 billion reads/month and 50 million writes/month, then $0.001/million reads and $1/million writes; storage above 5 GB is $0.75/GB-month. DO duration can dominate persistent socket workloads. This alternative may have low provider spend but higher implementation/on-call cost; no paid enablement or identity-provider purchase is justified for the present local foundation. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Firebase: useful Spark services, billing-gated trusted functions

| Product | Published no-cost allowance / restriction |
| --- | --- |
| Standard Firestore | 1 GiB stored; 10 GiB egress/month; 50,000 document reads, 20,000 writes and 20,000 deletes/day |
| Authentication | Non-phone methods available; Identity Platform lists 50,000 MAUs and 50 SAML/OIDC MAUs; Spark additionally has daily limits below |
| FCM | No-cost transport |
| Cloud Functions | Unavailable on Spark; Blaze lists 2 million invocations/month before $0.40/million plus other resource costs |

Spark requires no payment method. Functions on Blaze requires a linked billing account even when expected usage fits the no-cost invocation allocation. Build/artifact storage, CPU, memory, network and other services remain separate cost dimensions; free invocations are not a zero-invoice guarantee. [Firebase pricing](https://firebase.google.com/pricing), [Plan behavior](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Spark Identity Platform instrumentless limits are 3,000 Tier 1 daily active users and 2 Tier 2 daily active users. Auth Spark sends up to 1,000 verification emails/day, 150 password-reset emails/day and only 5 email-link sign-in emails/day; phone verification SMS requires Blaze and has region-dependent charges. These provider limits are not child identity/consent verification. [Auth limits](https://firebase.google.com/docs/auth/limits).

Firestore listeners consume reads for added/updated documents; reconnects can rerun queries. Rules-dependent reads, indexes and fan-out add usage. Managed PITR, backup storage and restore operations are billable; do not assume a free backup plan. Use cursors/limits and bounded listeners rather than a full-history live subscription. [Firestore billing](https://firebase.google.com/docs/firestore/pricing).

Budget alerts do not halt charges. Current Firebase docs also describe service-specific spend cap budgets for Functions, App Hosting, AI Logic and Extensions; they do not provide a project-wide Firestore cap. This distinction prevents treating a new Functions cap as a blanket no-spend guarantee. Stay on Spark if reevaluating locally; never link billing in this mission. [Avoid surprise bills](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).

## Planning envelope and controls

The following are planning assumptions, not measured capacity or provider guarantees: 25 fictional families, 100 accounts, 20 concurrent connections, 10 reviewed messages/family/day and 30 days. That is 7,500 user messages/month. If each creates one content-free Broadcast to two recipient connections, 22,500 Realtime metered messages result (one sent plus two received); other events, retries and joins are additional. Database changes are instead counted per listening client. [Realtime metering](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages).

At an assumed 4 KB combined stored footprint/message, those messages occupy about 30 MB before indexes, events, auth rows, projections and database overhead. A measured 100 KB egress/account/day would be about 300 MB/month for this cohort. These examples leave headroom under stated Free allowances, but bursts, queries and fan-out must be measured in the local spike and any authorized hosted pilot.

Use a local-only default; no public signup, uploads, cloud inference, analytics or real-child records. Bound request sizes, pagination, retry counts and subscriptions; rate-limit by account/family and enforce server idempotency. Track aggregate counts without private content. Define stop thresholds before a hosted synthetic pilot (for example 70% storage/egress/monthly-message budget and 50% connection cap), an owner contact and a safe read-only/degraded mode. Do not delete financial audit events just to save quota. Include SMTP/domain expenses, secure backups, abuse support, security review and incident response in any future production budget: no free tier supplies those obligations automatically.

Hosted pilot owner actions: approve provider/project/region and synthetic scope, provision a Free project without paid add-ons, approve email credentials/domain changes separately, assign backup/restore and quota monitoring owners, and pass the [production release gates](../mission/PRODUCTION_RELEASE_GATES.md) before real families. No evidence here supports a claim of perpetual free production service.
