# 共有 CRUD 契約

現行の公開語彙・戻り値・条件・ページングの正本（アダプタ非依存）。  
アダプタ固有の注入面・梱包は各ドメイン specs を参照。  
実装の正: `packages/js/src/types.ts` / `packages/go/crudian/`。

## 入口

`createCrud(db, options?)`（呼び出し側が作った接続／クライアントを注入。内部で接続を開かない）

### options

| 項目 | JS (`CreateCrudOptions`) | Go (`crudian.Options`) | 既定 |
|------|--------------------------|------------------------|------|
| 主キー列名 | `pk?: string` | `PK string` | `"id"` |
| SQL 方言 | `dialect?: "sqlite" \| "postgres" \| "mysql"` | `Dialect` / `Driver string` | sqlite（TypeORM は DataSource `type` から推論可） |
| プール | （文書化用型 `PoolOptions`。実設定は呼び出し側） | `Pool *PoolOptions`（GORM 適用・libSQL no-op） | — |

- 空文字 / 非文字列の `pk` は拒否（黙って `"id"` に落とさない）
- 表に PK 列が無いときは独自最小エラー
- 複合 PK は非対応

## メソッド

| メソッド | 戻り値・要点 |
|----------|--------------|
| `create` | 対象行 |
| `read` | 1件。未ヒットは `null`。`columns?` で投影可 |
| `search` | 正式。`paging?: "offset" \| "cursor"`（**未指定 = `"offset"`**）。offset 時 `{ items, total, offset, limit, hasMore }`、cursor 時 `{ items, nextCursor, hasMore, total }`。`total` は where 全件数 |
| `list` | `search` の別名（同じ `SearchQuery`） |
| `count` | where 全件数（`number` / Go `int64`）。`CountQuery` は `{ where? }` のみ |
| `exists` | where 一致の有無（`boolean`）。入力は `count` と同型（Go は `ExistsQuery`）。実装は `SELECT 1 … LIMIT 1` 相当 |
| `update` | 対象行。0件は `null` |
| `delete` | 影響件数 |
| `upsert` | conflict は **設定中の PK 列**。対象行。cols にその PK が必須 |
| `bulkCreate` / `bulkUpdate` / `bulkDelete` / `bulkUpsert` | 件数のみ |
| `duplicate` | 対象行。0件は `null`。新行の PK は DB 採番 |
| `transaction` | ヘルパのみ（自動では張らない） |

## 条件・演算子

- 公開 API はビルダー（木構造は内部表現）
- `eq` / `ne` / `lt` / `gt` / `lte` / `gte` / `in` / `like` / `isNull` / `isNotNull` + ネスト可能な and/or
- 空の `in([])` は拒否

## ページング

- デフォルト `"offset"`。cursor が必要なら `paging: "cursor"` を明示
- offset: `offset`（default `0`）+ `limit`
- cursor: `cursor` + `limit`（**PK 列**昇順 keyset。`nextCursor` は生の PK 値）
- モードと相反する入力（offset↔cursor）は拒否（独自最小エラー）
- 両モードとも当面単一 PK 列の昇順固定
- `total` / `count()` は where 全件数（limit / offset / cursor 非依存）

## その他

- 識別子は文字列必須・形式検証なし。不正時は下位例外
- 独自エラーは最小限。他は下位例外を伝播
- 全文検索には対応しない
- 行データはジェネリクス（Go は `map[string]any`）
- upsert はアプリ層（read → update / create）。SQL `ON CONFLICT` / `ON DUPLICATE KEY` は使わない

## 関連

- pillar: [`../../README.md`](../../README.md)
- テスト: [`../../tests/contract/`](../../tests/contract/)（`count` / offset・cursor / `exists` / 可変 PK）
