package crudian

// Row is a column map (table-oriented CRUD, not ORM structs).
type Row map[string]any

// SearchResult is the cursor page payload.
type SearchResult struct {
	Items      []Row
	NextCursor any // number or string id, or nil
	HasMore    bool
	Total      int64
}

// ReadQuery selects one row.
type ReadQuery struct {
	Columns []string
	Where   *WhereBuilder
}

// SearchQuery lists rows with cursor pagination.
type SearchQuery struct {
	Columns []string
	Where   *WhereBuilder
	Limit   int
	Cursor  any // nil, number, or string
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
