# 共有 CRUD 契約

現行の公開語彙・戻り値・条件・ページングの正本（アダプタ非依存）。  
アダプタ固有の注入面・梱包は各ドメイン specs を参照。

## 入口

`createCrud(db)`（呼び出し側が作った接続／クライアントを注入。内部で接続を開かない）

## メソッド

| メソッド | 戻り値・要点 |
|----------|--------------|
| `create` | 対象行 |
| `read` | 1件。未ヒットは `null`。`columns?` で投影可 |
| `search` | 正式。`paging?: "offset" \| "cursor"`（**未指定 = `"offset"`**）。offset 時 `{ items, total, offset, limit, hasMore }`、cursor 時 `{ items, nextCursor, hasMore, total }`。`total` は where 全件数 |
| `list` | `search` の別名（同じ `SearchQuery`） |
| `count` | where 全件数（`number`）。`CountQuery` は `{ where? }` のみ |
| `exists` | where 一致の有無（`boolean`）。入力は `count` と同型。実装は `SELECT 1 … LIMIT 1` 相当 |
| `update` | 対象行。0件は `null` |
| `delete` | 影響件数 |
| `upsert` | conflict は主キー `id`。対象行 |
| `bulkCreate` / `bulkUpdate` / `bulkDelete` / `bulkUpsert` | 件数のみ |
| `duplicate` | 対象行。0件は `null` |
| `transaction` | ヘルパのみ（自動では張らない） |

## 条件・演算子

- 公開 API はビルダー（木構造は内部表現）
- `eq` / `ne` / `lt` / `gt` / `lte` / `gte` / `in` / `like` / `isNull` / `isNotNull` + ネスト可能な and/or

## ページング

- デフォルト `"offset"`。cursor が必要なら `paging: "cursor"` を明示
- offset: `offset`（default `0`）+ `limit`
- cursor: `cursor` + `limit`（`id` 昇順 keyset。`nextCursor` は生の `id`）
- モードと相反する入力（offset↔cursor）は拒否（独自最小エラー）
- 両モードとも当面 `id` 昇順固定
- `total` / `count()` は where 全件数（limit / offset / cursor 非依存）

## その他

- 識別子は文字列必須・形式検証なし。不正時は下位例外
- 独自エラーは最小限。他は下位例外を伝播
- 全文検索には対応しない
- 行データはジェネリクス（Go は `map[string]any`）

## 関連

- pillar: [`../../README.md`](../../README.md)
- テスト: [`../../tests/contract/`](../../tests/contract/)
