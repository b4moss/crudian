# Go Module — 設計と進め方

JS 版（`@b4moss/crudian`）の CRUD 契約を Go へ移植する方針のメモ。  
仕様の正は [`docs/main.md`](../main.md)。マイルストーン割当は [`roadmap.md`](./roadmap.md)。  
受け入れテストは [`docs/tests/v0.7.0.md`](../tests/v0.7.0.md)。  
関連 Issue: [#48](https://github.com/b4moss/crudian/issues/48)（マイルストーン v0.7.0）  
参照: JS 先行（#47 count / #42 libSQL）、Dialect 将来拡張（#73）、可変 PK（#72・本マイルストーン外）

## 製品意図

- charter / 薄い DDD の共通 CRUD を **Go module** として配布する
- メソッド語彙・Adapter 切り分けは Node.js 版と同等
- GORM は各種 RDB に繋がるため、**初手から Dialect 層を切る**（実装はまず SQLite。他方言は stub）
- 実装順: (1) GORM / SQLite (2) libSQL SDK

## 命名・パス

単一 `go.mod`（ネスト module は使わない）:

| 項目 | 値 |
|------|-----|
| module | `github.com/b4moss/crudian/go` |
| 配置 | `packages/go/` |
| 共有 | `github.com/b4moss/crudian/go/crudian` |
| GORM adapter | `github.com/b4moss/crudian/go/gorm` |
| libSQL adapter | `github.com/b4moss/crudian/go/libsql` |
| Go バージョン | **1.26.x**（docker イメージに合わせる） |

## 層分割

```text
packages/go/
  go.mod
  crudian/     # 契約・where・Dialect・CRUD 本体・Executor
  gorm/        # CreateCrud(*gorm.DB)
  libsql/      # CreateCrud(*sql.DB) + 公式 libSQL driver
```

| 層 | 置き場 | 役割 |
|----|--------|------|
| 契約 | `go/crudian` | 型・`Where`・`CrudianError`・`SearchResult` 等 |
| Dialect | `go/crudian` | `SqliteDialect` 実装。Postgres/MySQL は stub / コメント |
| CRUD | `go/crudian` | Executor + Dialect で全メソッドを実装 |
| 具象 | `go/gorm` / `go/libsql` | 注入クライアントを Executor に橋渡し |

JS の bun-sqlite を契約の正とし、Go は **同等の観測結果**で測る。

## API 形

**同期 + `context.Context`**（全メソッド第1引数）。JS の sync/async 分裂は作らない。

```go
import (
  "context"
  "github.com/b4moss/crudian/go/crudian"
  "github.com/b4moss/crudian/go/gorm"
)

crud := gorm.CreateCrud(db) // *gorm.DB を注入。接続は呼び出し側

row, err := crud.Create(ctx, "items", map[string]any{"name": "alpha", "score": 1})
page, err := crud.Search(ctx, "items", crudian.SearchQuery{
  Where: crudian.Where().Eq("name", "alpha"),
  Limit: 20,
})
```

- 入口は `CreateCrud(db)`。内部で接続を生成しない
- 生の DB を公開（GORM: `*gorm.DB`、libSQL: `*sql.DB`）
- メソッド: `Create` / `Read` / `Update` / `Delete` / `Search` / `List` / `Count` / `Upsert` / `Duplicate` / `BulkCreate` / `BulkUpdate` / `BulkDelete` / `BulkUpsert` / `Transaction`
- 行は `map[string]any`（ジェネリクスは必要なら後続）。モデル／構造体マッピングはしない
- エラーは `(T, error)`。未ヒットの `Read` / `Update` / `Duplicate` は `(nil, nil)` 相当（行なしを error にしない）

### 契約の固定（JS と同じ）

| 項目 | 値 |
|------|-----|
| upsert / bulkUpsert conflict | 主キー列名 `id`（#72 の可変 PK は対象外） |
| cursor | `id` 昇順。`NextCursor` は生の `id` |
| `SearchResult` | `Items`, `NextCursor`, `HasMore`, `Total` |
| `Count` | where 全件数。`limit` / `cursor` / `columns` は受け取らない |
| `columns` | `Read` / `Search` / `List` で投影可。省略は全列 |
| 識別子 | 文字列必須。形式検証なし |
| 独自エラー | 最小限。他はドライバ / GORM 例外を伝播 |
| TX | 自動では張らない。`Transaction` ヘルパのみ |

## Dialect

```go
type Dialect interface {
  QuoteIdent(name string) string
  Placeholder(n int) string // 1-based or 0-based は Sqlite 実装で ? 固定でも可
  // insert 後の行取得・upsert 用フックは SqliteDialect が担う
}
```

- **実装する**: `SqliteDialect`（`"ident"`、`?`、既存 JS SQLite SQL と同趣旨）
- **stub**: Postgres / MySQL（コメントで空白。GORM で SQLite 以外は本マイルストーンのスコープ外）

## Executor

```go
type Executor interface {
  Run(ctx context.Context, sql string, args ...any) (int64, error) // rows affected
  Get(ctx context.Context, sql string, args ...any) (crudian.Row, error) // miss → nil, nil
  All(ctx context.Context, sql string, args ...any) ([]crudian.Row, error)
  Transaction(ctx context.Context, fn func(tx Executor) error) error
}
```

### GORM 橋渡し

- `db.WithContext(ctx).Raw` / `Exec` / `Scan`
- モデル API・Association は使わない（単表 + map）

### libSQL 橋渡し

- 公式 `github.com/tursodatabase/libsql-client-go` の `database/sql` ドライバを第一候補
- `*sql.DB` を注入。テストはクラウド資格情報なしの一時 `file://`（絶対パス。`:memory:` は TX で避ける）
- local `file://` 時、当該ドライバは登録済みの `sqlite` / `sqlite3` へ委譲する（テストでは `modernc.org/sqlite` を blank import）
- upstream は deprecated 表記あり。不通なら `go-libsql`（CGO）へフォールバックし README / Issue に理由を残す

## テスト方針

| 項目 | 値 |
|------|-----|
| ランタイム | Go 1.26 + `testing` |
| DB | 一時ファイル（推奨）または SQLite `:memory:`（ドライバが TX で安全な場合） |
| 契約 | JS v0.1 / v0.2 / v0.5 / v0.6 相当を gorm・libsql で一式 |
| 非対象 | リモート Turso Cloud E2E、GORM の PG/MySQL、可変 PK |

詳細: [`docs/tests/v0.7.0.md`](../tests/v0.7.0.md)

## CI / 梱包 / 版

- CI: [`.github/CI.md`](../../.github/CI.md) — `packages/go` 変更時のみ lint（`gofmt` / `vet`）+ `go test ./...`（Go 1.26）
- 公開版: `packages/go/VERSION`（初版 **0.7.0**）。npm の版とは独立
- git タグ: **`packages/go/vX.Y.Z`**（ネスト module の慣習）。ルート `vX.Y.Z` は JS npm 用
- 配布の正は **module path**（`github.com/b4moss/crudian/go`）。独自パッケージレジストリへの upload はしない。`go get` が git タグを解決する（proxy.golang.org はキャッシュ）
- CD: `.github/workflows/publish-go.yml` — タグ存在時に GitHub Release + proxy ping
- README: ルート / `packages/go`（英語）

## 意図的な非対応（v0.7.0）

- GORM での SQLite 以外の RDB（#48 スコープ外。#73 は JS 側の話）
- 可変 PK カラム名（#72）
- ORM 風モデル、マイグレーション、全文検索、offset ページング
- PHP
- goroutine / channel による擬似 async API
- npm 同時版上げ（JS に変更がなければ `0.6.0` のままでよい）

## 決定事項（2026-08-25 / #48）

| # | 項目 | 決定 |
|---|------|------|
| 1 | Module path | `github.com/b4moss/crudian/go` + パッケージ `gorm` / `libsql` / `crudian` |
| 2 | API 形 | 同期 + `context.Context`（全メソッド） |
| 3 | Dialect | 初手からインタフェース。Sqlite 実装 + 他 stub |
| 4 | libSQL | 公式 `libsql-client-go` 第一候補（local `file://` は companion sqlite 要） |
| 5 | 実装順 | GORM/SQLite → libSQL |
| 6 | マイルストーン | v0.7.0（Go 公開 SemVer 初版も 0.7.0） |
| 7 | PK / cursor | 当面 `id` 固定 |
| 8 | 言語間バージョン | 独立可（npm 据え置きで Go のみリリース可） |
| 9 | 配布 | module path + `packages/go/v*` タグ。レジストリ upload なし |
