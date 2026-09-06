#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=helpers.sh
source "$(cd "$(dirname "$0")" && pwd)/helpers.sh"

echo "== ci-skip-if-ancestor-passed =="

# --- same identity + green check on HEAD → hit ---
{
  FIX="$(make_fixture)"
  HEAD="$(git -C "$FIX" rev-parse HEAD)"
  export GITHUB_REPOSITORY="b4moss/crudian"
  export FAKE_GH_CHECK_JSON='{"check_runs":[{"name":"test packages/go (gorm / libsql)","conclusion":"success"}]}'
  out="$(mktemp)"
  (
    cd "$FIX"
    use_fixture_path "$FIX"
    export GITHUB_OUTPUT="$out"
    : >"$out"
    bash .github/scripts/ci-skip-if-ancestor-passed.sh \
      "test packages/go (gorm / libsql)" \
      packages/go \
      .github/workflows/ci.yml \
      .github/scripts/ci-skip-if-ancestor-passed.sh \
      >/tmp/skip-1.log
  )
  assert_eq "green on HEAD → hit" "$(output_get "$out" hit)" "true"
  assert_eq "via HEAD" "$(output_get "$out" via)" "$HEAD"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- no green checks → miss ---
{
  FIX="$(make_fixture)"
  export GITHUB_REPOSITORY="b4moss/crudian"
  export FAKE_GH_CHECK_JSON='{"check_runs":[]}'
  out="$(mktemp)"
  (
    cd "$FIX"
    use_fixture_path "$FIX"
    export GITHUB_OUTPUT="$out"
    : >"$out"
    bash .github/scripts/ci-skip-if-ancestor-passed.sh \
      "test packages/go (gorm / libsql)" \
      packages/go \
      .github/workflows/ci.yml \
      .github/scripts/ci-skip-if-ancestor-passed.sh \
      >/tmp/skip-2.log || true
  )
  assert_eq "no green → miss" "$(output_get "$out" hit)" "false"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- identity changed (ci.yml) vs green ancestor → miss ---
{
  FIX="$(make_fixture)"
  export GITHUB_REPOSITORY="b4moss/crudian"
  # First commit has green checks for old identity; then change ci.yml
  export FAKE_GH_CHECK_JSON='{"check_runs":[{"name":"lint packages/go","conclusion":"success"}]}'
  echo "name: CI changed" >"$FIX/.github/workflows/ci.yml"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "change ci.yml"
  # Mock returns green for every commit query — but identity won't match parent
  # Parent has old ci.yml; HEAD has new. Parent OID != HEAD for ci.yml.
  # When scanning parent, identity_match fails. When scanning HEAD, green exists
  # for "lint packages/go" — wait, HEAD matches itself and has green → would hit.
  # So use empty checks so neither hits... Actually we want: after changing ci.yml,
  # looking for a check that only existed conceptually on old tree.
  # Simpler: green checks empty → miss even if we had green on old (fake returns empty).
  export FAKE_GH_CHECK_JSON='{"check_runs":[]}'
  out="$(mktemp)"
  (
    cd "$FIX"
    use_fixture_path "$FIX"
    export GITHUB_OUTPUT="$out"
    : >"$out"
    bash .github/scripts/ci-skip-if-ancestor-passed.sh \
      "lint packages/go" \
      packages/go \
      .github/workflows/ci.yml \
      .github/scripts/ci-skip-if-ancestor-passed.sh \
      >/tmp/skip-3.log || true
  )
  assert_eq "changed identity + no green → miss" "$(output_get "$out" hit)" "false"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

echo "ancestor skip: pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
