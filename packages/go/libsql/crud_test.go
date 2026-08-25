package libsql_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/b4moss/crudian/go/crudian"
	libsqlcrud "github.com/b4moss/crudian/go/libsql"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite" // required by libsql-client-go for file:// URLs
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	path, err := filepath.Abs(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	// libsql file URLs must be file:///...; companion sqlite driver required.
	db, err := sql.Open("libsql", "file://"+filepath.ToSlash(path))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		score INTEGER NOT NULL,
		note TEXT
	)`); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func mustCreateCrud(t *testing.T, db *sql.DB) *libsqlcrud.Crud {
	t.Helper()
	crud, err := libsqlcrud.CreateCrud(db)
	if err != nil {
		t.Fatalf("CreateCrud: %v", err)
	}
	return crud
}

func TestCreateCrud(t *testing.T) {
	db := openDB(t)
	crud := mustCreateCrud(t, db)
	if crud.DB != db {
		t.Fatal("expected same *sql.DB")
	}
	if _, err := libsqlcrud.CreateCrud(nil); err == nil {
		t.Fatal("expected nil db error")
	}
}

func TestCoreCrud(t *testing.T) {
	ctx := context.Background()
	crud := mustCreateCrud(t, openDB(t))

	created, err := crud.Create(ctx, "items", crudian.Row{"name": "alice", "score": 10})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if toInt64(created["id"]) == 0 || created["name"] != "alice" {
		t.Fatalf("create row: %+v", created)
	}
	id := created["id"]

	got, err := crud.Read(ctx, "items", crudian.ReadQuery{Where: crudian.Where().Eq("id", id)})
	if err != nil || got == nil || got["name"] != "alice" {
		t.Fatalf("read: %+v err=%v", got, err)
	}

	proj, err := crud.Read(ctx, "items", crudian.ReadQuery{
		Columns: []string{"name"},
		Where:   crudian.Where().Eq("id", id),
	})
	if err != nil || proj == nil || proj["name"] != "alice" {
		t.Fatalf("columns: %+v err=%v", proj, err)
	}
	if _, ok := proj["score"]; ok {
		t.Fatalf("score should be projected out: %+v", proj)
	}

	miss, err := crud.Read(ctx, "items", crudian.ReadQuery{Where: crudian.Where().Eq("id", 99999)})
	if err != nil || miss != nil {
		t.Fatalf("miss: %+v err=%v", miss, err)
	}

	updated, err := crud.Update(ctx, "items", crudian.Row{"score": 11}, crudian.UpdateQuery{Where: crudian.Where().Eq("id", id)})
	if err != nil || updated == nil || toInt64(updated["score"]) != 11 || updated["name"] != "alice" {
		t.Fatalf("update: %+v err=%v", updated, err)
	}

	none, err := crud.Update(ctx, "items", crudian.Row{"score": 1}, crudian.UpdateQuery{Where: crudian.Where().Eq("id", 99999)})
	if err != nil || none != nil {
		t.Fatalf("update miss: %+v err=%v", none, err)
	}

	n, err := crud.Delete(ctx, "items", crudian.DeleteQuery{Where: crudian.Where().Eq("id", id)})
	if err != nil || n != 1 {
		t.Fatalf("delete: %d %v", n, err)
	}
	z, err := crud.Delete(ctx, "items", crudian.DeleteQuery{Where: crudian.Where().Eq("id", id)})
	if err != nil || z != 0 {
		t.Fatalf("delete zero: %d %v", z, err)
	}

	if _, err := crud.Create(ctx, "", crudian.Row{"name": "x", "score": 1}); err == nil {
		t.Fatal("empty table should fail")
	}
}

func TestSearchListCount(t *testing.T) {
	ctx := context.Background()
	crud := mustCreateCrud(t, openDB(t))

	for _, name := range []string{"a", "b", "c"} {
		if _, err := crud.Create(ctx, "items", crudian.Row{"name": name, "score": 1}); err != nil {
			t.Fatal(err)
		}
	}

	page, err := crud.Search(ctx, "items", crudian.SearchQuery{Limit: 2})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 2 || !page.HasMore || page.NextCursor == nil || page.Total != 3 {
		t.Fatalf("page1: %+v", page)
	}
	page2, err := crud.Search(ctx, "items", crudian.SearchQuery{Limit: 2, Cursor: page.NextCursor})
	if err != nil || len(page2.Items) != 1 || page2.HasMore || page2.Total != 3 {
		t.Fatalf("page2: %+v %v", page2, err)
	}

	list, err := crud.List(ctx, "items", crudian.SearchQuery{Limit: 2})
	if err != nil || list.Total != page.Total || len(list.Items) != len(page.Items) {
		t.Fatalf("list alias: %+v vs %+v", list, page)
	}

	found, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Where: crudian.Where().Eq("name", "b"),
		Limit: 10,
	})
	if err != nil || len(found.Items) != 1 || found.Total != 1 {
		t.Fatalf("eq: %+v %v", found, err)
	}

	or, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Where: crudian.Where().Eq("name", "a").Or(crudian.Where().Eq("name", "c")),
		Limit: 10,
	})
	if err != nil || or.Total != 2 {
		t.Fatalf("or: %+v %v", or, err)
	}

	in, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Where: crudian.Where().In("name", []any{"a", "b"}),
		Limit: 10,
	})
	if err != nil || in.Total != 2 {
		t.Fatalf("in: %+v %v", in, err)
	}

	like, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Where: crudian.Where().Like("name", "a%"),
		Limit: 10,
	})
	if err != nil || like.Total != 1 {
		t.Fatalf("like: %+v %v", like, err)
	}

	if _, err := crud.Create(ctx, "items", crudian.Row{"name": "n", "score": 0}); err != nil {
		t.Fatal(err)
	}
	if _, err := crud.DB.Exec(`UPDATE items SET note = NULL WHERE name = ?`, "n"); err != nil {
		t.Fatal(err)
	}
	isnull, err := crud.Search(ctx, "items", crudian.SearchQuery{
		Where: crudian.Where().IsNull("note"),
		Limit: 10,
	})
	if err != nil || isnull.Total < 1 {
		t.Fatalf("isNull: %+v %v", isnull, err)
	}

	cnt, err := crud.Count(ctx, "items", crudian.CountQuery{})
	if err != nil || cnt < 3 {
		t.Fatalf("count: %d %v", cnt, err)
	}
	cntW, err := crud.Count(ctx, "items", crudian.CountQuery{Where: crudian.Where().Eq("name", "a")})
	if err != nil || cntW != 1 {
		t.Fatalf("count where: %d %v", cntW, err)
	}

	if _, err := crud.Search(ctx, "items", crudian.SearchQuery{Limit: -1}); err == nil {
		t.Fatal("bad limit")
	}
	if _, err := crud.Search(ctx, "items", crudian.SearchQuery{Where: crudian.Where().In("name", []any{}), Limit: 10}); err == nil {
		t.Fatal("empty in")
	}
}

func TestExtendedWrites(t *testing.T) {
	ctx := context.Background()
	crud := mustCreateCrud(t, openDB(t))

	ins, err := crud.Upsert(ctx, "items", crudian.Row{"id": int64(10), "name": "new", "score": 1})
	if err != nil || toInt64(ins["id"]) != 10 {
		t.Fatalf("upsert insert: %+v %v", ins, err)
	}
	upd, err := crud.Upsert(ctx, "items", crudian.Row{"id": int64(10), "name": "upd", "score": 9})
	if err != nil || upd["name"] != "upd" || toInt64(upd["score"]) != 9 {
		t.Fatalf("upsert update: %+v %v", upd, err)
	}
	if _, err := crud.Upsert(ctx, "items", crudian.Row{"name": "x", "score": 1}); err == nil {
		t.Fatal("upsert without id")
	}

	src, err := crud.Create(ctx, "items", crudian.Row{"name": "src", "score": 5})
	if err != nil {
		t.Fatal(err)
	}
	dup, err := crud.Duplicate(ctx, "items", crudian.DuplicateQuery{
		Where:     crudian.Where().Eq("id", src["id"]),
		Overrides: crudian.Row{"name": "dup"},
	})
	if err != nil || dup["name"] != "dup" || toInt64(dup["id"]) == toInt64(src["id"]) {
		t.Fatalf("dup: %+v %v", dup, err)
	}
	miss, err := crud.Duplicate(ctx, "items", crudian.DuplicateQuery{Where: crudian.Where().Eq("id", 99999)})
	if err != nil || miss != nil {
		t.Fatalf("dup miss: %+v %v", miss, err)
	}

	n, err := crud.BulkCreate(ctx, "items", []crudian.Row{
		{"name": "b1", "score": 1},
		{"name": "b2", "score": 2},
	})
	if err != nil || n != 2 {
		t.Fatalf("bulkCreate: %d %v", n, err)
	}
	if z, err := crud.BulkCreate(ctx, "items", nil); err != nil || z != 0 {
		t.Fatalf("bulkCreate empty: %d %v", z, err)
	}

	un, err := crud.BulkUpdate(ctx, "items", crudian.Row{"score": 99}, crudian.UpdateQuery{
		Where: crudian.Where().Gte("score", 1).And(crudian.Where().Lte("score", 2)),
	})
	if err != nil || un < 1 {
		t.Fatalf("bulkUpdate: %d %v", un, err)
	}

	bn, err := crud.BulkUpsert(ctx, "items", []crudian.Row{
		{"id": int64(20), "name": "u1", "score": 1},
		{"id": int64(21), "name": "u2", "score": 2},
	})
	if err != nil || bn != 2 {
		t.Fatalf("bulkUpsert: %d %v", bn, err)
	}
	if _, err := crud.BulkUpsert(ctx, "items", []crudian.Row{{"name": "no-id", "score": 1}}); err == nil {
		t.Fatal("bulkUpsert without id")
	}

	dn, err := crud.BulkDelete(ctx, "items", crudian.DeleteQuery{Where: crudian.Where().Gte("id", 20)})
	if err != nil || dn < 1 {
		t.Fatalf("bulkDelete: %d %v", dn, err)
	}
	if _, err := crud.BulkUpdate(ctx, "items", crudian.Row{"score": 1}, crudian.UpdateQuery{}); err == nil {
		t.Fatal("bulkUpdate needs where")
	}
}

func TestTransaction(t *testing.T) {
	ctx := context.Background()
	crud := mustCreateCrud(t, openDB(t))

	err := crud.Transaction(ctx, func(tx *crudian.Crud) error {
		if _, err := tx.Create(ctx, "items", crudian.Row{"name": "t1", "score": 1}); err != nil {
			return err
		}
		if _, err := tx.Create(ctx, "items", crudian.Row{"name": "t2", "score": 2}); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	cnt, err := crud.Count(ctx, "items", crudian.CountQuery{})
	if err != nil || cnt != 2 {
		t.Fatalf("committed: %d %v", cnt, err)
	}

	err = crud.Transaction(ctx, func(tx *crudian.Crud) error {
		if _, err := tx.Create(ctx, "items", crudian.Row{"name": "boom", "score": 3}); err != nil {
			return err
		}
		return crudian.NewError("rollback")
	})
	if err == nil {
		t.Fatal("expected rollback error")
	}
	cnt2, err := crud.Count(ctx, "items", crudian.CountQuery{})
	if err != nil || cnt2 != 2 {
		t.Fatalf("rolled back: %d %v", cnt2, err)
	}
}

func toInt64(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case int32:
		return int64(n)
	case float64:
		return int64(n)
	default:
		return 0
	}
}
