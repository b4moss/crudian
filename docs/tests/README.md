# tests

テスト仕様（TDD の入力）。**`docs/specs/` と同じドメイン切り**。SemVer フォルダは使わない。

書き方・氷山パターン: charter の [`tdd.md`](../charter/tdd.md)。  
pillar: [`../README.md`](../README.md)  
仕様: [`../specs/`](../specs/)  
ロードマップ: [`../roadmap.md`](../roadmap.md)

| ドメイン | 内容 |
|----------|------|
| [`contract/`](./contract/) | 共有契約（`count` / `total`、offset pagination、`exists`） |
| [`bun-sqlite/`](./bun-sqlite/) | 参照実装 Core / Extended writes |
| [`drizzle/`](./drizzle/) | Drizzle アダプタ |
| [`prisma/`](./prisma/) | Prisma アダプタ |
| [`libsql/`](./libsql/) | JS libSQL アダプタ |
| [`typeorm/`](./typeorm/) | TypeORM アダプタ |
| [`go/`](./go/) | Go module（gorm / libsql） |
| [`dialect/`](./dialect/) | Dialect / MySQL・Postgres / JS プール |

----

以上
