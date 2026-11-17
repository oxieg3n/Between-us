# Encrypted logical recovery qualification

## Migration031 local qualification — PASS

Root completed fresh001–031application migration qualification and an actual encrypted logical restore on2026-11-17UTC. The [fresh031receipt](finance-checkpoints/fresh-migrations-031.json) records all1,222SQL assertions/26files, exact schema parity, source archive audit and owned connection/crash rollback checks. The [encrypted031receipt](finance-checkpoints/recovery-031.json) records exact snapshot recovery, independent audits of actual source/restored archive records,397restored SQL assertions/nine files, original message/financial UUID replay and two post-snapshot revocation replays. Additive031changes only the visible/private archive page read functions. Earlier025/026receipts below remain historical and are not relabeled. The20portable recovery/fresh-harness tests pass, including declined archive/hydration behavior and archive-audit metadata failure cases.

| Actual031execution | Observed result |
| --- | --- |
| Fresh application database | Run`33dfa2ecf582464482010460daf67ad6`,00:34:58.986–00:36:16.707UTC; all31migrations and1,222SQL assertions PASS; schema/owner/RLS/ACL/function/index/constraint/trigger parity and closed defaults PASS; owned generic/financial SQL transaction crash checks PASS |
| Encrypted restore | Run`f7c653fdebc543d19b85d73c93aae535`,00:38:31.610–00:39:28.936UTC;88selected tables,17,807rows; exact rows/code/RLS/ACL/index/constraint/trigger/migration parity PASS |
| Ciphertext | 2,243,899bytes; SHA-256`2b9b844cb9daa8b0e1257a94f242456b66c0891148174b5c7627070fca5c439e`; maintained age rejects corrupt/truncated ciphertext and the wrong key before target creation |
| Actual source/restored archive audits | Equal:86finance aggregates,23checkpoints,200visible capsule versions(197active),131private capsule versions(125active),563current visible entity pointers,200permanent occurrence bases,194private origins,29projection snapshots and2,094activity rows |
| Persisted operation/revocation proof | One original400-cent approval and saved message UUID retained; changed financial body denied; two tombstone passes; old managed child token denied; target remains quarantined |
| Verified restore work | 51,563ms,including audits and nine SQL suites; snapshot age53,513ms at verified completion. These are local drill timings, not operator RTO or a production RPO guarantee. |

All new targets and historical evidence are retained. The first fresh attempt failed the strict source/fresh function-definition comparison because030contained CRLF bytes while the installed definition used LF. Root normalized030toLF, applied the exact two function bodies and added SQL LF attributes, then used a new database for the passing fresh run. No hash comparison was weakened and no financial source row changed. An initial backup invocation omitted the`tsx`loader and failed before database I/O; the corrected command below completed the passing drill.

The encrypted snapshot includes all tables in`app_private`, including checkpoint chains, immutable ledger/command identities, visible/private capsule versions and origins, entity-version keys, mutable active residency/current entity pointers, permanent occurrence budget bases/period caches, activity and projection snapshots. Every table receives an exact count and cryptographic row digest in the same exported repeatable-read snapshot. Index definitions, constraint definitions/validation and trigger definitions/enabled state now have a separate structure digest, covering active partial indexes and030write-admission expression indexes. Existing table owner/RLS/full ACL, function/policy and migration checks remain.

An additional read-only audit independently checks every aggregate's bounded immutable tail, each checkpoint's canonical hash and covered ledger prefix, visible/private payload hashes and source/checkpoint/origin bindings, hydration-event/residency references, complete current-entity pointers and folded paid basis, permanent occurrence identities, and activity/projection source hashes. Source counts must include actual checkpoint, visible capsule and private capsule rows; an empty database cannot qualify that coverage. The restored audit equaled the source audit before and after the nine rollback-only restored SQL suites. Only counts and success metadata enter the safe result; capsule payloads, identities, claims and keys stay private. Permanent occurrence budget bindings are immutable across capsule versions: declined is terminal after hydration, the permanent basis has an immutability trigger and rearchive rejects a changed budget cost. Historical zero-cost declined versions cannot legitimately become approved versions with a different basis.

Those nine suites are`finance`, `communication`, `privacy_lifecycle`, `message_receipts`, `finance_checkpoints`, `finance_private_archives`, `finance_privacy_archives`, `finance_write_admission`and`finance_archive_page_reads`. Their source hashes and actual TAP counts are recorded per run. The new page suite models5369temporary capsule rows and requires20one-row index probes for the exact correlated payload/hash query shape, without a broad capsule scan/hash join. Root separately owns the measured real-schema benchmark query. Other suites' synthetic old-target correction tests are separate from preserving the actual preexisting integration archive dataset: the latter receives exact row/schema parity and semantic hash/source checks, without bypassing its authentication or replaying another fixture's operation.

Migration031first obtains at most`limit+1`active residency UUIDs, trims the extra UUID before fetching payloads, then uses a correlated primary-key lookup with`OFFSET0`to prevent join flattening. It validates hashes and scope within those bounded payload reads, eliminating the old second validation join. Output/cursor/parent authority/8MiB limits remain the same. The prior storage receipt observed a52-week hash join scanning273private capsules and a780-week nested-loop plan reading20of5369capsules; this statistics-dependent choice motivated an explicit query barrier. The temporary5369-row point-read plan checks passed in both fresh and restored suites; real-schema sizing benchmarks and hosted limits remain separate qualification work.

Root used the following commands. Future runs still require source review/freeze and serialized database execution after CPU-heavy benchmarks:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node --import tsx --test .\tests\recovery.test.ts .\tests\qualification-database.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Recovery portable checks failed.' }
node .\scripts\qualification-database.mjs plan
node --import tsx .\scripts\backup-recovery.mjs plan
# Root review and serialized database execution only:
node .\scripts\qualification-database.mjs --execute --confirm-local-synthetic-qualification
if ($LASTEXITCODE -ne 0) { throw 'Fresh qualification failed closed; retain the new quarantined target.' }
node --import tsx .\scripts\backup-recovery.mjs drill --execute --confirm-local-synthetic-recovery
if ($LASTEXITCODE -ne 0) { throw 'Encrypted recovery failed closed; retain owned resources and private metadata.' }
```

The existing protected loopback status, verified local`supabase_admin`authority, healthy owned container, exact PostgreSQL/dump/restore version, pinned isolated age tools, closed public policy, local synthetic mode and sufficient disk remain runtime preconditions. Only Root can inspect protected configuration or execute these operations. No new source fixture extension is needed: Root confirmed the source already contains actual archived integration families. Fresh SQL fixtures run only in the new quarantined target; encrypted recovery creates only its existing run-owned fictional fixture in the source. Both targets remain quarantined. A failed semantic audit is a blocker to investigate, not permission to weaken a hash/source check or mutate a preexisting family.

Fresh-schema qualification intentionally copies zero source Auth/data rows. Its source archive audit describes the upgraded source; its empty fresh archive audit does not claim to have restored those records. Actual source archival recovery is established only by the separate encrypted drill. The fixed128MiB streaming/decrypted archive limit and local-only operator/key/registry assumptions remain unchanged.

These results qualify a fictional local logical recovery exercise. They do not establish a running restored Auth/Realtime service, hosted disaster recovery, an offsite copy or independent backup/key registry, production key custody, an operated schedule, provider deletion or recovery of device journals/keys. No existing source family was used to bypass authentication or replay an old archived command; its data received exact parity and semantic source/hash validation, while controlled restored SQL fixtures exercised correction behavior.

## Historical025/026qualification

2026-11-16. LOCAL fictional data only. **Actual encrypted logical restore, fresh application migrations and financial SQL transaction crash rollback PASS through026.** Latest [restore evidence](evidence/backup-restore-026.json), [fresh financial crash evidence](evidence/fresh-financial-crash-026.json), earlier [fresh-schema/crash-probe evidence](evidence/fresh-migrations-026.json), and separately preserved [025restore evidence](evidence/backup-restore-025.json) include exact commands and harness source hashes. No hosted project, offsite copy, production recovery service, operational backup schedule, named recovery operator or complete provider deletion is qualified. This file preserves the [earlier unverified recovery plan](../runbooks/RECOVERY_AND_BACKUPS.md). Journal/draft content and author device keys are outside every server backup and cannot be recovered by a guardian or operator.

## Executable procedure and boundaries

The [root-executed harness](../../../services/backend/scripts/backup-recovery.mjs) is dry-run by default. It only accepts the exact existing local stack `supabase_db_betweenus-production-local`, loopback54322/database`postgres`, and local Auth54321. It never resets the stack, changes existing fixture IDs, changes global roles, drops a database, enables a worker, connects a restored database to an API or activates hosted services. Root reviews its complete source and owns serialized Docker/database execution.

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node --import tsx .\scripts\backup-recovery.mjs plan
# Only after root reviews/fixes/freezes this exact harness and the current schema:
node --import tsx .\scripts\backup-recovery.mjs drill --execute --confirm-local-synthetic-recovery
if ($LASTEXITCODE -ne 0) { throw 'Recovery failed closed; review private metadata without publishing provider diagnostics.' }
```

The command creates a unique ACL-protected `.local/recovery/<runUUID>/` directory, ignored by the existing root `.gitignore`. It retains all generated evidence and the quarantined database; there is no automatic cleanup. Metadata is safe to review, while keys, ciphertext, Auth fixtures, encrypted tombstones and registry files remain private. A failure can leave new fictional resources for root to review; it never authorizes broad cleanup. The script's128MiB plaintext/ciphertext ceiling is deliberately local; this is not a qualified500MB hosted-database exporter. Low disk is checked before fixture creation using three times the current database size plus128MiB reserve. No low-disk test fills the actual disk.

Root verified that the existing local`postgres` login has CREATEDB/CREATEROLE but is not a superuser; it correctly fails the strict quarantine preflight. Root then verified the already-existing local`supabase_admin` superuser through the owned container and with the same protected local database password. The harness first validates the original loopback-only status URL, then changes only its username to that fixed existing role; dump/restore use the same role through the owned container socket. No password is hardcoded or printed, no role/grant is enabled or changed, and ordinary API/Auth clients keep their original protected configuration. Hosted postgres does not provide this local administrative authority; this is explicitly a local drill, not a hosted deployment procedure.

The actual sequence is:

1. Check canonical root, absence of the deprecated root, tool hashes, closed public policies, PostgreSQL/tool compatibility and free disk.
2. Create distinct new guardian, child and independent verifier through real local managed Auth with `.test` identities and random credentials. New UUIDs and a run-scoped family prevent reuse of existing fixture records. Synthetic consent/contact verification never becomes production authority. Persist two fictional messages and exactly one400-cent chore approval, then retry its exact operation UUID.
3. Export a read-only repeatable-read PostgreSQL snapshot. Record rows/cryptographic row digests, RLS/table ACLs, function/policy digest and migration state in that same snapshot. Stream version-matched `pg_dump --format=custom` directly into maintained age encryption. No plaintext dump is written to disk. Only complete ciphertext is published, without overwriting a previous file.
4. Record the expected ciphertext SHA-256 in a separate private registry directory. The expected digest is an operator trust input, not a digest accepted from an arbitrary downloaded archive. The local registry and backup share a host and administrator; independent/off-host provenance is **not qualified**. Anyone with the public recipient can create a different valid age file, so age integrity alone does not prove backup origin.
5. Only after that backup succeeds, verify exact ownership of the three new identities. Withdraw the new child's consent, expire those identities' managed sessions, close that child's profile/membership, revoke the new contact and disable the new verifier. Erase only the new child's own unacknowledged message when there is no sender/recipient legal hold or report reference. Immutable financial events and shared records remain. Confirm the old managed child token is denied by the actual source API.
6. Capture the resulting revocation/partial-deletion instructions separately from the snapshot, bound to the exact fixture/run/snapshot digest; encrypt them with age and record their trusted ciphertext digest. This local custody demonstrates chronology; it is not a durable independently operated production tombstone ledger.
7. Exercise actual age rejection of altered ciphertext, truncation and a different identity. No restore target exists during these failure probes.
8. Verify trusted ciphertext/tombstone digests and finish age decryption successfully into bounded memory **before any target mutation**. Create only `betweenus_recovery_<runUUID>` from`template0` with connection limit0. Revoke CONNECT from PUBLIC and all non-superuser roles. Preserve that quarantine throughout the drill, including after success. Existing cluster superusers retain their administrative power; a disposable database in the existing local cluster is not a separately secured disaster-recovery host.
9. Restore selected schemas in one transaction with `pg_restore --exit-on-error --single-transaction`, retaining source owners/ACLs against the existing same-cluster roles. No `--create`, `--clean`, overwrite or cutover path exists. Compare exact snapshot integrity; run the existing financial, communication, privacy-lifecycle and message-receipt pgTAP files in rollback transactions. Parse actual TAP results. Recheck integrity after these tests.
10. Retry the persisted original message UUID and financial approval against restored SQL. Require one saved message/approval, unchanged earning and changed-fingerprint denial. Replay post-snapshot instructions twice while quarantined; old immutable Auth claims must fail restored SQL context/send/finance, the erased message stays absent, retained message and finance identities stay single, and the second replay leaves the same inventory digest. Session revalidation at SQL is distinct from a running restored Auth/Realtime service.

## Toolchain and key custody

Root verified the upstream age1.3.2 Windows AMD64 archive before isolated extraction. No global PATH, plugin, hook or machine configuration was changed. The harness invokes only absolute `age.exe`/`age-keygen.exe` paths and accepts native X25519 recipients, without plugins, SSH/password recipients or an application-designed cipher/envelope.

| Artifact | Pinned receipt |
| --- | --- |
| Upstream archive | [age-v1.3.2-windows-amd64.zip](https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-windows-amd64.zip),20,250,704bytes |
| Archive SHA-256 | `f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7` |
| `age.exe` SHA-256 | `2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0` |
| `age-keygen.exe` SHA-256 | `1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c` |
| Installed local tools | `services/backend/.local/tools/age-v1.3.2/age/` |
| License | [BSD-3-Clause, pinned release](https://github.com/FiloSottile/age/blob/v1.3.2/LICENSE); notice retained with the local distribution |
| Root's read-only source check | PostgreSQL and`pg_dump`17.11;19,625,651-byte database at inspection, not the later snapshot size |

age supplies the established authenticated file format, whose [maintained specification](https://c2sp.org/age@v1.1.0) defines header authentication and authenticated streaming payloads. The [release](https://github.com/FiloSottile/age/releases/tag/v1.3.2) contains hardening changes. This engineering use does not constitute independent cryptographic certification. PostgreSQL documents [dump-version compatibility](https://www.postgresql.org/docs/17/app-pgdump.html) and [transactional restore](https://www.postgresql.org/docs/17/app-pgrestore.html).

Fresh drill keys are generated by `age-keygen`; key values never enter command arguments, stdout, source, reports or mobile bundles. They remain in the restricted private `keys/` directory. The same-machine drill intentionally does not establish production key custody or disaster resilience. An operated backup host should hold only approved public recipient keys; restore identities need separately controlled offline recovery custody and a tested second recovery copy. Rotation requires verifying the replacement recipient/recovery identity, keeping the old identity until its approved backups expire, and a fresh restore proof. No production recovery key or destination is selected here.

## Recoverable inventory and exclusions

| Category | Local archive/restore coverage | Still required for genuine hosted recovery |
| --- | --- | --- |
| Application schema/data | `app_private`, `api`, all selected table rows/constraints/functions/RLS/grants, immutable message/financial operation identity | Hosted migration/extension compatibility and reviewed configuration |
| Migration history | `supabase_migrations` and recorded version inventory | Source commit/migration hashes reconciled to hosted deployment manifest |
| Auth database records | `auth` schema, including identities/password hashes/session metadata; protected only within encrypted backup | JWT signing keys, provider/OAuth/SMTP/hook configuration, domain settings and recovery verification; rotation/revocation at cutover. A restored Auth table is not a qualified live Auth service. |
| Roles/extensions | Existing cluster roles reused; source owners/ACLs retained; source extension inventory recorded; local`pgcrypto` prerequisite rebuilt | Global role passwords/grants and extension binaries are not exported; minimum-scoped export credential and owner-reviewed role/extension bootstrap. Current local harness uses root's existing administrative access. |
| Source extension inventory | `pg_stat_statements`1.11,`pgcrypto`1.3,`plpgsql`1.0,`supabase_vault`0.3.1,`uuid-ossp`1.1 | Vault secrets/provider wrapping keys are excluded; any use requires separate recoverability review. |
| Storage | No storage object bytes or bucket recovery claimed | [Supabase backups omit object bytes](https://supabase.com/docs/guides/platform/backups); inventory/export/restore objects and relevant configuration separately if introduced. |
| Realtime/Edge/workers/push | No publications/subscriptions/service wiring restored; restored DB remains inaccessible to ordinary service roles | Content-free publication/configuration, Edge source/env, SMTP/FCM/APNs secrets, worker schedules, device/provider receipt qualification |
| Journal/drafts/model sessions | Absent from backend by design; no device vault content/key is backed up | Device-specific exclusion/loss/erase tests. No server/guardian recovery or automatic journal synchronization. |
| Provider/recipient/device copies | Not erased or reconstructed by this harness | Independently verified finite expiry/deletion and exact remaining copies/holds; never call partial account erasure complete provider deletion. |

Supabase Free recommends regular [CLI logical exports and off-site copies](https://supabase.com/docs/guides/platform/backups). Its [CLI restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) must be reviewed again against an approved hosted project. This selected-schema, same-cluster local harness is narrower than that complete provider procedure.

## Operating targets and actual evidence

Proposed engineering targets for owner review: daily successful encrypted backup, RPO≤24hours, an alert when the last success is older than26hours, restore verification≤4hours after declaration, maximum30-day rolling backup retention subject to counsel/holds. These are targets, not observed availability guarantees or an approved retention schedule. A paused/lost Free project, unavailable scheduling PC, missing key, wrong password, incomplete storage inventory or an unoperated destination can exceed them. Offline safety resources and device-local journals must remain usable under their own boundaries.

Actual root-run result on migration025:

| Observed check | Result |
| --- | --- |
| Execution | 2026-11-16,19:43:10.133–19:43:24.916UTC; exact command/source hashes in [safe receipt](evidence/backup-restore-025.json) |
| Encrypted archive | 1,028,180bytes; SHA-256`0e1117e45437ce2243b1123029173364caa82a4385f49e436b23176bf9ace505` |
| Snapshot | 19:43:14.567UTC;72selected tables,5,115rows,25migrations001–025 |
| Integrity | Exact row digests/counts, RLS, canonical full ACL/owner semantics, functions/policies and migration inventory PASS |
| Restored SQL | **200assertions PASS**: finance31, communication82, privacy lifecycle71, message receipts16; source hashes retained |
| Persisted command retry | One original saved message UUID, one approved400-cent earning, changed financial fingerprint denied |
| Real post-snapshot chronology | New own-source child consent withdrawn, sessions expired, partial erasure performed after snapshot; old managed child token denied by source API |
| Replay | Two passes; erased message absent, retained message/financial command remain single, old claims denied context/send/finance, no active fixture session/operator; second inventory digest unchanged |
| Corruption/truncation/wrong identity | Actual maintained age CLI denied all three before target creation |
| Local measured restore interval | **9,528ms**, including authenticated decryption, quarantine creation, restore, integrity/SQL checks and replay |
| Snapshot age at recovery completion | **10,348ms**; this sample is not an operated daily-backup RPO guarantee |
| Target | `betweenus_recovery_0741addc5be94623898a7672cafb223d` retained; connection limit0 and no non-superuser CONNECT; no cutover |

The root repeated the complete encrypted drill after026; these are separate executions, not additive test counts:

| Latest026check | Actual result |
| --- | --- |
| Root run | `505e3d1ee06840159375b2b295dfd374`,19:56:20.560–19:56:32.577UTC |
| Encrypted archive | 1,096,254bytes; SHA-256`de16bf3e5e95f918164dd0b250ba2bc2c3eab5b8e2144b844daa9834186437a5` |
| Snapshot | 19:56:24.340UTC;74selected tables,5,747rows,26migrations001–026 |
| Integrity and restored behavior | Exact snapshot parity PASS; same four restored suites **200assertions PASS**; one saved message UUID/one400-cent approval, changed financial fingerprint denied |
| Revocation/deletion replay | Source old managed token denied; two idempotent replay passes; erased message absent, retained message/command single, no active fixture session/operator |
| Actual age failure probes | Corruption, truncation and wrong identity denied before target creation |
| Measured local recovery | **7,438ms**restore interval; **8,237ms**snapshot age at completion; no operated daily-backup RPO claim |
| Target | `betweenus_recovery_505e3d1ee06840159375b2b295dfd374` remains connection-limit0/no ordinary CONNECT; no service or cutover |

**11portable recovery tests PASS**, backend TypeScript PASS, dry-run CLI PASS. Pure tests separately cover complete ACL semantics despite array reordering, nullable-void RPC handling/safe errors, exact source/target denial, low disk/oversize/version mismatch, failed/missed scheduling heartbeat, snapshot-bound tombstone chronology, wrong digest/key/partial decrypt before target writes, quarantine/replay ordering, interrupted restore/verification/replay, TAP failure detection and partial-construction retirement. These fake-port failures are distinct from the actual age/database outcomes above. No hosted infrastructure was tested; cooperating engineering reviews are not an independent audit.

All failed attempts remain preserved. The first,19:34:29UTC/run`a6a78e9766ee4e82bbe447c501de2e38`, failed during fixture creation; exact-owned identity access was retired. Source review corrected SQL`void` success from`verify_child_consent`. The next attempt correctly stopped before fixture creation because the original login lacked superuser status; root then verified the existing local administrative account described above. Run`8362c3d39d5a4c4c9e7a1e22186e7178` failed with42601 during fixture construction and retired exact-owned identity access; the bare`day`SQL alias was replaced with established`AS local_day`, and safe checkpoints were added. Run`9a68f9affda843ef99332fffa2e3d3c9` performed encryption, fault rejection and actual quarantined restore but failed the function digest: root compared188functions and found only`auth.jwt`ACL-array serialization order differed, with identical grants/owners; policies matched. Canonical`aclexplode`records now preserve every grantor, grantee, privilege and grant option plus owner while ignoring array order. No grant check was removed. The later complete PASS above does not relabel these failed runs.

The harness emits only safe metadata on success, retaining `.local/recovery/<runUUID>/registry/result.json`. Failed runs exit nonzero and retain metadata; a failure never refreshes a success receipt. The pure `scheduleHealth` function rejects missing, future, malformed or stale completion times. **No OS task/cron job, offsite uploader, retention eraser or alert recipient is installed.** Before operating this for real data, assign a named host/operator and backup operator, configure failure escalation, protect a separately trusted digest/tombstone registry, approve keys/destinations/retention, maintain at least two verified recovery copies, test expiry and loss of the primary host, and run a genuine isolated hosted restore. Failure to assign these is a release blocker.

Do not delete an expired archive/key or a quarantined database through a computed broad command. Root must verify exact new-run ownership and approved retention/holds, then retire only those resources. Existing local source data, private configuration, unrelated Docker containers and historical evidence must remain intact.

## Fresh application migrations and interrupted transaction qualification

The additive [fresh-database harness](../../../services/backend/scripts/qualification-database.mjs) passed actual root execution after source migration026, then passed again in a separate new database with the financial crash block. Its five portable tests and the11recovery tests pass together (**16total**); backend TypeScript and syntax checks pass.

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node .\scripts\qualification-database.mjs plan
# Root only, after reviewing this exact source and serializing database operations:
node .\scripts\qualification-database.mjs --execute --confirm-local-synthetic-qualification
if ($LASTEXITCODE -ne 0) { throw 'Fresh application qualification failed closed; retain its quarantined database and safe metadata.' }
```

This creates only`betweenus_qualification_<new runUUID>` from`template0`, with the same connection-limit0/no non-superuser CONNECT guards. It copies **schema only, zero Auth rows** from the existing managed`auth`and migration-history schemas into bounded memory, including managed Auth constraints/owners/grants. It omits exactly three reviewed application auth triggers referring to functions that do not exist yet; migrations001/006/007 must recreate those hooks. Any other application dependency or data statement causes a refusal. This is a fresh application schema on a locally reconstructed managed-platform schema, not a pristine provider installation or hosted fresh-project test.

The empty local Realtime publication and target-local CREATE privilege for the existing`postgres`role are explicit prerequisites. There is no new CONNECT right, global role membership change or service subscriber. Applying each exact reviewed001–026file under`SET ROLE postgres`preserves source function/table owners and grantors; explicit migration BEGIN/COMMIT statements remain intact. Failed migrations retain their new target. The harness requires exact semantic table owners/RLS/grants, function/policy digest and migration-state parity with the upgraded source, proves fresh public/real-child/report/push/privacy execution defaults are closed before local synthetic SQL fixtures, and runs every current pgTAP file with actual TAP failure detection.

The interruption probe uses a new target-only private table and a dedicated connection. It validates its own positive backend PID, exact new database, unique application name and difference from the administrative PID before terminating **only that connection** during an uncommitted insert. The root connection and a fresh reconnect must both observe zero committed rows. This proves an actual PostgreSQL transaction rollback for the disposable probe; it does not claim a mid-financial-command crash test. Metadata lives in ignored`.local/qualification/<runUUID>/`; no plaintext Auth dump is written to disk, no existing source row is changed and no database is dropped.

Actual fresh026root run`d5f9a98ece5248168fd25ac17ed1d9a5`started19:54:22.306UTC and completed19:54:44.079UTC. All26migration files applied,74table owner/RLS/grant inventories and function/policy digest matched the upgraded source, and fresh public/real-child/report/push/privacy-execution defaults were closed before local synthetic SQL opt-in. **1,025assertions across21pgTAP files passed**, with each test source hash in the [safe receipt](evidence/fresh-migrations-026.json). Schema-only bootstrap copied zero Auth rows. The owned connection was actually terminated during an uncommitted private probe insert; reconnect observed zero rows. The target`betweenus_qualification_d5f9a98ece5248168fd25ac17ed1d9a5`remains quarantined. This is local application-install/upgrade parity and an atomic probe rollback, distinct from hosted platform reconstruction, signed app qualification or a mid-financial-command crash.

The final separate root run`3266a917cf26473b8b83bda4e02191d1`,20:01:48.256–20:02:13.534UTC, repeated all26migrations, exact schema/owner/RLS/grant/function parity, closed defaults and the complete **1,025assertions/21files**, then performed an additional actual financial SQL crash exercise. The pinned existing`finance.test.sql`retained its initial BEGIN and all31TAP checks; only its exact terminal ROLLBACK was removed. In that still-open transaction its own connection observed one new family, two financial events and two financial command identities; a separate administrative connection observed zero of those rows before termination. The harness verified its exact owned PID/database/run application name, terminated only that connection, then both administrative and fresh reconnected reads observed zero exact-family/event/command rows. The [safe receipt](evidence/fresh-financial-crash-026.json) records source hashes and actual results; the extra31checks repeat the existing financial suite and are not added to the1,025regression count.

This proves rollback of an actual financial SQL transaction after the commit function appended events/command identities inside the encompassing uncommitted transaction. It does **not** prove network recovery after a database COMMIT, external payment behavior or an earned-cents outcome; the separately proven persisted400-cent replay belongs to the encrypted restore drill. Its new target`betweenus_qualification_3266a917cf26473b8b83bda4e02191d1`remains quarantined. No source Auth fixture, existing source row, full service or unrelated connection was changed by either fresh-schema crash exercise.
