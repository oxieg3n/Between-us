# Workspace relocation result — 2026-11-15

Status: the complete repository is verified at the canonical root. Final empty-directory retirement and a fresh-session handoff remain pending a Windows directory lock. Do not describe the combined feature mission as implemented.

## Paths and move

| Item | Before | After |
| --- | --- | --- |
| Official root | `D:\projects\BetweenUs` existed, empty, ordinary directory, not Git | Complete authoritative repository, ordinary directory, no redirect/junction |
| Deprecated root | `D:\proejcts\BetweenUs` contained the repository | Empty ordinary directory; no `.git` or files; Windows refuses to rename it while a process holds it open |
| Git root | `D:/proejcts/BetweenUs` | `D:/Projects/BetweenUs` (Windows case-insensitive equivalent of the canonical path) |
| Branch | `feature/mobile-foundation` | Same |
| HEAD at physical move | `36a25a2fea5e14dda858f42909127d00ad385455` | Exact same HEAD before synchronization |
| Original dirty work | One untracked `Scripts/Narrator-One-Time-Diagnostic-eb5cb0e.txt` | Same path/content/hash, intentionally excluded from commits/push |

The destination was inspected before any mutation. A neutral `D:\` shell attempted to preserve the empty destination by renaming it, but Windows refused because it was open. No data moved in that failed attempt. The safe adapted move retained the empty destination and moved every top-level source item, including hidden `.git`, ignored `node_modules`, `.expo`, assets, scripts and configuration, onto the same D: volume. Every destination item was checked absent first. Nothing was cloned, overwritten or deleted.

The old directory was then confirmed empty; renaming that vacated directory also hit a Windows sharing lock. No unrelated process was killed. There were no old-root Metro/Expo watch commands found in the targeted process audit, no concurrent helper tasks, and no servers listening on 8081/8082 before checks. An external directory handle must be released before the last rename can succeed. A read-only process current-directory audit confirmed the current Codex CLI (PID 27396) and its scoped node hosts already use the new directory. The exact holder of the old lock was not proven; it may be an older workspace watcher rather than this CLI. Do not assert that an unrelated process is responsible or terminate one speculatively.

Local pre/post evidence: `D:\projects\BetweenUs.relocation-result-20261115-155826.json`. All pre/post refs, index hash, Git config hash, HEAD reflog hash, branch, HEAD, origin, top-level item names, dependency presence and diagnostic hash matched immediately after movement. Diagnostic SHA-256: `34ACB427BF1F0A4A1749104A4066BB389A54680641C2F9437FDFDC4186F8C56C`. Its contents were not published.

## Git integrity and remote reconciliation

- One primary checkout, `.git` directory rather than an external gitdir file; no secondary worktrees, submodules or `core.worktree` configuration needing repair.
- No unauthorized `pushurl` override. Fetch and evaluated push URL remain `https://github.com/oxieg3n/Between-us.git`.
- All Git operations after the physical move used the new root, including explicit `git -C 'D:\projects\BetweenUs' fetch origin` and `merge --ff-only origin/feature/mobile-foundation`.
- Fetch found exactly three documentation commits ahead, with no unpushed local divergence. Fast-forward advanced `36a25a2` to `3a6ad34`; the original untracked diagnostic remained intact. No stash, reset, rebase, conflict resolution, discarded changes or force operation was used.
- `git fsck --no-dangling` passed. The earlier local HEAD remains an ancestor. Main stays separate; `docs/` and root `index.html` remain unchanged relative to origin/main.

The migration checkpoint and any push receipts follow the remote `3a6ad34` documentation baseline. Commit and push only with the explicit new-root path. The final session reply supplies the resulting checkpoint SHA.

## Active paths and tools

PowerShell actually reported `D:\projects\BetweenUs`. WSL executed `cd /mnt/d/projects/BetweenUs && pwd` and reported `/mnt/d/projects/BetweenUs`.

The fetched AGENTS.md, README and combined mission already use the canonical root. Targeted searches found no deprecated paths in active mobile scripts, agents, app/build configs, editor settings or Playwright config. Relative scripts now resolve from the moved repository. Deprecated paths that remain describe the relocation source, guards or historical audit/QA provenance; these were preserved, not globally rewritten. No global Codex or Git configuration was changed.

Added `Scripts/Complete-WorkspaceRelocation.ps1` for the final empty-directory rename after old-path sessions close. It checks canonical Git identity, correct branch/origin and that the deprecated directory is genuinely empty and not a link, then renames it to a unique sibling archive. It never deletes data or overwrites an archive. Parser validation and `-CheckOnly` passed here; final rename remains blocked by the external handle.

## Checks executed from the new app directory

Working directory: `D:\projects\BetweenUs\apps\mobile`.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 13 passed |
| `npm run test:ui` | 5 passed, including existing accessibility/theme flows |
| `npx expo-doctor` | 20/20 passed |
| `npx expo export --platform web` | Passed; static output generated in the new app's ignored dist directory |
| `npx expo export --platform android` | Passed; Android Hermes bundle generated from the new app root |
| Completion helper parser and `-CheckOnly` | Passed, correctly reports pending old empty directory |

No npm reinstall/reclone was needed. Existing dependencies moved intact. Expo used `src/app` from the new working directory. No Android native runtime, standalone APK, iOS runtime or new screenshots were tested during this relocation. Earlier QA is historical and was not relabeled as a new-path run.

## Session/directory retirement gate and combined mission

The relocation addendum explicitly says: “Close the old Codex session after the move if it still carries the old working directory”. The old directory handle cannot be released safely by this task without locating/closing its owner. The current CLI already uses the canonical path, so a full CLI restart is needed only if an old session/watcher cannot otherwise be closed. Finish the directory-retirement gate before feature development; no Chores & Goals, savings/matching, payment bridge or Intelligent Journal implementation is claimed in this checkpoint. The remote mission specifications have been reconciled and the continuation checkpoint is in PROGRESS.md.

Close old-path terminals/Codex sessions. Open a fresh PowerShell window and run:

```powershell
Set-Location 'D:\projects\BetweenUs'
powershell -NoProfile -File .\Scripts\Complete-WorkspaceRelocation.ps1
codex
```

Only continue once the helper prints COMPLETE and the deprecated path is absent. In the fresh canonical-root task, read this report and `spec/MASTER_MISSION_CHORES_SAVINGS_INTELLIGENT_JOURNAL.md` fully, inspect status and resume its ordered implementation. If the helper still reports a lock, locate/close the remaining old-path session; do not clone, create a redirect, kill unrelated processes or overwrite anything.

## Push receipt

The relocation checkpoint is committed and pushed explicitly from `D:\projects\BetweenUs` on the development branch. The timestamped verified push receipt is added below after the command succeeds. This push documents the migration and remaining empty-directory lock; it does not publish a feature implementation or claim that lock cleanup succeeded.
