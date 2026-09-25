#!/usr/bin/env bash
# Split packages/php and push to b4moss/crudian-php for Packagist.
#
# Env:
#   VERSION     — e.g. 0.12.0 (required)
#   DIST_TAG    — e.g. v0.12.0 (default v$VERSION)
#   DIST_REPO   — default b4moss/crudian-php
#   DIST_TOKEN  — PAT/token with contents:write on DIST_REPO (required to push)
#   DIST_BRANCH — default main
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PREFIX="packages/php"
VERSION="${VERSION:?VERSION is required}"
DIST_TAG="${DIST_TAG:-v${VERSION}}"
DIST_REPO="${DIST_REPO:-b4moss/crudian-php}"
DIST_BRANCH="${DIST_BRANCH:-main}"
DIST_TOKEN="${DIST_TOKEN:?DIST_TOKEN is required (repo write access to ${DIST_REPO})}"

cd "$ROOT"

if [[ ! -f "$PREFIX/composer.json" ]]; then
  echo "missing $PREFIX/composer.json" >&2
  exit 1
fi

SPLIT_BRANCH="php-subtree-split-$$"
echo "Splitting ${PREFIX} → ${SPLIT_BRANCH}"
git subtree split --prefix="$PREFIX" -b "$SPLIT_BRANCH"

REMOTE_URL="https://x-access-token:${DIST_TOKEN}@github.com/${DIST_REPO}.git"
REMOTE_NAME="php-dist-$$"
git remote add "$REMOTE_NAME" "$REMOTE_URL"

echo "Pushing ${SPLIT_BRANCH} → ${DIST_REPO}:${DIST_BRANCH}"
git push "$REMOTE_NAME" "${SPLIT_BRANCH}:${DIST_BRANCH}" --force

# Point Packagist SemVer tag at the split tip
if git rev-parse -q --verify "refs/tags/${DIST_TAG}" >/dev/null; then
  echo "Local tag ${DIST_TAG} already exists; recreating on split tip"
  git tag -d "$DIST_TAG"
fi
git tag -a "$DIST_TAG" "$SPLIT_BRANCH" -m "b4moss/crudian ${DIST_TAG}"
echo "Pushing tag ${DIST_TAG} → ${DIST_REPO}"
git push "$REMOTE_NAME" "refs/tags/${DIST_TAG}" --force

git remote remove "$REMOTE_NAME"
git branch -D "$SPLIT_BRANCH" >/dev/null 2>&1 || true

echo "Subtree publish complete: ${DIST_REPO}@${DIST_TAG}"
