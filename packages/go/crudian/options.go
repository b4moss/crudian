package crudian

// Options configures NewCrud / CreateCrud.
// Zero-value PK means default "id" (Go cannot distinguish omit vs "").
type Options struct {
	PK string
}

func resolvePK(opts []Options) string {
	if len(opts) == 0 || opts[0].PK == "" {
		return "id"
	}
	return opts[0].PK
}
