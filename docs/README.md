# Crudian

DDD の Repository 層向け CRUD 抽象ライブラリ。

## 目的

- DB CRUD を抽象化し、各言語・ORM 向けに実装を提供する
- ライブラリ本体の DB 書き込みはインメモリ SQLite 等で担保する
- プロダクト側の Repository テストは Mock で高速に回す

## API

入口: `createCrud(db, options?)`（呼び出し側の接続／クライアントを注入。内部で開かない）

**options（JS `CreateCrudOptions` / Go `crudian.Options`）**

| 項目 | JS | Go | 既定 |
|------|----|----|------|
| 主キー列名 | `pk?: string` | `PK string` | `"id"` |
| SQL 方言 | `dialect?: "sqlite" \| "postgres" \| "mysql"` | `Dialect` / `Driver` | sqlite（TypeORM は `DataSource.options.type` から推論可） |
| 接続プール | （型 `PoolOptions` は文書化用。実体は呼び出し側） | `Pool *PoolOptions`（GORM 適用・libSQL no-op） | — |

- `create`（対象行を返す）
- `read`（未ヒットは `null`。`columns?` で投影可）
- `search`（正式。`paging?: "offset" | "cursor"`（**未指定 = `"offset"`**）。offset 時は `{ items, total, offset, limit, hasMore }`、cursor 時は `{ items, nextCursor, hasMore, total }`。`total` は where 全件数。`columns?` / `where?` / `limit?` / `offset?` / `cursor?`）
- `list`（`search` の別名。同じ `SearchQuery`＝`columns` 含む）
- `count`（where 全件数を `number` で返す。`CountQuery` は `{ where? }` のみ。`columns` は受け取らない）
- `exists`（where 一致行の有無を `boolean` で返す。入力は `count` と同型。件数は返さない）
- `update`（対象行を返す。0件なら `null`）
- `delete`（影響件数を返す）
- `upsert`（conflict は **設定中の PK 列**（既定 `id`）。対象行を返す。cols にその PK が必須）
- `bulkCreate` / `bulkUpdate` / `bulkDelete` / `bulkUpsert`（いずれも件数のみ返す）
- `duplicate`（対象行を返す。0件なら `null`。新行の PK は採番に任せる）
- `transaction`（ヘルパ。ライブラリは自動ではトランザクションを張らない）

### 条件・演算子

- 公開 API はビルダー（木構造は内部表現）
- 初期演算子: `eq` / `ne` / `lt` / `gt` / `lte` / `gte` / `in` / `like` / `isNull` / `isNotNull`

## 備考

- `limit` と pagination を提供する。方式は `paging` で切替（**デフォルト `"offset"`**。cursor が必要なら `paging: "cursor"` を明示）
- offset 時は `offset`（default `0`）+ `limit`。cursor 時は `cursor` + `limit`（**PK 列**昇順 keyset。`nextCursor` は生の PK 値）
- モードと相反する入力（offset↔cursor）は拒否する（独自最小エラー）
- 両モードとも当面 **単一 PK 列**の昇順固定（列名は `pk` / `PK` で変更可。複合 PK は非対応）
- 空文字 / 非文字列の `pk` は拒否。表に列が無いときは独自最小エラー（下位例外に任せない）
- `search` / `list` の `total` と `count()` は where 全件数（limit / offset / cursor 非依存）。`count` は `search` と同じ where コンパイルを流用する
- 存在の有無だけが必要なら `exists`、件数が必要なら `count`（`exists` は `count > 0` の糖衣。実装は `SELECT 1 … LIMIT 1`）
- Go の接続プール／lifetime は `Options.Pool` / `ApplyPool`（GORM で適用、libSQL は no-op）
- JS のプールは呼び出し側（Prisma datasource / TypeORM DataSource 等）。型 `PoolOptions` は文書化用。SQLite アダプタは no-op（#73 / [`tests/dialect/mysql-postgres.md`](./tests/dialect/mysql-postgres.md)）
- **Dialect:** SQLite / Postgres / MySQL。JS は Prisma / TypeORM の `options.dialect`（TypeORM は DataSource `type` からも推論）。Go は GORM の `Options.Driver` / `Dialect`。Drizzle / bun-sqlite / libsql は SQLite のみ。MySQL は `RETURNING` 非使用（insert 後 SELECT）
- 全文検索には対応しない
- 行データはジェネリクスで型付けする（Go は `map[string]any`）
- 契約語彙は PHP / Go にも写せる形を先に寄せる
- 識別子（テーブル・カラム名）は形式検証しない。ただし文字列必須。不正時は下位例外を伝播する
- 独自エラーは最小限。それ以外は下位例外を伝播する

## 契約決定事項

実装前の一問一答で固定した事項（2026-08-13）。

### 第1弾

| # | 項目 | 決定 |
|---|------|------|
| 1 | `read` 未ヒット | `null` を返す |
| 2 | `list` / `search` | 実質同じ（片方正式、片方別名） |
| 3 | cursor | 当面単一 PK 列の昇順固定（列名は後に `pk` / `PK` で変更可。#72） |
| 4 | 条件 | ネスト可能な and/or 条件木 |
| 5 | upsert conflict | 主キー前提（既定列名 `id`。#72 で変更可） |
| 6 | 行型 | ジェネリクス |
| 7 | DB 生成（bun-sqlite） | 呼び出し側の `Database` を注入 |
| 8 | 生 `Database` | 最初から公開 |
| 9 | npm 配布 | 単一パッケージ + `dist`。`exports` 条件で Bun / Node を出し分ける |
| 10 | 契約の寄せ方 | PHP/Go にも写せる共通語彙として先に寄せる |

### 第2弾

| # | 項目 | 決定 |
|---|------|------|
| 1 | 正式 API 名 | `search` を正式、`list` は別名 |
| 2 | 条件 API | ビルダーを主とし、木構造は内部表現 |
| 3 | 演算子 | `eq/ne/lt/gt/lte/gte/in/like` + `isNull` / `isNotNull` |
| 4 | cursor レスポンス | `{ items, nextCursor, hasMore }`（v0.5.0 で `total` を追加。v0.8.0 で `paging` 切替・デフォルト offset） |
| 5 | 書き込み戻り値 | `create`/`update`/`upsert`/`duplicate` は対象行、`delete` は影響件数 |
| 6 | エラー | 独自は最小限。他は SQLite 例外を伝播 |
| 7 | 識別子 | 形式検証なし（文字列必須のみ） |
| 8 | トランザクション | 自動では張らない。`transaction()` ヘルパを同時実装 |
| 9 | ビルド | `tsc` で `dist` を生成 |
| 10 | Node からの誤 import | 解決は可能だが、読み込み時に「誤って import していませんか？」と明示エラー |

### 第3弾

| # | 項目 | 決定 |
|---|------|------|
| 1 | `update` / `duplicate` の0件 | `null` を返す |
| 2 | `nextCursor` | 生の PK 値（既定列 `id`） |
| 3 | `bulk*` 戻り値 | すべて件数のみ |
| 4 | ファクトリ名 | `createCrud(db, options?)` |

契約・アダプタ仕様: [`specs/contract/`](./specs/contract/) / [`specs/bun-sqlite/`](./specs/bun-sqlite/) / [`specs/libsql/`](./specs/libsql/)。

## パッケージ構成

### JS（単一 npm パッケージ、実装は TypeScript）

パッケージ名: **`@b4moss/crudian`**（`packages/js`）

Node.js / Bun など JS エコシステム向け。ディレクトリ名の `js` は広範な呼称であり、実装言語は TypeScript。  
配布物は `tsc` で生成した `dist`。subpath / `exports` 条件で Bun 向け（`bun-sqlite`）と Node / Bun 向け（`drizzle` / `prisma` / `libsql` / `typeorm`）を出し分ける。  
Node から `@b4moss/crudian/bun-sqlite` を読んだ場合は、読み込み時に誤 import を示す明示エラーを出す。  
現行公開版: `packages/js/package.json`（いま **`0.11.0`**）。

| subpath | 対象 |
|---------|------|
| `@b4moss/crudian` | 共有契約・型（`where` / `CreateCrudOptions` / `PoolOptions` 等） |
| `@b4moss/crudian/bun-sqlite` | Bun `bun:sqlite`（sync） |
| `@b4moss/crudian/drizzle` | Drizzle + better-sqlite3（sync・SQLite のみ） |
| `@b4moss/crudian/prisma` | Prisma（async。SQLite / Postgres / MySQL） |
| `@b4moss/crudian/libsql` | libSQL（`@libsql/client`。async・SQLite 互換） |
| `@b4moss/crudian/typeorm` | TypeORM `DataSource`（async。SQLite / Postgres / MySQL） |

```ts
import { createCrud } from "@b4moss/crudian/bun-sqlite"

const crud = createCrud(db)
const byItemId = createCrud(db, { pk: "item_id" })
```

アダプタ詳細: [`specs/bun-sqlite/`](./specs/bun-sqlite/) / [`drizzle`](./specs/drizzle/) / [`prisma`](./specs/prisma/) / [`libsql`](./specs/libsql/) / [`typeorm`](./specs/typeorm/)

### PHP（未実装）

Packagist **`b4moss/crudian`** 単一パッケージを予定。方針・層分割の正本は [`plans/unscheduled/php-package.md`](./plans/unscheduled/php-package.md)（#127）。

### Go

| パス | 対象 |
|------|------|
| `packages/go` | Go module `github.com/b4moss/crudian/go`（`crudian` / `gorm` / `libsql`） |

詳細: [`specs/go/`](./specs/go/)

## ランタイム / テスト

- 対応ランタイム: **Node.js 24+**、および Bun（Go **1.26+** / PHP パッケージは各言語の通常ランタイム）
- テストはアダプタごとに、**そのアダプタが動くランタイムで**行う（共通テストの共有はしない）
- ローカル / E2E 用の全部入り環境: [`docker/README.md`](../docker/README.md)（Node 24 / Bun / Go 1.26 / PHP + Postgres / MySQL / MariaDB）

| アダプタ | ランタイム | テスト |
|----------|------------|--------|
| `bun-sqlite` | Bun | `bun:test`（`bun test`） |
| `drizzle` | Node.js 24+ | `node:test`（`node --test`） |
| `prisma` | Node.js 24+ | `node:test`（SQLite 常時。Postgres / MySQL は `test:prisma:postgres` / `test:prisma:mysql`） |
| `libsql`（JS） | Node.js 24+ / Bun | `node:test`（`node --test`） |
| `typeorm` | Node.js 24+ / Bun | `node:test` / `bun:test`（SQLite + Postgres / MySQL） |
| `go/gorm` | Go 1.26+ | `go test`（SQLite + Postgres / MySQL 契約。後者は実 DB） |
| `go/libsql` | Go 1.26+ | `go test`（公式 libSQL `database/sql`、SQLite 互換） |

## マイルストーン

機能単位で実装とインメモリテストを同時に閉じる。詳細は [`docs/roadmap.md`](./roadmap.md)。

| バージョン | 内容 |
|------------|------|
| **v0.1.0** | Core CRUD Trait（`createCrud` / 基本 CRUD / `search`・`list` / 条件ビルダー / `transaction` / 梱包骨格 + テスト） |
| **v0.2.0** | Extended writes（`upsert` / `duplicate` / `bulk*` + テスト。Bun テンプレ試し食いは推奨） |
| **v0.3.0** | Drizzle / Prisma で同等の実装とテストが通ること |
| **v0.5.0** | `count()` と `SearchResult.total`（#47） |
| **v0.6.0** | libSQL アダプタ（`@b4moss/crudian/libsql` / `@libsql/client`。#42） |
| **v0.7.0** | Go モジュール（`go/gorm` + `go/libsql`。初版は SQLite。#48） |
| **v0.8.0** | `search` / `list` の offset pagination と `paging` 切替（デフォルト `"offset"`。#90）。可変 PK（`pk` / `PK`。#72）。JS 全アダプタ + Go |
| **v0.9.0** | `exists` / `Exists`（boolean 糖衣。#106）。Go 接続プール／lifetime（GORM 適用・libSQL no-op。#105。JS は #73 / v0.10.0） |
| **v0.10.0** | Dialect / MySQL・Postgres（#73）。JS Prisma + Go GORM。JS プール文書化（#105 連動）。受け入れ: [`tests/dialect/mysql-postgres.md`](./tests/dialect/mysql-postgres.md) |
| **v0.11.0** | TypeORM アダプタ（#43）+ codecov 75%（#96）。受け入れ: [`tests/typeorm/adapter.md`](./tests/typeorm/adapter.md) |

## バージョン方針

- **言語（配布物）ごとに独立した SemVer** を持つ
  - JS/TS: `packages/js/package.json` → npm `@b4moss/crudian`（現行 **`0.11.0`**）。git タグ `vX.Y.Z`
  - Go: `packages/go/VERSION` → module `github.com/b4moss/crudian/go`（現行 **`0.11.0`**）。git タグ `packages/go/vX.Y.Z`
  - PHP: `packages/php/composer.json` → Packagist `b4moss/crudian`。git タグ `packages/php/vX.Y.Z`（未実装・`packages/php/` はプレースホルダのみ）
- **同一言語パッケージ内**ではアダプタ別バージョンは切らない（JS の bun-sqlite / drizzle / prisma / libsql / typeorm、Go の gorm / libsql、PHP の PDO / libSQL はいずれも単一配布物に同梱）
- 言語間で版が揃わない・飛ぶことは **許容**（歴史的には npm `0.6.0` のまま Go だけ `0.7.0` を初公開した）
- マイルストーン名（リポジトリ計画の v0.7.0 等）は作業単位であり、各言語の公開 SemVer と 1:1 である必要はない

## 配布

| 言語 | 形態 | 備考 |
|------|------|------|
| JS/TS | npm（`@b4moss/crudian`） | レジストリへ publish。CD: `release` + タグ `v*` |
| PHP | Packagist（`b4moss/crudian`） | 単一 Composer パッケージ。未実装。CD は後続 |
| Go | Go module（module path = 正） | npm 相当の独自レジストリは使わない。消費は `go get` + git タグ。CD は Release 作成と proxy への ping のみ（[`.github/CI.md`](../.github/CI.md)） |

思想の正典は charter の薄い DDD と iron-rule の `internal/db/crud`（および nook の `CrudTrait`）。本ライブラリはその共通 CRUD を言語横断でパッケージ化する。

## 索引

- 契約・アダプタ仕様: [`specs/`](./specs/)
- これからやる内容: [`plans/`](./plans/)（PHP は [`plans/unscheduled/php-package.md`](./plans/unscheduled/php-package.md)）
- ロードマップ: [`roadmap.md`](./roadmap.md)
- テスト仕様: [`tests/`](./tests/README.md)
- OKF 索引: [`index.md`](./index.md)

本ファイルはプロダクトの **pillar**（目的・スコープ・技術方針のハブ）。現行振る舞いの詳細正本は `specs/`。
