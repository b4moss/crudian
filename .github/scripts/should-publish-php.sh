#!/usr/bin/env bash
# Decide whether the PHP Composer package should be published from HEAD.
# Tag form: packages/php/vX.Y.Z (must match packages/php/composer.json version).
#
# Outputs (GITHUB_OUTPUT when set):
#   skip=true|false
#   tag=packages/php/vX.Y.Z
#   version=X.Y.Z
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PKG_DIR="$ROOT/packages/php"
COMPOSER_JSON="$PKG_DIR/composer.json"
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

if [[ ! -f "$COMPOSER_JSON" ]]; then
  skip "No packages/php/composer.json; skip PHP publish."
fi

PKG_VER="$(php -r 'echo json_decode(file_get_contents($argv[1]), true)["version"] ?? "";' "$COMPOSER_JSON")"
if [[ -z "$PKG_VER" ]]; then
  skip "packages/php/composer.json has no version; skip PHP publish."
fi

TAG="packages/php/v${PKG_VER}"
emit "version" "$PKG_VER"
emit "tag" "$TAG"

if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  skip "No git tag ${TAG} for packages/php version ${PKG_VER}; skip PHP publish."
fi

TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
HEAD_COMMIT="$(git rev-parse HEAD)"
if [[ "$TAG_COMMIT" != "$HEAD_COMMIT" ]] &&
  ! git merge-base --is-ancestor "$TAG_COMMIT" "$HEAD_COMMIT"; then
  skip "Tag ${TAG} (${TAG_COMMIT}) is not an ancestor of HEAD; skip PHP publish."
fi

echo "Using tag ${TAG} at ${TAG_COMMIT} (HEAD=${HEAD_COMMIT})."

if command -v gh >/dev/null 2>&1; then
  if gh release view "$TAG" >/dev/null 2>&1; then
    skip "GitHub Release ${TAG} already exists; skip PHP publish."
  fi
fi

echo "Will publish PHP package at ${TAG}."
emit "skip" "false"
