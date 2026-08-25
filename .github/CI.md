# CI / CD policy

## Goals

1. **Lint + unit/integration** must clear on GitHub at least once before merge.
2. **Same package identity that already passed on an ancestor (or integration tip)** is skipped — merge stacks must not re-run the same work.
3. **No product E2E in CI** (none exist today; keep it that way).
4. **Only changed language packages** are scheduled in CI; **only version-bumped packages** deploy in CD.
5. Prefer **short wall-clock time**: path filters, job parallelism, Bun/Go caches, ancestor skip.

## Verification model (two layers)

`act` is **not** a perfect stand-in for hosted GitHub Actions. Correctness is layered:

1. **Primary — gate script tests (CI job `test gate scripts`)**  
   [`.github/tests/`](./tests/) exercises the real decide/skip scripts with fixtures and fake `npm` / `gh` on `PATH`:
   - `should-publish-crudian.sh` (already-on-registry → skip; missing tag; new version publish/skip)
   - `should-publish-go.sh` (`VERSION` / `packages/go/v*` / existing Release)
   - `ci-skip-if-ancestor-passed.sh` (green check + matching identity → hit)  
   Run locally: `make gate-tests` or `bash .github/tests/run.sh`.  
   These tests are the **source of truth** for CD/CI gate behaviour (including the v0.7.0 npm republish failure mode).

2. **Secondary — `act` wiring smoke (local only)**  
   Dry-run workflows to confirm jobs call the right scripts and conditionals fire. Do **not** treat `act` pass/fail as product quality. Not required in GitHub Actions for v0.7.1.

3. **Occasional parity** — compare local dry-run logs to a real Actions run when debugging. Gaps: secrets, Checks API fidelity, cache scoping, runner images, real registry auth.

### Local `act` recipes

Install: [nektos/act](https://github.com/nektos/act) (e.g. GitHub releases binary, or `brew install act`). Docker required. Defaults live in [`.actrc`](../.actrc).

```bash
# Wiring smoke for publish workflows (push → release event fixture)
make act-publish-npm
make act-publish-go
```

Event fixture: [`.github/act/push-release.json`](./act/push-release.json).

Expected for a tree whose `package.json` version is **already on npm**: decide step should **skip** without needing `NODE_AUTH_TOKEN`. Full publish steps may still warn/fail without secrets — that is OK for smoke; rely on `make gate-tests` for decide correctness.

| Scenario | Assert with |
|----------|-------------|
| Go-only release; npm must skip | `make gate-tests` (already-published case) + optional `make act-publish-npm` |
| JS version bump; npm must publish path | `make gate-tests` (new version + content differs) |
| Go tag / VERSION decide | `make gate-tests` |

## Workflows

| Workflow | Trigger | Scope |
|----------|---------|--------|
| `CI` | PR → `develop` / `dev-v*`; push → those + `main` | Gate scripts + lint/tests per touched package |
| `Docker image` | PR when `docker/**` / `.devcontainer/**` change | Image build + runtime check (not E2E) |
| `Publish npm` | push → `release` | `@b4moss/crudian` when tag/`package.json` warrant |
| `Publish Go` | push → `release` or tag `packages/go/v*` | Go module release + proxy ping |

## CI details (`ci.yml`)

- **Change detection:** `dorny/paths-filter` on `packages/js/**` and `packages/go/**`. Edits under `.github/workflows`, `.github/scripts`, `.github/tests`, `.github/CI.md`, `.actrc`, or `Makefile` set `gates=true` and also schedule package jobs (so CI logic changes are not silently ignored).
- **Gate scripts job:** `bash .github/tests/run.sh` when `gates=true`.
- **Docs-only / other-only PRs:** package and gate jobs are skipped; gate job `CI result` still succeeds.
- **Lint:** JS = `tsc --noEmit`; Go = `gofmt -l` + `go vet`.
- **Tests:** JS bun-sqlite (+ build), JS drizzle/prisma/libsql, Go `go test ./...`.
- **Ancestor skip (not GHA cache):** each package job runs `.github/scripts/ci-skip-if-ancestor-passed.sh` with:
  - exact check-run name (e.g. `test packages/go (gorm / libsql)`)
  - identity paths: package dir + `ci.yml` + the skip script  
  If a recent ancestor / `origin/develop` / `origin/main` tip has the **same git OIDs** for those paths **and** a **successful** check-run with that name, the job short-circuits.  
  Why not `actions/cache` pass-markers? Cache entries are **branch-scoped**; feature → `dev-v*` → `develop` → `main` could not see each other’s markers, so stacks re-tested every time (confirmed in Actions logs: `Skip notice` never ran).
- **Gate:** `CI result` fails if any required job is `failure` / `cancelled`; `skipped` (path filter) is OK. Ancestor short-circuit still reports the job as **success**.

Required status check for branch protection should be **`CI result`** (not individual package jobs).

## CD details

### npm (`publish-npm.yml`)

- Script: `.github/scripts/should-publish-crudian.sh`
- Needs git tag `vX.Y.Z` matching `packages/js/package.json` `version`, on HEAD or an ancestor.
- **If `@b4moss/crudian@X.Y.Z` already exists on npm → skip** (never republish; Go-only releases must not attempt `0.6.0` again when only README/docs drifted).
- Otherwise skips when packed content matches already-published npm latest (version-normalized).
- Pre-publish tests: bun-sqlite, drizzle, prisma, **libsql**.

### Go (`publish-go.yml`)

- Version file: `packages/go/VERSION` (first public line: **0.7.0**)
- Nested-module tag: **`packages/go/vX.Y.Z`** (required by Go for `packages/go` + module path `github.com/b4moss/crudian/go`)
- Script: `.github/scripts/should-publish-go.sh` — skip if no tag, tag not ancestor, or GitHub Release already exists.
- On publish: `go vet` + `go test`, create GitHub Release, best-effort `proxy.golang.org` ping.
- **No npm-style registry upload.** Canonical identity is the module path + git tag; `go get` resolves them (proxy is a cache).
- Independent of npm: publishing Go `0.7.0` does not require bumping `@b4moss/crudian` past `0.6.0`. Root tag `v0.7.0` alone does not publish Go.

## Explicit non-goals

- E2E / browser / cloud Turso credentials in CI
- Always testing every language on every PR
- Republishing unchanged package versions
- Using `act` alone as the acceptance test for publish/skip logic
