# Local journal vault: production foundation

Date: 2026-11-16. Status: implementation contract for a fictional-data native spike; not an implemented security guarantee or permission to collect real children's writing. The owner has authorized production architecture and synthetic persistence evaluation. Historical memory-only prototype reports remain accurate for their builds. Production release still requires the independent reviews and device evidence below.

## Decision and information boundary

Use the SDK-compatible `expo-sqlite` SQLCipher build for an encrypted local database per authenticated author and installation. Store a separate, randomly generated database key through `expo-secure-store`, protected by OS authentication. Unsent conversation drafts use a different SQLCipher database, key and adapter. Do not invent a cipher, password derivation scheme, recovery protocol or encrypted export format.

Journal content, journal titles, entry identifiers, timestamps, private draft text, model prompts, model outputs and native model sessions never enter the family ledger, backend, contact graph, analytics, notifications, push payloads, crash reports or synchronization queue. The backend has no journal table, upload/read/export endpoint, administrator key or guardian recovery capability. It may authenticate an account without learning whether or what that author wrote. Journal export is an explicit author action described below; it is not synchronization. Local storage encryption is not end-to-end encryption, account authentication, protection against a compromised OS or proof that a trusted adult is safe.

The existing `state.tsx` role switcher, `journal.ts` saved-state comparison and `Journal.tsx` memory-only labels are demo behavior. They cannot become security boundaries by replacing arrays with database calls. `journal-intelligence` remains independent of storage/network/finance APIs and receives only the current author's explicitly permitted, bounded text in memory. Existing separate-message composition, Review and recipient authorization remain mandatory.

## Verified platform facts and selected use

The installed application uses Expo `~58.0.25`. Official versioned documentation was checked on the date above; package installation must use `npx expo install` from `apps/mobile`, under the master's serialized package ownership.

| Area | Verified fact and implementation consequence |
| --- | --- |
| SQLite | `useSQLCipher: true` is an `expo-sqlite` config-plugin option, requiring a new native build; SQLCipher is unavailable in Expo Go. `PRAGMA key` silently does nothing without SQLCipher. Require a nonempty `PRAGMA cipher_version` result before keying or schema creation. `withExclusiveTransactionAsync` uses another connection; original connection settings do not carry over. Keep a private, serialized connection and use `withTransactionAsync` only inside that exclusive adapter queue. Never expose the handle. [Expo SQLite SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/) |
| Key custody | SecureStore uses Android Keystore-backed encryption and iOS Keychain. Authentication-bound values may become permanently inaccessible after biometric changes. iOS items can survive reinstall; Android items do not survive uninstall. Exclude SecureStore from Android backup and do not assume its plugin excludes database files. Use async APIs and treat cancelled/failed authentication as retryable locked state. Select iOS `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` with `requireAuthentication: true`; qualify its passcode-removal and biometric behavior on devices. SecureStore authentication must be tested on real hardware. [Expo SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/) |
| Device authentication | `authenticateAsync`, enrollment/security-level checks and Android `biometricsSecurityLevel: 'strong'` support a preliminary device-unlock flow. LocalAuthentication success alone does not authorize key retrieval; retain SecureStore's authentication requirement. Face ID requires a native development build. [Expo LocalAuthentication SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/local-authentication/) |
| Screens | Use `preventScreenCaptureAsync` while sensitive surfaces are mounted, with balanced keyed ownership. Android protection also blanks Recents through `FLAG_SECURE`. Enable iOS `enableAppSwitcherProtectionAsync` and immediately show an opaque application lock cover on loss of active state. Do not request photo-library permission to detect screenshots. These controls cannot stop another camera or all OS/accessibility/keyboard disclosure. [Expo ScreenCapture SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/screen-capture/) |
| Randomness | Generate each database key with `await Crypto.getRandomBytesAsync(32)`. Use `Crypto.randomUUID()` for random local vault/entry IDs, never for key material. Do not use synchronous `getRandomBytes` for keys: its development behavior may fall back to `Math.random`. No insecure/web fallback is permitted for the native vault. [Expo Crypto SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/) |
| SQLCipher initialization | SQLCipher accepts a 64-character hex raw key, without application-created key derivation; retain its generated salt and default authenticated format. Set the key before schema access; wrong-key failure is established by reading the schema, not by whether the key pragma throws. `cipher_memory_security` can extend library allocation wiping at a performance cost. Preserve default HMAC and header behavior. [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/) |

The design recommendations in the following sections are project decisions, not claims that Expo supplies account isolation, recovery or secure erasure automatically.

## Account binding and shared devices

There are three different authorities: an authenticated application account, an enrolled local author/vault binding, and OS permission to release a device-protected key. A family/guardian administrator is none of these for another author. Never accept a UI role, request-supplied `authorId`, family membership or a deep-link parameter as a local vault capability.

Only the account/session coordinator can bind an authenticated account subject and issuer to an opaque installation-local vault ID. Persist that minimal binding and installation marker in protected local metadata, not AsyncStorage, URLs or a family record. Use random opaque names for database files and key aliases; no names, emails, role labels or journal titles in paths. Every database also contains its author/vault binding inside the encrypted metadata, checked after unlocking. Switching accounts discards the previous capability and completes lock/cleanup before another capability can be issued.

An enrolled device biometric or its passcode proves control of that device, not which family member is using it. A guardian who knows the child's passcode or has an enrolled fingerprint may unlock OS-protected keys. The initial production candidate therefore supports one enrolled author per OS application installation, on an author-controlled device, with a clear shared-device warning. A second author's enrollment is refused while a vault remains enrolled. It must not silently delete or replace that vault. Supporting multiple authors on one installation requires a separately reviewed author credential/key-release design using standard platform/library facilities, coercion analysis and tested author switching. Do not solve it with a homegrown PIN, a hardcoded key, a TypeScript brand or repeated OS biometrics. Synthetic multi-author adapter tests remain required to prove namespace separation; passing them does not enable shared-device production use.

Account/session tokens use their own managed authentication adapter and protected storage. They are never SQLCipher keys, recovery keys or key derivation inputs. A password reset, family administrator action, new login or new device cannot reconstruct an existing local journal key.

## Adapter contract

Keep the contract in an ordinary local module. A memory implementation for tests/web and an explicitly enabled native implementation share the domain types; the web/demo route continues to identify itself as memory-only. Unsupported native modules or missing SQLCipher refuse persistent mode rather than silently using plaintext SQLite or AsyncStorage. The following describes the required semantics; these names do not themselves provide authorization.

```ts
type VaultError =
  | 'locked' | 'cancelled' | 'unsupported' | 'identity-mismatch'
  | 'key-unavailable' | 'corrupt' | 'conflict' | 'quota' | 'storage';
type LockReason = 'background' | 'idle' | 'manual' | 'logout' | 'account-change' | 'revoked';
type EntrySummary = { id: string; title: string; updatedAt: string; revision: number };
type StoredEntry = EntrySummary & { body: string; createdAt: string };

// Constructed only by the session coordinator from validated account state.
// No public constructor, serialization, guardian override or role conversion.
interface AuthorGrant { readonly opaqueAuthorGrant: unique symbol }

interface UnlockedJournal {
  list(input: { before?: { updatedAt: string; id: string }; limit: number }): Promise<EntrySummary[]>;
  read(id: string): Promise<StoredEntry | undefined>;
  save(input: { id?: string; title: string; body: string; expectedRevision: number | null }): Promise<StoredEntry>;
  remove(input: { id: string; expectedRevision: number }): Promise<void>;
  // Author-selected snapshot held only in memory; no filesystem/share/network side effect.
  prepareExport(ids: readonly string[]): Promise<readonly StoredEntry[]>;
}
interface JournalVault {
  unlock(grant: AuthorGrant, signal: AbortSignal): Promise<UnlockedJournal>;
  lock(reason: LockReason): Promise<void>;
  // Requires a fresh own-author grant and a separate destructive UI confirmation.
  erase(grant: AuthorGrant, signal: AbortSignal): Promise<void>;
}
```

All public methods reject with an app-authored error code only. No native exception, SQL, key, path, author identifier or content reaches logs or UI. `unlock` captures an identity and generation token; the returned object is invalid after any lock, logout, account switch, background transition or verified revocation. Recheck that token both before work and after each awaited operation, including the final return. A stale read/export must not publish results; a queued stale save must not start. A transaction already committed before lock may persist, but its result cannot render in the next session. Cover that boundary in tests rather than promising cancellation can reverse a completed commit.

One adapter-owned serial queue is the only way to access each open database. The lock barrier synchronously revokes the capability and blocks new operations before awaiting any native cleanup. No screen holds a key, SQL handle or another author's entry collection. `list` returns at most 50 summaries; validate 1..50 and cursor shape. `read` loads a single body. Validate generated UUIDs/known identifiers, title <=150 and body <=5000 Unicode code units, nonblank body, bounded input bytes, and current revision in the adapter as well as UI. Reject oversize input rather than truncate private writing. Use bound parameters for all content and identifiers used as values. The only interpolated key pragma uses adapter-created, strictly `/^[0-9a-f]{64}$/` key hex; it must never be logged or retained for diagnostics.

Saving an existing entry requires the expected revision; update with `WHERE id = ? AND revision = ?`, increment once, and return `conflict` if zero rows changed. New entries require null expected revision and a generated ID. Deleting also checks revision; not-found reads return undefined without querying any other vault. Timestamps are app-generated UTC values used for display/order, never security authority. Order pagination by `(updated_at DESC, id DESC)` with matching cursor comparison. Initial local limits are 1,000 entries and 16 MiB of title/body UTF-8 bytes per author; enforce transactionally and return `quota` with an export/delete path. Limit adjustments require deliberate product review, not automatic eviction.

The unsent-message adapter has its own `unlock/lock/erase`, revision-protected `read/save/remove`, database and random key. It accepts only deliberately composed text plus an opaque candidate recipient and response preference. It has no `send`, queue, family-ledger or journal-read method. Journal editor autosave, if later approved, is an explicit `kind: 'journal-editor'` row there; conversation rows use `kind: 'conversation'`, and neither is read by notifications. Initial behavior keeps unsaved journal-editor text in memory unless the author explicitly opts into local draft recovery; persistence must be explained before enabling it. Discarding a draft removes its row. A recovered conversation must reselect/revalidate the recipient and undergo Review; stored acceptance/verification/permission snapshots confer no authority. A suggestion becomes a conversation draft only through the author's existing explicit prepare action. No entry body is automatically copied.

## Schema version 1

Each database contains exactly one encrypted metadata row. The journal database contains `entries`; the separate draft database contains `private_drafts`. No FTS, search index, attachment store, history, content hash, mood score, inference transcript, event ledger or sync tombstone is created.

```sql
CREATE TABLE vault_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  vault_id TEXT NOT NULL,
  account_issuer TEXT NOT NULL,
  account_subject TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('journal', 'drafts')),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1)
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) <= 150),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1)
);
CREATE INDEX entries_recent ON entries(updated_at DESC, id DESC);
-- Only in the separately keyed draft database:
CREATE TABLE private_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('journal-editor', 'conversation')),
  title TEXT NOT NULL CHECK (length(title) <= 150),
  body TEXT NOT NULL CHECK (length(body) <= 5000),
  recipient_candidate TEXT,
  response_preference TEXT,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1)
);
```

SQLite length checks are defense in depth; adapter Unicode/byte validation is authoritative. No `author_id` argument is needed in CRUD: the capability selects one vault, and encrypted metadata verifies it. Draft recipient existence is rechecked outside storage when the author resumes composition. Schema migrations run only after successful key/binding checks, under the same serial transaction boundary; unsupported future versions lock without downgrading or resetting. Do not import prototype fixtures or old plaintext into a new vault automatically.

## Creation, key custody and failure handling

1. Confirm a validated own-account enrollment, supported native build, device credential policy, available strong biometric key protection, installation marker and no existing different-author enrollment. Explain recovery and device-control limitations before creation. Declining or lacking hardware leaves the fictional memory-only mode available; never weaken `requireAuthentication` silently.
2. Create random opaque vault IDs and independent 32-byte journal/draft keys with async native randomness. Store keys with separate SecureStore services/aliases and `requireAuthentication: true`. Read them back through authenticated access before committing enrollment. LocalAuthentication may preflight availability, but does not substitute for this read.
3. Open each database in an application-private, backup-excluded directory. Verify SQLCipher availability before schema access, then set the validated raw key with SQLCipher's documented key syntax. Do not create a table first. Leave cipher defaults, HMAC and encrypted header intact; request `cipher_memory_security = ON`, qualify support/performance, and set `temp_store = MEMORY`, `secure_delete = ON`. Use ordinary rollback journal mode for this small initial workload; no WAL/shared container/background write requirement. Any later WAL change must cover WAL/SHM/keying/backup/cleanup explicitly.
4. On existing vaults, read `sqlite_master`, check encrypted binding/purpose/schema and run the reviewed integrity checks before returning an unlocked handle. A wrong key, unknown schema or mismatch never creates a replacement. Native integration must demonstrate that opening a copied file without/with a wrong key fails; merely observing `cipher_version` is insufficient evidence that a file was keyed.
5. Create schema and metadata atomically. Publish the protected enrollment record only after both vaults initialize successfully. A crash can leave an orphan key or empty file: reconcile only this operation's opaque IDs on the next authenticated enrollment, without touching a previous vault. An existing database with missing key enters `key-unavailable`; an existing key with missing database is an interrupted/lost-store state, not a new account's entitlement.
6. Drop temporary key-byte references promptly and overwrite mutable byte arrays when possible. JavaScript strings, garbage collection, bridge copies and native allocations prevent a guarantee of complete zeroization. Never save a key in Redux, AsyncStorage, environment variables, bundle constants, SQLite tables or model settings. No shared Keychain access group.

Key rotation is deferred from the first spike. A future SQLCipher rekey flow must independently review atomic key/database replacement and crash recovery before use; changing a key alias alone strands the data. Authentication changes are not rotation and must not trigger automatic key regeneration. Losing access shows recovery information, retry and explicit author-confirmed deletion; it never silently overwrites the vault.

## Lock, session and offline lifecycle

Initial policy: conceal immediately when AppState leaves `active`; lock on real background, unrelated inactivity, logout, account change, manual lock, verified own-account/device revocation, or after two minutes without author input while foregrounded. Measure idle time monotonically in process and recheck before every operation; a suspended timer is not an authority. Every fresh process starts locked. The adapter's own LocalAuthentication/SecureStore modal can cause inactive events: retain the pending lifetime only during that narrow authenticated native operation while keeping a separate opaque privacy cover. Any true background event still invalidates generation, including during the prompt. Wait briefly for active resume, then verify active state and current actor generation before unlock or private results can publish. Cancel/deny stale prompts without looping authentication or exposing content while inactive. Physical-device qualification remains mandatory.

The lock action first covers and unmounts sensitive screens, clears visible entry/draft/suggestion/export state and revokes the session token synchronously. Abort local reflection and native generation, drain database operations, finalize statements, close handles, stop/drain/release native model context and clear remaining app references. Do not delay the cover or another-author denial while awaiting native work. OS suspension may prevent cleanup from finishing; resumed execution must finish retirement before any unlock. Native stalls keep the next session locked and inference unavailable. There is no promise of erasing the OS heap. No background save/export/generation is allowed. Warn about unsaved writing before voluntary logout/account removal; involuntary lock never waits for a confirmation dialog.

Offline access is local access, not an offline server login. A previously enrolled author may explicitly unlock their own vault offline with the existing protected local binding and OS key authentication. It grants no contacts, account administration, message sending or backend permissions. A new account/device cannot enroll or recover another vault offline. A remote revocation cannot reach a disconnected device; do not advertise immediate offline revocation or remote erase. Upon reconnect, verified account/device revocation cancels queued work and locks the enrolled vault; re-enrollment requires that same author's reviewed authentication flow. A guardian's family/contact administration cannot issue that journal authority. No content upload is needed to learn session revocation. The initial release review must decide whether this offline-availability tradeoff is acceptable; time-limited offline grants need a separately reviewed expiry/clock-rollback design rather than a client date comparison.

Contact blocking/revocation remains separate: reauthorize the separately composed message at Review, send, delivery and retry; it cannot change private journal ownership or disclose a draft. Safety/help remains reachable while locked, offline or without guardian approval and must not include journal text.

## Backups, recovery, deletion and export

Exclude both databases, rollback/WAL/SHM sidecars, draft stores, enrollment markers and any export temporary files from OS/cloud backup and device transfer. On Android, use the correct private directory plus explicit legacy backup and current data-extraction exclusions for every actual path; `allowBackup=false` alone does not reliably disable all manufacturers' device transfer. On iOS, set and verify the directory/file backup exclusion using the platform resource attribute through a reviewed config plugin/local native module if Expo lacks the needed surface; reapply and verify after saves/moves/replacements because file operations can reset it. Do not assume `Paths.document` is excluded. Do not put a durable vault in an evictable cache directory just to avoid backup. [Android Auto Backup](https://developer.android.com/identity/data/autobackup), [Apple backup exclusion](https://developer.apple.com/documentation/foundation/urlresourcekey/isexcludedfrombackupkey).

The selected SecureStore accessibility prevents intended key migration, but does not replace these file exclusions. Treat iOS reinstall-surviving Keychain items as possible orphan secrets: a missing installation marker never automatically reattaches a surviving key to a new login. Explicit local vault removal deletes all known vault service aliases. Test uninstall/reinstall and device restore on each platform; do not promise uninstall alone securely deletes iOS keys.

Recovery notice before first save: **These pages are stored on this device. We cannot recover them if the device or its key is lost. Changing device security settings can make them inaccessible. Your parent, guardian and the service cannot unlock them for you.** Device loss, uninstall, biometric invalidation, passcode removal, corrupted storage or lost keys may mean permanent loss. No cloud backup, parent escrow, support override, password-reset recovery, multi-device sync or recovery phrase is included. A reviewed future recovery strategy is a separate explicit decision and cannot retrospectively recover lost keys.

Delete one entry under its revision transaction; clear matching editor state, reflection and selected export snapshot. `secure_delete` and file maintenance reduce reachable remnants, but flash wear leveling, OS snapshots and already exported copies prevent a promise of per-entry forensic erasure. No retained soft-delete history or tombstone is needed locally. Keep entries until the author deletes them; conversation drafts remain only until sent/discarded or the author erases the vault. A resumed draft is always identified as unsent.

Erase the whole enrolled vault only after fresh own-author authentication and an explicit destructive confirmation. First revoke runtime capabilities and stop all readers/model work, then durably mark deletion pending without content, remove both keys using their original SecureStore service/options, close/remove database files and sidecars, clear enrollment and memory. Retry unfinished removal on launch; never report completion while a key/file removal failed. Track enough non-content local state to finish cleanup safely. Key destruction limits future decryption; it cannot revoke copies already exported or guarantee physical flash erasure. Account removal must explain this separate local deletion choice; remote guardian/admin account deletion cannot export or decrypt the journal. Product/privacy reviewers must define how a retained offline vault interacts with account deletion before release.

Export is author initiated, own-vault only, with fresh authentication, entry selection, preview and an explicit disclosure that a readable file may leave the app and be copied by the selected destination. There is no administrator export and no journal export in family account downloads. `prepareExport` returns only selected records in memory; a separate narrowly owned export surface may write a bounded UTF-8 JSON/text document only after author confirmation. It must use a reviewed platform document destination, not email/cloud by default; no clipboard/autoshare. If a platform share API requires a plaintext temporary file, keep it app-private and backup-excluded, remove it after completion/cancel/timeout and on next startup, and disclose that destination copies cannot be deleted by this app. This artifact feature stays disabled until those lifecycle/device tests pass. Encrypted export/recovery is deferred; do not create an ad hoc file encryption protocol.

## Optional native model review

Current source pins `llama.rn` `0.13.0-rc.11`, a release candidate, and the SmolLM2-360M-Instruct Q8_0 artifact at publisher revision `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`, 386,404,992 bytes, SHA-256 `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`. On 2026-11-16 at 12:37:57 UTC, the publisher's pinned revision API returned matching LFS size/digest and `cardData.license: apache-2.0`; the pinned README returned HTTP 200 with `license: apache-2.0` and base model `HuggingFaceTB/SmolLM2-360M-Instruct`. This verifies the publisher declaration and artifact metadata, without downloading weights. Installed `llama.rn/LICENSE` is MIT. Before distribution, independent legal/supply-chain review still must assess notices, quantization provenance, runtime/bundled llama.cpp licenses, postinstall native-artifact downloads and binary hashes/build provenance. This metadata receipt does not approve redistribution or device safety. [Pinned publisher metadata](https://huggingface.co/api/models/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/revision/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f?blobs=true), [pinned publisher README](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/README.md), [runtime repository](https://github.com/mybigday/llama.rn).

Observed positive controls in current code: explicit public-model download separate from inference; pinned revision/size/hash checked before load; partial download cleanup; revalidation on load; unsupported-build fallback; native logs disabled before initialization; no exposed save/load-session APIs; serialized generation; version/AbortSignal stale-result rejection; bounded 5,000-character input, 840-token prompt, 128-token completion and 3,000-character output; strict schema plus independent content validation; cache clearing before/after generation; retirement on cache-clear failure; fixed public error messages and local-template fallback. Download requests contain no journal text. No model output can send a message or access vault keys.

Production work remains: coordinator-owned background/logout/account-lock unloading rather than relying on a mounted editor; safe behavior if `stopCompletion`, `clearCache` or `release` stalls/fails; native log/crash/tombstone inspection; low-memory and thermal interruption; disk-full/corrupt-download/incomplete-restart cases; cancellation during download/hash/load; multilingual/adversarial prompt injection and harmful-output evaluations. Existing English pattern filters and JSON schema cannot establish factual truth, identify every unsafe adult or prove semantic safety. The runtime's session persistence APIs must remain inaccessible. Do not store prompts, KV caches, chat history or model output in a vault, model directory or recovery file. Model weights can remain downloaded, but exclude them from backup and provide explicit removal; changing the model requires renewed license/hash/safety review. No broad telemetry is justified to assess private writing.

## Required evidence and release gates

An implementer may build the fictional adapter spike after explicit file ownership. Real-data release requires qualified independent mobile-security/cryptography review of library selection, native artifact provenance, key-release/author binding, backup exclusions, lifecycle races, export/deletion and recovery wording. Qualified child privacy/counsel and child-safety review remains necessary even if content stays on device: assess jurisdiction/age/consent, coercive guardians, device control, author rights and loss/retention explanations. This document does not certify compliance.

Focused automated acceptance tests must prove: forged/wrong-author grants deny; identical entry IDs in different synthetic vaults remain isolated; guardian role confers no read/export/erase; missing cipher support performs no content write; missing/invalid key or cancelled authentication never regenerates/resets data; wrong metadata purpose/author/schema denies; parameterized quote/control/Unicode inputs remain data; revision conflicts preserve writing; quota failure is atomic; migration failure rolls back; all stale list/read/save/export/unlock/generation completions are denied across lock/account-change; deletion retries safely after every interruption; restored orphan key/file combinations never autoattach; neither adapter imports network/ledger/notifications; drafts never auto-send or copy a journal. Test native driver initialization ordering separately from pure contract fakes.

Required physical-device qualification, **not run in this architecture task**:

| Environment / exact exercise | Evidence needed before release |
| --- | --- |
| Supported physical Android devices, minimum supported OS and current OS; strong fingerprint and supported face hardware; release-like signed build | Fresh enrollment and key-bound unlock, cancel/lockout, enrollment change, passcode removal, reboot-first-unlock, screen lock, background, Recents, screenshots/recording, notification shade and two-minute idle all stay private; plaintext/wrong-key database open fails; generic logs contain no fictional sentinel. |
| Physical iPhone with Face ID and a supported Touch ID device; minimum/current supported iOS; release-like signed build | Same key/authentication/lock tests, interruptions/Control Center, app-switcher snapshot protection, passcode/biometry invalidation, uninstall/reinstall-surviving Keychain behavior; no unrelated account reattachment. Simulator success is insufficient. |
| Android cloud restore, manufacturer device transfer and iOS backup/restore to a different physical device | Actual journal/draft/sidecar/key/export paths absent or inaccessible, no automatic orphan recovery, and clear permanent-loss UX. Inspect generated native backup rules and iOS resource attributes. |
| Low-resource supported Android/iOS hardware, airplane mode, disk nearly full, thermal load | Save/lock races preserve committed writes; model load/generation/cancellation and OS process kill recover locked without prompt/KV persistence; memory/RSS, latency and thermals recorded without private content. |
| Both platforms with a large fictional corpus and interruptible export/delete | Force-stop/crash during each setup/save/delete/export phase; database integrity survives or fails locked, no readable export leftovers, final key/file removal verified, destination-copy limitation explained. |

No native build, emulator/ADB operation, hardware test, model download, backend deployment or paid service was performed for this document. Existing model/domain tests were inspected, not rerun here. The master must run mobile `npm run typecheck`, `npm run lint` and `npm test` after any implementation integration, plus the appropriate real interaction/device checks; passing JavaScript tests does not close native storage or child-privacy gates.

## Fictional native adapter implementation record

The bounded implementation now lives in `apps/mobile/src/production/vault/`, with a local Expo module in `apps/mobile/modules/between-us-protection/`. The preferred asynchronous factory obtains only the module-owned fixed directory. A caller-supplied directory or JavaScript success callback cannot bypass that native path check. Android verifies canonical containment under the current app's `noBackupFilesDir`; iOS verifies its own Application Support path, refuses symbolic links/nested directories, reapplies `NSURLIsExcludedFromBackupKey` to all current files and reads back each value after writes. Neither native API accepts arbitrary paths or writing. SecureStore backup rules remain a separate root-owned native configuration responsibility. Official local-module/autolinking guidance was checked: [Expo local modules](https://docs.expo.dev/modules/get-started/), [autolinking](https://docs.expo.dev/modules/autolinking/).

The adapter has separate keys/databases, per-connection cipher/key checks, a single serialized connection per store, actual same-connection SQL transactions, revision/quota validation, crash-state metadata, non-destructive authentication/key failure, idle/background/session barriers and memory-only author-selected plaintext export preparation. Schema v1 currently uses the same entries table shape in each physically isolated purpose-bound database; only draft rows populate kind/recipient/preference. The session coordinator remains responsible for constructing validated actors, invoking signout/revocation locks and clearing UI/model memory. This is fictional-data foundation code, not independent security approval.

At this implementation checkpoint, full mobile TypeScript checking and focused vault/module ESLint pass. Sixteen focused portable tests pass using real in-memory SQLite with explicitly fake SQLCipher/key/filesystem ports, including rollback, stale-result/write barriers, key-loss nonreset, author isolation, quota/revisions, interrupted deletion, backup-check failure and own-prompt inactive versus real-background races. No native build/compilation, autolinking execution, emulator/ADB operation, hardware backup test or biometric device check was run by this helper. Native source passing TypeScript checks does not establish Kotlin/Swift compilation or device security behavior.

## Production Journal integration checkpoint, 2026-11-16

The production screen requires online managed `getUser`, verified issuer/subject/session claims and active `get_context` on each fresh unlock; the optional offline-unlock architecture above is not exposed by this UI. A refreshed token temporarily covers writing and cancels suggestions. Only verified identical issuer, subject, session ID and role can update the token while preserving unprotected writing. A transient verification failure leaves an opaque retry cover; verified denial, account/session change, background or the normal idle deadline clears writing. Initial unlock never substitutes a cached context for verification. Parent/guardian status does not mint another author's vault capability.

Optional conversation starters reuse the existing r12 local runtime and validator. Model use and while-writing suggestions are independent, memory-only choices, both initially off. Download/load leaves model use off until explicit opt-in. While-writing suggestions debounce for 1,200 ms, cancel on text/page/lifecycle changes, use already authorized contact metadata and do not extend the author-input idle deadline. The public model download contains no writing; contact refresh sends only the authorized RPC and expected account UID. Named-unsafe exclusions remain local and accompany the separately prepared text. Unknown relationship categories are conservatively unavailable whenever a category exclusion exists; child age metadata cannot distinguish a friend from a sibling. The receiving conversation flow must reauthorize the selected recipient and require explicit review/send. No original journal text is transferred automatically.

The caller still owns the global privacy cover and managed-session/revocation checks across every route, and must retire the screen on an account boundary even if a private operation is pending. Vault callbacks clear writer/draft/preparation state; model retirement aborts and drains the existing runtime. Public safety/help must remain reachable without guardian approval. Same-session token refresh must not remount the writer. There is no claim that an offline device receives immediate remote revocation.

At this checkpoint, mobile typecheck and all 138 portable unit tests pass; focused journal/helper ESLint has no diagnostics. Full package lint exits successfully with four concurrent root-owned Application unused-symbol warnings. Tests include same-session refresh, changed identity/role/session denial, latest-refresh races, offline cover/retry, cancellation, model default-off and malformed-output fallback, plus current-contact and unsafe-name/category exclusions. This helper did not run a native build, device interaction, browser interaction, model download or hardware inference; the physical-device and independent review gates above remain open.
