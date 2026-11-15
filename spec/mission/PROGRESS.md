# Combined mission progress

Canonical root: `D:\projects\BetweenUs`; branch `feature/mobile-foundation`.

## Dependency map and checklist

- [x] Relocation COMPLETE. Exact old-directory handle belonged to old ADB server; stopped with official command, helper succeeded, restarted at new root. Git/diagnostic preserved; remote synchronized.
- [x] Stage 0: inspect mission, linked product/security/design specs and existing source. No existing finance or intelligent-journal implementation. Baseline type/lint and 13 unit tests pass.
- [ ] Stage 1: parallel finance contracts, local inference feasibility, payment/security/UX review.
- [ ] Stage 2: task occurrences -> submission -> parent approval -> idempotent earnings -> payout eligibility. Parallel journal contract, contextual fallback and adversarial tests.
- [ ] Stage 3: multiple goals -> allocations/rules/transfers -> payout holds -> capped matching/reveal. Parallel native model feasibility and journal customization.
- [ ] Stage 4: role-aware finance and optional journal UI using existing Open Letter components and four tabs.
- [ ] Stage 5: full checks, serialized Pixel_10 interactions, both themes and actual screenshots. Correct defects and recapture.
- [ ] Stage 6: document verified functionality, unavailable capabilities, security release gates; commit and push verified branch.

## File ownership

Master: app state/navigation/Home, finance and journal UI, package/build configuration, integration tests, native QA and source control. Finance Domain Agent: src/finance/, finance unit tests, allowance/goal specs. Journal Engine Agent: src/journal-intelligence/, its tests, model/design/security specs. Security/Payment/UX Reviewer: payment guide, finance threat model and integration design. Helpers do not mutate packages, Git, ADB or master-owned files. Master reviews contributions.

Only appearance persists. Finance and journals remain fictional and memory-only. No real transfers, credentials, paid services, real child data, production publishing or main merge. Optional on-device inference is authorized by current mission; cloud processing remains prohibited. Original owner diagnostic stays untracked.
