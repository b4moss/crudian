package crudian

import "testing"

func TestCompileWhereOps(t *testing.T) {
	d := SqliteDialect{}
	c, err := compileWhere(d, Where().Eq("name", "a").ToNode())
	if err != nil || c.SQL == "" || len(c.Args) != 1 {
		t.Fatalf("eq: %+v %v", c, err)
	}
	c, err = compileWhere(d, Where().In("id", []any{1, 2}).ToNode())
	if err != nil || len(c.Args) != 2 {
		t.Fatalf("in: %+v %v", c, err)
	}
	_, err = compileWhere(d, Where().In("id", []any{}).ToNode())
	if err == nil {
		t.Fatal("empty in")
	}
	_, err = compileWhere(d, Where().Eq("", "x").ToNode())
	if err == nil {
		t.Fatal("empty column")
	}
	c, err = compileWhere(d, Where().Eq("a", 1).Or(Where().Eq("b", 2)).ToNode())
	if err != nil || c.SQL == "" {
		t.Fatalf("or: %+v %v", c, err)
	}
	c, err = compileWhere(d, Where().IsNull("note").ToNode())
	if err != nil {
		t.Fatal(err)
	}
	if c.SQL != `"note" IS NULL` {
		t.Fatalf("isNull: %q", c.SQL)
	}
}
