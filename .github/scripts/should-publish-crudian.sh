#!/usr/bin/env bash
# Decide whether @b4moss/crudian should be published from the current HEAD.
# Outputs GitHub Actions-style keys to GITHUB_OUTPUT when set:
#   skip=true|false
#   tag=vX.Y.Z (when not skipped for missing tag)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PKG_DIR="$ROOT/packages/js"
OUT="${GITHUB_OUTPUT:-/dev/stdout}"

emit() {
  local key="$1"
  local value="$2"
  if [[ "${GITHUB_OUTPUT:-}" ]]; then
    echo "${key}=${value}" >>"$GITHUB_OUTPUT"
  else
    echo "${key}=${value}"
  fi
}

skip() {
  local reason="$1"
  echo "$reason"
  emit "skip" "true"
  exit 0
}

# Accept a v* tag on HEAD or on an ancestor (merge commits onto release
# usually do not carry the tag themselves).
PKG_VER="$(node -p "require('${PKG_DIR}/package.json').version")"
TAG="v${PKG_VER}"

if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  skip "No git tag ${TAG} for packages/js version ${PKG_VER}; skip npm publish."
fi

TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
HEAD_COMMIT="$(git rev-parse HEAD)"
if [[ "$TAG_COMMIT" != "$HEAD_COMMIT" ]] &&
  ! git merge-base --is-ancestor "$TAG_COMMIT" "$HEAD_COMMIT"; then
  skip "Tag ${TAG} (${TAG_COMMIT}) is not an ancestor of HEAD; skip npm publish."
fi

echo "Using tag ${TAG} at ${TAG_COMMIT} (HEAD=${HEAD_COMMIT})."
emit "tag" "$TAG"

PUBLISHED="$(npm view @b4moss/crudian version 2>/dev/null || true)"
if [[ -z "$PUBLISHED" ]]; then
  echo "@b4moss/crudian is not on npm yet; will publish ${PKG_VER}."
  emit "skip" "false"
  exit 0
fi

if [[ ! -d "$PKG_DIR/dist" ]]; then
  echo "packages/js/dist is missing; build before comparing to npm."
  exit 1
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

mkdir -p "$TMP/pub" "$TMP/local"

# Pack the currently published version from the registry.
(
  cd "$TMP"
  npm pack "@b4moss/crudian@${PUBLISHED}" --silent >/dev/null
  tar -xzf "b4moss-crudian-${PUBLISHED}.tgz" -C "$TMP/pub"
)

# Pack the local package (uses package.json "files").
LOCAL_TGZ="$(
  cd "$PKG_DIR"
  npm pack --silent --pack-destination "$TMP"
)"
tar -xzf "$TMP/$LOCAL_TGZ" -C "$TMP/local"

node <<EOF
const fs = require("node:fs");
const path = require("node:path");

function normalize(pkgDir) {
  const file = path.join(pkgDir, "package.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.version = "0.0.0";
  delete json.gitHead;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}

normalize("$TMP/pub/package");
normalize("$TMP/local/package");
EOF

if diff -rq "$TMP/pub/package" "$TMP/local/package" >/dev/null; then
  skip "No @b4moss/crudian package content change vs npm@${PUBLISHED} (version-normalized); skip publish."
fi

echo "Package content differs from npm@${PUBLISHED}; will publish ${PKG_VER}."
emit "skip" "false"
