#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
RECOVERY_SCRIPT="$SCRIPT_DIR/fix-replit-git.sh"
TEST_ROOT=$(mktemp -d)
trap 'test -n "${TEST_ROOT:-}" && rm -rf -- "$TEST_ROOT"' EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

init_case() {
  local case_root="$1"
  mkdir -p "$case_root"
  git init --bare "$case_root/origin.git" >/dev/null
  git clone "$case_root/origin.git" "$case_root/work" >/dev/null 2>&1
  (
    cd "$case_root/work"
    git config user.name "Replit recovery test"
    git config user.email "replit-recovery-test@example.invalid"
    git switch -c main >/dev/null 2>&1
    printf 'baseline\n' > safe.txt
    printf 'baseline\n' > .env
    git add safe.txt .env
    git commit -m baseline >/dev/null
    git push -u origin main >/dev/null 2>&1
  )
  git --git-dir="$case_root/origin.git" symbolic-ref HEAD refs/heads/main
}

rescue_branch() {
  git -C "$1" branch --list 'replit-rescue/*' --format='%(refname:short)' | head -n1
}

test_staged_sensitive_edit_is_not_pushed() {
  local case_root="$TEST_ROOT/staged-sensitive"
  init_case "$case_root"
  (
    cd "$case_root/work"
    printf 'dummy-sensitive-canary\n' > .env
    printf 'safe edit\n' > safe.txt
    git add .env
    bash "$RECOVERY_SCRIPT" >/dev/null
  )

  local branch
  branch=$(rescue_branch "$case_root/work")
  test -n "$branch" || fail "rescue branch was not created"
  (cd "$case_root/work" && MSYS_NO_PATHCONV=1 git show "$branch:.env") |
    grep -q '^baseline$' || fail "rescue branch changed the sensitive file"
  (cd "$case_root/work" && MSYS_NO_PATHCONV=1 git show "$branch:safe.txt") |
    grep -q '^safe edit$' || fail "safe tracked edit was not preserved"
  grep -R -q 'dummy-sensitive-canary' "$case_root/work"/.replit-rescue-* ||
    fail "sensitive edit was not copied aside"
  printf 'PASS: pre-staged sensitive edit excluded from rescue commit\n'
}

test_sensitive_local_commit_blocks_push_and_reset() {
  local case_root="$TEST_ROOT/sensitive-local-commit"
  init_case "$case_root"
  local local_sha
  (
    cd "$case_root/work"
    printf '{"dummy":"sensitive-canary"}\n' > service-account-test.json
    git add service-account-test.json
    git commit -m 'local sensitive commit' >/dev/null
  )
  local_sha=$(git -C "$case_root/work" rev-parse HEAD)

  if (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1); then
    fail "sensitive local history was accepted"
  fi
  test "$(git -C "$case_root/work" rev-parse HEAD)" = "$local_sha" ||
    fail "checkout moved after sensitive-history rejection"
  test -z "$(git -C "$case_root/work" ls-remote --heads origin 'refs/heads/replit-rescue/*')" ||
    fail "sensitive local history reached the remote"
  printf 'PASS: sensitive local commit blocked before push and reset\n'
}

test_failed_push_blocks_reset() {
  local case_root="$TEST_ROOT/failed-push"
  init_case "$case_root"
  local local_sha
  (
    cd "$case_root/work"
    printf 'local commit\n' > safe.txt
    git add safe.txt
    git commit -m 'local safe commit' >/dev/null
  )
  local_sha=$(git -C "$case_root/work" rev-parse HEAD)
  printf '%s\n' '#!/bin/sh' 'while read old new ref; do' \
    '  case "$ref" in refs/heads/replit-rescue/*) exit 1;; esac' 'done' 'exit 0' \
    > "$case_root/origin.git/hooks/pre-receive"
  chmod +x "$case_root/origin.git/hooks/pre-receive"

  if (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1); then
    fail "recovery continued after remote backup rejection"
  fi
  test "$(git -C "$case_root/work" rev-parse HEAD)" = "$local_sha" ||
    fail "checkout reset after remote backup rejection"
  test -z "$(git -C "$case_root/work" ls-remote --heads origin 'refs/heads/replit-rescue/*')" ||
    fail "rejected rescue branch exists remotely"
  printf 'PASS: failed remote backup prevented checkout reset\n'
}

test_env_template_is_not_treated_as_sensitive() {
  local case_root="$TEST_ROOT/env-template"
  init_case "$case_root"
  (
    cd "$case_root/work"
    printf 'STRIPE_SECRET_KEY=\n' > .env.example
    git add .env.example
    git commit -m 'document required env vars' >/dev/null
  )

  # `.env.example` matches the `.env.*` credential rule by shape but holds no
  # values. Classifying it as sensitive aborts the rescue and leaves the stuck
  # checkout stuck, so the template must stay on the safe side of the classifier.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "committed .env.example template aborted the rescue"

  local branch
  branch=$(rescue_branch "$case_root/work")
  test -n "$branch" || fail "rescue branch was not created for a template-only commit"
  (cd "$case_root/work" && MSYS_NO_PATHCONV=1 git show "$branch:.env.example") |
    grep -q 'STRIPE_SECRET_KEY=' || fail "template was not preserved on the rescue branch"
  test "$(git -C "$case_root/work" rev-parse HEAD)" = \
    "$(git -C "$case_root/work" rev-parse origin/main)" ||
    fail "checkout was not reset after a template-only commit"
  printf 'PASS: .env.example template rescued instead of blocking recovery\n'
}

advance_remote() {
  # Move origin/main on by rewriting safe.txt, so the next local pull conflicts.
  local case_root="$1" content="$2"
  git clone "$case_root/origin.git" "$case_root/seed" >/dev/null 2>&1
  (
    cd "$case_root/seed"
    git config user.name "Replit recovery test"
    git config user.email "replit-recovery-test@example.invalid"
    printf '%s\n' "$content" > safe.txt
    git commit -am remote >/dev/null
    git push origin main >/dev/null 2>&1
  )
}

remote_rescue_refs() {
  git -C "$1" ls-remote --heads origin 'refs/heads/replit-rescue/*'
}

test_rebase_scans_restored_tip_not_transient_head() {
  local case_root="$TEST_ROOT/rebase-tip"
  init_case "$case_root"
  (
    cd "$case_root/work"
    printf 'first\n' > extra.txt
    git add extra.txt
    git commit -m c1-safe >/dev/null
    printf 'local\n' > safe.txt
    git commit -am c2-conflicting >/dev/null
    printf '{"private_key":"rebase-tip-canary"}\n' > service-account-prod.json
    git add service-account-prod.json
    git commit -m c3-credential >/dev/null
  )
  advance_remote "$case_root" remote
  (cd "$case_root/work" && git fetch origin >/dev/null 2>&1 && git rebase origin/main >/dev/null 2>&1) || true

  # Mid-rebase HEAD holds only the replayed commits; the credential commit comes
  # back when the rebase aborts. Scanning HEAD would clear the gate and publish it.
  if (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1); then
    fail "credential commit behind a conflicted rebase was accepted"
  fi
  test -z "$(remote_rescue_refs "$case_root/work")" ||
    fail "rescue branch reached the remote despite credential history"
  local origin_objects
  origin_objects=$(git -C "$case_root/origin.git" rev-list --all --objects 2>/dev/null |
    awk '{print $2}' | grep -c 'service-account-prod.json' || true)
  test "$origin_objects" = "0" || fail "credential path reached the origin repository"
  printf 'PASS: conflicted rebase scans the restored tip, not the transient HEAD\n'
}

test_untracked_collision_is_copied_before_forced_checkout() {
  local case_root="$TEST_ROOT/untracked-collision"
  init_case "$case_root"
  printf 'untracked-collision-canary\n' > "$case_root/work/scratch.txt"
  git clone "$case_root/origin.git" "$case_root/seed" >/dev/null 2>&1
  (
    cd "$case_root/seed"
    git config user.name "Replit recovery test"
    git config user.email "replit-recovery-test@example.invalid"
    printf 'remote version\n' > scratch.txt
    git add scratch.txt
    git commit -m 'remote starts tracking scratch' >/dev/null
    git push origin main >/dev/null 2>&1
  )

  # checkout -f overwrites an untracked path the target tracks, and that content
  # was deliberately never staged, so it has to be copied aside beforehand.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed on an untracked/tracked path collision"
  grep -R -q 'untracked-collision-canary' "$case_root/work"/.replit-rescue-* ||
    fail "colliding untracked file was destroyed instead of copied aside"
  printf 'PASS: untracked collision copied aside before forced checkout\n'
}

test_conflict_resolution_survives_the_abort() {
  local case_root="$TEST_ROOT/resolution"
  init_case "$case_root"
  (
    cd "$case_root/work"
    printf 'local\n' > safe.txt
    git commit -am local-change >/dev/null
  )
  advance_remote "$case_root" remote
  (cd "$case_root/work" && git fetch origin >/dev/null 2>&1 && git merge origin/main >/dev/null 2>&1) || true
  (
    cd "$case_root/work"
    printf 'resolution-canary\n' > safe.txt
    git add safe.txt
  )

  # `git merge --abort` restores the pre-merge tree, so a resolution made after
  # the merge stopped is gone before the ordinary backup step ever looks.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed on a partially resolved conflict"
  local snapshot
  snapshot=$(git -C "$case_root/work" branch --list 'replit-rescue/*-conflict-state' \
    --format='%(refname:short)' | head -n1)
  test -n "$snapshot" || fail "no conflict-state snapshot branch was created"
  (cd "$case_root/work" && MSYS_NO_PATHCONV=1 git show "$snapshot:safe.txt") |
    grep -q 'resolution-canary' || fail "conflict resolution was not snapshotted"
  remote_rescue_refs "$case_root/work" | grep -q -- '-conflict-state' ||
    fail "conflict-state snapshot was not pushed to the remote"
  printf 'PASS: conflict resolution snapshotted before the abort\n'
}

remote_clone() {
  # A second clone used to move origin/main in ways advance_remote doesn't cover.
  local case_root="$1" name="$2"
  git clone "$case_root/origin.git" "$case_root/$name" >/dev/null 2>&1
  git -C "$case_root/$name" config user.name "Replit recovery test"
  git -C "$case_root/$name" config user.email "replit-recovery-test@example.invalid"
}

test_ignored_file_obstruction_is_copied_aside() {
  local case_root="$TEST_ROOT/ignored-obstruction"
  init_case "$case_root"
  (
    cd "$case_root/work"
    printf 'ignored.txt\n' > .gitignore
    git add .gitignore
    git commit -m 'ignore a scratch file' >/dev/null
    git push origin main >/dev/null 2>&1
    printf 'ignored-obstruction-canary\n' > ignored.txt
  )
  remote_clone "$case_root" seed2
  (
    cd "$case_root/seed2"
    printf 'remote version\n' > ignored.txt
    git add -f ignored.txt
    git commit -m 'remote starts tracking the ignored path' >/dev/null
    git push origin main >/dev/null 2>&1
  )

  # `--exclude-standard` hides ignored files, so an ignored path the target has
  # begun tracking looked like no obstruction at all and was overwritten.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed on an ignored-file obstruction"
  grep -R -q 'ignored-obstruction-canary' "$case_root/work"/.replit-rescue-* ||
    fail "ignored file was destroyed instead of copied aside"
  printf 'PASS: ignored file obstructing a tracked path is copied aside\n'
}

test_directory_swap_preserves_nested_untracked() {
  local case_root="$TEST_ROOT/dir-swap"
  init_case "$case_root"
  mkdir -p "$case_root/work/scratch"
  printf 'nested-obstruction-canary\n' > "$case_root/work/scratch/note"
  remote_clone "$case_root" seed2
  (
    cd "$case_root/seed2"
    printf 'now a file\n' > scratch
    git add scratch
    git commit -m 'scratch becomes a file' >/dev/null
    git push origin main >/dev/null 2>&1
  )

  # Checking only `$TARGET_REF:$path` missed this: nothing obstructs `scratch`
  # by name, but the checkout must delete the whole local directory to place a
  # file there, taking the nested untracked note with it.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed on a directory-to-file swap"
  grep -R -q 'nested-obstruction-canary' "$case_root/work"/.replit-rescue-* ||
    fail "nested untracked file was destroyed instead of copied aside"
  printf 'PASS: directory replaced by a file preserves nested untracked content\n'
}

test_deleted_sensitive_file_does_not_abort() {
  local case_root="$TEST_ROOT/deleted-sensitive"
  init_case "$case_root"
  advance_remote "$case_root" remote
  (cd "$case_root/work" && git fetch origin >/dev/null 2>&1 && git merge origin/main >/dev/null 2>&1) || true
  rm -f "$case_root/work/.env"

  # A deleted tracked credential path is still "dirty" and still classifies as
  # sensitive, but there is no content to copy — an unguarded cp took the run down.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "a locally deleted credential file aborted the recovery"
  test "$(git -C "$case_root/work" rev-parse HEAD)" = \
    "$(git -C "$case_root/work" rev-parse origin/main)" ||
    fail "checkout was not reset after a deleted credential file"
  printf 'PASS: locally deleted credential file does not abort recovery\n'
}

test_nested_credential_excluded_from_snapshot() {
  local case_root="$TEST_ROOT/nested-credential"
  init_case "$case_root"
  (
    cd "$case_root/work"
    mkdir -p config
    printf 'OLD=placeholder\n' > config/.env
    git add -f config/.env
    git commit -m 'track a nested env file' >/dev/null
    git push origin main >/dev/null 2>&1
    printf 'local\n' > safe.txt
    git commit -am local-change >/dev/null
  )
  advance_remote "$case_root" remote
  (cd "$case_root/work" && git fetch origin >/dev/null 2>&1 && git merge origin/main >/dev/null 2>&1) || true
  printf 'SECRET=nested-snapshot-canary\n' > "$case_root/work/config/.env"

  # `:(exclude).env` matches only a root-level .env, so config/.env was staged
  # into the snapshot and pushed. is_sensitive is the single classifier now.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed with a nested credential file"
  local hits
  # `git grep` exits 1 when it matches nothing, which under `set -o pipefail`
  # would abort this script on the success case. Swallow it before counting.
  hits=$( { git -C "$case_root/origin.git" rev-list --all 2>/dev/null |
    xargs -r git -C "$case_root/origin.git" grep -I -l 'nested-snapshot-canary' 2>/dev/null ||
    true; } | wc -l | tr -d ' ')
  test "$hits" = "0" || fail "nested credential reached the origin repository"
  printf 'PASS: nested credential kept out of the conflict snapshot\n'
}

test_dry_run_does_not_prune_refs() {
  local case_root="$TEST_ROOT/dry-run-prune"
  init_case "$case_root"
  (
    cd "$case_root/work"
    git push origin main:refs/heads/doomed >/dev/null 2>&1
    git fetch origin >/dev/null 2>&1
  )
  # Delete the branch inside the bare repo rather than via `push --delete`, which
  # would also drop the local remote-tracking ref and leave nothing to prune.
  git -C "$case_root/origin.git" update-ref -d refs/heads/doomed
  test -n "$(git -C "$case_root/work" rev-parse --verify -q origin/doomed || true)" ||
    fail "test setup did not leave a stale remote-tracking ref"

  # --dry-run promises to change nothing; `fetch --prune` deleted refs anyway.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" --dry-run >/dev/null 2>&1) ||
    fail "dry run exited non-zero"
  test -n "$(git -C "$case_root/work" rev-parse --verify -q origin/doomed || true)" ||
    fail "dry run pruned a remote-tracking ref"
  printf 'PASS: dry run leaves remote-tracking refs alone\n'
}

test_rebase_restores_original_branch_not_main() {
  local case_root="$TEST_ROOT/rebase-branch"
  init_case "$case_root"
  local main_sha
  (
    cd "$case_root/work"
    printf 'precious\n' > main-only.txt
    git add main-only.txt
    git commit -m 'unpushed work on main' >/dev/null
    git switch -c feature >/dev/null 2>&1
    printf 'feature\n' > safe.txt
    git commit -am feature-change >/dev/null
  )
  main_sha=$(git -C "$case_root/work" rev-parse main)
  advance_remote "$case_root" remote
  (cd "$case_root/work" && git fetch origin >/dev/null 2>&1 && git rebase origin/main >/dev/null 2>&1) || true

  # Mid-rebase HEAD is detached, so a symbolic-ref capture is empty and the reset
  # treated it as a detached checkout — landing on `main` and force-resetting it
  # while the operator was on `feature`.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed during a conflicted rebase"
  test "$(git -C "$case_root/work" symbolic-ref --quiet --short HEAD)" = "feature" ||
    fail "recovery left the checkout on the wrong branch after a rebase"
  test "$(git -C "$case_root/work" rev-parse main)" = "$main_sha" ||
    fail "main was force-reset during a rebase on another branch"
  printf 'PASS: conflicted rebase returns to its own branch, main untouched\n'
}

test_dangling_symlink_is_copied_aside() {
  local case_root="$TEST_ROOT/dangling-symlink"
  init_case "$case_root"
  ln -s /nonexistent/target "$case_root/work/dangling.txt"
  remote_clone "$case_root" seed2
  (
    cd "$case_root/seed2"
    printf 'remote content\n' > dangling.txt
    git add dangling.txt
    git commit -m 'remote tracks that path' >/dev/null
    git push origin main >/dev/null 2>&1
  )

  # -e follows the link, so a dangling symlink reads as absent while still being
  # destroyed by the forced checkout.
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed on a dangling symlink obstruction"
  local aside
  aside=$(find "$case_root/work" -maxdepth 2 -path '*/.replit-rescue-*/dangling.txt' | head -n1)
  test -n "$aside" || fail "dangling symlink was destroyed instead of copied aside"
  printf 'PASS: dangling symlink obstruction copied aside\n'
}

test_retry_pushes_orphaned_rescue_branches() {
  local case_root="$TEST_ROOT/retry-orphan"
  init_case "$case_root"
  (
    cd "$case_root/work"
    printf 'local\n' > safe.txt
    git commit -am local-change >/dev/null
  )
  advance_remote "$case_root" remote
  (cd "$case_root/work" && git fetch origin >/dev/null 2>&1 && git merge origin/main >/dev/null 2>&1) || true
  (
    cd "$case_root/work"
    printf 'retry-orphan-canary\n' > safe.txt
    git add safe.txt
  )
  printf '%s\n' '#!/bin/sh' 'exit 1' > "$case_root/origin.git/hooks/pre-receive"
  chmod +x "$case_root/origin.git/hooks/pre-receive"

  # First run fails closed: snapshot exists only locally.
  if (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1); then
    fail "recovery continued despite a rejected push"
  fi
  test -n "$(git -C "$case_root/work" branch --list 'replit-rescue/*-conflict-state')" ||
    fail "no local snapshot survived the rejected push"

  # The instructed retry must make that earlier snapshot durable, not just push a
  # fresh rescue branch and reset. A prompt retry also lands in the same second,
  # so the branch name must not collide with the one the first run created.
  rm -f "$case_root/origin.git/hooks/pre-receive"
  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "retry after restored access did not complete"
  remote_rescue_refs "$case_root/work" | grep -q -- '-conflict-state' ||
    fail "retry left the earlier conflict snapshot stranded in the container"
  printf 'PASS: retry makes an earlier stranded rescue branch durable\n'
}

test_unsafe_orphan_is_not_published() {
  local case_root="$TEST_ROOT/unsafe-orphan"
  init_case "$case_root"
  (
    cd "$case_root/work"
    # A rescue branch this run did not create: stale, hand-made, or from a
    # checkout whose history was never gated. The name prefix says nothing.
    git switch -c replit-rescue/unsafe >/dev/null 2>&1
    printf 'KEY=unsafe-orphan-canary\n' > .env
    git add -f .env
    git commit -m 'stale rescue branch carrying a credential' >/dev/null
    git switch -c replit-rescue/safe-work >/dev/null 2>&1
    git reset --hard main >/dev/null 2>&1
    printf 'real work\n' > notes.txt
    git add notes.txt
    git commit -m 'legitimately rescued work' >/dev/null
    git switch main >/dev/null 2>&1
    printf 'local\n' > safe.txt
    git commit -am local-change >/dev/null
  )
  advance_remote "$case_root" remote
  (cd "$case_root/work" && git fetch origin >/dev/null 2>&1 && git merge origin/main >/dev/null 2>&1) || true

  (cd "$case_root/work" && bash "$RECOVERY_SCRIPT" >/dev/null 2>&1) ||
    fail "recovery failed while an unsafe orphan was present"

  # The credential must not reach the remote, in any object.
  local hits
  hits=$( { git -C "$case_root/origin.git" rev-list --all 2>/dev/null |
    xargs -r git -C "$case_root/origin.git" grep -I -l 'unsafe-orphan-canary' 2>/dev/null ||
    true; } | wc -l | tr -d ' ')
  test "$hits" = "0" || fail "unsafe orphaned rescue branch was published"
  test -z "$(git -C "$case_root/work" ls-remote --heads origin \
    'refs/heads/replit-rescue/unsafe')" || fail "unsafe orphan ref reached the remote"
  # ...and it must still exist locally: skipping is not deleting.
  test -n "$(git -C "$case_root/work" branch --list 'replit-rescue/unsafe')" ||
    fail "unsafe orphan was destroyed instead of left alone"
  # A clean orphan must still be made durable.
  test -n "$(git -C "$case_root/work" ls-remote --heads origin \
    'refs/heads/replit-rescue/safe-work')" ||
    fail "a clean orphaned rescue branch was not published"
  printf 'PASS: unsafe orphan withheld, clean orphan still published\n'
}

test_staged_sensitive_edit_is_not_pushed
test_unsafe_orphan_is_not_published
test_rebase_restores_original_branch_not_main
test_dangling_symlink_is_copied_aside
test_retry_pushes_orphaned_rescue_branches
test_sensitive_local_commit_blocks_push_and_reset
test_failed_push_blocks_reset
test_env_template_is_not_treated_as_sensitive
test_rebase_scans_restored_tip_not_transient_head
test_untracked_collision_is_copied_before_forced_checkout
test_conflict_resolution_survives_the_abort
test_ignored_file_obstruction_is_copied_aside
test_directory_swap_preserves_nested_untracked
test_deleted_sensitive_file_does_not_abort
test_nested_credential_excluded_from_snapshot
test_dry_run_does_not_prune_refs
printf 'All fix-replit-git safety tests passed.\n'
