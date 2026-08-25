# crudian

CRUD abstraction for DDD repositories (language-agnostic packaging).

## JavaScript / TypeScript

npm package: **[@b4moss/crudian](./packages/js)**

```bash
npm install @b4moss/crudian
```

See [`packages/js/README.md`](./packages/js/README.md) for adapters (`bun-sqlite` / `drizzle` / `prisma`) and API notes.

## Docs

- Spec: [`docs/main.md`](./docs/main.md)
- Roadmap: [`docs/plans/roadmap.md`](./docs/plans/roadmap.md)
- Tests: [`docs/tests/`](./docs/tests/)

## Docker / Dev Containers

言語ランタイム（Node.js 24 / Bun / Go 1.26 / PHP）を **1 コンテナ** にまとめ、E2E 用に Postgres / MySQL / MariaDB を compose で起動する（[#44](https://github.com/b4moss/crudian/issues/44)）。

```bash
make docker-build
make docker-check
make docker-up
make docker-shell
```

詳細: [`docker/README.md`](./docker/README.md)

## License

MIT © Bicycle for Mind LLC., Kohki SHIKATA — see [`LICENSE`](./LICENSE).
