# Crudian

DDD の Repository 層向け CRUD 抽象ライブラリ。

## 目的

- DB CRUD を抽象化し、各言語・ORM 向けに実装を提供する
- ライブラリ本体の DB 書き込みはインメモリ SQLite 等で担保する
- プロダクト側の Repository テストは Mock で高速に回す

## API

- `create`
- `read`（未ヒットは `null`）
- `list` / `search`（実質同義。片方正式・片方別名。カラム・条件・比較演算子・ネスト可能な and/or・複合検索）
- `update`
- `delete`
- `upsert`（conflict は主キー `id`）
- `bulkCreate`
- `bulkUpdate`
- `bulkDelete`
- `bulkUpsert`（conflict は主キー `id`）
- `duplicate`

## 備考

- `limit` と cursor 方式の pagination を提供する（offset は使わない）
- cursor は当面 `id` 昇順固定
- 全文検索には対応しない
- 行データはジェネリクスで型付けする
- 契約語彙は PHP / Go にも写せる形を先に寄せる

## 契約決定事項

実装前の一問一答で固定した事項（2026-08-13）。

| # | 項目 | 決定 |
|---|------|------|
| 1 | `read` 未ヒット | `null` を返す |
| 2 | `list` / `search` | 実質同じ（片方正式、片方別名） |
| 3 | cursor | 当面 `id` 昇順固定 |
| 4 | 条件 | ネスト可能な and/or 条件木 |
| 5 | upsert conflict | 主キー（`id`）前提 |
| 6 | 行型 | ジェネリクス |
| 7 | DB 生成（bun-sqlite） | 呼び出し側の `Database` を注入 |
| 8 | 生 `Database` | 最初から公開 |
| 9 | npm 配布 | 単一パッケージ + `dist`。`exports` 条件で Bun / Node を出し分ける |
| 10 | 契約の寄せ方 | PHP/Go にも写せる共通語彙として先に寄せる |

設計・進め方の詳細: [`docs/plans/bun-sqlite-adapter.md`](./plans/bun-sqlite-adapter.md)

## パッケージ構成

### JS（単一 npm パッケージ、実装は TypeScript）

パッケージ名: **`@b4moss/crudian`**（`packages/js`）

Node.js / Bun など JS エコシステム向け。ディレクトリ名の `js` は広範な呼称であり、実装言語は TypeScript。  
配布物は `dist`。subpath / `exports` 条件で Bun 向け（`bun-sqlite`）と Node 向け（`drizzle` / `prisma`）を出し分ける。

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

## 配布

| 言語 | 形態 | 取り込み先 |
|------|------|------------|
| JS/TS | npm（`@b4moss/crudian`） | Bun / Node 向けテンプレートリポジトリ |
| PHP | Composer / Laravel package | PHP / Laravel 向けテンプレートリポジトリ |
| Go | Go module | Go 向けテンプレートリポジトリ |

思想の正典は charter の薄い DDD と iron-rule の `internal/db/crud`（および nook の `CrudTrait`）。本ライブラリはその共通 CRUD を言語横断でパッケージ化する。

## 初期スコープ

まず `@b4moss/crudian/bun-sqlite` を実装し（v0.1.0）、テスト整備（v0.2.0）のあと他アダプタへ展開する（v0.3.0）。

設計と進め方: [`docs/plans/bun-sqlite-adapter.md`](./plans/bun-sqlite-adapter.md)

このドキュメントを仕様の正とする。
