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

### JS（単一 npm パッケージ、実装は TypeScript）

パッケージ名: **`@b4moss/crudian`**（`packages/js`）

Node.js / Bun など JS エコシステム向け。ディレクトリ名の `js` は広範な呼称であり、実装言語は TypeScript。

| subpath | 対象 |
|---------|------|
| `@b4moss/crudian` | 共有契約・型 |
| `@b4moss/crudian/bun-sqlite` | Bun `bun:sqlite` |
| `@b4moss/crudian/drizzle` | Drizzle |
| `@b4moss/crudian/prisma` | Prisma |

```ts
import { /* ... */ } from "@b4moss/crudian/bun-sqlite"
```

### 他言語

| パス | 対象 |
|------|------|
| `packages/php/laravel` | PHP Laravel（Eloquent） |
| `packages/php/pdo-mysql` | 生 PHP + PDO MySQL |
| `packages/php/pdo-postgres` | 生 PHP + PDO Postgres |
| `packages/php/pdo-sqlite` | 生 PHP + PDO SQLite |
| `packages/go/gorm` | Go + GORM |

## 初期スコープ

まず `@b4moss/crudian/bun-sqlite` を実装し、問題なければ他アダプタ・他言語へ展開する。

このドキュメントを仕様の正とする。
