# Between Us: Three-Family Pilot and One-Year Financial History

**Approved product-scope change:** 2026-11-17
**Current development baseline:** `feature/staging-release-qualification` @ `7ece347` (finance checkpoints r3)
**Canonical local repository:** `D:\projects\BetweenUs`
**Status:** Owner-approved *targets*, **not yet implemented/enforced as production policy**, not legal retention approval, and not authorization to enroll real children.

## Locked pilot scope

| Setting | Owner decision | Engineering semantics |
| --- | --- | --- |
| Trial participants | **3 families maximum** | Enforce on the **server** when pilot enrollment is authorized; not just a form limit |
| Family size | No approved per-family maximum change | Capacity forecast assumes **2 children and 4 accounts per family**; counts are assumptions, not an enrollment policy |
| Default financial history | **1 year (rolling 12 calendar months)** | Initial product history/active online window; rolling calendar-year rules honor configured family timezone |
| Expandable future window | **Yes** | Versioned, configurable policy can extend to 18/24/36/60+ months after reviewed capacity, privacy and operational approval |
| Historical data | No unreviewed destruction | Original immutable events, identities, corrections, payouts and matching provenance remain protected until a lawful, approved lifecycle is implemented |
| Platform | **Supabase Free** | Pilot capacity must be proven in hosted synthetic staging before any public use |
| Real pilot authorization | **NOT YET GRANTED** | Consent, guardianship, trained safety staff, security/legal approval, hosted services, signing and supported-device checks remain release gates |

**Interpretation of one year:** The normal product history view, user-facing history filter, and operational budget target should cover the latest **12 calendar months**. A 365-day fiscal growth forecast remains a useful approximation, not a literal deletion timestamp. When date-window boundaries matter (leap year, month-end, DST, family time zone), use tested calendar arithmetic.

Do not erase or block correction of an outstanding payout, earned allowance, active savings goal, parent match, debt/adjustment, held legal record, or related idempotency evidence merely because the original event is older than 12 months. The one-year *customer-facing* window and a one-year *target data retention* are related but **not equivalent**. The 12-month retention target is a product request and still requires a reviewed deletion/legal-hold/backup policy, an irreversible-purpose audit, and evidence before automated expiration is enabled.

**No immediate automatic purge.** Checkpoints/archives currently preserve all accepted events and versions, even older than one year. Keeping a twelve-month UI window alone does not reclaim Supabase database storage. Research and implement a future authorized lifecycle path, such as safe redaction/expiry of settled nonessential details after independent retention approval or verified encrypted off-database archival with a restore/reconciliation route. Never simply truncate the ledger or remove permanent replay identities. Do not claim unlimited history without storage.

## Engineering tasks in dependency order

1. **Update pilot planning:** Use **3 families** as the first capacity scenario, still include larger expansion comparisons, and use the existing **365-day financeGrowthDays** setting for one-year estimates. Record actual finance-only measured one-year bytes and separate them from modeled full-product storage/egress.
2. **Add versioned pilot policy:** `pilotFamilyLimit=3`, `historyWindowMonths=12`, `retentionStatus=draft/unapproved`, `pilotEnrollmentEnabled=false`, `policyVersion` and `effectiveFrom`, with stable typed contracts. Do not allow ordinary mobile clients to configure this.
3. **Implement a transactional backend enrollment gate** on the appropriate family-activation path only **after** examining current Auth/family invitation flows. Count distinct **active pilot family IDs**, not users, child accounts or unrelated synthetic fixture families. Apply an atomic DB guard/advisory lock so two concurrent family activations cannot both claim the final slot. Retry/idempotency cannot double-count. Reject a fourth family with a safe, neutral error. With pilot enrollment OFF, reject all unapproved real enrollment regardless of remaining capacity. Removing a family must not free a slot prematurely where consent, deletion, or appeal is unresolved. Plan controlled admin limit increase without schema rewrite; require operator-reviewed Free capacity and approval.
4. **History filters and UX:** Default authorized parent/child financial history to the latest 12 calendar months; keep balances, approved earnings, savings goals, ongoing matching, unresolved payments and corrections correct across the boundary. Exports must include the lawfully required **full authorized retained** history, even if the screen defaults to one year. Parent-hidden match data must never leak in child UI/history/export/cursors. Older retained records must remain accessible for authorized correction/reconciliation when needed, using a bounded, audited flow.
5. **Future extension mechanism:** Make window and family count policy values server-controlled, allow versioned safe increases without a mobile update, and re-run projections/backups/security/permissions before enabling more families or longer history. Do not expose an arbitrary user-side "keep forever" option or disable legal deletion.
6. **Retention design and release gate:** Privacy/legal reviewers approve each financial data class, precise trigger, legal holds, backup expiry and verified deletion proof. Only then implement scheduled expiration or separate encrypted archival. No destructive migration against current fixtures or real data before sign-off.
7. **Tests:** exactly 3 accepted distinct fictional families / 4th denied; concurrency race; family-count vs users; blocked enrollment while policy disabled; future policy increase without bypass; calendar-month/year boundaries, leap day, timezone; one-year history view with older unpaid obligation and historical reversal; saved balance conservation and idempotent retry; no surprise match leakage; role-safe exports and old-source correction; backup/restore and holds. Run all existing mobile/backend/pgTAP/integration/browser/native tests relevant to changed behavior.
8. **Evidence:** Create a scoped pilot acceptance report documenting what is **IMPLEMENTED**, **TESTED**, **DRAFT**, and **OWNER-BLOCKED**. Record exact version, branch, commits, and provider usage. Do not mark capped enrollment as enforced until SQL/API concurrent tests pass.

## One-year, three-family capacity planning

Source-bound local PostgreSQL measurement from `spec/production/staging/FINANCE_CHECKPOINT_REPORT.md`:

- Measured one-year financial tables/indexes per child: **6,397,952 bytes** (52-week / 1,307-event fictional workload).
- **Six children (3 families x 2 assumed children): 38,387,712 bytes (~38.39 MB)** of finance-only measured local storage, before the rest of the service.
- Existing conservative `estimateCapacity(3)` assumptions model approximately **112.51 MB** total database storage at 365 days, **0.490 GB** monthly uncached egress including four full logical exports, **15,841** monthly Edge invocations under floating-point rounding, **5,941** Realtime messages and roughly **2** peak sockets. All are **unverified estimates** and many resources are shared across staging/production at organization level.
- No production lifetime guarantee: ongoing events, indexes, provider billing aggregation, backups, user activity, unfinished obligations and legal holds can exceed the illustration. Forecast is not a purge mechanism.
- A longer history or additional families require a new budget model plus measured hosted resource acceptance. Old five-/fifteen-year exercises are preserved as **historical stress tests** proving checkpoint correctness, not as approved default retention.

## Implementation safety and review boundary

Keep `main`, public demo, approved Open Letter brand, existing local data, prior migration history, and untracked diagnostic intact. Develop from `D:\projects\BetweenUs` on the current feature branch; do not force push.

No new paid service, real transfer, real-child enrollment, real-data deletion, or public deployment is authorized by this specification.

**Release gate:** current hosted/physical/legal/safety/operator/signing requirements remain **NO-GO**. Three families is the intended pilot size **after** those gates are approved, not a bypass for them.
