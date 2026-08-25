#!/usr/bin/env bash
# Shared helpers for .github/tests
# shellcheck disable=SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/.github/scripts"

PASS=0
FAIL=0

assert_eq() {
  local label="$1"
  local got="$2"
  local want="$3"
  if [[ "$got" == "$want" ]]; then
    echo "  OK  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $label (got=$(printf %q "$got") want=$(printf %q "$want"))"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_has() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  if grep -qE "$pattern" "$file"; then
    echo "  OK  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $label (pattern=$pattern file=$file)"
    echo "---- file ----"
    cat "$file" || true
    FAIL=$((FAIL + 1))
  fi
}

# Create an isolated git repo with packages/js + packages/go skeletons and real scripts.
# Usage: FIXTURE=$(make_fixture) ; cd "$FIXTURE"
make_fixture() {
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/crudian-gate.XXXXXX")"
  mkdir -p "$dir/packages/js/dist" "$dir/packages/go" "$dir/.github/scripts" "$dir/bin"

  cp "$SCRIPTS_DIR/should-publish-crudian.sh" "$dir/.github/scripts/"
  cp "$SCRIPTS_DIR/should-publish-go.sh" "$dir/.github/scripts/"
  cp "$SCRIPTS_DIR/ci-skip-if-ancestor-passed.sh" "$dir/.github/scripts/"
  chmod +x "$dir/.github/scripts/"*.sh

  cat >"$dir/packages/js/package.json" <<'EOF'
{
  "name": "@b4moss/crudian",
  "version": "0.6.0",
  "files": ["dist", "LICENSE", "README.md"],
  "license": "MIT"
}
EOF
  echo "local dist" >"$dir/packages/js/dist/index.js"
  echo "MIT" >"$dir/packages/js/LICENSE"
  echo "readme local" >"$dir/packages/js/README.md"
  echo "0.7.0" >"$dir/packages/go/VERSION"
  echo 'module github.com/b4moss/crudian/go' >"$dir/packages/go/go.mod"
  mkdir -p "$dir/.github/workflows"
  echo "name: CI" >"$dir/.github/workflows/ci.yml"

  git -C "$dir" init -q
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "gate-test"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m "fixture root"

  # Install PATH stubs (callers can overwrite bin/*).
  install_default_stubs "$dir"

  echo "$dir"
}

install_default_stubs() {
  local dir="$1"
  cat >"$dir/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
# FAKE_NPM_VERSIONS: space-separated versions that exist on the registry
# FAKE_NPM_LATEST: latest version string (empty => package missing)
# FAKE_NPM_PUB_DIR: directory whose contents become the packed "registry" package/
cmd="${1:-}"
shift || true
case "$cmd" in
  view)
    pkg="${1:-}"
    if [[ "$pkg" == @b4moss/crudian@* ]]; then
      ver="${pkg##*@}"
      for v in ${FAKE_NPM_VERSIONS:-}; do
        if [[ "$v" == "$ver" ]]; then
          echo "$ver"
          exit 0
        fi
      done
      exit 1
    fi
    if [[ "$pkg" == @b4moss/crudian ]]; then
      if [[ -n "${FAKE_NPM_LATEST:-}" ]]; then
        echo "$FAKE_NPM_LATEST"
        exit 0
      fi
      exit 1
    fi
    exit 1
    ;;
  pack)
    # registry form: npm pack @b4moss/crudian@VER
    if [[ "${1:-}" == @b4moss/crudian@* ]]; then
      ver="${1##*@}"
      out="b4moss-crudian-${ver}.tgz"
      stage="$(mktemp -d)"
      mkdir -p "$stage/package"
      if [[ -n "${FAKE_NPM_PUB_DIR:-}" && -d "${FAKE_NPM_PUB_DIR}" ]]; then
        cp -R "${FAKE_NPM_PUB_DIR}/." "$stage/package/"
      else
        echo '{"name":"@b4moss/crudian","version":"'"$ver"'","files":["dist"]}' >"$stage/package/package.json"
        mkdir -p "$stage/package/dist"
        echo "published dist" >"$stage/package/dist/index.js"
        echo "MIT" >"$stage/package/LICENSE"
        echo "readme published" >"$stage/package/README.md"
      fi
      # rewrite version field
      node -e "const fs=require('fs');const p='$stage/package/package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='$ver';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
      tar -czf "$out" -C "$stage" package
      rm -rf "$stage"
      echo "$out"
      exit 0
    fi
    # local form: npm pack [--silent] [--pack-destination DIR]
    dest="."
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --pack-destination) dest="$2"; shift 2 ;;
        --silent) shift ;;
        *) shift ;;
      esac
    done
    ver="$(node -p "require('./package.json').version")"
    name="b4moss-crudian-${ver}.tgz"
    stage="$(mktemp -d)"
    mkdir -p "$stage/package"
    # Minimal pack of files listed in package.json "files" + package.json
    cp package.json "$stage/package/"
    node -e "
      const fs=require('fs'); const path=require('path');
      const j=JSON.parse(fs.readFileSync('package.json','utf8'));
      for (const f of (j.files||[])) {
        const src=f; const dst=path.join('$stage/package', f);
        fs.mkdirSync(path.dirname(dst), {recursive:true});
        const st=fs.statSync(src);
        if (st.isDirectory()) {
          fs.cpSync(src, dst, {recursive:true});
        } else {
          fs.copyFileSync(src, dst);
        }
      }
    "
    tar -czf "$dest/$name" -C "$stage" package
    rm -rf "$stage"
    echo "$name"
    exit 0
    ;;
  *)
    echo "fake-npm: unsupported: $cmd $*" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$dir/bin/npm"

  cat >"$dir/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
# FAKE_GH_RELEASES: space-separated release tags that exist
# FAKE_GH_CHECK_JSON: raw JSON body for check-runs API (optional)
cmd="${1:-}"
shift || true
case "$cmd" in
  release)
    sub="${1:-}"
    tag="${2:-}"
    if [[ "$sub" == view ]]; then
      for t in ${FAKE_GH_RELEASES:-}; do
        if [[ "$t" == "$tag" ]]; then
          echo "title: $tag"
          exit 0
        fi
      done
      exit 1
    fi
    exit 1
    ;;
  api)
    jq_filter=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --paginate) shift ;;
        --jq)
          jq_filter="$2"
          shift 2
          ;;
        -*) shift ;;
        *) shift ;;
      esac
    done
    bodyfile="$(mktemp)"
    if [[ -n "${FAKE_GH_CHECK_JSON:-}" ]]; then
      printf '%s' "$FAKE_GH_CHECK_JSON" >"$bodyfile"
    else
      printf '%s' '{"check_runs":[]}' >"$bodyfile"
    fi
    if [[ -n "$jq_filter" ]]; then
      # Don't fail the gate script on jq issues; return 0 matches.
      jq -r "$jq_filter" "$bodyfile" 2>/dev/null || echo 0
    else
      cat "$bodyfile"
      echo
    fi
    rm -f "$bodyfile"
    exit 0
    ;;
  *)
    echo "fake-gh: unsupported: $cmd $*" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$dir/bin/gh"
}

use_fixture_path() {
  local dir="$1"
  export PATH="$dir/bin:$PATH"
}

run_decide_npm() {
  local dir="$1"
  local out="$2"
  (
    cd "$dir"
    use_fixture_path "$dir"
    export GITHUB_OUTPUT="$out"
    : >"$out"
    bash .github/scripts/should-publish-crudian.sh
  )
}

run_decide_go() {
  local dir="$1"
  local out="$2"
  (
    cd "$dir"
    use_fixture_path "$dir"
    export GITHUB_OUTPUT="$out"
    : >"$out"
    bash .github/scripts/should-publish-go.sh
  )
}

output_get() {
  local file="$1"
  local key="$2"
  grep -E "^${key}=" "$file" | tail -1 | cut -d= -f2-
}

cleanup_fixture() {
  local dir="${1:-}"
  if [[ -n "$dir" && -d "$dir" ]]; then
    rm -rf "$dir"
  fi
}
