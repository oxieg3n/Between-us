# Between Us: mandatory Windows workspace relocation and Git push origin

**Status:** Approved relocation instructions, pending execution on the owner's Windows computer.
**Created:** 2026-11-15.
**Canonical Windows repository root:** `D:\projects\BetweenUs`
**Canonical Expo app directory:** `D:\projects\BetweenUs\apps\mobile`
**WSL equivalent:** `/mnt/d/projects/BetweenUs`
**Deprecated location (source of existing working copy):** `D:\proejcts\BetweenUs`
**GitHub remote:** https://github.com/oxieg3n/Between-us
**Development branch:** `feature/mobile-foundation`

## Mandatory execution order

**This relocation precedes the master implementation mission.** Do it before continuing Chores & Goals, savings/matching, journal intelligence, Android builds, screenshots, or Git pushes.

1. Start from a **neutral directory**, not inside the tree being moved. Coordinate with running Codex agents; stop Metro/Expo, local development servers, editor windows, watch processes, and terminals whose working directory is inside the old root. Do not kill unrelated processes or silently discard tasks.
2. Inspect the old and new locations. If the new destination already exists, **stop the automated move** and compare contents, Git roots and branches. No overwrite, deletion, clone, arbitrary merge, or push from either copy until resolved.
3. If the old folder exists and the destination does not, move the **entire folder** on the same D: volume, including `.git`, hidden and ignored files. Do **not** run a fresh clone instead of relocating. Preserve all commits, uncommitted changes, staged content, local branches, tags, reflogs and remote configuration.
4. Inspect active Git worktrees, submodules, `core.worktree` and external `gitdir` links **before** moving. If the main directory is a linked worktree, contains external worktrees, or uses unusual Git path configuration, first plan the necessary `git worktree repair` or metadata repairs and verify that each path remains valid. Stop on unresolved conflicts.
5. Validate the new root and identity, compare pre/post branch, HEAD, dirty status and remote, then verify that the old project root no longer exists. Use `git -C 'D:\projects\BetweenUs'` for every subsequent commit/push.
6. Update **active** configs, scripts, task definitions, developer instructions, run commands and absolute-path references from `D:\proejcts\BetweenUs` to `D:\projects\BetweenUs`; WSL paths change from `/mnt/d/proejcts/BetweenUs` to `/mnt/d/projects/BetweenUs`. Search with `rg` excluding `.git`, `node_modules`, build outputs and recorded QA provenance. Do not rewrite historic build reports, screenshot manifests or existing commits.
7. From the new root, fetch the feature branch and **safely reconcile this documentation-only remote change** with any local unpushed commits or uncommitted work. Fast-forward only if possible; otherwise stop and examine branch divergence before a controlled merge or rebase. No force-push or implicit reset.
8. Run smoke checks and then commit/push any approved new development **only from the new verified root**, on `feature/mobile-foundation`; never merge to `main` or change the public GitHub Pages demo.
9. Close the old Codex session after the move if it still carries the old working directory; launch a fresh session with `Set-Location 'D:\projects\BetweenUs'` followed by `codex`. Continue the combined mission from `spec/MASTER_MISSION_CHORES_SAVINGS_INTELLIGENT_JOURNAL.md`.

## PowerShell relocation reference (execute outside the old tree)

**Codex should inspect and adapt this; it must not blindly run a destructive script.** It is for the normal case where this is the primary repository checkout with no conflicting worktree links.

```powershell
$ErrorActionPreference = 'Stop'
$Old = 'D:\proejcts\BetweenUs'
$New = 'D:\projects\BetweenUs'
$ExpectedOrigin = 'https://github.com/oxieg3n/Between-us'
$ExpectedBranch = 'feature/mobile-foundation'

Set-Location 'D:\'

if (!(Test-Path -LiteralPath $Old -PathType Container)) {
    if (Test-Path -LiteralPath $New -PathType Container) {
        Write-Host "Old source absent; verify existing new checkout without moving."
    } else {
        throw "Neither repository folder exists. Inspect drives and backups; do not clone over unknown work."
    }
} else {
    if (Test-Path -LiteralPath $New) {
        throw "Destination already exists. Inspect both copies; never overwrite."
    }
    $BeforeRoot = (git -C $Old rev-parse --show-toplevel).Trim()
    if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($BeforeRoot).TrimEnd('\') -ine [IO.Path]::GetFullPath($Old).TrimEnd('\')) {
        throw "Old folder is not the expected Git root."
    }
    $BeforeBranch = (git -C $Old branch --show-current).Trim()
    $BeforeHead = (git -C $Old rev-parse HEAD).Trim()
    $BeforeStatus = @(git -C $Old status --porcelain=v1 --untracked-files=all)
    $BeforeOrigin = (git -C $Old remote get-url origin).Trim()
    $Worktrees = @(git -C $Old worktree list --porcelain)
    Write-Host "Branch: $BeforeBranch, HEAD: $BeforeHead, origin: $BeforeOrigin"
    $Worktrees | ForEach-Object { Write-Host $_ }
    # STOP AND REVIEW: linked/external worktrees, submodules, core.worktree,
    # .git files pointing elsewhere, or processes holding the folder open.
    New-Item -ItemType Directory -Path (Split-Path -Parent $New) -Force | Out-Null
    Move-Item -LiteralPath $Old -Destination $New
    if (Test-Path -LiteralPath $Old) { throw "Old root still exists after move; investigate." }
    if (!(Test-Path -LiteralPath $New)) { throw "New root missing after move." }
    $AfterRoot = (git -C $New rev-parse --show-toplevel).Trim()
    $AfterBranch = (git -C $New branch --show-current).Trim()
    $AfterHead = (git -C $New rev-parse HEAD).Trim()
    $AfterStatus = @(git -C $New status --porcelain=v1 --untracked-files=all)
    $AfterOrigin = (git -C $New remote get-url origin).Trim()
    if ([IO.Path]::GetFullPath($AfterRoot).TrimEnd('\') -ine [IO.Path]::GetFullPath($New).TrimEnd('\')) { throw "Git root is wrong." }
    if ($AfterBranch -ne $BeforeBranch -or $AfterHead -ne $BeforeHead -or $AfterOrigin -ne $BeforeOrigin) { throw "Git identity changed." }
    if (($BeforeStatus -join "`n") -ne ($AfterStatus -join "`n")) { throw "Git working tree status changed." }
}
if ((git -C $New remote get-url origin).Trim() -notmatch 'github\.com[:/]oxieg3n/Between-us(?:\.git)?$') {
    throw "Unexpected Git remote. Resolve before pushing."
}
Write-Host "Existing Git root verified at: $New"
git -C $New status -sb
git -C $New remote -v
```

**After validation**, reopen a terminal in the new root and inspect any local changes before syncing:

```powershell
Set-Location 'D:\projects\BetweenUs'
git rev-parse --show-toplevel
git branch --show-current
git status -sb
git remote -v
git fetch origin
git status -sb

# Use git pull --ff-only only if a fast-forward is possible and
# local changes do not block it. Reconcile divergence without force.

# All subsequent pushes MUST explicitly use the new root:
git -C 'D:\projects\BetweenUs' push -u origin feature/mobile-foundation
```

Do not run the example push if local changes or divergence remain unresolved, or before an authorized feature commit has been integrated. The Git remote URL should normally remain unchanged; it points to GitHub and is independent of which Windows directory the command runs from.

## Verification and Git reporting

Record in `spec/mission/WORKSPACE_RELOCATION_RESULT.md`:

- Original and new directory existence and resolution.
- Old and new Git root/HEAD/branch/status comparisons.
- Origin push/fetch URLs; no unauthorized `pushurl` overrides.
- Any linked worktrees, worktree repair, submodule, script or absolute path changes.
- Actual paths reported by PowerShell, Expo/Metro, Android build scripts and WSL.
- Typecheck/lint/test results, and optionally an Android smoke test after paths are corrected.
- **A real Git command executed from the new directory** including the final push outcome and resulting remote HEAD SHA, if a push was appropriate.
- Anything not performed, with an honest blocker.

**Definition of done:** The single authoritative working copy is at `D:\projects\BetweenUs`, old location is not used, all active tools and new Git pushes originate at `D:\projects\BetweenUs`, remote origin and branch are correct, and no local work was lost.

**Safety:** No force pushes, no automatic deletion of a conflicting destination, no reclone over the source, no loss of untracked/ignored assets, no hidden redirect, and no claim that a GitHub documentation commit physically relocated a Windows folder.
