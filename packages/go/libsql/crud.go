package libsql

import (
	"context"
	"database/sql"

	"github.com/b4moss/crudian/go/crudian"
)

// Crud wraps *sql.DB (libSQL driver) with the shared CRUD facade.
type Crud struct {
	*crudian.Crud
	DB *sql.DB
}

// CreateCrud injects an existing *sql.DB. Does not open connections.
func CreateCrud(db *sql.DB) (*Crud, error) {
	if db == nil {
		return nil, crudian.NewError("db is required")
	}
	ex := &sqlExecutor{db: db}
	return &Crud{Crud: crudian.NewCrud(ex, crudian.SqliteDialect{}), DB: db}, nil
}

type sqlExecutor struct {
	db *sql.DB
	tx *sql.Tx
}

func (e *sqlExecutor) conn(ctx context.Context) querier {
	if e.tx != nil {
		return e.tx
	}
	return contextDB{db: e.db, ctx: ctx}
}

type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

type contextDB struct {
	db  *sql.DB
	ctx context.Context
}

func (c contextDB) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if ctx == nil {
		ctx = c.ctx
	}
	return c.db.ExecContext(ctx, query, args...)
}

func (c contextDB) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if ctx == nil {
		ctx = c.ctx
	}
	return c.db.QueryContext(ctx, query, args...)
}

func (e *sqlExecutor) Run(ctx context.Context, query string, args ...any) (int64, error) {
	res, err := e.conn(ctx).ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (e *sqlExecutor) Get(ctx context.Context, query string, args ...any) (crudian.Row, error) {
	rows, err := e.conn(ctx).QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil
	}
	return scanRow(rows)
}

func (e *sqlExecutor) All(ctx context.Context, query string, args ...any) ([]crudian.Row, error) {
	rows, err := e.conn(ctx).QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]crudian.Row, 0)
	for rows.Next() {
		row, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (e *sqlExecutor) Transaction(ctx context.Context, fn func(tx crudian.Executor) error) error {
	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	inner := &sqlExecutor{db: e.db, tx: tx}
	if err := fn(inner); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func scanRow(rows *sql.Rows) (crudian.Row, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	raw := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range raw {
		ptrs[i] = &raw[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}
	out := crudian.Row{}
	for i, c := range cols {
		v := raw[i]
		if b, ok := v.([]byte); ok {
			out[c] = string(b)
		} else {
			out[c] = v
		}
	}
	return out, nil
}
