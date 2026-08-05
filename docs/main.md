# Crudian

DDD の Repository 層向け CRUD 抽象ライブラリ。

## 目的

- DB CRUD を抽象化し、各言語・ORM 向けに実装を提供する
- ライブラリ本体の DB 書き込みはインメモリ SQLite 等で担保する
- プロダクト側の Repository テストは Mock で高速に回す

## API

- `create`
- `read`
- `list`
- `update`
- `delete`
- `upsert`
- `bulkCreate`
- `bulkUpdate`
- `bulkDelete`
- `bulkUpsert`
- `duplicate`
- `search`（カラムと条件、比較演算子、and/or、複合検索）

## 備考

- `limit` と cursor 方式の pagination を提供する（offset は使わない）
- 全文検索には対応しない

## パッケージ構成

| パス | npm / 対象 |
|------|------------|
| `packages/node-bun/bun-sqlite` | `@b4moss/crudian`（Bun `bun:sqlite`） |
| `packages/node-bun/drizzle` | Node.js / Bun + Drizzle |
| `packages/node-bun/prisma` | Node.js / Bun + Prisma |
| `packages/php/laravel` | PHP Laravel（Eloquent） |
| `packages/php/pdo-mysql` | 生 PHP + PDO MySQL |
| `packages/php/pdo-postgres` | 生 PHP + PDO Postgres |
| `packages/php/pdo-sqlite` | 生 PHP + PDO SQLite |
| `packages/go/gorm` | Go + GORM |

## 初期スコープ

まず `packages/node-bun/bun-sqlite`（`@b4moss/crudian`）を実装し、問題なければ他言語・ORM へ展開する。

このドキュメントを仕様の正とする。
