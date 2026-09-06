package crudian

// Row is a column map (table-oriented CRUD, not ORM structs).
type Row map[string]any

// SearchResult is the page payload for search/list.
// Offset mode: Offset/Limit set, NextCursor nil.
// Cursor mode: NextCursor set (or nil at end), Offset/Limit are 0.
type SearchResult struct {
	Items      []Row
	NextCursor any // number or string id, or nil
	HasMore    bool
	Total      int64
	Offset     int
	Limit      int
}

// ReadQuery selects one row.
type ReadQuery struct {
	Columns []string
	Where   *WhereBuilder
}

// SearchQuery lists rows with offset or cursor pagination.
type SearchQuery struct {
	Columns []string
	Where   *WhereBuilder
	Limit   int
	Cursor  any    // nil, number, or string
	Paging  string // "", "offset", or "cursor" ("" = offset)
	Offset  *int   // nil = unset (0 in offset mode); non-nil in cursor mode is rejected
}

// CountQuery counts matching rows.
type CountQuery struct {
	Where *WhereBuilder
}

// UpdateQuery requires Where.
type UpdateQuery struct {
	Where *WhereBuilder
}

// DeleteQuery requires Where.
type DeleteQuery struct {
	Where *WhereBuilder
}

// DuplicateQuery copies the first match.
type DuplicateQuery struct {
	Where     *WhereBuilder
	Overrides Row
}
