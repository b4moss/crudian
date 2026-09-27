# テスト仕様 — prisma

対象: `@b4moss/crudian/prisma`  
仕様: [`../../README.md`](../../README.md) / [`../../specs/prisma/`](../../specs/prisma/)  
参照実装: bun-sqlite（[`../bun-sqlite/core-crud.md`](../bun-sqlite/core-crud.md) / [`../bun-sqlite/extended-writes.md`](../bun-sqlite/extended-writes.md)）  
書き方: charter `tdd.md`（氷山パターン）

## 共通前提

| 項目 | 値 |
|------|-----|
| 契約 | bun-sqlite と同等の語彙・振る舞い（`createCrud` 入口、CRUD / search / list / upsert / duplicate / bulk* / transaction） |
| 共有 | 型・`where` ビルダー・`CrudianError` は `@b4moss/crudian` を利用 |
| ランタイム / テスト | **Node.js 24+** + `node:test`（`node --test`）。アダプタ固有（共有スイートなし） |
| DB | テスト用 SQLite（インメモリまたはファイル）。呼び出し側がクライアント／接続を注入 |
| upsert / bulkUpsert conflict | 主キー `id` |
| 単発書き込み戻り値 | 対象行（`read` / `update` / `duplicate` の0件は `null`） |
| bulk 戻り値 | 件数のみ |
| トランザクション | 自動では張らない。`transaction` ヘルパを提供 |
| 識別子 | 文字列必須。形式検証はしない（下位例外に任せる） |
| 独自エラー | 最小限。他は下位（ドライバ / ORM）例外を伝播 |

フィクスチャ表（例）は整数主キー `id` を持つ単表。スキーマはテスト内で用意してよい。  
**同等性の判定:** 同じ操作列に対し、bun-sqlite で期待する結果と同じ観測結果になること。


---

## Prisma アダプタ

パッケージ: `@b4moss/crudian/prisma`  
入口: `createCrud(client)`（PrismaClient 相当を注入。生クライアントを公開）  
テストランタイム・契約は Drizzle と同じ。

### prisma.createCrud

#### テスト：正常系

- 注入クライアントと公開参照が同一
- bun-sqlite / drizzle と同じメソッド一式を持つ
- テスト用 SQLite の PrismaClient で初期化できる

#### テスト: 異常系

- `client` が `null` / `undefined` / 想定外型なら拒否

---

### prisma.transaction

#### テスト：正常系

- 複数書き込みがコミットされる
- 戻り値が伝わる

#### テスト: 異常系

- throw でロールバック
- 非関数は拒否

---

### prisma.coreCrud

#### テスト：正常系

- `create` / `read` / `update` / `delete` が drizzle / bun-sqlite と同趣旨の結果

#### テスト: 異常系

- 未ヒット・0件の扱いが契約どおり（`null` / `0`）
- 文字列でないテーブル名は拒否
- 制約違反は下位例外

---

### prisma.searchList

#### テスト：正常系

- cursor ページングと条件ビルダーが契約どおり
- `list` === `search`

#### テスト: 異常系

- `limit` / `in` / 識別子の拒否が契約どおり

---

### prisma.extendedWrites

#### テスト：正常系

- `upsert` / `duplicate` / `bulk*` が契約どおり（戻り値・conflict=`id`）

#### テスト: 異常系

- `id` / where 欠落の拒否
- 制約違反は下位例外

---

---

## パッケージ境界・CI（prisma）

### adapterExports

- Node から `@b4moss/crudian/prisma` を import できる
- 共有契約 `@b4moss/crudian` を Node から import できる
- Bun 専用の `bun-sqlite` を Node から読んだ場合の誤 import 明示は維持

#### テスト：正常系

- Node 24+ で `@b4moss/crudian/prisma` を import できる

#### テスト: 異常系

- Node から `@b4moss/crudian/bun-sqlite` を読むと誤 import 明示エラー（既存）

### nodeAdapterCi

- `bun run test:prisma`（または同等）が Node 上で通る。Postgres / MySQL は `test:prisma:postgres` / `test:prisma:mysql`

----

以上
