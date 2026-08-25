package crudian

import "context"

// Executor runs dialect-agnostic SQL.
type Executor interface {
	Run(ctx context.Context, sql string, args ...any) (int64, error)
	Get(ctx context.Context, sql string, args ...any) (Row, error) // miss → nil, nil
	All(ctx context.Context, sql string, args ...any) ([]Row, error)
	Transaction(ctx context.Context, fn func(tx Executor) error) error
}
