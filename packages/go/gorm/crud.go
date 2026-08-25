package gorm

import (
	"context"
	"database/sql"

	"github.com/b4moss/crudian/go/crudian"
	gormio "gorm.io/gorm"
)

// Crud wraps a GORM DB with the shared CRUD facade.
type Crud struct {
	*crudian.Crud
	DB *gormio.DB
}

// CreateCrud injects an existing *gorm.DB (SQLite). Does not open connections.
func CreateCrud(db *gormio.DB) (*Crud, error) {
	if db == nil {
		return nil, crudian.NewError("db is required")
	}
	ex := &gormExecutor{db: db}
	return &Crud{Crud: crudian.NewCrud(ex, crudian.SqliteDialect{}), DB: db}, nil
}

type gormExecutor struct {
	db *gormio.DB
}

func (e *gormExecutor) Run(ctx context.Context, query string, args ...any) (int64, error) {
	tx := e.db.WithContext(ctx).Exec(query, args...)
	if tx.Error != nil {
		return 0, tx.Error
	}
	return tx.RowsAffected, nil
}

func (e *gormExecutor) Get(ctx context.Context, query string, args ...any) (crudian.Row, error) {
	rows, err := e.db.WithContext(ctx).Raw(query, args...).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil
	}
	return scanRow(rows)
}

func (e *gormExecutor) All(ctx context.Context, query string, args ...any) ([]crudian.Row, error) {
	rows, err := e.db.WithContext(ctx).Raw(query, args...).Rows()
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

func (e *gormExecutor) Transaction(ctx context.Context, fn func(tx crudian.Executor) error) error {
	return e.db.WithContext(ctx).Transaction(func(tx *gormio.DB) error {
		return fn(&gormExecutor{db: tx})
	})
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
