package crudian

import "strings"

// Dialect abstracts SQL dialect hooks.
// Postgres / MySQL: stub for future (#48 / #73). Not implemented in v0.7.0.
type Dialect interface {
	QuoteIdent(name string) string
	Placeholder(n int) string // 1-based index into args for this statement
}

// SqliteDialect uses "ident" and "?".
type SqliteDialect struct{}

func (SqliteDialect) QuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func (SqliteDialect) Placeholder(n int) string {
	_ = n
	return "?"
}

// PostgresDialect is intentionally unimplemented in v0.7.0 (GORM non-SQLite out of scope).
// type PostgresDialect struct{}
//
// MySQLDialect is intentionally unimplemented in v0.7.0.
// type MySQLDialect struct{}
