# Dialect / サーバ DB 仕様

SQL 方言の切り出しと MySQL / Postgres 対応、および接続プール方針の現行正本。

## 概要

共有 CRUD から方言を注入可能にし、既存 SQLite の観測結果を変えずに Postgres / MySQL を足す。

## Dialect フック

| フック | 役割 |
|--------|------|
| `quoteIdent` | 識別子クォート |
| `placeholder(i)` | プレースホルダ（1-based） |
| insert 後の行取得 | `insertReturning` または `fetchAfterInsert` |
| 列記述 | PK 存在確認用（旧 `PRAGMA table_info` 相当） |

- **載せない:** 接続プール／lifetime（別関心）
- **upsert:** 当面アプリ層（read → update / create）。`ON CONFLICT` / `ON DUPLICATE KEY` SQL フックは必須としない
- **MySQL:** `RETURNING` 非使用（insert 後 SELECT）

## 対象アダプタ

| 系統 | SQLite | Postgres | MySQL |
|------|:------:|:--------:|:-----:|
| JS Prisma | ✓ | ✓（`options.dialect`） | ✓ |
| JS TypeORM | ✓ | ✓ | ✓ |
| JS Drizzle / bun-sqlite / libsql | ✓ | — | — |
| Go GORM | ✓（`Options.Driver` / `Dialect`） | ✓ | ✓ |
| Go libsql | ✓（互換） | — | — |

## 接続プール／lifetime

| 系統 | 方針 |
|------|------|
| Go | `Options.Pool` / `ApplyPool`。GORM は `CreateCrud` 時に適用、libSQL は no-op |
| JS | 呼び出し側（Prisma datasource / TypeORM DataSource 等）。型 `PoolOptions` は文書化用。SQLite 系は no-op |

## 選択 API

- JS Prisma: `createCrud(client, { dialect?: "sqlite" | "postgres" | "mysql" })`（既定 sqlite）
- JS TypeORM: DataSource `options.type` から推論。`options.dialect` で上書き可
- Go GORM: `Options.Driver`（`"sqlite"|"postgres"|"mysql"`）または `Options.Dialect`
- **SQLite 固定のまま:** bun-sqlite / drizzle / JS libsql / Go libsql（`dialect` オプションは無視または未使用）

## 関連

- テスト: [`../../tests/dialect/mysql-postgres.md`](../../tests/dialect/mysql-postgres.md)
- Go プール受け入れは [`../../tests/contract/exists.md`](../../tests/contract/exists.md) Part B も参照
- pillar: [`../../README.md`](../../README.md)
