# Encrypted logical recovery qualification

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
