# Roadmap — bun:sqlite CRUD Trait

`@b4moss/crudian/bun-sqlite` を参照実装として、機能をマイルストーンに割り当てる。  
仕様の正は [`docs/main.md`](../main.md)。設計詳細は [`bun-sqlite-adapter.md`](./bun-sqlite-adapter.md)。libSQL は [`libsql-adapter.md`](./libsql-adapter.md)。Go は [`go-module.md`](./go-module.md)。

## 方針

- 入口は `createCrud(db)`。単表 CRUD Facade + Adapter
- **機能単位で実装とインメモリ DB テスト（Bun + `bun:test`）を同時に閉じる**
- 旧定義の「v0.1 = 全メソッド実装 / v0.2 = テストのみ」は改め、下表の分割に更新する
- v0.3.0 以降で drizzle / prisma / libsql（および将来 PHP / Go）へ同じ語彙を展開する
- **バージョンは言語（配布物）単位**（JS npm と Go module は独立）。同一言語内のアダプタは単一版に同梱。言語間で版が飛ぶのは許容。詳細は `docs/main.md` の「バージョン方針」

## マイルストーン一覧

| バージョン | テーマ | 完了条件（要約） |
|------------|--------|------------------|
| **v0.1.0** | Core CRUD Trait | 基本 CRUD + `search`/`list` + 条件ビルダー + `transaction` + 梱包骨格が、インメモリテスト付きで使える |
| **v0.2.0** | Extended writes | `upsert` / `duplicate` / `bulk*` が同水準で揃い、Bun テンプレに載せられる |
| **v0.3.0** | Other JS adapters | drizzle / prisma が bun-sqlite と同等 API・テストで通る |
| **v0.5.0** | count / SearchResult.total | `count()` と `search`/`list` の `total` が bun-sqlite / drizzle / prisma で揃う（#47） |
| **v0.6.0** | libSQL adapter | `@b4moss/crudian/libsql`（`@libsql/client`）が既存契約と同等 API・テストで通る（#42） |
| **v0.7.0** | Go module | `github.com/b4moss/crudian/go/gorm`（SQLite）と `.../go/libsql` が同等契約で通る（#48） |
| **v0.4.0** | Docker / E2E harness | 全ランタイム 1 コンテナ + Postgres / MySQL / MariaDB 上の E2E 基盤（[#44](https://github.com/b4moss/crudian/issues/44)） |

---

## v0.1.0 — Core CRUD Trait（bun:sqlite）

使える最小の CRUD Trait。テンプレ接続前の土台。

| 機能 | 内容 | 備考 |
|------|------|------|
| 共有契約 | `@b4moss/crudian` に型・演算子・ビルダー契約・`SearchResult` 等 | PHP/Go に写せる語彙で先に寄せる |
| `createCrud(db)` | `Database` 注入。生 `db` を公開 | 内部で DB を生成しない |
| `create` | 挿入し対象行を返す | |
| `read` | 1件。未ヒットは `null` | |
| `update` | 更新し対象行を返す。0件は `null` | |
| `delete` | 影響件数を返す | |
| `search` | 正式 API。`{ items, nextCursor, hasMore }`（v0.5.0 で `total` 追加） | `nextCursor` は生 `id`。cursor は `id` 昇順 |
| `list` | `search` の別名 | |
| 条件ビルダー | `eq/ne/lt/gt/lte/gte/in/like/isNull/isNotNull` + ネスト可能な and/or | 木は内部表現 |
| `transaction` | ヘルパのみ（自動 TX は張らない） | |
| 梱包 | `tsc` → `dist`、`exports`、Node からの `bun-sqlite` 誤 import 明示エラー | |
| テスト | 上記すべてを `:memory:` で担保 | Bun + `bun:test` |

**v0.1.0 に含めないもの:** `upsert` / `duplicate` / `bulk*`（→ v0.2.0）

### v0.1.0 推奨実装順

1. 共有契約（型・ビルダー・エラー最小）
2. `createCrud` + 生 `db` 公開 + `transaction`
3. `create` / `read` / `update` / `delete` + テスト
4. `search` / `list`（cursor・limit）+ テスト
5. 条件ビルダーを `search` に接続 + テスト
6. `tsc` / `exports` / Node 誤 import ガード

---

## v0.2.0 — Extended writes（bun:sqlite）

書き込み系を揃え、参照実装として「全メソッド」を満たす。

| 機能 | 内容 | 備考 |
|------|------|------|
| `upsert` | conflict は主キー `id`。対象行を返す | |
| `duplicate` | 対象行を返す。0件は `null` | |
| `bulkCreate` | 件数のみ | |
| `bulkUpdate` | 件数のみ | |
| `bulkDelete` | 件数のみ | |
| `bulkUpsert` | 件数のみ。conflict は `id` | |
| テスト | 上記のインメモリ DB テスト | 単発系と同様、機能単位で閉じる |
| リリース準備 | Bun テンプレへの試し食い（推奨） | 必須ゲートにするかは別途 |

### v0.2.0 推奨実装順

1. `upsert` + テスト
2. `duplicate` + テスト
3. `bulkCreate` / `bulkUpdate` / `bulkDelete` + テスト
4. `bulkUpsert` + テスト
5. テンプレ試し食い・ドキュメント最終確認 → タグ

**v0.2.0 完了時の状態:** bun-sqlite が仕様上の全メソッドを提供し、ライブラリ側 DB テストで担保されている。

---

## v0.3.0 — Other JS adapters

bun-sqlite と同等の契約を、Node 向けアダプタへ展開する。

| 機能 | 内容 | 備考 |
|------|------|------|
| `@b4moss/crudian/drizzle` | 同等 API + `node:test` | Node.js 22+ |
| `@b4moss/crudian/prisma` | 同等 API + `node:test` | Node.js 22+ |

PHP / Go パッケージは本マイルストーンの必須範囲外（契約語彙が安定したあとの後続）。

---

## v0.5.0 — count / SearchResult.total

件数 API を契約に足し、既存アダプタへ展開する（#47）。

| 機能 | 内容 | 備考 |
|------|------|------|
| `count` | `CountQuery`（`{ where? }`）→ `number` | where コンパイルは `search` と共用 |
| `SearchResult.total` | where 全件数を常時付与 | limit / cursor 非依存。オプトインなし |
| 対象 | bun-sqlite / drizzle / prisma | 共有 sync / async 層で実装 |
| テスト | [`docs/tests/v0.5.0.md`](../tests/v0.5.0.md) | |

---

## v0.6.0 — libSQL adapter

既存契約を libSQL クライアント向けアダプタへ展開する（#42）。

| 機能 | 内容 | 備考 |
|------|------|------|
| `@b4moss/crudian/libsql` | bun-sqlite / prisma と同等 API（async） | peer: `@libsql/client` |
| 入口 | `createCrud(client)` | 呼び出し側が作った Client を注入。生 client を `crud.db` で公開 |
| 実装方針 | `createAsyncSqliteCrud` に薄い executor を渡す | prisma アダプタと同型 |
| テスト | 一時ファイル DB + `node:test` | [`docs/tests/v0.6.0.md`](../tests/v0.6.0.md)。`:memory:` は TX と相性が悪いためテストではファイルを使う |
| 設計 | [`libsql-adapter.md`](./libsql-adapter.md) | サブパスは商業名 Turso ではなく libSQL |

**対象外:** `@tursodatabase/serverless`、リモート Cloud 前提の E2E、TypeORM（#43）

### v0.6.0 推奨実装順

1. 仕様・テスト仕様の固定（本マイルストーンの docs）
2. `packages/js/src/libsql` + `exports` / peer / scripts
3. CRUD / search / extended writes / count・total のテスト
4. CI（`test:libsql`）・README 更新 → 版上げ `0.6.0`

---

## v0.7.0 — Go module

JS 契約を Go へ移植する（#48）。**Go の公開初版は `0.7.0`**（`packages/go/VERSION`）。npm（`@b4moss/crudian`）は変更がなければ **`0.6.0` のまま**でよい。

| 機能 | 内容 | 備考 |
|------|------|------|
| module | `github.com/b4moss/crudian/go` | 単一 go.mod。パッケージ `crudian` / `gorm` / `libsql` |
| API | 同期 + `context.Context` | JS sync/async 分裂なし |
| Dialect | 初手から切る | Sqlite 実装。他 RDB は stub（実装スコープ外） |
| `go/gorm` | GORM + SQLite | 生 `*gorm.DB` 注入 |
| `go/libsql` | 公式 libSQL `database/sql` | 第一候補: `libsql-client-go`（local `file://` は companion sqlite ドライバが必要） |
| 配布 | Go module path + git タグ | タグ **`packages/go/v0.7.0`**。npm 風レジストリへの upload はなし |
| テスト | [`docs/tests/v0.7.0.md`](../tests/v0.7.0.md) | Go 1.26 + `testing` |
| CI/CD | [`.github/CI.md`](../../.github/CI.md) | 変更時のみ `packages/go` を lint/test。CD は当該タグ時のみ |
| 設計 | [`go-module.md`](./go-module.md) | |

**対象外:** GORM の SQLite 以外、可変 PK（#72）、PHP、製品 E2E の CI 実行

### v0.7.0 推奨実装順

1. 仕様・テスト仕様の固定（本マイルストーンの docs）
2. `crudian` 共有（where / Dialect / CRUD）
3. `gorm` + SQLite 結合テスト
4. `libsql` + 結合テスト
5. CI（path filter + `go test` / lint）・README
6. 公開: `packages/go/VERSION=0.7.0` に対しタグ `packages/go/v0.7.0`（npm は触らない）

---

## 機能 × マイルストーン早見

| 機能 | v0.1.0 | v0.2.0 | v0.3.0 | v0.5.0 | v0.6.0 | v0.7.0 |
|------|:------:|:------:|:------:|:------:|:------:|:------:|
| 共有契約・ビルダー型 | ✓ | | | | | |
| `createCrud` / 生 `db` | ✓ | | | | | |
| `create` / `read` / `update` / `delete` | ✓ | | | | | |
| `search` / `list` + cursor | ✓ | | | | | |
| 条件ビルダー（演算子・and/or） | ✓ | | | | | |
| `transaction` | ✓ | | | | | |
| `tsc` / `exports` / 誤 import ガード | ✓ | | | | | |
| Core のインメモリテスト | ✓ | | | | | |
| `upsert` / `duplicate` | | ✓ | | | | |
| `bulk*` | | ✓ | | | | |
| Extended のインメモリテスト | | ✓ | | | | |
| テンプレ試し食い | | △ | | | | |
| drizzle / prisma | | | ✓ | | | |
| `count` / `SearchResult.total` | | | | ✓ | | |
| libsql（`@libsql/client`） | | | | | ✓ | |
| Go gorm（SQLite）/ libsql | | | | | | ✓ |

△ = 推奨（必須にするかは未決）

---

## GitHub Issue 対応

| Milestone | Issue |
|-----------|--------|
| **v0.1.0** | #16 `createCrud` / 共有契約 / `transaction` |
| | #6 基本 CRUD（create / read / update / delete） |
| | #9 `search` / `list`（条件ビルダー・cursor） |
| | #17 `tsc` dist / `exports` / Node 誤 import ガード |
| **v0.2.0** | #7 `upsert` / `duplicate` |
| | #8 `bulk*` |
| | #18 Bun テンプレ試し食い（推奨） |
| **v0.3.0** | #12 / #13 drizzle |
| | #14 / #15 prisma |
| **v0.5.0** | #47 `count` / `SearchResult.total` |
| **v0.6.0** | #42 libSQL アダプタ（`@b4moss/crudian/libsql`） |
| **v0.7.0** | #48 Go モジュール化（gorm SQLite / libsql） |
| **v0.4.0** | #44 Docker / Dev Containers（全ランタイム 1 コンテナ + 実 DB E2E） |

クローズ済み（方針変更により機能 Issue へ内包）: #10 / #11
