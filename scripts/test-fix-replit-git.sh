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

test_staged_sensitive_edit_is_not_pushed
test_sensitive_local_commit_blocks_push_and_reset
test_failed_push_blocks_reset
printf 'All fix-replit-git safety tests passed.\n'
