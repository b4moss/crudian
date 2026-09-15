package crudian_test

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/b4moss/crudian/go/crudian"
	_ "modernc.org/sqlite"
)

func openSQLDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "pool.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func intPtr(v int) *int { return &v }

func TestApplyPool(t *testing.T) {
	db := openSQLDB(t)

	if err := crudian.ApplyPool(nil, &crudian.PoolOptions{MaxOpenConns: intPtr(3)}); err == nil {
		t.Fatal("expected nil db error")
	}
	if err := crudian.ApplyPool(db, nil); err != nil {
		t.Fatalf("nil pool: %v", err)
	}

	if err := crudian.ApplyPool(db, &crudian.PoolOptions{MaxOpenConns: intPtr(7)}); err != nil {
		t.Fatalf("apply max open: %v", err)
	}
	if got := db.Stats().MaxOpenConnections; got != 7 {
		t.Fatalf("MaxOpenConnections: got %d want 7", got)
	}

	idle := 2
	lifetime := 30 * time.Second
	idleTime := 5 * time.Second
	if err := crudian.ApplyPool(db, &crudian.PoolOptions{
		MaxIdleConns:    &idle,
		ConnMaxLifetime: &lifetime,
		ConnMaxIdleTime: &idleTime,
	}); err != nil {
		t.Fatalf("apply rest: %v", err)
	}
	// MaxOpen should remain from previous apply (field was nil this call).
	if got := db.Stats().MaxOpenConnections; got != 7 {
		t.Fatalf("MaxOpenConnections unchanged: got %d want 7", got)
	}
}
