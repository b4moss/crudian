package libsql_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/b4moss/crudian/go/crudian"
	libsqlcrud "github.com/b4moss/crudian/go/libsql"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite" // required by libsql-client-go for file:// URLs
)

func openItemIDDB(t *testing.T) *sql.DB {
	t.Helper()
	path, err := filepath.Abs(filepath.Join(t.TempDir(), "pk.db"))
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	db, err := sql.Open("libsql", "file://"+filepath.ToSlash(path))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE items (
		item_id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		score INTEGER NOT NULL,
		note TEXT
	)`); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestConfigurablePKSmoke(t *testing.T) {
	ctx := context.Background()
	crud, err := libsqlcrud.CreateCrud(openItemIDDB(t), crudian.Options{PK: "item_id"})
	if err != nil {
		t.Fatalf("CreateCrud: %v", err)
	}
	created, err := crud.Create(ctx, "items", crudian.Row{"name": "a", "score": 1})
	if err != nil || toInt64(created["item_id"]) == 0 {
		t.Fatalf("create: %+v err=%v", created, err)
	}
	page, err := crud.Search(ctx, "items", crudian.SearchQuery{Paging: "offset", Limit: 10})
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("search: %+v err=%v", page, err)
	}
	_, err = crud.Upsert(ctx, "items", crudian.Row{"name": "missing-pk"})
	if err == nil || !strings.Contains(err.Error(), "item_id") {
		t.Fatalf("expected upsert pk error, got %v", err)
	}
}
