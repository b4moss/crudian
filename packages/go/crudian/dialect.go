package crudian

import (
	"fmt"
	"strings"
)

// Dialect abstracts SQL dialect hooks (quote, placeholders, insert fetch, catalog).
// Pool / connection lifetime is intentionally not part of this interface (#105).
type Dialect interface {
	QuoteIdent(name string) string
	Placeholder(n int) string // 1-based index into args for this statement
	SupportsInsertReturning() bool
	LastInsertIDSQL() string
	DescribeColumns(table string) (sql string, args []any)
}

// SqliteDialect uses "ident", "?", PRAGMA, last_insert_rowid / RETURNING.
type SqliteDialect struct{}

func (SqliteDialect) QuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func (SqliteDialect) Placeholder(n int) string {
	_ = n
	return "?"
}

func (SqliteDialect) SupportsInsertReturning() bool { return true }

func (SqliteDialect) LastInsertIDSQL() string {
	return "SELECT last_insert_rowid() AS id"
}

func (SqliteDialect) DescribeColumns(table string) (string, []any) {
	return "PRAGMA table_info(" + (SqliteDialect{}).QuoteIdent(table) + ")", nil
}

// PostgresDialect uses "ident", $n, RETURNING *, information_schema.
type PostgresDialect struct{}

func (PostgresDialect) QuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func (PostgresDialect) Placeholder(n int) string {
	return fmt.Sprintf("$%d", n)
}

func (PostgresDialect) SupportsInsertReturning() bool { return true }

func (PostgresDialect) LastInsertIDSQL() string {
	return "SELECT lastval() AS id"
}

func (PostgresDialect) DescribeColumns(table string) (string, []any) {
	return "SELECT column_name AS name FROM information_schema.columns" +
		" WHERE table_schema = current_schema() AND table_name = $1", []any{table}
}

// MySQLDialect uses `ident`, ?, LAST_INSERT_ID, information_schema (no RETURNING).
type MySQLDialect struct{}

func (MySQLDialect) QuoteIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func (MySQLDialect) Placeholder(n int) string {
	_ = n
	return "?"
}

func (MySQLDialect) SupportsInsertReturning() bool { return false }

func (MySQLDialect) LastInsertIDSQL() string {
	return "SELECT LAST_INSERT_ID() AS id"
}

func (MySQLDialect) DescribeColumns(table string) (string, []any) {
	return "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS" +
		" WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", []any{table}
}

// ResolveDialect picks a dialect by name (sqlite|postgres|mysql). Empty → sqlite.
func ResolveDialect(name string) (Dialect, error) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", "sqlite":
		return SqliteDialect{}, nil
	case "postgres", "postgresql":
		return PostgresDialect{}, nil
	case "mysql":
		return MySQLDialect{}, nil
	default:
		return nil, NewError("unknown dialect: " + name)
	}
}
