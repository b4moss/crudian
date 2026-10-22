#!/usr/bin/env bash
# Verify that packages/go is a valid nested Go module for external consumers.
#
# Checks:
#   1. go.mod module path == github.com/b4moss/crudian/packages/go
#      (must match the directory path under the repo root)
#   2. A throwaway consumer can import crudian + gorm and `go build`
#
# Env:
#   GO_MODULE_REF  If set (commit SHA / tag / branch), resolve via
#                  `GOPROXY=direct go get ...@REF` instead of a local replace.
#                  Omit for offline / local replace mode (default).
#   ROOT           Repo root override (defaults to git toplevel or script-relative).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel 2>/dev/null || true)}"
if [[ -z "${ROOT:-}" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

MODULE_DIR="$ROOT/packages/go"
EXPECTED_PATH="github.com/b4moss/crudian/packages/go"
GO_MOD="$MODULE_DIR/go.mod"

if [[ ! -f "$GO_MOD" ]]; then
  echo "missing $GO_MOD" >&2
  exit 1
fi

declared="$(awk '/^module / { print $2; exit }' "$GO_MOD")"
if [[ "$declared" != "$EXPECTED_PATH" ]]; then
  echo "module path mismatch: go.mod declares '$declared' but nested layout requires '$EXPECTED_PATH'" >&2
  exit 1
fi
echo "module path OK: $declared"

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

cd "$tmpdir"
go mod init example.com/crudian-consumer >/dev/null

if [[ -n "${GO_MODULE_REF:-}" ]]; then
  echo "resolving $EXPECTED_PATH@${GO_MODULE_REF} via GOPROXY=direct"
  GOPROXY=direct go get "${EXPECTED_PATH}@${GO_MODULE_REF}"
else
  echo "using local replace → $MODULE_DIR"
  go mod edit -require="${EXPECTED_PATH}@v0.0.0"
  go mod edit -replace="${EXPECTED_PATH}=${MODULE_DIR}"
fi

cat >main.go <<'EOF'
package main

import (
	"github.com/b4moss/crudian/packages/go/crudian"
	_ "github.com/b4moss/crudian/packages/go/gorm"
)

func main() {
	_ = crudian.Where()
}
EOF

# Resolve transitive deps declared by the replaced / fetched module.
go mod tidy
go build -o /dev/null .
echo "consumer import + build OK"
