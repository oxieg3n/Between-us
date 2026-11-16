# Between Us private vault protection

This local Expo module exposes two fixed storage purposes. Preparation returns `Promise<string|null>`; protection returns `Promise<boolean>`. No method accepts a path or private content.

| Methods | Android fixed child of `Context.noBackupFilesDir` | iOS fixed Application Support child |
| --- | --- | --- |
| `prepareVaultDirectory` / `protectVaultDirectory` | `between-us-vaults` | `BetweenUsPrivateVaults` |
| `prepareMessageOutboxDirectory` / `protectMessageOutboxDirectory` | `between-us-message-outbox` | `BetweenUsApprovedMessageOutbox` |

The journal/draft directory is unchanged. The approved-message outbox uses a sibling, never a child of the biometric-vault directory, so sending first does not populate the directory whose enrollment rejects all orphan files. Each purpose uses the same canonical containment, no-symlink/no-nested-directory and bounded file checks. On iOS, both reapply `isExcludedFromBackup` to their own directory and every file, then read each attribute from a fresh URL. Failed checks return null/false without native path/error logs. The module does not open SQLite databases or inspect content.

The outbox methods additionally refuse when a `message-outbox-v1-*` filename remains in the old vault directory. They neither move/delete it nor create an empty replacement that could hide an uncertain send. Any affected staging installation needs separately reviewed recovery; retrying or reinstalling is not proof that its old message failed. The original vault's strict orphan refusal is unchanged. Old native builds lacking the new methods cannot use outbox persistence until rebuilt.

Expo autolinking discovers local modules in `apps/mobile/modules` by default using `expo-module.config.json`. Native rebuilds are required; Expo Go cannot supply this module. Root owns app/native configuration, autolinking inspection and builds. Android backup/device-transfer policy for SecureStore remains separately configured by its plugin and root-owned backup rules. This module never manages keys and is not a recovery or encryption implementation.

The root operator observed the p1 Android debug vault diagnostic pass SQLCipher/no-backup path/wrong-key/reopen checks before this sibling-path addition. That evidence does not qualify the new directory or physical biometric/restore/iOS behavior. The new API passes mobile TypeScript and scoped ESLint; native compilation/runtime were not run by this helper. Root must rebuild and test first approved Send before Journal enrollment, unchanged journal unlock/reopen, distinct paths, legacy-outbox refusal without deletion/replacement, sibling symlink/nested-directory negatives and sidecar protection. Physical Android/iOS backup/device transfer and iOS attribute reapplication remain release gates. No static string test is presented as native filesystem proof. [Expo Modules API](https://docs.expo.dev/modules/module-api/) describes the native method mechanism; it does not establish these storage guarantees.
