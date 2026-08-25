# crudian

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
| `@b4moss/crudian/bun-sqlite` | Bun `bun:sqlite` (sync) |
| `@b4moss/crudian/drizzle` | Drizzle + better-sqlite3 (sync) |
| `@b4moss/crudian/prisma` | Prisma (async) |
| `@b4moss/crudian/libsql` | `@libsql/client` (async) |

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
| `github.com/b4moss/crudian/go/gorm` | GORM adapter (**SQLite today**; MySQL/Postgres later) |
| `github.com/b4moss/crudian/go/libsql` | libSQL (`database/sql`) adapter |
| `github.com/b4moss/crudian/go/crudian` | Shared contract, `Where`, Dialect, CRUD |

Usage, drivers, and API notes: [`packages/go/README.md`](./packages/go/README.md). Today’s Go adapters target **SQLite only**; **MySQL and PostgreSQL support is planned** on the same Dialect/CRUD surface.

**Release:** tag `packages/go/vX.Y.Z` matching `VERSION`. Root tag `vX.Y.Z` alone does **not** publish Go. CD creates a GitHub Release and pings the module proxy; it does not upload to npm.

## Docs

| Doc | Contents |
|-----|----------|
| [`docs/main.md`](./docs/main.md) | Spec (source of truth), including per-language versioning |
| [`docs/plans/roadmap.md`](./docs/plans/roadmap.md) | Milestones |
| [`docs/plans/go-module.md`](./docs/plans/go-module.md) | Go design |
| [`docs/plans/libsql-adapter.md`](./docs/plans/libsql-adapter.md) | JS libSQL design |
| [`docs/tests/`](./docs/tests/) | Acceptance tests |
| [`.github/CI.md`](./.github/CI.md) | CI/CD policy (path-filtered tests, CD per language, gate tests + act smoke) |
| [`.github/tests/`](./.github/tests/) | Automated tests for publish/skip gate scripts (`make gate-tests`) |

## License

MIT © Bicycle for Mind LLC., Kohki SHIKATA — see [`LICENSE`](./LICENSE).
