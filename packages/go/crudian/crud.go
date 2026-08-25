package crudian

import (
	"context"
	"fmt"
)

// Crud is the table-oriented facade (JS createCrud equivalent).
type Crud struct {
	ex Executor
	d  Dialect
}

// NewCrud wires an executor and dialect.
func NewCrud(ex Executor, d Dialect) *Crud {
	if d == nil {
		d = SqliteDialect{}
	}
	return &Crud{ex: ex, d: d}
}

func (c *Crud) requireWhere(w *WhereBuilder, label string) error {
	if w == nil {
		return NewError(label + " requires where")
	}
	return nil
}

func (c *Crud) Create(ctx context.Context, table string, cols Row) (Row, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return nil, err
	}
	if cols == nil || len(cols) == 0 {
		return nil, NewError("cols must not be empty")
	}
	keys := sortedKeys(cols)
	qTbl := c.d.QuoteIdent(tbl)
	colSQL := make([]string, len(keys))
	ph := make([]string, len(keys))
	args := make([]any, len(keys))
	for i, k := range keys {
		colSQL[i] = c.d.QuoteIdent(k)
		ph[i] = c.d.Placeholder(i + 1)
		args[i] = cols[k]
	}
	sql := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		qTbl, joinComma(colSQL), joinComma(ph),
	)
	row, err := c.ex.Get(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, NewError("expected row object")
	}
	return row, nil
}

func (c *Crud) Read(ctx context.Context, table string, query ReadQuery) (Row, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return nil, err
	}
	where, err := compileWhere(c.d, resolveWhere(query.Where))
	if err != nil {
		return nil, err
	}
	sql := "SELECT " + selectColumns(c.d, query.Columns) + " FROM " + c.d.QuoteIdent(tbl)
	if where.SQL != "" {
		sql += " WHERE " + where.SQL
	}
	sql += " LIMIT 1"
	return c.ex.Get(ctx, sql, where.Args...)
}

func (c *Crud) Update(ctx context.Context, table string, cols Row, query UpdateQuery) (Row, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return nil, err
	}
	if err := c.requireWhere(query.Where, "update"); err != nil {
		return nil, err
	}
	if cols == nil || len(cols) == 0 {
		return nil, NewError("cols must not be empty")
	}
	where, err := compileWhere(c.d, resolveWhere(query.Where))
	if err != nil {
		return nil, err
	}
	if where.SQL == "" {
		return nil, NewError("update requires where")
	}
	keys := sortedKeys(cols)
	sets := make([]string, len(keys))
	args := make([]any, 0, len(keys)+len(where.Args))
	for i, k := range keys {
		sets[i] = c.d.QuoteIdent(k) + " = " + c.d.Placeholder(i+1)
		args = append(args, cols[k])
	}
	args = append(args, where.Args...)
	qTbl := c.d.QuoteIdent(tbl)
	n, err := c.ex.Run(ctx, fmt.Sprintf("UPDATE %s SET %s WHERE %s", qTbl, joinComma(sets), where.SQL), args...)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, nil
	}
	return c.ex.Get(ctx, "SELECT * FROM "+qTbl+" WHERE "+where.SQL+" LIMIT 1", where.Args...)
}

func (c *Crud) Delete(ctx context.Context, table string, query DeleteQuery) (int64, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return 0, err
	}
	if err := c.requireWhere(query.Where, "delete"); err != nil {
		return 0, err
	}
	where, err := compileWhere(c.d, resolveWhere(query.Where))
	if err != nil {
		return 0, err
	}
	if where.SQL == "" {
		return 0, NewError("delete requires where")
	}
	return c.ex.Run(ctx, "DELETE FROM "+c.d.QuoteIdent(tbl)+" WHERE "+where.SQL, where.Args...)
}

func (c *Crud) Count(ctx context.Context, table string, query CountQuery) (int64, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return 0, err
	}
	where, err := compileWhere(c.d, resolveWhere(query.Where))
	if err != nil {
		return 0, err
	}
	sql := "SELECT COUNT(*) AS " + c.d.QuoteIdent("row_count") + " FROM " + c.d.QuoteIdent(tbl)
	if where.SQL != "" {
		sql += " WHERE " + where.SQL
	}
	row, err := c.ex.Get(ctx, sql, where.Args...)
	if err != nil {
		return 0, err
	}
	if row == nil {
		return 0, nil
	}
	return toInt64(row["row_count"]), nil
}

func (c *Crud) Search(ctx context.Context, table string, query SearchQuery) (SearchResult, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return SearchResult{}, err
	}
	limit := query.Limit
	if limit == 0 {
		limit = 20
	}
	if limit <= 0 {
		return SearchResult{}, NewError("limit must be a positive number")
	}
	if query.Cursor != nil {
		switch query.Cursor.(type) {
		case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, string:
		default:
			return SearchResult{}, NewError("cursor must be a number, string, or null")
		}
	}
	where, err := compileWhere(c.d, resolveWhere(query.Where))
	if err != nil {
		return SearchResult{}, err
	}
	args := append([]any{}, where.Args...)
	parts := make([]string, 0, 2)
	if where.SQL != "" {
		parts = append(parts, "("+where.SQL+")")
	}
	if query.Cursor != nil {
		parts = append(parts, c.d.QuoteIdent("id")+" > "+c.d.Placeholder(len(args)+1))
		args = append(args, query.Cursor)
	}
	whereSQL := ""
	if len(parts) > 0 {
		whereSQL = " WHERE " + parts[0]
		for i := 1; i < len(parts); i++ {
			whereSQL += " AND " + parts[i]
		}
	}
	sql := "SELECT " + selectColumns(c.d, query.Columns) + " FROM " + c.d.QuoteIdent(tbl) +
		whereSQL + " ORDER BY " + c.d.QuoteIdent("id") + " ASC LIMIT " + c.d.Placeholder(len(args)+1)
	args = append(args, limit+1)
	rows, err := c.ex.All(ctx, sql, args...)
	if err != nil {
		return SearchResult{}, err
	}
	hasMore := len(rows) > limit
	items := rows
	if hasMore {
		items = rows[:limit]
	}
	var next any
	if hasMore && len(items) > 0 {
		if id, ok := items[len(items)-1]["id"]; ok {
			next = id
		}
	}
	total, err := c.Count(ctx, table, CountQuery{Where: query.Where})
	if err != nil {
		return SearchResult{}, err
	}
	return SearchResult{Items: items, NextCursor: next, HasMore: hasMore, Total: total}, nil
}

func (c *Crud) List(ctx context.Context, table string, query SearchQuery) (SearchResult, error) {
	return c.Search(ctx, table, query)
}

func (c *Crud) Upsert(ctx context.Context, table string, cols Row) (Row, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return nil, err
	}
	if cols == nil || len(cols) == 0 {
		return nil, NewError("cols must not be empty")
	}
	id, ok := cols["id"]
	if !ok {
		return nil, NewError("upsert requires cols.id")
	}
	existing, err := c.Read(ctx, tbl, ReadQuery{Where: Where().Eq("id", id)})
	if err != nil {
		return nil, err
	}
	if existing != nil {
		patch := Row{}
		for k, v := range cols {
			if k == "id" {
				continue
			}
			patch[k] = v
		}
		if len(patch) == 0 {
			return existing, nil
		}
		updated, err := c.Update(ctx, tbl, patch, UpdateQuery{Where: Where().Eq("id", id)})
		if err != nil {
			return nil, err
		}
		if updated == nil {
			return nil, NewError("upsert update failed")
		}
		return updated, nil
	}
	return c.Create(ctx, tbl, cols)
}

func (c *Crud) Duplicate(ctx context.Context, table string, query DuplicateQuery) (Row, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return nil, err
	}
	if err := c.requireWhere(query.Where, "duplicate"); err != nil {
		return nil, err
	}
	source, err := c.Read(ctx, tbl, ReadQuery{Where: query.Where})
	if err != nil || source == nil {
		return nil, err
	}
	cols := Row{}
	for k, v := range source {
		if k == "id" {
			continue
		}
		cols[k] = v
	}
	for k, v := range query.Overrides {
		cols[k] = v
	}
	delete(cols, "id")
	return c.Create(ctx, tbl, cols)
}

func (c *Crud) BulkCreate(ctx context.Context, table string, rows []Row) (int64, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	var n int64
	for _, row := range rows {
		if _, err := c.Create(ctx, table, row); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

func (c *Crud) BulkUpdate(ctx context.Context, table string, cols Row, query UpdateQuery) (int64, error) {
	tbl, err := AssertString(table, "table")
	if err != nil {
		return 0, err
	}
	if err := c.requireWhere(query.Where, "bulkUpdate"); err != nil {
		return 0, err
	}
	if cols == nil || len(cols) == 0 {
		return 0, NewError("cols must not be empty")
	}
	where, err := compileWhere(c.d, resolveWhere(query.Where))
	if err != nil {
		return 0, err
	}
	if where.SQL == "" {
		return 0, NewError("bulkUpdate requires where")
	}
	keys := sortedKeys(cols)
	sets := make([]string, len(keys))
	args := make([]any, 0, len(keys)+len(where.Args))
	for i, k := range keys {
		sets[i] = c.d.QuoteIdent(k) + " = " + c.d.Placeholder(i+1)
		args = append(args, cols[k])
	}
	args = append(args, where.Args...)
	return c.ex.Run(ctx, fmt.Sprintf("UPDATE %s SET %s WHERE %s", c.d.QuoteIdent(tbl), joinComma(sets), where.SQL), args...)
}

func (c *Crud) BulkDelete(ctx context.Context, table string, query DeleteQuery) (int64, error) {
	return c.Delete(ctx, table, query)
}

func (c *Crud) BulkUpsert(ctx context.Context, table string, rows []Row) (int64, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	var n int64
	for _, row := range rows {
		if row == nil {
			return n, NewError("each row must be an object")
		}
		if _, ok := row["id"]; !ok {
			return n, NewError("bulkUpsert requires each row to have id")
		}
		if _, err := c.Upsert(ctx, table, row); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

func (c *Crud) Transaction(ctx context.Context, fn func(tx *Crud) error) error {
	if fn == nil {
		return NewError("transaction callback must be a function")
	}
	return c.ex.Transaction(ctx, func(txEx Executor) error {
		return fn(NewCrud(txEx, c.d))
	})
}

func sortedKeys(cols Row) []string {
	keys := make([]string, 0, len(cols))
	for k := range cols {
		keys = append(keys, k)
	}
	// stable-ish for SQL: sort
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return keys
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
	case float32:
		return int64(n)
	default:
		return 0
	}
}
