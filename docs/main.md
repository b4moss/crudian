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

## ランタイム / テスト

- 対応ランタイム: **Node.js 22+**、および Bun
- テストはアダプタごとに、**そのアダプタが動くランタイムで**行う（共通テストの共有はしない）

| アダプタ | ランタイム | テスト |
|----------|------------|--------|
| `bun-sqlite` | Bun | `bun:test`（`bun test`） |
| `drizzle` | Node.js 22+ | `node:test`（`node --test`） |
| `prisma` | Node.js 22+ | `node:test`（`node --test`） |

## マイルストーン

| バージョン | 内容 |
|------------|------|
| **v0.1.0** | `bun:sqlite` で全メソッド実装 |
| **v0.2.0** | `bun:sqlite` の単体・結合テストと DB インメモリテストが通ること |
| **v0.3.0** | Drizzle / Prisma で同等の実装とテストが通ること |

## 初期スコープ

まず `@b4moss/crudian/bun-sqlite` を実装し（v0.1.0）、テスト整備（v0.2.0）のあと他アダプタへ展開する（v0.3.0）。

このドキュメントを仕様の正とする。
