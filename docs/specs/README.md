# specs

現行バージョンに存在する振る舞いの仕様正本。ドメイン切りは [`../tests/`](../tests/) と同じ。  
未実装は [`../plans/`](../plans/) へ。

| ドメイン | 内容 |
|----------|------|
| [`contract/`](./contract/) | 共有 CRUD 契約（語彙・戻り値・条件・ページング） |
| [`bun-sqlite/`](./bun-sqlite/) | `@b4moss/crudian/bun-sqlite`（参照実装） |
| [`drizzle/`](./drizzle/) | `@b4moss/crudian/drizzle` |
| [`prisma/`](./prisma/) | `@b4moss/crudian/prisma` |
| [`libsql/`](./libsql/) | `@b4moss/crudian/libsql` |
| [`typeorm/`](./typeorm/) | `@b4moss/crudian/typeorm` |
| [`go/`](./go/) | Go module（`gorm` / `libsql`） |
| [`dialect/`](./dialect/) | SQL 方言（SQLite / Postgres / MySQL）とプール方針 |

pillar: [`../README.md`](../README.md)

----

以上
