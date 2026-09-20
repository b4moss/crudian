# Go module (`github.com/b4moss/crudian/go`)

CRUD facade matching the JavaScript `@b4moss/crudian` contract, for **GORM** and **libSQL**.

**Supported databases:** SQLite (GORM + libSQL), **PostgreSQL** and **MySQL** (GORM with explicit `Driver` / `Dialect`). libSQL stays SQLite-compatible.

API shape: **synchronous methods with `context.Context` as the first argument** (no JS-style sync/async split). Rows are `map[string]any` (`crudian.Row`) — not ORM structs.

## Install

Go does not use an npm-like registry for this package. You depend on the **module path**; the toolchain fetches the matching **git tag** (often via `proxy.golang.org` as a cache).

```bash
go get github.com/b4moss/crudian/go@v0.9.0
```

Or in `go.mod`:

```go
require github.com/b4moss/crudian/go v0.9.0
```

| Item | Value |
|------|--------|
| Module path | `github.com/b4moss/crudian/go` |
| Source tree | `packages/go/` in this repository |
| Version file | [`VERSION`](./VERSION) |
| Git tag | **`packages/go/vX.Y.Z`** (must match `VERSION`) |
| Minimum Go | 1.22+ locally; **CI uses Go 1.26** |

Language versions are independent of the npm package.

## Packages

| Import | Entry | Injected client |
|--------|--------|-----------------|
| `.../go/gorm` | `gorm.CreateCrud(db, opts...)` | `*gorm.DB` (SQLite / Postgres / MySQL) |
| `.../go/libsql` | `libsql.CreateCrud(db)` | `*sql.DB` (SQLite-compatible) |
| `.../go/crudian` | shared types | `Where`, Dialects, `Crud`, queries, `PoolOptions` |

`CreateCrud` never opens connections. The caller owns the DB and can use `crud.DB` for escapes.

### Dialect (#73)

| Dialect | Quote | Placeholder | Insert return |
|---------|-------|-------------|-----------------|
| `SqliteDialect` | `"x"` | `?` | `RETURNING *` |
| `PostgresDialect` | `"x"` | `$n` | `RETURNING *` |
| `MySQLDialect` | `` `x` `` | `?` | insert + `LAST_INSERT_ID()` + `SELECT` (no `RETURNING`) |

Select dialect on GORM via **explicit** options (preferred over auto-detect):

```go
crud, err := gorm.CreateCrud(db, crudian.Options{Driver: "postgres"})
// or: crudian.Options{Dialect: crudian.PostgresDialect{}}
// mysql: Driver: "mysql" / MySQLDialect{}
// default / omit: SqliteDialect
```

Upsert stays **application-level** (read → update / create); not `ON CONFLICT` / `ON DUPLICATE KEY`.

### Connection pool / lifetime (#105)

| Backend | Behavior |
|---------|----------|
| **GORM** (SQLite / Postgres / MySQL) | Pass `crudian.Options{Pool: &crudian.PoolOptions{...}}` to `CreateCrud` — applied via `db.DB()` |
| **libSQL** | `Pool` is accepted but **ignored** (single-connection oriented) |
| **JS** | Prisma: configure pool on the injected client / datasource ([`packages/js/README.md`](../js/README.md)). SQLite adapters are no-op. |

Nil fields in `PoolOptions` leave that setting unchanged. Helpers: `crudian.ApplyPool(*sql.DB, *PoolOptions)`.

```go
maxOpen := 10
idle := 5
lifetime := time.Hour
crud, err := gorm.CreateCrud(db, crudian.Options{
	Driver: "postgres",
	Pool: &crudian.PoolOptions{
		MaxOpenConns:    &maxOpen,
		MaxIdleConns:    &idle,
		ConnMaxLifetime: &lifetime,
	},
})
```

## GORM / SQLite

```go
package main

import (
	"context"
	"fmt"

	"github.com/b4moss/crudian/go/crudian"
	"github.com/b4moss/crudian/go/gorm"
	"github.com/glebarez/sqlite"
	gormio "gorm.io/gorm"
)

func main() {
	db, err := gormio.Open(sqlite.Open("file:app.db"), &gormio.Config{})
	if err != nil {
		panic(err)
	}
	crud, err := gorm.CreateCrud(db)
	if err != nil {
		panic(err)
	}
	ctx := context.Background()

	row, err := crud.Create(ctx, "items", crudian.Row{"name": "alpha", "score": 1})
	if err != nil {
		panic(err)
	}
	fmt.Println(row["id"])
}
```

## GORM / Postgres or MySQL

```go
import (
	"github.com/b4moss/crudian/go/crudian"
	"github.com/b4moss/crudian/go/gorm"
	"gorm.io/driver/postgres" // or gorm.io/driver/mysql
	gormio "gorm.io/gorm"
)

db, err := gormio.Open(postgres.Open(dsn), &gormio.Config{})
crud, err := gorm.CreateCrud(db, crudian.Options{Driver: "postgres"})
```

Tests: `go test ./gorm/ -run TestPostgresDialectContract` / `TestMySQLDialectContract` (local or docker DB; see [`docs/tests/v0.10.0.md`](../../docs/tests/v0.10.0.md)).

## libSQL

Inject a `*sql.DB` opened with `github.com/tursodatabase/libsql-client-go/libsql`.

For local **`file://`** URLs that driver delegates to a registered `sqlite` / `sqlite3` driver — blank-import one (for example `modernc.org/sqlite`). Prefer absolute `file:///...` paths. Avoid `:memory:` when using transactions.

```go
import (
	"context"
	"database/sql"

	"github.com/b4moss/crudian/go/crudian"
	"github.com/b4moss/crudian/go/libsql"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite"
)

db, err := sql.Open("libsql", "file:///absolute/path/to/local.db")
crud, err := libsql.CreateCrud(db)
row, err := crud.Create(context.Background(), "items", crudian.Row{"name": "alpha", "score": 1})
_ = row
```

## API surface

All methods take `ctx context.Context` first. Table names are plain strings.

| Method | Returns | Notes |
|--------|---------|--------|
| `Create` | row | dialect insert-return (`RETURNING *` or fetch-after-insert) |
| `Read` | row or `nil` | miss is not an error |
| `Update` | row or `nil` | requires `Where` |
| `Delete` | rows affected | requires `Where` |
| `Search` / `List` | `SearchResult` | offset (default) or cursor; includes `Total` |
| `Count` | `int64` | `Where` only |
| `Exists` | `bool` | `Where` only; presence sugar (`Count > 0`) |
| `Upsert` | row | requires PK in cols; app-level |
| `Duplicate` | row or `nil` | requires `Where` |
| `BulkCreate` / `BulkUpdate` / `BulkDelete` / `BulkUpsert` | count | |
| `Transaction` | error | explicit only; CRUD does not auto-begin |

`Where` builders: `Eq` / `Ne` / `Lt` / `Gt` / `Lte` / `Gte` / `In` / `Like` / `IsNull` / `IsNotNull`, plus nestable `And` / `Or`.

Spec: [`docs/main.md`](../../docs/main.md), tests: [`docs/tests/v0.10.0.md`](../../docs/tests/v0.10.0.md).

## Versioning and release

1. Set [`VERSION`](./VERSION).
2. Tag the release commit: `packages/go/vX.Y.Z`.
3. Push the tag (and/or merge that commit to `release`).

CI policy: [`.github/CI.md`](../../.github/CI.md).

## Out of scope

- TypeORM / PHP packages
- Configurable composite primary keys
- ORM model mapping, migrations, full-text search
- Putting pool settings on the Dialect interface
