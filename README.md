# crudian

[![CI](https://github.com/b4moss/crudian/actions/workflows/ci.yml/badge.svg)](https://github.com/b4moss/crudian/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/b4moss/crudian/graph/badge.svg)](https://codecov.io/gh/b4moss/crudian)
[![npm](https://img.shields.io/npm/v/@b4moss/crudian)](https://www.npmjs.com/package/@b4moss/crudian)
[![Packagist](https://img.shields.io/packagist/v/b4moss/crudian)](https://packagist.org/packages/b4moss/crudian)
[![Go Reference](https://pkg.go.dev/badge/github.com/b4moss/crudian/go.svg)](https://pkg.go.dev/github.com/b4moss/crudian/go)
[![Release](https://img.shields.io/github/v/release/b4moss/crudian)](https://github.com/b4moss/crudian/releases)
[![License](https://img.shields.io/github/license/b4moss/crudian)](https://github.com/b4moss/crudian/blob/main/LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/b4moss/crudian/badge)](https://scorecard.dev/viewer/?uri=github.com/b4moss/crudian)

CRUD abstraction for DDD repositories, packaged per language.

Versions are **independent per language**. A repo milestone name (for example planning `v0.7.0`) does not force every language package to publish that number. It is normal for npm to stay on `0.6.0` while the Go module’s first release is `0.7.0`.

## JavaScript / TypeScript

npm package: **[@b4moss/crudian](./packages/js)** (`packages/js`)

Current published line: see `packages/js/package.json` (for example `0.6.0`).

```bash
npm install @b4moss/crudian
```

| Subpath | Backend |
|---------|---------|
| `@b4moss/crudian/bun-sqlite` | Bun `bun:sqlite` (sync, SQLite) |
| `@b4moss/crudian/drizzle` | Drizzle + better-sqlite3 (sync, SQLite) |
| `@b4moss/crudian/prisma` | Prisma (async; SQLite / Postgres / MySQL via `dialect`) |
| `@b4moss/crudian/libsql` | `@libsql/client` (async, SQLite-compatible) |
| `@b4moss/crudian/typeorm` | TypeORM `DataSource` (async; SQLite / Postgres / MySQL) |

Full method samples: [`packages/js/README.md`](./packages/js/README.md).

**Release:** git tag `vX.Y.Z` must match `package.json` `version`. Pushing that tree to `release` runs npm publish only when the packed content differs from the registry ([`.github/CI.md`](./.github/CI.md)).

## Go

Go module: **[github.com/b4moss/crudian/go](./packages/go)** (`packages/go`)

There is **no npm-style package registry upload**. The canonical identity is the **module path** on GitHub; consumers resolve a **git tag** with the Go toolchain (`go get` / `go.mod`). The public module proxy caches source; it is not a separate store you publish tarballs into.

First Go release line: `packages/go/VERSION` → **`0.7.0`**, git tag **`packages/go/v0.7.0`** (nested-module tag form).

```bash
go get github.com/b4moss/crudian/go@v0.7.0
```

| Import path | Role |
|-------------|------|
| `github.com/b4moss/crudian/go/gorm` | GORM adapter (SQLite / Postgres / MySQL) |
| `github.com/b4moss/crudian/go/libsql` | libSQL (`database/sql`) adapter (SQLite-compatible) |
| `github.com/b4moss/crudian/go/crudian` | Shared contract, `Where`, Dialect, CRUD, Pool |

Usage, drivers, and API notes: [`packages/go/README.md`](./packages/go/README.md). Dialect acceptance: [`docs/tests/v0.10.0.md`](./docs/tests/v0.10.0.md).

**Release:** tag `packages/go/vX.Y.Z` matching `VERSION`. Root tag `vX.Y.Z` alone does **not** publish Go. CD creates a GitHub Release and pings the module proxy; it does not upload to npm.

## PHP

Composer package: **[b4moss/crudian](./packages/php)** (`packages/php`)

Requires PHP **8.3+**. PDO adapters for SQLite / Postgres / MySQL; libSQL via official SDK (**technical preview**, needs `ext-ffi`).

```bash
composer require b4moss/crudian
```

| Namespace | Role |
|-----------|------|
| `B4moss\Crudian\` | Shared contract, Where, Dialect, CRUD, Executor |
| `B4moss\Crudian\Pdo\` | `createCrud(PDO)` |
| `B4moss\Crudian\Libsql\` | `createCrud($connection)` (preview) |

Usage: [`packages/php/README.md`](./packages/php/README.md). Acceptance: [`docs/tests/v0.12.0.md`](./docs/tests/v0.12.0.md).

**Release:** tag `packages/php/vX.Y.Z` matching `packages/php/VERSION`. Monorepo CD gates tests and creates the Release marker; **[b4moss/crudian-php](https://github.com/b4moss/crudian-php)** mirrors `packages/php` and tags `vX.Y.Z` for Packagist (`b4moss/crudian`).

## Docs

| Doc | Contents |
|-----|----------|
| [`docs/main.md`](./docs/main.md) | Spec (source of truth), including per-language versioning |
| [`docs/roadmap.md`](./docs/roadmap.md) | Milestones |
| [`docs/plans/go-module.md`](./docs/plans/go-module.md) | Go design |
| [`docs/plans/libsql-adapter.md`](./docs/plans/libsql-adapter.md) | JS libSQL design |
| [`docs/tests/`](./docs/tests/) | Acceptance tests |
| [`.github/CI.md`](./.github/CI.md) | CI/CD policy (path-filtered tests, CD per language, gate tests + act smoke) |
| [`.github/tests/`](./.github/tests/) | Automated tests for publish/skip gate scripts (`make gate-tests`) |

## License

MIT © Bicycle for Mind LLC., Kohki SHIKATA — see [`LICENSE`](./LICENSE).
