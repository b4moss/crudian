package crudian

// Options configures NewCrud / CreateCrud.
// Zero-value PK means default "id" (Go cannot distinguish omit vs "").
// Pool is applied only by backends that support it (GORM); libSQL ignores it.
// Dialect selects SQL dialect; empty / nil → SqliteDialect.
// Driver is an optional hint ("sqlite"|"postgres"|"mysql") used when Dialect is nil.
type Options struct {
	PK      string
	Pool    *PoolOptions
	Dialect Dialect
	Driver  string
}

func resolvePK(opts []Options) string {
	if len(opts) == 0 || opts[0].PK == "" {
		return "id"
	}
	return opts[0].PK
}

func resolveOptionsDialect(opts []Options) (Dialect, error) {
	if len(opts) == 0 {
		return SqliteDialect{}, nil
	}
	o := opts[0]
	if o.Dialect != nil {
		return o.Dialect, nil
	}
	if o.Driver != "" {
		return ResolveDialect(o.Driver)
	}
	return SqliteDialect{}, nil
}
