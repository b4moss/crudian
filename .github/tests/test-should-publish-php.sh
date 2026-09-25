#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=helpers.sh
source "$(cd "$(dirname "$0")" && pwd)/helpers.sh"

echo "== should-publish-php =="

# --- missing VERSION → skip ---
{
  FIX="$(make_fixture)"
  rm -f "$FIX/packages/php/VERSION"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "drop VERSION" || true
  out="$(mktemp)"
  run_decide_php "$FIX" "$out" >/tmp/php-decide-1.log || true
  assert_eq "missing VERSION → skip" "$(output_get "$out" skip)" "true"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- empty VERSION → skip ---
{
  FIX="$(make_fixture)"
  : >"$FIX/packages/php/VERSION"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "empty VERSION"
  out="$(mktemp)"
  run_decide_php "$FIX" "$out" >/tmp/php-decide-1b.log || true
  assert_eq "empty VERSION → skip" "$(output_get "$out" skip)" "true"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- no packages/php/v* tag → skip ---
{
  FIX="$(make_fixture)"
  out="$(mktemp)"
  export FAKE_GH_RELEASES=""
  run_decide_php "$FIX" "$out" >/tmp/php-decide-2.log || true
  assert_eq "missing php tag → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "missing php tag message" /tmp/php-decide-2.log "No git tag packages/php/v0.12.0"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- tag + release exists → skip ---
{
  FIX="$(make_fixture)"
  git -C "$FIX" tag packages/php/v0.12.0
  out="$(mktemp)"
  export FAKE_GH_RELEASES="packages/php/v0.12.0"
  run_decide_php "$FIX" "$out" >/tmp/php-decide-3.log || true
  assert_eq "release exists → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "release exists message" /tmp/php-decide-3.log "already exists"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- tag + no release → publish ---
{
  FIX="$(make_fixture)"
  git -C "$FIX" tag packages/php/v0.12.0
  out="$(mktemp)"
  export FAKE_GH_RELEASES=""
  run_decide_php "$FIX" "$out" >/tmp/php-decide-4.log
  assert_eq "tag without release → publish" "$(output_get "$out" skip)" "false"
  assert_eq "php tag emitted" "$(output_get "$out" tag)" "packages/php/v0.12.0"
  assert_eq "php dist_tag emitted" "$(output_get "$out" dist_tag)" "v0.12.0"
  assert_eq "php version emitted" "$(output_get "$out" version)" "0.12.0"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

echo "php decide: pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
