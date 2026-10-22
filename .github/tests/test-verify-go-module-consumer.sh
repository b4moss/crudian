#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=helpers.sh
source "$(cd "$(dirname "$0")" && pwd)/helpers.sh"

echo "== verify-go-module-consumer =="

VERIFY="$SCRIPTS_DIR/verify-go-module-consumer.sh"

# --- mismatched module path → fail ---
{
  FIX="$(make_fixture)"
  echo 'module github.com/b4moss/crudian/go' >"$FIX/packages/go/go.mod"
  set +e
  ROOT="$FIX" bash "$VERIFY" >/tmp/verify-go-1.log 2>&1
  status=$?
  set -e
  assert_eq "mismatched path exits non-zero" "$status" "1"
  assert_file_has "mismatch message" /tmp/verify-go-1.log "module path mismatch"
  cleanup_fixture "$FIX"
}

# --- matching path in bare fixture → path OK, then build fails (no packages) ---
{
  FIX="$(make_fixture)"
  echo 'module github.com/b4moss/crudian/packages/go' >"$FIX/packages/go/go.mod"
  set +e
  ROOT="$FIX" bash "$VERIFY" >/tmp/verify-go-2.log 2>&1
  status=$?
  set -e
  assert_file_has "matching path logged" /tmp/verify-go-2.log "module path OK: github.com/b4moss/crudian/packages/go"
  if [[ "$status" -eq 0 ]]; then
    echo "  FAIL bare fixture should not build without package sources"
    FAIL=$((FAIL + 1))
  else
    echo "  OK  bare fixture fails after path check (expected)"
    PASS=$((PASS + 1))
  fi
  cleanup_fixture "$FIX"
}

# --- real packages/go tree with local replace → pass ---
{
  set +e
  ROOT="$REPO_ROOT" bash "$VERIFY" >/tmp/verify-go-3.log 2>&1
  status=$?
  set -e
  assert_eq "real packages/go consumer build" "$status" "0"
  assert_file_has "real build OK" /tmp/verify-go-3.log "consumer import \\+ build OK"
}

echo "verify-go-module-consumer: pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
