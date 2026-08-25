# crudian

CRUD abstraction for DDD repositories (language-agnostic packaging).

## JavaScript / TypeScript

npm package: **[@b4moss/crudian](./packages/js)** (`packages/js`)

```bash
npm install @b4moss/crudian
```

Adapters (subpaths):

| Subpath | Backend |
|---------|---------|
| `@b4moss/crudian/bun-sqlite` | Bun `bun:sqlite` (sync) |
| `@b4moss/crudian/drizzle` | Drizzle + better-sqlite3 (sync) |
| `@b4moss/crudian/prisma` | Prisma (async) |
| `@b4moss/crudian/libsql` | `@libsql/client` (async) |

Full usage — **every method with sample code** — lives in [`packages/js/README.md`](./packages/js/README.md).

## Docs

- Spec: [`docs/main.md`](./docs/main.md)
- Roadmap: [`docs/plans/roadmap.md`](./docs/plans/roadmap.md)
- libSQL design: [`docs/plans/libsql-adapter.md`](./docs/plans/libsql-adapter.md)
- Go design: [`docs/plans/go-module.md`](./docs/plans/go-module.md)
- Tests: [`docs/tests/`](./docs/tests/)

## License

MIT © Bicycle for Mind LLC., Kohki SHIKATA — see [`LICENSE`](./LICENSE).
