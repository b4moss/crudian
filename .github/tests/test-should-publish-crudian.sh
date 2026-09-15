#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=helpers.sh
source "$(cd "$(dirname "$0")" && pwd)/helpers.sh"

echo "== should-publish-crudian =="

# --- already on npm → skip (v0.7.0 failure mode) ---
{
  FIX="$(make_fixture)"
  git -C "$FIX" tag v0.6.0
  out="$(mktemp)"
  export FAKE_NPM_VERSIONS="0.6.0"
  export FAKE_NPM_LATEST="0.6.0"
  run_decide_npm "$FIX" "$out" >/tmp/npm-decide-1.log || true
  assert_eq "already published → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "already published message" /tmp/npm-decide-1.log "already has @b4moss/crudian@0.6.0"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- no tag → skip ---
{
  FIX="$(make_fixture)"
  # no v0.6.0 tag
  out="$(mktemp)"
  export FAKE_NPM_VERSIONS=""
  export FAKE_NPM_LATEST=""
  run_decide_npm "$FIX" "$out" >/tmp/npm-decide-2.log || true
  assert_eq "missing tag → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "missing tag message" /tmp/npm-decide-2.log "No git tag v0.6.0"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

# --- new version not on registry + tag + content differs → publish ---
{
  FIX="$(make_fixture)"
  # bump to 0.6.1
  node -e "
    const fs=require('fs');
    const p='$FIX/packages/js/package.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.version='0.6.1';
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
  echo "readme local changed" >"$FIX/packages/js/README.md"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "bump 0.6.1"
  git -C "$FIX" tag v0.6.1

  # published latest is 0.6.0 with different readme
  PUB="$(mktemp -d)"
  mkdir -p "$PUB/dist"
  echo '{"name":"@b4moss/crudian","version":"0.6.0","files":["dist","LICENSE","README.md"]}' >"$PUB/package.json"
  echo "published dist" >"$PUB/dist/index.js"
  echo "MIT" >"$PUB/LICENSE"
  echo "readme published" >"$PUB/README.md"
  export FAKE_NPM_PUB_DIR="$PUB"
  export FAKE_NPM_VERSIONS="0.6.0"
  export FAKE_NPM_LATEST="0.6.0"

  out="$(mktemp)"
  run_decide_npm "$FIX" "$out" >/tmp/npm-decide-3.log
  assert_eq "new version content differs → publish" "$(output_get "$out" skip)" "false"
  assert_eq "tag emitted" "$(output_get "$out" tag)" "v0.6.1"
  cleanup_fixture "$FIX"
  rm -rf "$PUB" "$out"
}

# --- new version + content equals latest (normalized) → skip ---
{
  FIX="$(make_fixture)"
  node -e "
    const fs=require('fs');
    const p='$FIX/packages/js/package.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.version='0.6.1';
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "bump 0.6.1 identical body"
  git -C "$FIX" tag v0.6.1

  # published package body matches local files (except version)
  PUB="$(mktemp -d)"
  mkdir -p "$PUB/dist"
  cp "$FIX/packages/js/package.json" "$PUB/package.json"
  node -e "const fs=require('fs');const p='$PUB/package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='0.6.0';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
  cp -R "$FIX/packages/js/dist" "$PUB/"
  cp "$FIX/packages/js/LICENSE" "$PUB/"
  cp "$FIX/packages/js/README.md" "$PUB/"
  export FAKE_NPM_PUB_DIR="$PUB"
  export FAKE_NPM_VERSIONS="0.6.0"
  export FAKE_NPM_LATEST="0.6.0"

  out="$(mktemp)"
  run_decide_npm "$FIX" "$out" >/tmp/npm-decide-4.log || true
  assert_eq "identical content new version → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "identical content message" /tmp/npm-decide-4.log "No @b4moss/crudian package content change"
  cleanup_fixture "$FIX"
  rm -rf "$PUB" "$out"
}

# --- squash merge onto release: tag not ancestor, but trees match → publish ---
{
  FIX="$(make_fixture)"
  ROOT_SHA="$(git -C "$FIX" rev-parse HEAD)"

  node -e "
    const fs=require('fs');
    const p='$FIX/packages/js/package.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.version='0.6.1';
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
  echo "readme local changed" >"$FIX/packages/js/README.md"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "bump 0.6.1 on main"
  git -C "$FIX" tag v0.6.1
  MAIN_SHA="$(git -C "$FIX" rev-parse HEAD)"

  # Simulate squash onto an older release tip: same tree, no tag ancestry.
  git -C "$FIX" checkout -q -B release "$ROOT_SHA"
  git -C "$FIX" checkout -q "$MAIN_SHA" -- .
  git -C "$FIX" commit -q -m "v0.6.1 squash onto release"
  # Keep the tag reachable (as on a real remote) without making it an ancestor.
  git -C "$FIX" update-ref "refs/tags/v0.6.1" "$MAIN_SHA"

  if git -C "$FIX" merge-base --is-ancestor "$MAIN_SHA" HEAD; then
    echo "  FAIL squash fixture unexpectedly has tag as ancestor"
    FAIL=$((FAIL + 1))
  else
    PUB="$(mktemp -d)"
    mkdir -p "$PUB/dist"
    echo '{"name":"@b4moss/crudian","version":"0.6.0","files":["dist","LICENSE","README.md"]}' >"$PUB/package.json"
    echo "published dist" >"$PUB/dist/index.js"
    echo "MIT" >"$PUB/LICENSE"
    echo "readme published" >"$PUB/README.md"
    export FAKE_NPM_PUB_DIR="$PUB"
    export FAKE_NPM_VERSIONS="0.6.0"
    export FAKE_NPM_LATEST="0.6.0"

    out="$(mktemp)"
    run_decide_npm "$FIX" "$out" >/tmp/npm-decide-5.log
    assert_eq "squash same tree → publish" "$(output_get "$out" skip)" "false"
    assert_eq "squash tag emitted" "$(output_get "$out" tag)" "v0.6.1"
    assert_file_has "squash-safe message" /tmp/npm-decide-5.log "squash-safe"
    rm -rf "$PUB" "$out"
  fi
  cleanup_fixture "$FIX"
}

# --- tag not ancestor and trees differ → skip ---
{
  FIX="$(make_fixture)"
  ROOT_SHA="$(git -C "$FIX" rev-parse HEAD)"

  node -e "
    const fs=require('fs');
    const p='$FIX/packages/js/package.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.version='0.6.1';
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "bump 0.6.1 on main"
  git -C "$FIX" tag v0.6.1
  MAIN_SHA="$(git -C "$FIX" rev-parse HEAD)"

  # Release tip also claims 0.6.1 but with a different tree (not a squash of main).
  git -C "$FIX" checkout -q -B release "$ROOT_SHA"
  node -e "
    const fs=require('fs');
    const p='$FIX/packages/js/package.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.version='0.6.1';
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
  echo "divergent release content" >"$FIX/packages/js/README.md"
  git -C "$FIX" add -A
  git -C "$FIX" commit -q -m "unrelated 0.6.1 on release"
  git -C "$FIX" update-ref "refs/tags/v0.6.1" "$MAIN_SHA"

  out="$(mktemp)"
  export FAKE_NPM_VERSIONS=""
  export FAKE_NPM_LATEST=""
  run_decide_npm "$FIX" "$out" >/tmp/npm-decide-6.log || true
  assert_eq "divergent tree → skip" "$(output_get "$out" skip)" "true"
  assert_file_has "divergent tree message" /tmp/npm-decide-6.log "trees differ"
  cleanup_fixture "$FIX"
  rm -f "$out"
}

echo "npm decide: pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
