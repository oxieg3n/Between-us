# Authoritative finance service interface

2026-11-16. The synthetic production foundation reuses the r12 finance domain directly from `apps/mobile/src/finance/engine.ts` and `types.ts`; it does not copy financial arithmetic or change the mobile prototype. Root bundles that import for the server. This is a household planning ledger, without custody, real transfer or automatic financial-provider integration.

## Server module

`createFinanceService({userClient,serviceClient})` exports:

```ts
read(familyId: string, childId: string): Promise<FinanceView>
command(familyId: string, childId: string,
  request: {id: string; action: FinanceAction}): Promise<FinanceView>
```

`FinanceAction` is the existing `FinanceCommand` union with `id`, `at` and `childId` omitted. `request.id` is a UUID operation identity reused on network retry. Both Supabase clients must select schema `api`; `userClient` carries the actual user's managed Auth JWT, while `serviceClient` is constructed only inside the trusted server. Neither returned method exposes a raw aggregate, revision, event count, command record, session token, fingerprint or parent projection to a child. No ETag/private revision belongs in HTTP headers.

The service rejects unknown request envelope fields, top-level action IDs and recursively submitted `role`, `actor`, `at` and `childId`; the unchanged domain enforces its full action-specific field/type/role rules. Numbers must be non-negative safe integers. Maximum logical action JSON is 4 KiB, strings 500 characters, arrays 31 items and object nesting five levels. Engine field limits can be stricter. The service derives actor and event time server-side. A historical `paidAt` can describe a parent report; future payment/funding/correction reports fail. A declaration is never represented as independently verified transfer evidence.

`FinanceServiceError.code` is `not_authorized`, `invalid_action` or `temporarily_unavailable`. Private SQL error text is not returned. Validation/domain messages may explain the user's own permitted action, but matching-only state/revision/conflict counts are not included. Root's HTTP layer owns authentication transport, status mapping, request rate/budget counters and content-free request IDs/logging.

## SQL RPCs

| RPC | Grants and behavior |
| --- | --- |
| `api.finance_scope(p_family_id uuid,p_child_id uuid) -> jsonb` | Authenticated; invokes current managed-session `actor()`, then validates the selected child/family and current membership under family lock. Returns `{actorId,sessionId,expiresAt,familyId,childId,role}` derived from the real session. Guardian maps to domain parent; child can select only their enrolled child subject. This response grants no private table or commit access. |
| `api.finance_load(p_scope jsonb,p_operation_id uuid DEFAULT NULL,p_fingerprint text DEFAULT NULL) -> jsonb` | Service-only; rechecks managed session, token expiry, account, consent and membership under family lock. Returns private `{state,revision,serverAt,replay}` only to trusted server. Creates/synchronizes the authoritative roster from private children; new IDs append, existing names/IDs/history remain unchanged. |
| `api.finance_commit(p_scope jsonb,p_operation_id uuid,p_fingerprint text,p_expected_revision bigint,p_state jsonb,p_server_at text) -> jsonb` | Service-only; repeats current authority checks and locks family/aggregate. Returns `{status:'conflict'}` on CAS mismatch, otherwise `{status:'committed'|'replayed',state,serverAt}` to trusted server only. |

All raw finance tables enable RLS with no authenticated/anonymous grants. The `finance_events` and `finance_commands` tables reject UPDATE/DELETE even through accidental privileged statements. `finance_aggregates` is an internal replay aggregate, while append-only events and command identities remain auditable. No ledger table is published to Realtime and no matching-driven child invalidation is emitted. The initial service uses explicit reads; any later invalidation mechanism must compare child-visible projections before emitting a content-free signal.

## Atomicity, replay and timestamps

1. User client obtains its SQL-derived scope; service load verifies it again and returns current aggregate/revision and PostgreSQL UTC time.
2. A SHA-256 logical fingerprint binds family, child and the submitted action using sorted JSON keys. SQL independently computes the same canonical hash from the appended event minus server fields/effects. Event ID is `<actor UUID>:<operation UUID>`, so hidden event counts never influence public identifiers.
3. The trusted service applies the unchanged domain exactly once to the loaded state, with a derived actor and DB-provided `serverAt`.
4. Commit rechecks current session/authority under the shared family lock, compares revision, checks exact immutable event prefix/timezone/roster, one-event append, actor/child/ID binding, UTC chronology, future reports and safe integer values. It atomically inserts the event and command identity and updates the aggregate.
5. A CAS loser reloads fresh state and DB time, then applies against that state. Retry is bounded to four attempts. If the same operation already committed, load/commit compares the fingerprint and **skips domain application**. The response projects the **current** authorized state/current DB time so a retried mutation cannot roll back the UI to stale balances. Original event time remains private audit history. Changed-body or changed-child replay fails.

SQL deliberately does not reimplement the r12 math; the narrow service credential is a trusted computation boundary. Possession of that secret permits invoking trusted commit operations and must be protected accordingly. Client JWTs cannot call load/commit. The master must independently verify concurrent real database requests; service-mock CAS tests do not prove PostgreSQL serialization by themselves.

Matching inherits the domain defaults: OFF, 100%, $20 per child/family-local calendar month shared across that child's goals, separate $20 parent budget, Surprise and explicit reveal. A parent can configure permitted future settings. Child responses come only from `financeView` under the child actor; they do not receive `matching`, hidden activities, commitments, raw effects, source lots, revisions or another child's records.

## Finite foundation capacity

The initial synthetic foundation retains all history and stops writes for a reviewed capacity/archival upgrade; it never discards old financial records to make space. Limits are twelve retained child subjects/family; 128 ordinary visible actions and a separate 32 parent-only matching actions per child. The SQL/service use these separate counters so hidden matching actions do not consume the child's ordinary action allowance. Visible entity bounds are 100 chore occurrences, 32 goals, eight savings rules, 32 payouts and 32 payments/payout. Latest 100 visible activities and latest 100 parent commitments are returned; complete history remains private and a separately reviewed pagination/export endpoint is needed before general release.

Internal corruption/abuse ceilings are 64 MiB aggregate JSON, 4 MiB/event and 4096 derived effects/event. They are deliberately larger than ordinary request limits because hidden matching can add correction effects to a child's otherwise identical command. Do not reduce these to small matching-dependent rejection thresholds without equivalent-world tests. These ceilings are guards, not a performance promise; full replay at maximum capacity and the free Edge CPU/memory limits require measurement before production. Long-lived production needs reviewed archival/projection work without weakening auditability or child non-disclosure. Root owns aggregate request-rate/global resource budgets and deployment free-plan controls.

## Evidence and remaining checks

The isolated TypeScript service suite passes seven tests: forged input/isolation/clean DTO; idempotent current-state replay; forced concurrent approval CAS; concurrent shared-cap allocations; hidden-match equivalent child payloads/IDs/errors; future dates and bounded retries/revocation. A targeted strict TypeScript check passes. The first service run exposed a nondeterministic mock race assertion; an explicit two-load barrier now forces the intended CAS interleaving and the rerun passes.

`supabase/tests/finance.test.sql` is rolled-back pgTAP coverage for grants, scoped sessions, clock/fingerprint checks, atomic append/CAS/replay, safe integers, immutable history/prefix, roster sync, consent withdrawal and managed-session deletion. It has not been executed by this helper. Root must run migrations, pgTAP, actual GoTrue/PostgREST authorization, cross-process concurrency and HTTP validation, including no private data in errors/logs/headers. No SQL, Docker, cloud, Git or native operation was performed by this helper.
