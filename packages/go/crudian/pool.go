package crudian

import (
	"database/sql"
	"time"
)

// PoolOptions configures database/sql connection pool settings.
// Nil fields are left unchanged (driver / runtime defaults).
type PoolOptions struct {
	MaxOpenConns    *int
	MaxIdleConns    *int
	ConnMaxLifetime *time.Duration
	ConnMaxIdleTime *time.Duration
}

// ApplyPool applies non-nil PoolOptions fields to db.
// A nil p is a no-op. A nil db is rejected.
func ApplyPool(db *sql.DB, p *PoolOptions) error {
	if db == nil {
		return NewError("db is required")
	}
	if p == nil {
		return nil
	}
	if p.MaxOpenConns != nil {
		db.SetMaxOpenConns(*p.MaxOpenConns)
	}
	if p.MaxIdleConns != nil {
		db.SetMaxIdleConns(*p.MaxIdleConns)
	}
	if p.ConnMaxLifetime != nil {
		db.SetConnMaxLifetime(*p.ConnMaxLifetime)
	}
	if p.ConnMaxIdleTime != nil {
		db.SetConnMaxIdleTime(*p.ConnMaxIdleTime)
	}
	return nil
}
