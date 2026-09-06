package gorm_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/b4moss/crudian/go/crudian"
	gormcrud "github.com/b4moss/crudian/go/gorm"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func openItemIDDB(t *testing.T) *gorm.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "pk.db")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.Exec(`CREATE TABLE items (
		item_id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		score INTEGER NOT NULL,
		note TEXT
	)`).Error; err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestConfigurablePK(t *testing.T) {
	ctx := context.Background()
	db := openItemIDDB(t)
	crud, err := gormcrud.CreateCrud(db, crudian.Options{PK: "item_id"})
	if err != nil {
		t.Fatalf("CreateCrud: %v", err)
	}

	created, err := crud.Create(ctx, "items", crudian.Row{"name": "a", "score": 1})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if toInt64(created["item_id"]) == 0 {
		t.Fatalf("expected item_id: %+v", created)
	}

	for _, name := range []string{"b", "c", "d", "e"} {
		if _, err := crud.Create(ctx, "items", crudian.Row{"name": name, "score": 1}); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	page1, err := crud.Search(ctx, "items", crudian.SearchQuery{Paging: "cursor", Limit: 2})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if !page1.HasMore || toInt64(page1.NextCursor) != 2 {
		t.Fatalf("page1: %+v", page1)
	}
	page2, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Paging: "cursor",
		Limit:  2,
		Cursor: page1.NextCursor,
	})
	if err != nil || len(page2.Items) != 2 {
		t.Fatalf("page2: %+v err=%v", page2, err)
	}

	up, err := crud.Upsert(ctx, "items", crudian.Row{"item_id": int64(10), "name": "x", "score": 9})
	if err != nil || toInt64(up["item_id"]) != 10 {
		t.Fatalf("upsert insert: %+v err=%v", up, err)
	}
	up2, err := crud.Upsert(ctx, "items", crudian.Row{"item_id": int64(10), "name": "y"})
	if err != nil || up2["name"] != "y" || toInt64(up2["score"]) != 9 {
		t.Fatalf("upsert update: %+v err=%v", up2, err)
	}

	dup, err := crud.Duplicate(ctx, "items", crudian.DuplicateQuery{
		Where:     crudian.Where().Eq("item_id", created["item_id"]),
		Overrides: crudian.Row{"name": "dup"},
	})
	if err != nil || dup["name"] != "dup" || toInt64(dup["item_id"]) == toInt64(created["item_id"]) {
		t.Fatalf("duplicate: %+v err=%v", dup, err)
	}

	n, err := crud.BulkUpsert(ctx, "items", []crudian.Row{
		{"item_id": int64(20), "name": "u1", "score": 1},
		{"item_id": int64(21), "name": "u2", "score": 2},
	})
	if err != nil || n != 2 {
		t.Fatalf("bulkUpsert: n=%d err=%v", n, err)
	}

	err = crud.Transaction(ctx, func(tx *crudian.Crud) error {
		row, err := tx.Create(ctx, "items", crudian.Row{"name": "tx", "score": 1})
		if err != nil {
			return err
		}
		if toInt64(row["item_id"]) == 0 {
			t.Fatalf("tx create: %+v", row)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("tx: %v", err)
	}
}

func TestConfigurablePKErrors(t *testing.T) {
	ctx := context.Background()
	db := openDB(t)
	crud, err := gormcrud.CreateCrud(db, crudian.Options{PK: "item_id"})
	if err != nil {
		t.Fatalf("CreateCrud: %v", err)
	}
	_, err = crud.Create(ctx, "items", crudian.Row{"name": "a", "score": 1})
	if err == nil || !strings.Contains(err.Error(), "item_id") || !strings.Contains(err.Error(), "items") {
		t.Fatalf("expected missing pk column error, got %v", err)
	}

	db2 := openItemIDDB(t)
	crud2, err := gormcrud.CreateCrud(db2, crudian.Options{PK: "item_id"})
	if err != nil {
		t.Fatalf("CreateCrud: %v", err)
	}
	_, err = crud2.Upsert(ctx, "items", crudian.Row{"name": "a", "score": 1})
	if err == nil || !strings.Contains(err.Error(), "item_id") {
		t.Fatalf("expected upsert pk required, got %v", err)
	}
}

func TestConfigurablePKDefaultID(t *testing.T) {
	ctx := context.Background()
	crud := mustCreateCrud(t, openDB(t))
	created, err := crud.Create(ctx, "items", crudian.Row{"name": "a", "score": 1})
	if err != nil || toInt64(created["id"]) == 0 {
		t.Fatalf("default id: %+v err=%v", created, err)
	}
	_, err = crud.Upsert(ctx, "items", crudian.Row{"name": "no-id"})
	if err == nil {
		t.Fatal("expected upsert without id to fail")
	}
}
