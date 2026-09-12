#!/bin/bash
set -euo pipefail

# Recover a Replit workspace whose git checkout is wedged in a merge conflict.
#
# Replit's Git pane has no "abort merge" control, so once a pull conflicts the
# checkout stays stuck until the underlying git state is cleared from the Shell.
# The usual advice — `git reset --hard origin/main` — clears it by throwing away
# whatever the container had. This script reaches the same clean state without
# losing anything: every local commit and tracked edit is parked on a timestamped
# rescue branch (pushed to GitHub when the container has credentials) first.
#
# Untracked files are deliberately never staged and never deleted. `git reset
# --hard` does not touch them, and this script does not run `git clean`, so .env,
# local notes and scratch files survive exactly as they are. That also means no
# untracked secret can be swept into a branch and pushed to GitHub.
#
# Must be idempotent and non-interactive (when run as
#   git show origin/<branch>:scripts/fix-replit-git.sh | bash
# stdin is the script itself, so nothing here may read from stdin).
#
# Usage:
#   bash scripts/fix-replit-git.sh             # back up, then reset to origin/main
#   bash scripts/fix-replit-git.sh --dry-run   # report what it would do, change nothing
#   bash scripts/fix-replit-git.sh --target=origin/some-branch

DRY_RUN=0
TARGET_REF="origin/main"

for arg in "$@"; do
  case "$arg" in
    -n|--dry-run) DRY_RUN=1 ;;
    --target=*)   TARGET_REF="${arg#--target=}" ;;
    -h|--help)
      printf '%s\n' \
        "Usage: bash scripts/fix-replit-git.sh [--dry-run] [--target=origin/main]" \
        "" \
        "Clears a stuck merge conflict in a Replit checkout, after backing up all" \
        "local commits and tracked edits to a rescue branch. Untracked files" \
        "(.env, scratch files) are never staged, pushed, or deleted."
      exit 0
      ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

say()  { printf '[fix-replit-git] %s\n' "$*"; }
step() { printf '\n[fix-replit-git] == %s ==\n' "$*"; }

# In dry-run, echo the command instead of running it. Anything that only reads
# state is called directly so the report reflects the real repository.
run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[fix-replit-git]   would run: %s\n' "$*"
  else
    printf '[fix-replit-git]   + %s\n' "$*"
    "$@"
  fi
}

# Files that may hold credentials. Never staged into the rescue branch; if one is
# tracked *and* modified it is copied aside on disk instead, so a reset can't drop
# the edit and a push can't leak it.
is_sensitive() {
  case "$1" in
    .env|.env.*|*/.env|*/.env.*) return 0 ;;
    *.pem|*.key|*.p12|*.pfx|*.jks) return 0 ;;
    *service-account*.json|*credentials.json|*client_secret*.json) return 0 ;;
    *) return 1 ;;
  esac
}

step "inspecting checkout"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  say "ERROR: not inside a git repository."
  say "In the Replit Shell, run 'cd ~/workspace' (or your project folder) first."
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"
GIT_DIR=$(git rev-parse --git-dir)

say "repo: $REPO_ROOT"

if ! git rev-parse --verify --quiet HEAD >/dev/null; then
  say "ERROR: this checkout has no commits yet; nothing to rescue."
  exit 1
fi

BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
if [ -n "$BRANCH" ]; then
  say "branch: $BRANCH"
else
  say "branch: (detached HEAD)"
fi
say "head:   $(git log -1 --format='%h %s')"

# Detect an interrupted operation. Written as if/fi rather than `[ ... ] && ...`
# so a false test doesn't trip `set -e`.
IN_PROGRESS=""
if [ -f "$GIT_DIR/MERGE_HEAD" ];       then IN_PROGRESS="merge";       fi
if [ -d "$GIT_DIR/rebase-merge" ];     then IN_PROGRESS="rebase";      fi
if [ -d "$GIT_DIR/rebase-apply" ];     then IN_PROGRESS="rebase-apply"; fi
if [ -f "$GIT_DIR/CHERRY_PICK_HEAD" ]; then IN_PROGRESS="cherry-pick"; fi
if [ -f "$GIT_DIR/REVERT_HEAD" ];      then IN_PROGRESS="revert";      fi

CONFLICTED=$(git diff --name-only --diff-filter=U 2>/dev/null || true)

if [ -n "$IN_PROGRESS" ]; then
  say "stuck operation: $IN_PROGRESS in progress"
else
  say "stuck operation: none"
fi

if [ -n "$CONFLICTED" ]; then
  say "conflicted files:"
  printf '%s\n' "$CONFLICTED" | sed 's/^/    /'
fi

step "syncing refs from GitHub"
if ! git fetch origin --prune; then
  say "ERROR: could not reach GitHub. Check the container's network/credentials."
  exit 1
fi

if ! git rev-parse --verify --quiet "$TARGET_REF" >/dev/null; then
  say "ERROR: target ref '$TARGET_REF' does not exist after fetch."
  exit 1
fi

TARGET_SHA=$(git rev-parse --short "$TARGET_REF")
say "target: $TARGET_REF ($TARGET_SHA) $(git log -1 --format='%s' "$TARGET_REF")"

# Local-only commits are measured from the pre-merge HEAD, which is still the
# branch tip while a merge is conflicted.
LOCAL_ONLY=$(git rev-list --count "$TARGET_REF"..HEAD)
BEHIND=$(git rev-list --count "HEAD..$TARGET_REF")
say "divergence: $LOCAL_ONLY local-only commit(s), $BEHIND commit(s) behind $TARGET_REF"

if [ "$LOCAL_ONLY" != "0" ]; then
  say "local-only commits that must be preserved:"
  git log --oneline "$TARGET_REF"..HEAD | sed 's/^/    /'
fi

step "clearing the interrupted operation"

# Aborting restores the working tree to its pre-merge state, which puts back any
# edits that existed before the pull and removes the conflict markers. Doing this
# before the backup is what makes the backup commit clean.
if [ -n "$IN_PROGRESS" ]; then
  case "$IN_PROGRESS" in
    merge)                run git merge --abort ;;
    rebase|rebase-apply)  run git rebase --abort ;;
    cherry-pick)          run git cherry-pick --abort ;;
    revert)               run git revert --abort ;;
  esac
  say "cleared: $IN_PROGRESS"
else
  say "nothing to abort"
fi

step "backing up local work"

# Re-read the dirty set after the abort — it reflects the real pre-merge edits.
if [ "$DRY_RUN" = "1" ] && [ -n "$IN_PROGRESS" ]; then
  say "(dry run: the merge was not aborted, so the list below still reflects the"
  say " conflicted tree rather than your pre-merge edits)"
fi

TRACKED_DIRTY=$(git diff --name-only HEAD 2>/dev/null || true)

SENSITIVE_DIRTY=""
SAFE_DIRTY=""
if [ -n "$TRACKED_DIRTY" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if is_sensitive "$f"; then
      SENSITIVE_DIRTY="${SENSITIVE_DIRTY}${f}"$'\n'
    else
      SAFE_DIRTY="${SAFE_DIRTY}${f}"$'\n'
    fi
  done <<< "$TRACKED_DIRTY"
fi

STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP_BRANCH="replit-rescue/$STAMP"
ASIDE_DIR="$REPO_ROOT/.replit-rescue-$STAMP"

if [ "$LOCAL_ONLY" = "0" ] && [ -z "$TRACKED_DIRTY" ]; then
  say "no local commits and no tracked edits — nothing to back up"
  BACKUP_BRANCH=""
else
  # A tracked credential file that was edited would be reverted by the reset, so
  # copy it aside on disk rather than committing it to a branch bound for GitHub.
  if [ -n "$SENSITIVE_DIRTY" ]; then
    say "WARNING: these tracked files look like credential files and were edited:"
    printf '%s' "$SENSITIVE_DIRTY" | sed 's/^/    /'
    say "They will NOT be committed or pushed. Copying them to:"
    say "    $ASIDE_DIR"
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      run mkdir -p "$ASIDE_DIR/$(dirname "$f")"
      run cp -- "$f" "$ASIDE_DIR/$f"
    done <<< "$SENSITIVE_DIRTY"
  fi

  say "rescue branch: $BACKUP_BRANCH (at current HEAD, so all $LOCAL_ONLY local commit(s) come along)"
  run git branch "$BACKUP_BRANCH" HEAD

  if [ -n "$SAFE_DIRTY" ]; then
    say "committing tracked edits onto the rescue branch:"
    printf '%s' "$SAFE_DIRTY" | sed 's/^/    /'

    # Commit onto the rescue branch without moving the working tree: stage the
    # edits, write a tree, commit it against the branch, then restore the index.
    if [ "$DRY_RUN" = "1" ]; then
      say "  would commit the above onto $BACKUP_BRANCH"
    else
      # A fresh container may have no git identity; commit-tree refuses without one.
      if ! git config user.email >/dev/null 2>&1; then
        export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Replit Rescue}"
        export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-replit-rescue@localhost}"
        export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-Replit Rescue}"
        export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-replit-rescue@localhost}"
        say "  (no git identity configured; committing as Replit Rescue)"
      fi
      git add -u -- . ':(exclude).env' ':(exclude).env.*' ':(exclude)*.pem' \
        ':(exclude)*.key' ':(exclude)*.p12' ':(exclude)*.pfx' ':(exclude)*.jks' \
        ':(exclude)*service-account*.json' ':(exclude)*credentials.json' \
        ':(exclude)*client_secret*.json'
      TREE=$(git write-tree)
      COMMIT=$(git commit-tree "$TREE" -p HEAD \
        -m "Rescue uncommitted Replit edits ($STAMP)" \
        -m "Saved by scripts/fix-replit-git.sh before resetting the Replit checkout to $TARGET_REF.")
      git update-ref "refs/heads/$BACKUP_BRANCH" "$COMMIT"
      git reset -q            # unstage; edits stay in the working tree for now
      say "  committed as $(git rev-parse --short "$COMMIT")"
    fi
  else
    say "no tracked edits to commit"
  fi

  step "pushing the rescue branch to GitHub"
  if [ "$DRY_RUN" = "1" ]; then
    say "would run: git push -u origin $BACKUP_BRANCH"
  elif git push -u origin "$BACKUP_BRANCH"; then
    say "pushed: $BACKUP_BRANCH is now on GitHub and safe even if this container is wiped"
  else
    say "WARNING: push failed (the container may not have GitHub write credentials)."
    say "Your work is still safe locally on branch $BACKUP_BRANCH in this container."
    say "Recover it later with: git switch $BACKUP_BRANCH"
  fi
fi

step "resetting the checkout to $TARGET_REF"

# -f is safe here precisely because the backup above already captured these edits;
# without it the leftover working-tree changes can block the branch switch.
if [ -n "$BRANCH" ]; then
  run git checkout -f -B "$BRANCH" "$TARGET_REF"
else
  say "HEAD was detached; landing on a local 'main' tracking $TARGET_REF"
  run git checkout -f -B main "$TARGET_REF"
fi
run git reset --hard "$TARGET_REF"

# Note: no `git clean` on purpose. Untracked files are not what wedged the merge,
# and removing them would delete .env / Replit scratch files that git never had.

step "done"

if [ "$DRY_RUN" = "1" ]; then
  say "DRY RUN — nothing was changed."
  say "Re-run without --dry-run to apply."
  exit 0
fi

say "checkout is now clean at $(git log -1 --format='%h %s')"
if [ -n "$BACKUP_BRANCH" ]; then
  say "your previous state is preserved on: $BACKUP_BRANCH"
fi
if [ -n "$SENSITIVE_DIRTY" ]; then
  say "credential files were copied aside to: $ASIDE_DIR"
fi
say "Replit's Git pane should now show a clean tree. If it still looks stuck,"
say "close and reopen the Git tab to force it to re-read the checkout."
