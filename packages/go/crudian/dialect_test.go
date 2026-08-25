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
}
