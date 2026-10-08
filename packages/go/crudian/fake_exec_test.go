package crudian

import (
	"context"
	"strings"
	"sync"
	"testing"
)

// memExec is a minimal in-memory Executor for covering Crud paths without a DB.
type memExec struct {
	mu      sync.Mutex
	tables  map[string][]Row
	seq     map[string]int64
	failSQL string
}

func newMemExec() *memExec {
	return &memExec{
		tables: map[string][]Row{},
		seq:    map[string]int64{},
	}
}

func (m *memExec) cloneRow(r Row) Row {
	out := Row{}
	for k, v := range r {
		out[k] = v
	}
	return out
}

func (m *memExec) Run(ctx context.Context, sql string, args ...any) (int64, error) {
	_ = ctx
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSQL != "" && strings.Contains(sql, m.failSQL) {
		return 0, NewError("forced fail")
	}
	upper := strings.ToUpper(strings.TrimSpace(sql))
	switch {
	case strings.HasPrefix(upper, "INSERT INTO"):
		tbl := extractIdent(sql, "INSERT INTO")
		m.seq[tbl]++
		row := Row{"id": m.seq[tbl]}
		if len(args) >= 1 {
			row["name"] = args[0]
		}
		if len(args) >= 2 {
			row["score"] = args[1]
		}
		// explicit id in cols shifts args (id, name, score) when sorted: id, name, score
		if len(args) >= 3 {
			row["id"] = args[0]
			row["name"] = args[1]
			row["score"] = args[2]
			if v := toInt64(args[0]); v > m.seq[tbl] {
				m.seq[tbl] = v
			}
		}
		m.tables[tbl] = append(m.tables[tbl], m.cloneRow(row))
		return 1, nil
	case strings.HasPrefix(upper, "UPDATE"):
		// naive: update all rows in first mentioned table when WHERE id =
		tbl := extractIdent(sql, "UPDATE")
		rows := m.tables[tbl]
		var n int64
		for i := range rows {
			// apply SET from args pairing is hard; mark touched when WHERE matches last arg as id
			if len(args) >= 2 {
				id := args[len(args)-1]
				if rows[i]["id"] == id || toInt64(rows[i]["id"]) == toInt64(id) {
					// set score/name from earlier args if present in SQL
					if strings.Contains(sql, `"score"`) || strings.Contains(sql, "`score`") {
						rows[i]["score"] = args[0]
					}
					if strings.Contains(sql, `"name"`) || strings.Contains(sql, "`name`") {
						// name may be first or only set
						if !strings.Contains(sql, "score") {
							rows[i]["name"] = args[0]
						} else if len(args) >= 3 {
							// sorted keys: name before score
							rows[i]["name"] = args[0]
							rows[i]["score"] = args[1]
						}
					}
					n++
				}
			}
		}
		m.tables[tbl] = rows
		return n, nil
	case strings.HasPrefix(upper, "DELETE"):
		tbl := extractIdent(sql, "DELETE FROM")
		rows := m.tables[tbl]
		kept := rows[:0]
		var n int64
		id := any(nil)
		if len(args) > 0 {
			id = args[0]
		}
		for _, r := range rows {
			if id != nil && (r["id"] == id || toInt64(r["id"]) == toInt64(id)) {
				n++
				continue
			}
			kept = append(kept, r)
		}
		m.tables[tbl] = kept
		return n, nil
	default:
		return 0, nil
	}
}

func (m *memExec) Get(ctx context.Context, sql string, args ...any) (Row, error) {
	_ = ctx
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSQL != "" && strings.Contains(sql, m.failSQL) {
		return nil, NewError("forced fail")
	}
	upper := strings.ToUpper(strings.TrimSpace(sql))
	switch {
	case strings.Contains(upper, "PRAGMA TABLE_INFO") || strings.Contains(upper, "INFORMATION_SCHEMA"):
		return nil, nil // All() used for describe
	case strings.Contains(upper, "LAST_INSERT_ROWID") || strings.Contains(upper, "LAST_INSERT_ID") || strings.Contains(upper, "LASTVAL"):
		return Row{"id": m.seq["items"]}, nil
	case strings.HasPrefix(upper, "INSERT INTO") && strings.Contains(upper, "RETURNING"):
		tbl := extractIdent(sql, "INSERT INTO")
		m.seq[tbl]++
		row := Row{"id": m.seq[tbl]}
		// VALUES (?, ?) with sorted keys name, score typically
		if len(args) >= 1 {
			row["name"] = args[0]
		}
		if len(args) >= 2 {
			row["score"] = args[1]
		}
		m.tables[tbl] = append(m.tables[tbl], m.cloneRow(row))
		return m.cloneRow(row), nil
	case strings.HasPrefix(upper, "SELECT COUNT"):
		if strings.Contains(upper, "_CRUDIAN_GROUPS") || strings.Contains(sql, "_crudian_groups") {
			return Row{"row_count": int64(len(m.tables["items"]))}, nil
		}
		return Row{"row_count": int64(len(m.tables["items"]))}, nil
	case strings.HasPrefix(upper, "SELECT 1"):
		if len(m.tables["items"]) == 0 {
			return nil, nil
		}
		return Row{"ok": 1}, nil
	case strings.HasPrefix(upper, "SELECT"):
		tbl := "items"
		if strings.Contains(sql, `"items"`) || strings.Contains(sql, "`items`") {
			tbl = "items"
		}
		rows := m.tables[tbl]
		if len(args) > 0 {
			for _, r := range rows {
				if r["id"] == args[0] || toInt64(r["id"]) == toInt64(args[0]) {
					return m.cloneRow(r), nil
				}
			}
			return nil, nil
		}
		if len(rows) == 0 {
			return nil, nil
		}
		return m.cloneRow(rows[0]), nil
	default:
		return nil, nil
	}
}

func (m *memExec) All(ctx context.Context, sql string, args ...any) ([]Row, error) {
	_ = ctx
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSQL != "" && strings.Contains(sql, m.failSQL) {
		return nil, NewError("forced fail")
	}
	upper := strings.ToUpper(strings.TrimSpace(sql))
	if strings.Contains(upper, "PRAGMA TABLE_INFO") || strings.Contains(upper, "INFORMATION_SCHEMA") {
		return []Row{{"name": "id"}, {"name": "name"}, {"name": "score"}, {"name": "note"}}, nil
	}
	rows := m.tables["items"]
	out := make([]Row, 0, len(rows))
	for _, r := range rows {
		out = append(out, m.cloneRow(r))
	}
	// cursor / limit: if last arg is limit+1 style, trim
	if len(args) > 0 {
		if lim, ok := args[len(args)-1].(int); ok && lim > 0 && len(out) > lim {
			out = out[:lim]
		}
	}
	return out, nil
}

func (m *memExec) Transaction(ctx context.Context, fn func(tx Executor) error) error {
	return fn(m)
}

func extractIdent(sql, after string) string {
	i := strings.Index(strings.ToUpper(sql), strings.ToUpper(after))
	if i < 0 {
		return "items"
	}
	rest := strings.TrimSpace(sql[i+len(after):])
	rest = strings.TrimLeft(rest, "`\"")
	end := 0
	for end < len(rest) && rest[end] != '`' && rest[end] != '"' && rest[end] != ' ' && rest[end] != '\n' {
		end++
	}
	if end == 0 {
		return "items"
	}
	return rest[:end]
}

func TestNewCrudOptionsAndDialects(t *testing.T) {
	ex := newMemExec()
	c := NewCrud(ex, nil)
	if _, ok := c.d.(SqliteDialect); !ok {
		t.Fatalf("default dialect %T", c.d)
	}
	c = NewCrud(ex, nil, Options{Driver: "mysql", PK: "item_id"})
	if _, ok := c.d.(MySQLDialect); !ok || c.pk != "item_id" {
		t.Fatalf("mysql opts: %T pk=%s", c.d, c.pk)
	}
	c = NewCrud(ex, nil, Options{Driver: "nope"})
	if _, ok := c.d.(SqliteDialect); !ok {
		t.Fatalf("bad driver fallback %T", c.d)
	}
	c = NewCrud(ex, PostgresDialect{}, Options{Dialect: MySQLDialect{}})
	if _, ok := c.d.(PostgresDialect); !ok {
		t.Fatalf("explicit dialect wins: %T", c.d)
	}
	d, err := resolveOptionsDialect(nil)
	if err != nil || d == nil {
		t.Fatal(err)
	}
	d, err = resolveOptionsDialect([]Options{{Dialect: PostgresDialect{}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := d.(PostgresDialect); !ok {
		t.Fatalf("%T", d)
	}
	d, err = resolveOptionsDialect([]Options{{Driver: "postgresql"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := d.(PostgresDialect); !ok {
		t.Fatalf("%T", d)
	}
}

func TestDialectGaps(t *testing.T) {
	s := SqliteDialect{}
	if s.LastInsertIDSQL() == "" {
		t.Fatal("sqlite last insert")
	}
	sql, args := s.DescribeColumns("t")
	if sql == "" || args != nil {
		t.Fatalf("pragma: %q %v", sql, args)
	}
	p := PostgresDialect{}
	if p.LastInsertIDSQL() == "" || p.QuoteIdent(`x"y`) == "" {
		t.Fatal("postgres bits")
	}
	m := MySQLDialect{}
	if m.Placeholder(3) != "?" {
		t.Fatal("mysql ph")
	}
	sql, args = m.DescribeColumns("t")
	if sql == "" || len(args) != 1 {
		t.Fatalf("mysql describe: %q %v", sql, args)
	}
	d, err := ResolveDialect("SQLITE")
	if err != nil {
		t.Fatal(err)
	}
	_ = d
	d, err = ResolveDialect("postgresql")
	if err != nil {
		t.Fatal(err)
	}
	_ = d
}

func TestCompileWhereAllOps(t *testing.T) {
	d := SqliteDialect{}
	cases := []*WhereBuilder{
		Where().Ne("a", 1),
		Where().Lt("a", 2),
		Where().Gt("a", 3),
		Where().Lte("a", 4),
		Where().Gte("a", 5),
		Where().Like("a", "%x%"),
		Where().IsNotNull("a"),
		Where().Eq("a", 1).And(nil),
		Where().Eq("a", 1).Or(nil),
	}
	for i, w := range cases {
		c, err := compileWhere(d, w.ToNode(), 1)
		if err != nil || c.SQL == "" {
			t.Fatalf("case %d: %+v %v", i, c, err)
		}
	}
	// force appendCond non-and branch
	w := &WhereBuilder{node: CondNode{Type: "cond", Op: OpEq, Column: "a", Value: 1}}
	w2 := w.Eq("b", 2)
	c, err := compileWhere(d, w2.ToNode(), 1)
	if err != nil || c.SQL == "" {
		t.Fatalf("appendCond branch: %+v %v", c, err)
	}
	_, err = compileWhere(d, CondNode{Type: "cond", Op: Op("nope"), Column: "a", Value: 1}, 1)
	if err == nil {
		t.Fatal("unknown op")
	}
	_, err = compileWhere(d, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	// empty group
	c, err = compileWhere(d, GroupNode{Type: "and"}, 1)
	if err != nil || c.SQL != "" {
		t.Fatalf("empty group: %+v %v", c, err)
	}
	// asSlice errors
	_, err = compileWhere(d, Where().In("id", "nope").ToNode(), 1)
	if err == nil {
		t.Fatal("in non-array")
	}
	_, err = compileWhere(d, Where().In("id", nil).ToNode(), 1)
	if err == nil {
		t.Fatal("in nil")
	}
	// call marker methods via interface (empty methods still need a call site)
	var nodes []WhereNode = []WhereNode{CondNode{}, GroupNode{}}
	for _, n := range nodes {
		n.whereNode()
	}
}

func TestToInt64(t *testing.T) {
	cases := []any{
		int64(1), int(2), int32(3), uint64(4), uint32(5),
		float64(6), float32(7), []byte("8"), "9", struct{}{},
		[]byte("x"), "nope",
	}
	for _, v := range cases {
		_ = toInt64(v)
	}
}

func TestCrudWithMemExecSQLite(t *testing.T) {
	ctx := context.Background()
	ex := newMemExec()
	c := NewCrud(ex, SqliteDialect{})

	row, err := c.Create(ctx, "items", Row{"name": "a", "score": 1})
	if err != nil || toInt64(row["id"]) == 0 {
		t.Fatalf("create: %+v %v", row, err)
	}
	id := row["id"]

	got, err := c.Read(ctx, "items", ReadQuery{Where: Where().Eq("id", id)})
	if err != nil || got == nil {
		t.Fatalf("read: %v", err)
	}
	if _, err := c.Update(ctx, "items", Row{"score": 2}, UpdateQuery{Where: Where().Eq("id", id)}); err != nil {
		t.Fatal(err)
	}
	if n, err := c.Count(ctx, "items", CountQuery{}); err != nil || n < 1 {
		t.Fatalf("count: %d %v", n, err)
	}
	if ok, err := c.Exists(ctx, "items", ExistsQuery{Where: Where().Eq("id", id)}); err != nil || !ok {
		t.Fatalf("exists: %v %v", ok, err)
	}
	off := 0
	sr, err := c.Search(ctx, "items", SearchQuery{Limit: 10, Offset: &off})
	if err != nil || len(sr.Items) == 0 {
		t.Fatalf("search: %+v %v", sr, err)
	}
	sr, err = c.List(ctx, "items", SearchQuery{Paging: "cursor", Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	_ = sr
	sr, err = c.Search(ctx, "items", SearchQuery{
		Paging: "cursor",
		Limit:  10,
		Cursor: id,
	})
	if err != nil {
		t.Fatal(err)
	}
	sr, err = c.Search(ctx, "items", SearchQuery{
		Limit:   10,
		OrderBy: []OrderByClause{{Column: "score", Direction: "desc"}, {Column: "name"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	sr, err = c.Search(ctx, "items", SearchQuery{
		GroupBy:    []string{"name"},
		Aggregates: []AggregateSpec{{Fn: "count", As: "n"}, {Fn: "sum", Column: "score", As: "s"}},
		Limit:      5,
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = sr

	if _, err := c.Upsert(ctx, "items", Row{"id": id, "name": "a", "score": 3}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Upsert(ctx, "items", Row{"id": int64(999), "name": "z", "score": 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Duplicate(ctx, "items", DuplicateQuery{Where: Where().Eq("id", id), Overrides: Row{"name": "dup"}}); err != nil {
		t.Fatal(err)
	}
	if n, err := c.BulkCreate(ctx, "items", []Row{{"name": "b", "score": 1}}); err != nil || n != 1 {
		t.Fatalf("bulkCreate: %d %v", n, err)
	}
	if n, err := c.BulkUpdate(ctx, "items", Row{"score": 9}, UpdateQuery{Where: Where().Eq("id", id)}); err != nil || n < 1 {
		t.Fatalf("bulkUpdate: %d %v", n, err)
	}
	if n, err := c.BulkUpsert(ctx, "items", []Row{{"id": id, "name": "a", "score": 1}}); err != nil || n != 1 {
		t.Fatalf("bulkUpsert: %d %v", n, err)
	}
	if err := c.Transaction(ctx, func(tx *Crud) error {
		_, err := tx.Create(ctx, "items", Row{"name": "tx", "score": 1})
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.BulkCreate(ctx, "items", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := c.BulkUpsert(ctx, "items", nil); err != nil {
		t.Fatal(err)
	}
	if n, err := c.BulkDelete(ctx, "items", DeleteQuery{Where: Where().Eq("id", id)}); err != nil || n < 1 {
		t.Fatalf("bulkDelete: %d %v", n, err)
	}

	// validation errors
	if _, err := c.Create(ctx, "items", nil); err == nil {
		t.Fatal("empty cols")
	}
	if _, err := c.Update(ctx, "items", Row{"score": 1}, UpdateQuery{}); err == nil {
		t.Fatal("update where")
	}
	if _, err := c.Delete(ctx, "items", DeleteQuery{}); err == nil {
		t.Fatal("delete where")
	}
	if _, err := c.Search(ctx, "items", SearchQuery{Limit: -1}); err == nil {
		t.Fatal("limit")
	}
	if _, err := c.Search(ctx, "items", SearchQuery{Paging: "nope"}); err == nil {
		t.Fatal("paging")
	}
	if _, err := c.Search(ctx, "items", SearchQuery{Paging: "offset", Cursor: 1}); err == nil {
		t.Fatal("offset+cursor")
	}
	o := 1
	if _, err := c.Search(ctx, "items", SearchQuery{Paging: "cursor", Offset: &o}); err == nil {
		t.Fatal("cursor+offset")
	}
	if _, err := c.Search(ctx, "items", SearchQuery{Cursor: []byte("x")}); err == nil {
		t.Fatal("bad cursor")
	}
	neg := -1
	if _, err := c.Search(ctx, "items", SearchQuery{Offset: &neg}); err == nil {
		t.Fatal("neg offset")
	}
	if _, err := c.Upsert(ctx, "items", Row{"name": "x"}); err == nil {
		t.Fatal("upsert pk")
	}
	if _, err := c.Duplicate(ctx, "items", DuplicateQuery{}); err == nil {
		t.Fatal("dup where")
	}
	if _, err := c.BulkUpsert(ctx, "items", []Row{{"name": "x"}}); err == nil {
		t.Fatal("bulkUpsert pk")
	}
	if err := c.Transaction(ctx, nil); err == nil {
		t.Fatal("tx nil")
	}
	if _, err := c.Create(ctx, "", Row{"name": "x"}); err == nil {
		t.Fatal("empty table")
	}
}

func TestCrudWithMemExecMySQL(t *testing.T) {
	ctx := context.Background()
	ex := newMemExec()
	c := NewCrud(ex, MySQLDialect{})
	row, err := c.Create(ctx, "items", Row{"name": "m", "score": 1})
	if err != nil || row == nil {
		t.Fatalf("mysql create: %+v %v", row, err)
	}
	// explicit pk skips last insert id
	row, err = c.Create(ctx, "items", Row{"id": int64(42), "name": "n", "score": 2})
	if err != nil {
		t.Fatal(err)
	}
	_ = row
	if _, err := c.Read(ctx, "items", ReadQuery{Columns: []string{"name"}, Where: Where().Eq("id", int64(42))}); err != nil {
		t.Fatal(err)
	}
}

func TestEnsurePKMissing(t *testing.T) {
	ctx := context.Background()
	ex := newMemExec()
	// Describe returns columns without custom pk
	c := NewCrud(ex, SqliteDialect{}, Options{PK: "missing_pk"})
	if _, err := c.Create(ctx, "items", Row{"name": "x", "score": 1}); err == nil {
		t.Fatal("expected missing pk")
	}
}

func TestSearchValidationAndAggregates(t *testing.T) {
	ctx := context.Background()
	ex := newMemExec()
	c := NewCrud(ex, SqliteDialect{})
	_, _ = c.Create(ctx, "items", Row{"name": "a", "score": 1})

	bad := []SearchQuery{
		{OrderBy: []OrderByClause{{Column: "", Direction: "asc"}}},
		{OrderBy: []OrderByClause{{Column: "id", Direction: "sideways"}}},
		{GroupBy: []string{}},
		{GroupBy: []string{""}},
		{Aggregates: []AggregateSpec{{Fn: "count", As: "n"}}},
		{GroupBy: []string{"name"}, Aggregates: []AggregateSpec{{Fn: "nope", As: "n"}}},
		{GroupBy: []string{"name"}, Aggregates: []AggregateSpec{{Fn: "sum", As: ""}}},
		{GroupBy: []string{"name"}, Aggregates: []AggregateSpec{{Fn: "sum", As: "s"}}},
		{Paging: "cursor", OrderBy: []OrderByClause{{Column: "id"}}},
		{Paging: "cursor", GroupBy: []string{"name"}},
	}
	for i, q := range bad {
		if _, err := c.Search(ctx, "items", q); err == nil {
			t.Fatalf("expected error case %d", i)
		}
	}

	sr, err := c.Search(ctx, "items", SearchQuery{
		GroupBy: []string{"name"},
		Aggregates: []AggregateSpec{
			{Fn: "avg", Column: "score", As: "avg_score"},
			{Fn: "min", Column: "score", As: "min_score"},
			{Fn: "max", Column: "score", As: "max_score"},
			{Fn: "count", Column: "score", As: "cnt"},
		},
		Columns: []string{"name"},
		Limit:   5,
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = sr

	// empty joinComma / selectColumns
	if joinComma(nil) != "" {
		t.Fatal("joinComma empty")
	}
	if selectColumns(SqliteDialect{}, nil) != "*" {
		t.Fatal("select *")
	}
	// typed slice for In
	if _, err := compileWhere(SqliteDialect{}, Where().In("id", []int{1, 2}).ToNode(), 1); err != nil {
		t.Fatal(err)
	}
}

func TestExecutorErrorPaths(t *testing.T) {
	ctx := context.Background()
	ex := newMemExec()
	c := NewCrud(ex, SqliteDialect{})
	row, err := c.Create(ctx, "items", Row{"name": "a", "score": 1})
	if err != nil {
		t.Fatal(err)
	}
	id := row["id"]

	ex.failSQL = "UPDATE"
	if _, err := c.Update(ctx, "items", Row{"score": 2}, UpdateQuery{Where: Where().Eq("id", id)}); err == nil {
		t.Fatal("update fail")
	}
	ex.failSQL = "DELETE"
	if _, err := c.Delete(ctx, "items", DeleteQuery{Where: Where().Eq("id", id)}); err == nil {
		t.Fatal("delete fail")
	}
	ex.failSQL = "COUNT"
	if _, err := c.Count(ctx, "items", CountQuery{}); err == nil {
		t.Fatal("count fail")
	}
	ex.failSQL = "SELECT 1"
	if _, err := c.Exists(ctx, "items", ExistsQuery{}); err == nil {
		t.Fatal("exists fail")
	}
	ex.failSQL = "SELECT"
	if _, err := c.Read(ctx, "items", ReadQuery{Where: Where().Eq("id", id)}); err == nil {
		t.Fatal("read fail")
	}
	ex.failSQL = ""
	// upsert pk-only patch
	if got, err := c.Upsert(ctx, "items", Row{"id": id}); err != nil || got == nil {
		t.Fatalf("upsert pk only: %v", err)
	}
	// duplicate miss
	miss, err := c.Duplicate(ctx, "items", DuplicateQuery{Where: Where().Eq("id", int64(99999))})
	if err != nil || miss != nil {
		t.Fatalf("dup miss: %v %v", miss, err)
	}
	// bulkUpsert nil row
	if _, err := c.BulkUpsert(ctx, "items", []Row{nil}); err == nil {
		t.Fatal("nil row")
	}
	// Create RETURNING nil row
	ex2 := newMemExec()
	ex2.failSQL = "RETURNING" // won't match; force Get insert to return nil via empty tables + custom
	c2 := NewCrud(&nilReturningExec{mem: newMemExec()}, SqliteDialect{})
	if _, err := c2.Create(ctx, "items", Row{"name": "x", "score": 1}); err == nil {
		t.Fatal("expected row object")
	}
	// MySQL last insert nil
	c3 := NewCrud(&nilLastIDExec{mem: newMemExec()}, MySQLDialect{})
	if _, err := c3.Create(ctx, "items", Row{"name": "x", "score": 1}); err == nil {
		t.Fatal("expected last id row")
	}
	// MySQL create then select miss
	c4 := NewCrud(&nilSelectAfterInsertExec{mem: newMemExec()}, MySQLDialect{})
	if _, err := c4.Create(ctx, "items", Row{"name": "x", "score": 1}); err == nil {
		t.Fatal("expected select miss")
	}
	// Count nil row
	c5 := NewCrud(&nilCountExec{mem: newMemExec()}, SqliteDialect{})
	n, err := c5.Count(ctx, "items", CountQuery{})
	if err != nil || n != 0 {
		t.Fatalf("count nil row: %d %v", n, err)
	}
	// BulkUpdate empty cols / empty where SQL
	if _, err := c.BulkUpdate(ctx, "items", nil, UpdateQuery{Where: Where().Eq("id", id)}); err == nil {
		t.Fatal("bulkUpdate empty cols")
	}
	if _, err := c.Update(ctx, "items", nil, UpdateQuery{Where: Where().Eq("id", id)}); err == nil {
		t.Fatal("update empty cols")
	}
	// Search All failure
	ex.failSQL = "ORDER BY"
	if _, err := c.Search(ctx, "items", SearchQuery{Limit: 5}); err == nil {
		t.Fatal("search all fail")
	}
	ex.failSQL = ""
}

type nilSelectAfterInsertExec struct{ mem *memExec }

func (n *nilSelectAfterInsertExec) Run(ctx context.Context, sql string, args ...any) (int64, error) {
	return 1, nil
}
func (n *nilSelectAfterInsertExec) Get(ctx context.Context, sql string, args ...any) (Row, error) {
	u := strings.ToUpper(sql)
	if strings.Contains(u, "LAST_INSERT_ID") {
		return Row{"id": int64(1)}, nil
	}
	if strings.HasPrefix(strings.TrimSpace(u), "SELECT") {
		return nil, nil
	}
	return n.mem.Get(ctx, sql, args...)
}
func (n *nilSelectAfterInsertExec) All(ctx context.Context, sql string, args ...any) ([]Row, error) {
	return n.mem.All(ctx, sql, args...)
}
func (n *nilSelectAfterInsertExec) Transaction(ctx context.Context, fn func(tx Executor) error) error {
	return n.mem.Transaction(ctx, fn)
}

type nilCountExec struct{ mem *memExec }

func (n *nilCountExec) Run(ctx context.Context, sql string, args ...any) (int64, error) {
	return n.mem.Run(ctx, sql, args...)
}
func (n *nilCountExec) Get(ctx context.Context, sql string, args ...any) (Row, error) {
	if strings.Contains(strings.ToUpper(sql), "COUNT") {
		return nil, nil
	}
	return n.mem.Get(ctx, sql, args...)
}
func (n *nilCountExec) All(ctx context.Context, sql string, args ...any) ([]Row, error) {
	return n.mem.All(ctx, sql, args...)
}
func (n *nilCountExec) Transaction(ctx context.Context, fn func(tx Executor) error) error {
	return n.mem.Transaction(ctx, fn)
}

type nilReturningExec struct{ mem *memExec }

func (n *nilReturningExec) Run(ctx context.Context, sql string, args ...any) (int64, error) {
	return n.mem.Run(ctx, sql, args...)
}
func (n *nilReturningExec) Get(ctx context.Context, sql string, args ...any) (Row, error) {
	if strings.Contains(strings.ToUpper(sql), "RETURNING") {
		return nil, nil
	}
	return n.mem.Get(ctx, sql, args...)
}
func (n *nilReturningExec) All(ctx context.Context, sql string, args ...any) ([]Row, error) {
	return n.mem.All(ctx, sql, args...)
}
func (n *nilReturningExec) Transaction(ctx context.Context, fn func(tx Executor) error) error {
	return n.mem.Transaction(ctx, fn)
}

type nilLastIDExec struct{ mem *memExec }

func (n *nilLastIDExec) Run(ctx context.Context, sql string, args ...any) (int64, error) {
	return n.mem.Run(ctx, sql, args...)
}
func (n *nilLastIDExec) Get(ctx context.Context, sql string, args ...any) (Row, error) {
	if strings.Contains(strings.ToUpper(sql), "LAST_INSERT_ID") {
		return nil, nil
	}
	return n.mem.Get(ctx, sql, args...)
}
func (n *nilLastIDExec) All(ctx context.Context, sql string, args ...any) ([]Row, error) {
	return n.mem.All(ctx, sql, args...)
}
func (n *nilLastIDExec) Transaction(ctx context.Context, fn func(tx Executor) error) error {
	return n.mem.Transaction(ctx, fn)
}
