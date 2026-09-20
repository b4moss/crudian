package gorm_test

import (
	"context"
	"os"
	"testing"

	"github.com/b4moss/crudian/go/crudian"
	gormcrud "github.com/b4moss/crudian/go/gorm"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func serverURL(env, fallback string) string {
	if v := os.Getenv(env); v != "" {
		return v
	}
	return fallback
}

func openPostgres(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := serverURL(
		"DATABASE_URL_POSTGRES",
		"host=127.0.0.1 user=crudian password=crudian dbname=crudian port=5432 sslmode=disable",
	)
	// Accept URI form from docker compose
	if len(dsn) > 11 && dsn[:11] == "postgres://" || len(dsn) > 13 && dsn[:13] == "postgresql://" {
		db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err != nil {
			t.Skipf("postgres unavailable: %v", err)
		}
		return db
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	return db
}

func openMySQL(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := serverURL(
		"DATABASE_URL_MYSQL_DSN",
		"crudian:crudian@tcp(127.0.0.1:3306)/crudian?parseTime=true&charset=utf8mb4",
	)
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Skipf("mysql unavailable: %v", err)
	}
	return db
}

func migrateItemsPG(t *testing.T, db *gorm.DB) {
	t.Helper()
	_ = db.Exec(`DROP TABLE IF EXISTS items`).Error
	_ = db.Exec(`DROP TABLE IF EXISTS alt_items`).Error
	if err := db.Exec(`CREATE TABLE items (
		id SERIAL PRIMARY KEY,
		name TEXT NOT NULL,
		score INTEGER NOT NULL DEFAULT 0,
		note TEXT
	)`).Error; err != nil {
		t.Fatalf("migrate: %v", err)
	}
}

func migrateItemsMySQL(t *testing.T, db *gorm.DB) {
	t.Helper()
	_ = db.Exec(`DROP TABLE IF EXISTS items`).Error
	_ = db.Exec(`DROP TABLE IF EXISTS alt_items`).Error
	if err := db.Exec(`CREATE TABLE items (
		id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		score INT NOT NULL DEFAULT 0,
		note TEXT NULL
	) ENGINE=InnoDB`).Error; err != nil {
		t.Fatalf("migrate: %v", err)
	}
}

func runServerDialectContract(t *testing.T, db *gorm.DB, driver string) {
	t.Helper()
	ctx := context.Background()
	crud, err := gormcrud.CreateCrud(db, crudian.Options{Driver: driver})
	if err != nil {
		t.Fatalf("CreateCrud: %v", err)
	}

	created, err := crud.Create(ctx, "items", crudian.Row{"name": "alice", "score": 10})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created["name"] != "alice" {
		t.Fatalf("create row: %+v", created)
	}
	id := created["id"]

	got, err := crud.Read(ctx, "items", crudian.ReadQuery{Where: crudian.Where().Eq("id", id)})
	if err != nil || got == nil || got["name"] != "alice" {
		t.Fatalf("read: %+v err=%v", got, err)
	}

	updated, err := crud.Update(ctx, "items", crudian.Row{"score": 20}, crudian.UpdateQuery{
		Where: crudian.Where().Eq("id", id),
	})
	if err != nil || updated == nil || toInt64(updated["score"]) != 20 {
		t.Fatalf("update: %+v err=%v", updated, err)
	}

	n, err := crud.Count(ctx, "items", crudian.CountQuery{})
	if err != nil || n != 1 {
		t.Fatalf("count: %d err=%v", n, err)
	}
	exists, err := crud.Exists(ctx, "items", crudian.ExistsQuery{Where: crudian.Where().Eq("name", "alice")})
	if err != nil || !exists {
		t.Fatalf("exists: %v err=%v", exists, err)
	}

	page, err := crud.Search(ctx, "items", crudian.SearchQuery{Limit: 10})
	if err != nil || len(page.Items) != 1 || page.Total != 1 {
		t.Fatalf("search: %+v err=%v", page, err)
	}

	up, err := crud.Upsert(ctx, "items", crudian.Row{"id": id, "name": "alice", "score": 30})
	if err != nil || toInt64(up["score"]) != 30 {
		t.Fatalf("upsert: %+v err=%v", up, err)
	}

	maxOpen := 5
	crud2, err := gormcrud.CreateCrud(db, crudian.Options{
		Driver: driver,
		Pool:   &crudian.PoolOptions{MaxOpenConns: &maxOpen},
	})
	if err != nil {
		t.Fatalf("pool CreateCrud: %v", err)
	}
	if _, err := crud2.Count(ctx, "items", crudian.CountQuery{}); err != nil {
		t.Fatalf("pool count: %v", err)
	}

	del, err := crud.Delete(ctx, "items", crudian.DeleteQuery{Where: crudian.Where().Eq("id", id)})
	if err != nil || del != 1 {
		t.Fatalf("delete: %d err=%v", del, err)
	}
}

func TestPostgresDialectContract(t *testing.T) {
	db := openPostgres(t)
	migrateItemsPG(t, db)
	runServerDialectContract(t, db, "postgres")
}

func TestMySQLDialectContract(t *testing.T) {
	db := openMySQL(t)
	migrateItemsMySQL(t, db)
	runServerDialectContract(t, db, "mysql")
}
