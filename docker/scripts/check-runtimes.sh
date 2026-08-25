#!/usr/bin/env bash
# Verify the all-in-one image exposes the runtimes expected by issue #44.
set -euo pipefail

fail=0

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "FAIL: missing command: $name" >&2
    fail=1
    return 1
  fi
  return 0
}

echo "== crudian runtime check =="

require_cmd node
require_cmd npm
require_cmd bun
require_cmd go
require_cmd php
require_cmd composer
require_cmd psql
require_cmd mysql

node_v="$(node -v | sed 's/^v//')"
node_major="${node_v%%.*}"
echo "node:  v${node_v}"
if [[ "$node_major" != "24" ]]; then
  echo "FAIL: expected Node.js 24.x, got v${node_v}" >&2
  fail=1
fi

bun_v="$(bun --version)"
echo "bun:   ${bun_v}"

go_v="$(go env GOVERSION | sed 's/^go//')"
echo "go:    ${go_v}"
if [[ ! "$go_v" =~ ^1\.26(\.|$) ]]; then
  echo "FAIL: expected Go 1.26.x, got ${go_v}" >&2
  fail=1
fi

php_v="$(php -r 'echo PHP_VERSION;')"
echo "php:   ${php_v}"

composer_v="$(composer --version 2>/dev/null | head -n1)"
echo "composer: ${composer_v}"

if [[ "$fail" -ne 0 ]]; then
  echo "runtime check FAILED" >&2
  exit 1
fi

echo "runtime check OK"
