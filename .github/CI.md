# CI / CD policy

## Goals

1. **Lint + unit/integration** must clear on GitHub at least once before merge.
2. **Same package content that already passed** is skipped on later runs (GHA cache pass-marker), including after merges that only reintroduce already-tested trees.
3. **No product E2E in CI** (none exist today; keep it that way).
4. **Only changed language packages** run in CI; **only version-bumped packages** deploy in CD.
5. Prefer **short wall-clock time**: path filters, job parallelism, Bun/Go/Docker caches, pass-markers.

## Workflows

| Workflow | Trigger | Scope |
|----------|---------|--------|
| `CI` | PR → `develop` / `dev-v*`; push → those + `main` | Lint + tests per touched package |
| `Docker image` | PR when `docker/**` / `.devcontainer/**` change | Image build + runtime check (not E2E) |
| `Publish npm` | push → `release` | `@b4moss/crudian` when tag/`package.json` warrant |
| `Publish Go` | push → `release` or tag `packages/go/v*` | Go module release + proxy ping |

## CI details (`ci.yml`)

- **Change detection:** `dorny/paths-filter` on `packages/js/**` and `packages/go/**`. Edits to `ci.yml` / this file re-run all package jobs.
- **Docs-only / other-only PRs:** package jobs are skipped; gate job `CI result` still succeeds.
- **Lint:** JS = `tsc --noEmit`; Go = `gofmt -l` + `go vet`.
- **Tests:** JS bun-sqlite (+ build), JS drizzle/prisma/libsql, Go `go test ./...`.
- **Pass-marker:** per-job content `hashFiles(...)` cache. Hit → skip work. Push to integration branches seeds markers for later PRs.
- **Gate:** `CI result` fails if any required job is `failure` / `cancelled`; `skipped` is OK.

Required status check for branch protection should be **`CI result`** (not individual package jobs).

## CD details

### npm (`publish-npm.yml`)

- Script: `.github/scripts/should-publish-crudian.sh`
- Needs git tag `vX.Y.Z` matching `packages/js/package.json` `version`, on HEAD or an ancestor.
- Skips when packed content matches already-published npm (version-normalized).
- Pre-publish tests: bun-sqlite, drizzle, prisma, **libsql**.

### Go (`publish-go.yml`)

- Version file: `packages/go/VERSION`
- Nested-module tag: **`packages/go/vX.Y.Z`** (required by Go for `packages/go` + module path `github.com/b4moss/crudian/go`)
- Script: `.github/scripts/should-publish-go.sh` — skip if no tag, tag not ancestor, or GitHub Release already exists.
- On publish: `go vet` + `go test`, create GitHub Release, best-effort `proxy.golang.org` ping.
- No npm-style registry upload; consumers use the module path + tag.

## Explicit non-goals

- E2E / browser / cloud Turso credentials in CI
- Always testing every language on every PR
- Republishing unchanged package versions
