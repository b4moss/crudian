# Go module (`github.com/b4moss/crudian/go`)

CRUD facade matching the JS `@b4moss/crudian` contract, for GORM (SQLite) and libSQL.

## Install

```bash
go get github.com/b4moss/crudian/go@latest
```

Requires Go 1.22+ (CI uses Go 1.26).

## GORM / SQLite

```go
package main

import (
	"context"

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
	_ = row
	page, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Where: crudian.Where().Eq("name", "alpha"),
		Limit: 20,
	})
	if err != nil {
		panic(err)
	}
	_ = page
}
```

## libSQL

Inject a `*sql.DB` opened with `github.com/tursodatabase/libsql-client-go/libsql` (first choice per v0.7.0).

For local `file://` URLs that driver delegates to a registered `sqlite` / `sqlite3` driver — import one (e.g. `modernc.org/sqlite`) alongside libsql. Prefer absolute `file:///...` paths; avoid `:memory:` when using transactions.

Upstream marks `libsql-client-go` deprecated in favor of `go-libsql` / `tursogo`. We still target the official client API for this milestone; if it becomes unusable, fall back to `go-libsql` (CGO) and note the reason here.

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
```

## Notes

- Rows are `map[string]any` (`crudian.Row`). No ORM model mapping.
- All methods take `context.Context` first.
- Upsert / cursor pagination assume primary key column `id`.
- Connections are caller-owned; `CreateCrud` does not open DBs.
- Postgres/MySQL dialects are stubs (out of scope for v0.7.0).
