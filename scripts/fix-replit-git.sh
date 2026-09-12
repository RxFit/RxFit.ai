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
    # Templates list variable *names*, never values, and are meant to be tracked
    # and pushed — .gitignore keeps .env.example out of the .env ignore rule.
    # Checked first so `.env.example` is not swept up by the `.env.*` rule below,
    # which would otherwise abort the whole rescue over a committed template.
    *.example|*.sample|*.template|*.dist) return 1 ;;
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

# During a rebase HEAD is detached, so the symbolic-ref above is empty even though
# `git rebase --abort` checks the original branch back out. Treating that as a
# genuinely detached checkout makes the reset below land on `main` and force-reset
# it while the operator was on another branch entirely. The rebase state records
# the real branch, so read it; "detached HEAD" there means it really was detached.
for __head_name in "$GIT_DIR/rebase-merge/head-name" "$GIT_DIR/rebase-apply/head-name"; do
  if [ -f "$__head_name" ]; then
    __ref=$(cat "$__head_name")
    case "$__ref" in
      refs/heads/*) BRANCH="${__ref#refs/heads/}" ;;
      *)            BRANCH="" ;;
    esac
    break
  fi
done
unset __head_name __ref
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

# No --prune: it deletes remote-tracking refs, which a dry run must not do. The
# fetch itself is unconditional because every comparison below needs the target
# ref, and it only advances remote-tracking refs — reported honestly at the end
# rather than claimed as "nothing happened".
if ! git fetch origin; then
  say "ERROR: could not reach GitHub. Check the container's network/credentials."
  exit 1
fi

if ! git rev-parse --verify --quiet "$TARGET_REF" >/dev/null; then
  say "ERROR: target ref '$TARGET_REF' does not exist after fetch."
  exit 1
fi

TARGET_SHA=$(git rev-parse --short "$TARGET_REF")
say "target: $TARGET_REF ($TARGET_SHA) $(git log -1 --format='%s' "$TARGET_REF")"

# The commit the rescue branch will actually be created from. During a merge,
# cherry-pick or revert, HEAD is still the branch tip. During a *rebase* it is
# not: HEAD is a detached, partially-replayed commit, and the original tip comes
# back only when the rebase is aborted. Scanning HEAD there would inspect a few
# replayed commits and miss whatever else the restored tip carries, so resolve
# the tip that the rescue will really publish.
if [ -f "$GIT_DIR/rebase-merge/orig-head" ]; then
  TIP=$(cat "$GIT_DIR/rebase-merge/orig-head")
elif [ -f "$GIT_DIR/rebase-apply/orig-head" ]; then
  TIP=$(cat "$GIT_DIR/rebase-apply/orig-head")
else
  TIP=$(git rev-parse HEAD)
fi

if [ "$TIP" != "$(git rev-parse HEAD)" ]; then
  say "rebase in progress; the tip restored by the abort is $(git rev-parse --short "$TIP")"
fi

LOCAL_ONLY=$(git rev-list --count "$TARGET_REF".."$TIP")
BEHIND=$(git rev-list --count "$TIP..$TARGET_REF")
say "divergence: $LOCAL_ONLY local-only commit(s), $BEHIND commit(s) behind $TARGET_REF"

if [ "$LOCAL_ONLY" != "0" ]; then
  say "local-only commits that must be preserved:"
  git log --oneline "$TARGET_REF".."$TIP" | sed 's/^/    /'
fi

# A rescue branch publishes the complete local-only commit graph. Path filtering
# during the later uncommitted-edit step cannot remove a credential file that is
# already present in one of those commits, so refuse to push or reset when any
# local-only commit touched a credential-shaped path.
SENSITIVE_LOCAL_HISTORY=""
if [ "$LOCAL_ONLY" != "0" ]; then
  while IFS= read -r commit; do
    while IFS= read -r -d '' f; do
      if is_sensitive "$f"; then
        SENSITIVE_LOCAL_HISTORY="${SENSITIVE_LOCAL_HISTORY}${f}"$'\n'
      fi
    done < <(git diff-tree --root -m --no-commit-id --name-only -r -z "$commit")
  done < <(git rev-list "$TARGET_REF".."$TIP")
fi

if [ -n "$SENSITIVE_LOCAL_HISTORY" ]; then
  say "ERROR: local-only commit history touches credential-shaped paths:"
  printf '%s' "$SENSITIVE_LOCAL_HISTORY" | sort -u | sed 's/^/    /'
  say "No rescue branch was pushed and the checkout was not reset."
  say "Remove the credential material from local history, then run this script again."
  exit 1
fi

# Tracked paths that is_sensitive considers credential-shaped, at any depth. The
# snapshot below restores these to their committed content so a working-tree
# secret cannot ride along in the pushed conflict-state branch.
SENSITIVE_TRACKED=""
while IFS= read -r -d '' f; do
  if is_sensitive "$f"; then
    SENSITIVE_TRACKED="${SENSITIVE_TRACKED}${f}"$'\n'
  fi
done < <(git ls-tree -r --name-only -z HEAD)

# Second resolution is not enough on its own: the documented response to a
# rejected push is to re-run, and a prompt retry lands in the same second, so the
# branch name collides, `git branch` fails and set -e ends the run mid-recovery.
# Walk to the first free name instead.
STAMP=$(date -u +%Y%m%d-%H%M%S)
__n=1
__stamp="$STAMP"
while git show-ref --verify --quiet "refs/heads/replit-rescue/$__stamp" ||
      git show-ref --verify --quiet "refs/heads/replit-rescue/$__stamp-conflict-state"; do
  __n=$((__n + 1))
  __stamp="$STAMP-$__n"
done
STAMP="$__stamp"
unset __n __stamp

BACKUP_BRANCH="replit-rescue/$STAMP"
CONFLICT_BRANCH="replit-rescue/$STAMP-conflict-state"
ASIDE_DIR="$REPO_ROOT/.replit-rescue-$STAMP"

step "snapshotting the conflicted tree"

# Aborting restores the *pre*-merge state, so any conflict resolution already
# made — edited or staged after the merge stopped — is discarded with it, and
# the later backup (taken after the abort) never sees it. Snapshot the tree as
# it stands now, before the abort, so half-finished resolution work survives.
#
# A conflicted index holds unmerged entries and `git write-tree` refuses to run
# against it, so build the snapshot in a throwaway index seeded from HEAD. That
# also means the index starts clean, so :(exclude) pathspecs are enough to keep
# credential paths at their committed content rather than the working-tree one.
SNAPSHOT_MADE=0
if [ -n "$IN_PROGRESS" ] && [ "$DRY_RUN" != "1" ]; then
  if ! git config user.email >/dev/null 2>&1; then
    export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Replit Rescue}"
    export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-replit-rescue@localhost}"
    export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-Replit Rescue}"
    export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-replit-rescue@localhost}"
  fi
  TMP_INDEX="$GIT_DIR/replit-rescue-index.$$"
  rm -f "$TMP_INDEX"
  GIT_INDEX_FILE="$TMP_INDEX" git read-tree HEAD
  GIT_INDEX_FILE="$TMP_INDEX" git add -u 2>/dev/null || true
  # Stage everything, then put credential paths back to their committed content.
  # A `:(exclude).env` pathspec matches only a root-level .env and would let
  # config/.env through, so the single is_sensitive classifier decides here too —
  # one definition of "credential-shaped", applied identically everywhere.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    GIT_INDEX_FILE="$TMP_INDEX" git reset -q HEAD -- "$f" 2>/dev/null || true
  done <<< "$SENSITIVE_TRACKED"
  SNAP_TREE=$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)
  rm -f "$TMP_INDEX"
  if [ "$SNAP_TREE" != "$(git rev-parse "HEAD^{tree}")" ]; then
    SNAP_COMMIT=$(git commit-tree "$SNAP_TREE" -p HEAD \
      -m "Conflicted Replit tree as found ($STAMP)" \
      -m "Snapshot taken by scripts/fix-replit-git.sh before aborting the $IN_PROGRESS, so any conflict resolution already made is not lost. May contain conflict markers for files that were still unresolved.")
    git update-ref "refs/heads/$CONFLICT_BRANCH" "$SNAP_COMMIT"
    SNAPSHOT_MADE=1
    say "saved the conflicted tree to $CONFLICT_BRANCH ($(git rev-parse --short "$SNAP_COMMIT"))"
  else
    say "conflicted tree matches HEAD; no resolution work to snapshot"
  fi
elif [ -n "$IN_PROGRESS" ]; then
  say "would snapshot the conflicted tree to $CONFLICT_BRANCH before aborting"
else
  say "no interrupted operation, so nothing to snapshot"
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

# A previous run may have created rescue branches and then failed to push them —
# the fail-closed path exits before resetting, and the operator re-runs once access
# is restored. By then the abort has happened, so that run sees nothing to back up
# and would reset while the earlier snapshot still exists only in this container,
# losing exactly the resolution it was created to protect. Collect any local rescue
# branch the remote does not have, so the retry makes it durable too.
ORPHANED=""
SENSITIVE_ORPHANED_HISTORY=""
REMOTE_RESCUE=$(git ls-remote --heads origin 'refs/heads/replit-rescue/*' 2>/dev/null |
  awk '{print $2}' | sed 's#^refs/heads/##' || true)
while IFS= read -r b; do
  [ -n "$b" ] || continue
  case $'\n'"$REMOTE_RESCUE"$'\n' in
    *$'\n'"$b"$'\n'*) continue ;;
  esac
  # Never trust a rescue-looking local ref merely because its name matches.
  # It may be stale, manually created, or left by an older unsafe script. Scan
  # every commit that ref would add to the target before putting it on GitHub.
  while IFS= read -r commit; do
    while IFS= read -r -d '' f; do
      if is_sensitive "$f"; then
        SENSITIVE_ORPHANED_HISTORY="${SENSITIVE_ORPHANED_HISTORY}${b}: ${f}"$'\n'
      fi
    done < <(git diff-tree --root -m --no-commit-id --name-only -r -z "$commit")
  done < <(git rev-list "$TARGET_REF".."$b")
  ORPHANED="${ORPHANED}${b}"$'\n'
done < <(git branch --list 'replit-rescue/*' --format='%(refname:short)')

if [ -n "$SENSITIVE_ORPHANED_HISTORY" ]; then
  say "ERROR: an unpushed rescue branch touches credential-shaped paths:"
  printf '%s' "$SENSITIVE_ORPHANED_HISTORY" | sort -u | sed 's/^/    /'
  say "No rescue branch was pushed and the checkout was not reset."
  say "Remove the credential material from that branch history, then run this script again."
  exit 1
fi

if [ -n "$ORPHANED" ]; then
  say "rescue branches from an earlier run that never reached GitHub:"
  printf '%s' "$ORPHANED" | sed 's/^/    /'
fi

if [ "$LOCAL_ONLY" = "0" ] && [ -z "$TRACKED_DIRTY" ] && [ "$SNAPSHOT_MADE" = "0" ] && [ -z "$ORPHANED" ]; then
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
      # The path can be dirty because it was *deleted*; there is then nothing to
      # copy, and an unguarded cp would fail and take the whole run down with it.
      if [ -e "$f" ]; then
        run mkdir -p "$ASIDE_DIR/$(dirname "$f")"
        run cp -- "$f" "$ASIDE_DIR/$f"
      else
        say "    ($f was deleted locally — no content to copy aside)"
      fi
    done <<< "$SENSITIVE_DIRTY"
  fi

  say "rescue branch: $BACKUP_BRANCH (at current HEAD, so all $LOCAL_ONLY local commit(s) come along)"
  run git branch "$BACKUP_BRANCH" "$TIP"

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
      # Start from HEAD so a sensitive file staged before this script cannot
      # remain in the index and leak through write-tree. Then stage only the
      # paths already classified as safe above.
      git reset -q HEAD --
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        git add -u -- "$f"
      done <<< "$SAFE_DIRTY"
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
  PUSH_REFS=""
  if [ -n "$BACKUP_BRANCH" ]; then
    PUSH_REFS="$BACKUP_BRANCH"
  fi
  if [ "$SNAPSHOT_MADE" = "1" ]; then
    PUSH_REFS="$PUSH_REFS $CONFLICT_BRANCH"
  fi
  while IFS= read -r b; do
    [ -n "$b" ] || continue
    case " $PUSH_REFS " in *" $b "*) continue ;; esac
    PUSH_REFS="$PUSH_REFS $b"
  done <<< "$ORPHANED"
  PUSH_REFS="${PUSH_REFS# }"
  if [ "$DRY_RUN" = "1" ]; then
    say "would run: git push -u origin $PUSH_REFS"
  elif git push -u origin $PUSH_REFS; then
    say "pushed: $PUSH_REFS now on GitHub and safe even if this container is wiped"
  else
    say "ERROR: push failed, so the remote backup is not durable."
    say "The local rescue branch(es) remain at: $PUSH_REFS"
    say "The checkout was not reset. Restore GitHub write access and run again."
    exit 1
  fi
fi

step "resetting the checkout to $TARGET_REF"

# `git reset --hard` leaves untracked files alone, but `git checkout -f` does not:
# an untracked path that obstructs a path the target tracks is overwritten or
# removed. That happens exactly when the remote has started tracking a file the
# container still has as a local-only scratch file, so copy those aside first —
# they were deliberately excluded from the rescue commit and exist nowhere else.
# Walk the target's paths rather than the working tree's: the target tree is
# bounded by the repo, while listing every untracked path would have to descend
# node_modules. Three ways a target path can be obstructed locally, all of which
# `checkout -f` resolves by destroying the local side:
#   1. the path exists as an untracked file       (ignored ones included)
#   2. the path exists as a directory, because the target turned it into a file
#   3. an ancestor of the path exists as a file, where the target needs a directory
declare -A IS_TRACKED=()
while IFS= read -r -d '' f; do
  IS_TRACKED["$f"]=1
done < <(git ls-files -z)

COLLIDING=""
add_collision() {
  case $'\n'"$COLLIDING" in
    *$'\n'"$1"$'\n'*) return 0 ;;   # already recorded
  esac
  COLLIDING="${COLLIDING}${1}"$'\n'
}

while IFS= read -r -d '' p; do
  # -e follows the link, so a *dangling* symlink reads as absent while still
  # obstructing the checkout; -L catches it. Same for an obstructing ancestor.
  if [ -d "$p" ] && [ ! -L "$p" ]; then
    add_collision "$p"
  elif { [ -e "$p" ] || [ -L "$p" ]; } && [ -z "${IS_TRACKED[$p]:-}" ]; then
    add_collision "$p"
  fi
  d=$(dirname "$p")
  while [ "$d" != "." ] && [ "$d" != "/" ]; do
    if { [ -e "$d" ] || [ -L "$d" ]; } && [ ! -d "$d" ] && [ -z "${IS_TRACKED[$d]:-}" ]; then
      add_collision "$d"
    fi
    d=$(dirname "$d")
  done
done < <(git ls-tree -r --name-only -z "$TARGET_REF")

if [ -n "$COLLIDING" ]; then
  say "these local paths obstruct paths $TARGET_REF tracks:"
  printf '%s' "$COLLIDING" | sed 's/^/    /'
  say "the forced checkout would destroy them, so copying them to:"
  say "    $ASIDE_DIR"
  while IFS= read -r u; do
    [ -n "$u" ] || continue
    run mkdir -p "$ASIDE_DIR/$(dirname "$u")"
    run cp -a -- "$u" "$ASIDE_DIR/$u"
  done <<< "$COLLIDING"
fi

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
if [ "$SNAPSHOT_MADE" = "1" ]; then
  say "the conflicted tree as found is on:  $CONFLICT_BRANCH"
fi
if [ -n "$SENSITIVE_DIRTY" ] || [ -n "$COLLIDING" ]; then
  say "files copied aside on disk:          $ASIDE_DIR"
fi
say "Replit's Git pane should now show a clean tree. If it still looks stuck,"
say "close and reopen the Git tab to force it to re-read the checkout."
