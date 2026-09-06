#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=helpers.sh
source "$(cd "$(dirname "$0")" && pwd)/helpers.sh"

echo "== should-publish-go =="

# --- missing VERSION → skip ---
{
  FIX="$(make_fixture)"
  rm -f "$FIX/packages/go/VERSION"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "drop VERSION" || true
  out="$(mktemp)"
  run_decide_go "$FIX" "$out" >/tmp/go-decide-1.log || true
  assert_eq "missing VERSION → skip" "$(output_get "$out" skip)" "true"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- empty VERSION → skip ---
{
  FIX="$(make_fixture)"
  : >"$FIX/packages/go/VERSION"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "empty VERSION"
  out="$(mktemp)"
  run_decide_go "$FIX" "$out" >/tmp/go-decide-2.log || true
  assert_eq "empty VERSION → skip" "$(output_get "$out" skip)" "true"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- no packages/go/v* tag → skip ---
{
  FIX="$(make_fixture)"
  out="$(mktemp)"
  export FAKE_GH_RELEASES=""
  run_decide_go "$FIX" "$out" >/tmp/go-decide-3.log || true
  assert_eq "missing go tag → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "missing go tag message" /tmp/go-decide-3.log "No git tag packages/go/v0.7.0"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- tag + release exists → skip ---
{
  FIX="$(make_fixture)"
  git -C "$FIX" tag packages/go/v0.7.0
  out="$(mktemp)"
  export FAKE_GH_RELEASES="packages/go/v0.7.0"
  run_decide_go "$FIX" "$out" >/tmp/go-decide-4.log || true
  assert_eq "release exists → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "release exists message" /tmp/go-decide-4.log "already exists"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- tag + no release → publish ---
{
  FIX="$(make_fixture)"
  git -C "$FIX" tag packages/go/v0.7.0
  out="$(mktemp)"
  export FAKE_GH_RELEASES=""
  run_decide_go "$FIX" "$out" >/tmp/go-decide-5.log
  assert_eq "tag without release → publish" "$(output_get "$out" skip)" "false"
  assert_eq "go tag emitted" "$(output_get "$out" tag)" "packages/go/v0.7.0"
  assert_eq "go version emitted" "$(output_get "$out" version)" "0.7.0"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

echo "go decide: pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
