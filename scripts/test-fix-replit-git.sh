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

test_staged_sensitive_edit_is_not_pushed
test_sensitive_local_commit_blocks_push_and_reset
test_failed_push_blocks_reset
test_env_template_is_not_treated_as_sensitive
test_rebase_scans_restored_tip_not_transient_head
test_untracked_collision_is_copied_before_forced_checkout
test_conflict_resolution_survives_the_abort
printf 'All fix-replit-git safety tests passed.\n'
