package crudian_test

import (
	"testing"

	"github.com/b4moss/crudian/go/crudian"
)

func TestSqliteDialect(t *testing.T) {
	d := crudian.SqliteDialect{}
	if got := d.QuoteIdent(`na"me`); got != `"na""me"` {
		t.Fatalf("quote: %q", got)
	}
	if d.Placeholder(1) != "?" || d.Placeholder(99) != "?" {
		t.Fatal("placeholder")
	}
	if !d.SupportsInsertReturning() {
		t.Fatal("sqlite should support returning")
	}
}

func TestPostgresDialect(t *testing.T) {
	d := crudian.PostgresDialect{}
	if d.Placeholder(2) != "$2" {
		t.Fatalf("ph: %q", d.Placeholder(2))
	}
	if !d.SupportsInsertReturning() {
		t.Fatal("pg returning")
	}
	sql, args := d.DescribeColumns("items")
	if len(args) != 1 || args[0] != "items" || sql == "" {
		t.Fatalf("describe: %q %v", sql, args)
	}
}

func TestMySQLDialect(t *testing.T) {
	d := crudian.MySQLDialect{}
	if got := d.QuoteIdent("a`b"); got != "`a``b`" {
		t.Fatalf("quote: %q", got)
	}
	if d.SupportsInsertReturning() {
		t.Fatal("mysql should not rely on returning")
	}
	if d.LastInsertIDSQL() == "" {
		t.Fatal("last insert id")
	}
}

func TestResolveDialect(t *testing.T) {
	d, err := crudian.ResolveDialect("postgres")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := d.(crudian.PostgresDialect); !ok {
		t.Fatalf("%T", d)
	}
	_, err = crudian.ResolveDialect("nope")
	if err == nil {
		t.Fatal("expected error")
	}
}
