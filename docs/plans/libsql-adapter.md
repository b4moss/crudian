# libSQL Adapter — 設計と進め方

`@b4moss/crudian/libsql` を、既存の async 共有層（prisma と同型）で追加する方針のメモ。  
仕様の正は [`docs/main.md`](../main.md)。マイルストーン割当は [`roadmap.md`](./roadmap.md)。  
受け入れテストは [`docs/tests/v0.6.0.md`](../tests/v0.6.0.md)。  
関連 Issue: [#42](https://github.com/b4moss/crudian/issues/42)（マイルストーン v0.6.0）

## 製品意図

- Node.js / Bun から **libSQL クライアント**（`@libsql/client`）経由で、既存 CRUD 契約を使えるようにする
- ホスト先はローカルファイル・`:memory:`・リモート（Turso Cloud 等）のいずれでもよいが、**アダプタ名とサブパスはプロトコル／SDK 名の libSQL に揃える**
- 商業サービス名 **Turso はサブパスに使わない**（Issue タイトルの歴史的経緯として残っても、公開 API は `libsql`）

## 命名

| 項目 | 値 |
|------|-----|
| npm subpath | `@b4moss/crudian/libsql` |
| ソース | `packages/js/src/libsql/` |
| peer | `@libsql/client`（optional） |
| 型名（案） | `LibsqlLikeClient` / `LibsqlCrud` |
| テストスクリプト | `test:libsql` |

## 層分割

| 層 | 置き場 | 役割 |
|----|--------|------|
| 契約 | `@b4moss/crudian` | 既存の型・`where`・`CrudianError`（変更なしが原則） |
| 共有実装 | `packages/js/src/sqlite/async-crud.ts` | async CRUD 本体（prisma と共用） |
| 具象 | `@b4moss/crudian/libsql` | `@libsql/client` の `execute` / `transaction` を executor に橋渡し |

bun-sqlite を参照実装とし、本アダプタは **prisma と同等の観測結果**で測る（async）。

## API 形

```ts
import { createClient } from "@libsql/client"
import { createCrud } from "@b4moss/crudian/libsql"
import { where } from "@b4moss/crudian"

const client = createClient({ url: process.env.LIBSQL_URL ?? "file:local.db" })
const crud = createCrud(client)

await crud.create("items", { name: "alpha", score: 1 })
await crud.search("items", { where: where().eq("name", "alpha") })
```

- 入口は `createCrud(client)`。接続生成は呼び出し側
- 生の client を `crud.db` で公開（JOIN 等の非 CRUD 用）
- メソッドは prisma と同じ async 面（`create` / `read` / `update` / `delete` / `search` / `list` / `count` / `upsert` / `duplicate` / `bulk*` / `transaction`）
- SQL 方言は既存 `sqlite/sql`（`?` プレースホルダ）。libSQL の名前付き引数は使わない

## Executor 橋渡し

prisma アダプタと同様に、`createAsyncSqliteCrud(client, ex)` へ渡す。

| executor | libSQL |
|----------|--------|
| `run(sql, args)` | `execute({ sql, args })` → `{ changes: rowsAffected }` |
| `get(sql, args)` | 同上 → `rows[0]`（なければ `undefined`） |
| `all(sql, args)` | 同上 → `rows` |
| `transaction(fn)` | `client.transaction("write")` で interactive TX。成功 `commit`、失敗 `rollback`、終了時 `close`。TX 中は `active` を tx に切替 |

行オブジェクトは plain object に正規化する（bigint 等は Number 化を prisma に合わせる）。

### 注入面（最小）

`LibsqlLikeClient` は実 SDK 全体を型依存せず、次を満たせばよい。

- `execute(stmt: { sql: string; args?: unknown[] } | string): Promise<{ rows: Row[]; rowsAffected: number }>`
- `transaction(mode: "write" | "read" | "deferred"): Promise<TransactionLike>`（Transaction も `execute` を持つ）

## テスト方針

| 項目 | 値 |
|------|-----|
| ランタイム | Node.js 24+ + `node:test`（drizzle / prisma と同じ） |
| DB | 一時ファイル（`file:...`）。クラウド資格情報不要。`:memory:` は推奨しない（TX で別接続になりやすい） |
| 契約 | v0.1 / v0.2 / v0.5 相当を libsql で一式（[`v0.6.0.md`](../tests/v0.6.0.md)） |
| 非対象 | リモート Turso Cloud E2E、認証トークン前提 |

## 梱包

- `package.json` の `exports["./libsql"]`
- optional peerDependencies: `@libsql/client`
- CI: `node-adapters` ジョブに `bun run test:libsql`

## 意図的な非対応

- サブパス `turso`
- `@tursodatabase/serverless` 専用アダプタ（別 Issue）
- ORM 風モデル、マイグレーション、全文検索、offset ページング
- ライブラリ内部での自動トランザクション（ヘルパのみ）

## 決定事項（v0.6.0）

| # | 項目 | 決定 |
|---|------|------|
| 1 | サブパス | `@b4moss/crudian/libsql`（商業名 Turso は使わない） |
| 2 | SDK | `@libsql/client` |
| 3 | sync / async | async（prisma と同型） |
| 4 | 共有層 | `createAsyncSqliteCrud` を再利用 |
| テスト DB | 一時ファイル（`file:...`）。`:memory:` は接続／interactive TX で別 DB になりやすい |
| 6 | マイルストーン | v0.6.0（#42）。v0.5.0 の count とは別スコープ |
| 7 | 版上げ | JS パッケージ `@b4moss/crudian` を `0.6.0` へ（Go 等の他言語版とは独立） |
