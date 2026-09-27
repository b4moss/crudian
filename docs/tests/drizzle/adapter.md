# テスト仕様 — drizzle

対象: `@b4moss/crudian/drizzle`  
仕様: [`../../README.md`](../../README.md) / [`../../specs/drizzle/`](../../specs/drizzle/)  
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

## Drizzle アダプタ

パッケージ: `@b4moss/crudian/drizzle`  
入口: `createCrud(db)`（Drizzle の DB クライアントを注入。生クライアントを公開）

### drizzle.createCrud

- 注入した Drizzle DB と同じ参照を Facade から読める
- `create` / `read` / `update` / `delete` / `upsert` / `duplicate` / `bulk*` / `search` / `list` / `transaction` を持つ
- パスや接続を内部生成しない

#### テスト：正常系

- 注入クライアントと `crud.db`（または同等の公開プロパティ）が同一参照
- 上記メソッドがすべて関数として存在する
- テスト用 SQLite 接続を渡して初期化エラーなく使える

#### テスト: 異常系

- `db` が `null` / `undefined` のとき拒否する
- `db` が想定外型のとき拒否する

---

### drizzle.transaction

- コールバックをトランザクション内で実行する
- 成功時コミット、例外時ロールバック
- 各 CRUD は自動では TX を張らない

#### テスト：正常系

- コールバック内の複数 `create` がコミットされ、終了後にすべて読める
- コールバックの戻り値が伝わる

#### テスト: 異常系

- コールバック throw でロールバックされ、部分書き込みが残らない
- 非関数コールバックは拒否する

---

### drizzle.coreCrud

`create` / `read` / `update` / `delete`（v0.1.0 相当）

#### テスト：正常系

- `create` が対象行を返し、`id` が採番される
- `read` が1件を返す。カラム制限ができる
- `update` が更新後行を返す。未指定カラムは維持
- `delete` が影響件数を返す

#### テスト: 異常系

- `read` 未ヒットは `null`
- `update` 0件は `null`
- `delete` 0件は `0`
- テーブル名が文字列でないとき拒否
- 制約違反は下位例外

---

### drizzle.searchList

`search`（正式）/ `list`（別名）、条件ビルダー、cursor

#### テスト：正常系

- `items` が `id` 昇順
- `limit` 未満で `hasMore=false`、`nextCursor=null`
- ページングで続きが重複なく取れる
- `list` と `search` が同結果
- `eq` / `and` / `or` / 比較 / `in` / `like` / `isNull` / `isNotNull` が絞り込める

#### テスト: 異常系

- `limit` 不正は拒否
- `in` 空配列は拒否
- カラム名が文字列でないとき拒否

---

### drizzle.extendedWrites

`upsert` / `duplicate` / `bulk*`（v0.2.0 相当）

#### テスト：正常系

- `upsert`: 未存在 id は挿入、既存 id は更新。未指定カラムは更新時維持
- `duplicate`: 新 id でコピー。overrides 反映。0件は `null`
- `bulkCreate` / `bulkUpdate` / `bulkDelete` / `bulkUpsert` が件数のみ返す
- 空配列の bulk は `0`（no-op）

#### テスト: 異常系

- `upsert` / `bulkUpsert` で `id` 欠落は拒否
- `duplicate` / `bulkUpdate` / `bulkDelete` で where 欠落は拒否
- 制約違反は下位例外

---

---

## パッケージ境界・CI（drizzle）

### adapterExports

- Node から `@b4moss/crudian/drizzle` を import できる
- 共有契約 `@b4moss/crudian` を Node から import できる

#### テスト：正常系

- Node 24+ で `@b4moss/crudian/drizzle` を import できる

### nodeAdapterCi

- `bun run test:drizzle`（または同等）が Node 上で通る

----

以上
