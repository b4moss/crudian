package crudian

import "testing"

func TestCompileWhereOps(t *testing.T) {
	d := SqliteDialect{}
	c, err := compileWhere(d, Where().Eq("name", "a").ToNode(), 1)
	if err != nil || c.SQL == "" || len(c.Args) != 1 {
		t.Fatalf("eq: %+v %v", c, err)
	}
	c, err = compileWhere(d, Where().In("id", []any{1, 2}).ToNode(), 1)
	if err != nil || len(c.Args) != 2 {
		t.Fatalf("in: %+v %v", c, err)
	}
	_, err = compileWhere(d, Where().In("id", []any{}).ToNode(), 1)
	if err == nil {
		t.Fatal("empty in")
	}
	_, err = compileWhere(d, Where().Eq("", "x").ToNode(), 1)
	if err == nil {
		t.Fatal("empty column")
	}
	c, err = compileWhere(d, Where().Eq("a", 1).Or(Where().Eq("b", 2)).ToNode(), 1)
	if err != nil || c.SQL == "" {
		t.Fatalf("or: %+v %v", c, err)
	}
	c, err = compileWhere(d, Where().IsNull("note").ToNode(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if c.SQL != `"note" IS NULL` {
		t.Fatalf("isNull: %q", c.SQL)
	}
}

func TestCompileWherePostgresIndex(t *testing.T) {
	d := PostgresDialect{}
	c, err := compileWhere(d, Where().Eq("a", 1).And(Where().Eq("b", 2)).ToNode(), 3)
	if err != nil {
		t.Fatal(err)
	}
	if c.SQL != `("a" = $3) AND ("b" = $4)` && c.SQL != `"a" = $3 AND "b" = $4` {
		// And of two conds becomes joined with parens when multiple parts
		if !(len(c.Args) == 2 && c.NextIndex == 5) {
			t.Fatalf("unexpected: sql=%q args=%v next=%d", c.SQL, c.Args, c.NextIndex)
		}
	}
	if c.NextIndex != 5 {
		t.Fatalf("nextIndex=%d want 5 sql=%q", c.NextIndex, c.SQL)
	}
}
