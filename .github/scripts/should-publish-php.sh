#!/usr/bin/env bash
# Decide whether the PHP Composer package should be published from HEAD.
# Monorepo tag: packages/php/vX.Y.Z (must match packages/php/VERSION).
# Dist repo:    b4moss/crudian-php with Packagist tags vX.Y.Z (via subtree split).
#
# Outputs (GITHUB_OUTPUT when set):
#   skip=true|false
#   tag=packages/php/vX.Y.Z
#   dist_tag=vX.Y.Z
#   version=X.Y.Z
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PKG_DIR="$ROOT/packages/php"
VERSION_FILE="$PKG_DIR/VERSION"
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

if [[ ! -f "$VERSION_FILE" ]]; then
  skip "No packages/php/VERSION; skip PHP publish."
fi

PKG_VER="$(tr -d '[:space:]' <"$VERSION_FILE")"
if [[ -z "$PKG_VER" ]]; then
  skip "packages/php/VERSION is empty; skip PHP publish."
fi

TAG="packages/php/v${PKG_VER}"
DIST_TAG="v${PKG_VER}"
emit "version" "$PKG_VER"
emit "tag" "$TAG"
emit "dist_tag" "$DIST_TAG"

if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  skip "No git tag ${TAG} for packages/php version ${PKG_VER}; skip PHP publish."
fi

TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
HEAD_COMMIT="$(git rev-parse HEAD)"
if [[ "$TAG_COMMIT" != "$HEAD_COMMIT" ]] &&
  ! git merge-base --is-ancestor "$TAG_COMMIT" "$HEAD_COMMIT"; then
  skip "Tag ${TAG} (${TAG_COMMIT}) is not an ancestor of HEAD; skip PHP publish."
fi

echo "Using tag ${TAG} at ${TAG_COMMIT} (HEAD=${HEAD_COMMIT}). Dist tag ${DIST_TAG} → b4moss/crudian-php."

if command -v gh >/dev/null 2>&1; then
  if gh release view "$TAG" >/dev/null 2>&1; then
    skip "GitHub Release ${TAG} already exists; skip PHP publish."
  fi
fi

echo "Will publish PHP package at ${TAG} (subtree → crudian-php ${DIST_TAG})."
emit "skip" "false"
