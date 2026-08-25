# Go module (`github.com/b4moss/crudian/go`)

CRUD facade matching the JavaScript `@b4moss/crudian` contract, for **GORM (SQLite)** and **libSQL**.

API shape: **synchronous methods with `context.Context` as the first argument** (no JS-style sync/async split). Rows are `map[string]any` (`crudian.Row`) — not ORM structs.

## Install

Go does not use an npm-like registry for this package. You depend on the **module path**; the toolchain fetches the matching **git tag** (often via `proxy.golang.org` as a cache).

```bash
go get github.com/b4moss/crudian/go@v0.7.0
```

Or in `go.mod`:

```go
require github.com/b4moss/crudian/go v0.7.0
```

| Item | Value |
|------|--------|
| Module path | `github.com/b4moss/crudian/go` |
| Source tree | `packages/go/` in this repository |
| Version file | [`VERSION`](./VERSION) (first release: **0.7.0**) |
| Git tag | **`packages/go/vX.Y.Z`** (must match `VERSION`) |
| Minimum Go | 1.22+ locally; **CI uses Go 1.26** |

Language versions are independent: npm `@b4moss/crudian` may remain on `0.6.0` while this module ships `0.7.0`.

## Packages

| Import | Entry | Injected client |
|--------|--------|-----------------|
| `.../go/gorm` | `gorm.CreateCrud(db)` | `*gorm.DB` (SQLite) |
| `.../go/libsql` | `libsql.CreateCrud(db)` | `*sql.DB` |
| `.../go/crudian` | shared types | `Where`, `SqliteDialect`, `Crud`, queries |

`CreateCrud` never opens connections. The caller owns the DB and can use `crud.DB` for escapes.

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

	got, err := crud.Read(ctx, "items", crudian.ReadQuery{
		Where: crudian.Where().Eq("id", row["id"]),
	})
	if err != nil {
		panic(err)
	}
	_ = got

	page, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Where: crudian.Where().Eq("name", "alpha"),
		Limit: 20,
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(page.Total, len(page.Items), page.NextCursor, page.HasMore)
}
```

Pure-Go SQLite drivers such as `github.com/glebarez/sqlite` are fine for tests and apps that want to avoid CGO. GORM’s `gorm.io/driver/sqlite` (CGO) also works if you prefer it.

## libSQL

Inject a `*sql.DB` opened with `github.com/tursodatabase/libsql-client-go/libsql`.

For local **`file://`** URLs that driver delegates to a registered `sqlite` / `sqlite3` driver — blank-import one (for example `modernc.org/sqlite`). Prefer absolute `file:///...` paths. Avoid `:memory:` when using transactions.

Upstream marks `libsql-client-go` deprecated in favor of `go-libsql` / `tursogo`. This milestone still targets the official client; if it becomes unusable, fall back to `go-libsql` (CGO) and document why here.

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
if err != nil {
	panic(err)
}
crud, err := libsql.CreateCrud(db)
if err != nil {
	panic(err)
}
row, err := crud.Create(context.Background(), "items", crudian.Row{"name": "alpha", "score": 1})
_ = row
```

## API surface

All methods take `ctx context.Context` first. Table names are plain strings.

| Method | Returns | Notes |
|--------|---------|--------|
| `Create` | row | `INSERT … RETURNING *` |
| `Read` | row or `nil` | miss is not an error |
| `Update` | row or `nil` | requires `Where` |
| `Delete` | rows affected | requires `Where` |
| `Search` / `List` | `SearchResult` | cursor on `id` ASC; includes `Total` |
| `Count` | `int64` | `Where` only |
| `Upsert` | row | requires `cols["id"]` |
| `Duplicate` | row or `nil` | requires `Where` |
| `BulkCreate` / `BulkUpdate` / `BulkDelete` / `BulkUpsert` | count | |
| `Transaction` | error | explicit only; CRUD does not auto-begin |

`Where` builders: `Eq` / `Ne` / `Lt` / `Gt` / `Lte` / `Gte` / `In` / `Like` / `IsNull` / `IsNotNull`, plus nestable `And` / `Or`.

Contract details match the JS adapters (primary key / cursor column `id` for now). Spec: [`docs/main.md`](../../docs/main.md), design: [`docs/plans/go-module.md`](../../docs/plans/go-module.md).

## Versioning and release

1. Set [`VERSION`](./VERSION) (for example `0.7.0`).
2. Tag the release commit: `packages/go/v0.7.0` (not the root `v0.7.0` tag used for npm).
3. Push the tag (and/or merge that commit to `release`). [Publish Go](../../.github/workflows/publish-go.yml) runs tests, creates a GitHub Release, and best-effort pings `proxy.golang.org`.

Root milestone tag `v0.7.0` alone does **not** publish this module. Leaving npm at `0.6.0` while shipping Go `0.7.0` is intentional and supported.

CI policy (path filters, lint, pass-markers): [`.github/CI.md`](../../.github/CI.md).

## Out of scope (v0.7.0)

- GORM backends other than SQLite
- Configurable primary-key column names
- ORM model mapping, migrations, full-text search, offset pagination
- Product E2E in CI
