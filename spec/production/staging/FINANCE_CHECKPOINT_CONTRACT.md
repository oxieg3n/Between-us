# Financial checkpoint and settled archive contract

Implemented locally in `1116-FinanceCheckpoints-r3` on `feature/staging-release-qualification`. Root integrated the finance, database and security specialists' bounded work. The existing source ledger, command identities, fictional fixtures, public demo and historical evidence remain intact. Local qualification includes1,222SQL assertions/26files,21managed integration scenarios and a31-migration fresh/restore proof. See [actual qualification](FINANCE_CHECKPOINT_REPORT.md) for measured runtime/storage limits and the remaining hosted, legal and operational gates. No production deployment or real-child enrollment is approved.

## Implementation

Keep the family `finance_aggregates` row, current public finance DTO and RPC names. Extend internal `FinanceState` with:

```ts
checkpoint?: {
  version: 1;
  lastEventAt: string | null;
  books: Record<childId, ChildBook>;
  activity: Record<childId, {
    visible: FinanceView['activity'];
    parent: FinanceView['activity'];
  }>;
}
```

`checkpointState` folds the bounded tail into books and clears that tail. Each activity cache is separately bounded; hidden matching records never enter a child's cache. Ordinary and hidden tail limits remain128/32 per child, with automatic checkpointing before they prevent another legitimate action. A hidden-only rollover may fold/cache-clear but **must not publish or hydrate visible archival capsules**. Visible retirement is triggered only by visible collection bounds (100occurrences or32payouts), independent of private match history.

The visible compactor retires fully settled connected occurrence/payout components through payment lots and original public allocation sources. It must preserve live free/allocation/held-lot dependencies and every monetary correction invariant. Private matching does not veto otherwise eligible visible retirement. An oversized unresolved component fails closed; this is an explicit engineering limit. Zero original allocation rows may prune when no positive free/allocation/payout/payment lot references that allocation; permanent IDs and source ledger rows remain. Private matches use the independent028archive described below. Unresolved live provenance and memory/storage bounds still require measurement.

Domain capsule payload:

```ts
{
  version: 1;
  childId: string;
  occurrences: ChoreOccurrence[];
  payouts: BookPayout[];
  allocations: BookAllocation[]; // zero lots; original sourceCents retained
  paidCents: number;
}
```

The book optionally carries `archivedPaidCents` (default0) and:

```ts
archivedBudget?: {
  period: AllowancePeriod;
  anchorDate: string;
  maximumCents: number;
  byPeriod: Record<string, number>;
  excludedOccurrenceIds: string[];
}
```

Hydration restores the exact archived component, subtracts its folded paid basis once and does not re-add global earned/correction totals. It rejects another child, duplicate hot entity IDs or insufficient folded paid basis. A later correction/rearchive appends a new capsule version; the original is never rewritten. Current hot entities take precedence over old inactive capsules.

## SQL persistence and authoritative source

`finance_events` and `finance_commands` remain immutable, complete and authoritative. Neither is truncated, deleted, renumbered or partitioned away. Family event sequence is allocated under the existing family lock using the durable ledger maximum/watermark, **never** compacted `events.length`. Existing command UUID/fingerprint/child bindings survive all checkpoints and old retries return the current authorized state before engine/CAS/capacity work.

Migration027 adds private append-only checkpoint/capsule/entity-registration records plus a separately mutable capsule residency index and recomputable budget cache. Capsule payloads receive server-assigned UUID/hash/family/child/source-sequence and checkpoint bindings. Rehydration changes only the private active/superseded index; original payload/hash/entity versions remain. Chore/goal IDs and archived occurrence/payout/payment keys remain discoverable permanently, including inactive versions, so compaction cannot permit ID reuse.

Active residency has family/child keys and a partial active UUID-page index. Visible correction lookup uses a separately mutable`finance_archive_current_entities` pointer with a foreign key to the immutable entity/capsule version, rather than searching inactive versions. Hydration deletes only those derived current pointers. Private residency additionally has a partial unique active match key. Both page queries first select at most`limit+1`active residency IDs before loading payloads; output limits alone would not bound an inactive-history scan.

Every new raw table enables RLS and denies PUBLIC, anon, authenticated and direct service-role access. Service callers use explicitly granted SECURITY DEFINER functions with an empty search path. Append-only tables use the existing immutability trigger. New growth/cache writes retain the026resource circuit; no automatic paid fallback is introduced.

## Exact service RPC seam

`finance_scope` and the existing three-argument `finance_load` remain. Load returns existing`{state,revision,serverAt,replay}` plus private server-only`stateHash` (SHA-256 over `finance_canonical(state)`) and`throughSequence` (durable family ledger maximum). Server time is at least the checkpoint/tail's last event time and uses the database clock.

The existing six-argument `finance_commit` accepts legacy bare state only for a normal append before checkpoint storage is active. The new request uses its existing `p_state` parameter as:

```ts
{
  state: FinanceState;
  event: FinanceEvent;
  previousStateHash: string;
  capsules?: ArchiveCapsule[];
  hydratedCapsules?: {id: string; hash: string}[];
  privateCapsules?: FinancePrivateMatchCapsule[];
  hydratedPrivateCapsules?: {id: string; hash: string}[];
}
```

Only`state` is persisted. Explicit`event` is required when a checkpoint clears the tail. The transaction validates exact previous-state canonical hash/CAS, immutable roster/timezone, previous checkpoint binding, bounded complete tail or rollover, event actor/child/time/action fingerprint and capsule source/residency/accounting. Every newly covered event remains in the durable ledger. SQL validates source binding and archival bookkeeping; the established trusted server remains the money-computation boundary. A hash is not proof that an untrusted caller computed correct money.

Load, budget and archive reads verify the latest immutable checkpoint payload and its canonical stored hash, then compare only the bounded contiguous tail with immutable events. Missing/corrupt source fails with generic financial-unavailable semantics; there is no lifetime replay or empty-balance fallback. Returned archive payloads also require their stored canonical hash. The checkpoint boundary is the next durable sequence minus the new tail length, supporting both before-apply and after-apply folding.

Approved additional service-only RPCs:

| Function | Return and boundary |
| --- | --- |
| `finance_archive_lookup(p_scope jsonb,p_entity_kind text,p_entity_id text)` | Active `{capsule,id,hash,revision,stateHash}` or null. Each lookup rechecks current session/account/consent/family/child. A missing active capsule does not mean an old entity ID is reusable. |
| `finance_archive_budget(p_scope jsonb,p_period text,p_anchor_date text,p_period_keys text[],p_hot_occurrence_ids text[] DEFAULT '{}')` | `{period,anchorDate,maximumCents,byPeriod,excludedOccurrenceIds,revision,stateHash}`. Accept up to131candidate hot IDs (old100+31new) with a conservative bounded request ceiling; only indexed existing IDs enter exclusions. |
| `finance_archive_page(p_scope jsonb,p_after_id uuid DEFAULT null,p_limit int DEFAULT20)` | Bounded active visible capsules plus`nextAfterId`, random-UUID keyset; after-ID must belong to this family/child and every page reauthorizes. Root projects occurrence/payout DTOs; no source lots, raw matching, checkpoint hash or private sequence reaches a child. |

Visible archive publication and residency changes depend only on visible operations. Random page cursors and `hasMore`/next values are computed from the visible capsule stream; hidden-only checkpoints cannot alter that stream. The first list endpoint is a current-active-archive view, not a source-fenced complete privacy export. A source-bound paginated full-history export remains a separate integration requirement.

## Separate private match archive

Migration028 adds immutable match origin/capsule records and separate mutable residency. Payloads are exactly`{version:1,childId,match:BookMatch}`. Eligibility requires all original source value invalidated,`activeCents === fundedCents === correctionDueCents`, and no positive lot referencing the match allocation anywhere in free, allocation, payout or payment lots. It does not affect visible archive eligibility or indexing.

`ChildBook.archivedMatches` contains`{month,usedCents,byGoal:{[goalId]:{activeCents,fundedCents,revealedFundedCents}}}`. SQL validates a bounded delta from the source-bound prior summary plus newly archived payloads minus exact hydrated versions, without scanning lifetime private history. Month is monotonic and cannot exceed the event's family-local month; rollover resets prior-month use. Goal contributions remain until exact hydration. Parent reveal/reconcile may hydrate and later append another immutable version; the original version stays retained.

`finance_private_match_lookup(p_scope,p_match_id)` returns the active`{capsule,id,hash,revision,stateHash}` or null. `finance_private_match_page(p_scope,p_after_id DEFAULT null,p_limit DEFAULT20)` returns`{items:[{id,capsule}],nextAfterId}` from only the separate active private stream. Both require current parent authority on every call. Private hydration requires a parent; internal trusted-service publication may accompany a child's visible command so hidden storage state cannot introduce a role-dependent visible failure. Public action JSON cannot supply any archive envelope field. Root projects parent-only DTOs and strips original source maps.

The028commit wrapper calls revoked`app_private.finance_commit_checkpoint_core` with private envelope fields removed. The029privacy wrapper subsequently calls revoked`app_private.finance_commit_archive_core`; no extra public overload or bypass grant is introduced. The original aggregate ceiling stays64MiB; each capsule is at most1MiB. These storage limits do not establish a256MiBEdge runtime qualification.

## Budget preservation

Retired approved occurrences still consume the appropriate allowance budget. Exact due-date/reward/reservation records remain permanently indexed; rearchiving an already indexed occurrence must not add its cost again. `byPeriod` and`maximumCents` include all indexed retired occurrences, including currently hydrated/inactive capsules. `excludedOccurrenceIds` is the requested hot subset already represented in that basis: the engine skips those hot entries to prevent double counting. It does not subtract them from the archive basis a second time.

The compactor overlays newly retired costs onto the precommit basis; capsule/index/period-summary updates commit together. Same-plan budget reads are indexed. Changed period/anchor requires a separately bounded reindex of at most10,000archived occurrences; larger work fails closed rather than scanning unlimited history inside a normal command. This is a measured-work gate, not a raised lifetime transaction cap. Weekly/biweekly keys use floor division for dates before the anchor; monthly keys are calendar YYYY-MM. No plan change may erase previous reserved amounts or pretend current-period spending reset after checkpointing.

## Locks, privacy and failure semantics

Preserve `assert_live_session` SHARE → family advisory lock → current-clock/session/account/consent/membership recheck → aggregate row → deterministic capsule/index/budget rows. Multi-family privacy flows retain sorted family locks before relationship/job locks; do not acquire a new session lock after family. Event, command identity, checkpoint, capsule, residency, budget and aggregate changes are one transaction. Reused IDs with changed hashes or child bindings deny; same logical retry returns current state without reapplying money.

All raw checkpoints, capsule metadata and budget versions stay server-only. Internal revisions, hashes, sequences and private matching counters never become child DTO/header/error/cursor fields. Child archive projections exclude private lots and parent matching just as current `financeView` does. A parent role does not authorize journal/draft content or keys.

Checkpoints/archives are financial copies included in finite-retention, finance/account legal-hold and deletion-review inventories. Current account deletion revokes access; retaining immutable/shared records means it cannot claim complete erasure. Child own-privacy and guardian-reviewed exports must enumerate all authorized archived history with a source-bound manifest and explicit completion. Returning only a hot snapshot is incomplete. Existing child004, parent014/025and notification023consumers must use the checkpoint-aware domain projection; full archive export/pagination completion remains Root integration work.

## Qualification still required

Migrations027/028 and their tests are not yet executed. Source tests cover legacy compatibility,300visible immutable appends across rollover, checkpoint/hash/tail corruption, permanent ID reuse, zero-allocation reference guards, private source eligibility, actual transactional private publication/hydration/rearchive, exact folded summary, parent-only lookup/page, stored payload corruption and revoked sessions. Required remaining evidence includes visible settled-capsule lifecycle, broader budget/old-target corrections, equivalent child payloads/archive pages/cursors with different private histories, current authority after lock waits, resource-circuit atomic rollback and actual crash/restore tests. Source coverage is not a passing execution result.

Update fresh/upgrade and encrypted restore harnesses from their explicitly reviewed026inventory to027only after integration. Schema-selected dumps include the new tables automatically, but restored evidence must additionally verify checkpoint/capsule source hashes, all historical command identities, old-target correction after restore, residency and budget basis, then deletion/revocation replay. Prior026PASS evidence remains historical and is not relabeled as027proof. No hosted DR, offsite custody, provider deletion, legal certification or production enrollment is established by local tests.

## Captured exports and bounded write admission (029-030)

Every new accepted command captures exact role-filtered activity and current child/parent projections atomically with its financial publication. Legacy snapshots may be warmed only from bounded, complete event coverage and the same source CAS. Corruption or incomplete history blocks export rather than producing a partial artifact marked ready. Captured exports merge all retained entities while excluding raw lots, checkpoints, source hashes and surprise information from child artifacts.

The outer commit wrapper applies indexed admission in the same family transaction:60 writes/minute per actor/child/visibility stream,1,000 visible/day per child and200 private/day per child. Exact retries do not consume new admissions. A denied write rolls back checkpoint, archive, activity and ledger publication together. These are additional ceilings;128/32 hot replay windows and existing collection caps remain unchanged.

For a successful new envelope, `finance_commit` returns only its existing status/time metadata and omits the duplicate `state`. The trusted adapter projects its already sealed exact candidate only on `committed` and exact matching server time. A racing `replayed` result retains current database state. Legacy bare-state callers retain their original response shape. This reduces transport and duplicate replay work without changing financial authority.

Parent live matching records beyond the100-record summary are discoverable through a separate20-record `parent-open-history` page. Every page verifies current parent authority and source integrity. Logical-ID cursor absence fails explicitly; it is not a stable snapshot across concurrent corrections. Retired private capsules remain a distinct parent-only page.
