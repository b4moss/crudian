#!/usr/bin/env bash
# Run all gate-script tests.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
failed=0
for t in "$DIR"/test-*.sh; do
  echo
  echo "######## $(basename "$t") ########"
  if ! bash "$t"; then
    echo "FAILED: $t"
    failed=1
  fi
done
if [[ "$failed" -ne 0 ]]; then
  echo
  echo "gate script tests FAILED"
  exit 1
fi
echo
echo "gate script tests PASSED"
