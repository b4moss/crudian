# Roadmap — bun:sqlite CRUD Trait

`@b4moss/crudian/bun-sqlite` を参照実装として、機能をマイルストーンに割り当てる。  
仕様の正は [`docs/main.md`](../main.md)。設計詳細は [`bun-sqlite-adapter.md`](./bun-sqlite-adapter.md)。libSQL は [`libsql-adapter.md`](./libsql-adapter.md)。Go は [`go-module.md`](./go-module.md)。TypeORM は [`typeorm-adapter.md`](./typeorm-adapter.md)。

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
| **v0.9.0** | exists | `exists` / `Exists`（boolean 糖衣。入力は `count` と同型。#106）。Go 接続プール／lifetime（GORM 適用・libSQL no-op。#105。JS は #73） |
| **v0.4.0** | Docker / E2E harness | 全ランタイム 1 コンテナ + Postgres / MySQL / MariaDB 上の E2E 基盤（[#44](https://github.com/b4moss/crudian/issues/44)） |
| **v0.10.0** | Dialect / MySQL・Postgres | SQL 方言の切り出しと MySQL / Postgres 対応。JS プールもここに載せる（[#73](https://github.com/b4moss/crudian/issues/73)、#105 の JS 分） |
| **v0.11.0** | TypeORM adapter / coverage | `@b4moss/crudian/typeorm`（[#43](https://github.com/b4moss/crudian/issues/43)）と codecov 75%（[#96](https://github.com/b4moss/crudian/issues/96)） |

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
| Dialect | 初手から切る | **いまは Sqlite のみ**。MySQL / Postgres は将来（stub） |
| `go/gorm` | GORM | 生 `*gorm.DB` 注入。**v0.7.0 は SQLite のみ** |
| `go/libsql` | 公式 libSQL `database/sql` | 第一候補: `libsql-client-go`（SQLite 互換） |
| 配布 | Go module path + git タグ | タグ **`packages/go/v0.7.0`**。npm 風レジストリへの upload はなし |
| テスト | [`docs/tests/v0.7.0.md`](../tests/v0.7.0.md) | Go 1.26 + `testing` |
| CI/CD | [`.github/CI.md`](../../.github/CI.md) | 変更時のみ `packages/go` を lint/test。CD は当該タグ時のみ |
| 設計 | [`go-module.md`](./go-module.md) | |

**対象外（v0.7.0）:** GORM の MySQL / PostgreSQL（**将来対応**）、可変 PK（#72）、PHP、製品 E2E の CI 実行

### v0.7.0 推奨実装順

1. 仕様・テスト仕様の固定（本マイルストーンの docs）
2. `crudian` 共有（where / Dialect / CRUD）
3. `gorm` + SQLite 結合テスト
4. `libsql` + 結合テスト
5. CI（path filter + `go test` / lint）・README
6. 公開: `packages/go/VERSION=0.7.0` に対しタグ `packages/go/v0.7.0`（npm は触らない）

---

## v0.10.0 — Dialect / MySQL・Postgres

共有 CRUD から SQL 方言を切り出し、ORM 向けに MySQL / Postgres を足す（#73）。  
**JS の接続プール／lifetime（#105 の JS 分）も本マイルストーンで載せる。**

| 機能 | 内容 | 備考 |
|------|------|------|
| Dialect | `quoteIdent` / placeholder / insert 後行取得 / 列記述 | Sqlite → Postgres → MySQL の順。upsert は当面アプリ層のまま |
| 既存 SQLite アダプタ | SqliteDialect へ移行し回帰テスト緑 | 破壊的変更を避ける |
| Postgres | 少なくとも 1 ORM（**Prisma**）+ Go GORM で同等契約 | Drizzle PG subpath は本版対象外 |
| MySQL | Dialect + RETURNING 代替を含む同等テスト | **#43 着手ゲート** |
| JS プール | #105 相当を MySQL / Postgres 経路で文書化（Prisma は呼び出し側設定が本体） | SQLite / libSQL は no-op 可 |
| テスト | [`docs/tests/v0.10.0.md`](../tests/v0.10.0.md) | |
| 設計 | #73 Issue 本文 | TypeORM は v0.11.0（#43） |

**対象外（v0.10.0）:** TypeORM アダプタ本体（→ #43）、PHP、契約語彙の破壊的変更、Drizzle の Postgres/MySQL subpath

---

## v0.11.0 — TypeORM adapter / coverage

| 機能 | 内容 | 備考 |
|------|------|------|
| `@b4moss/crudian/typeorm` | `createCrud(DataSource)`。表名文字列が第一級 | peer: `typeorm` |
| DB | SQLite + Postgres + MySQL すべて必須 | #73 MySQL 完了が前提 |
| ランタイム | Node 24+ **と** Bun | 両方で `test:typeorm` |
| 実装 | QueryBuilder / Repository を積極利用 | |
| codecov | カバレッジ 75%（#96） | 計測修正 → 不足分テスト |
| 設計 | [`typeorm-adapter.md`](./typeorm-adapter.md) | |
| テスト | [`docs/tests/v0.11.0.md`](../tests/v0.11.0.md) | |

**対象外（v0.11.0）:** Entity 第一級 API、関係グラフ横断 CRUD、Cloud 専用 E2E、PHP

### v0.11.0 推奨実装順

1. #73 MySQL 完了を確認（済み）
2. 仕様・テスト仕様の固定（[`docs/tests/v0.11.0.md`](../tests/v0.11.0.md)）
3. #96 計測修正（Go `-coverpkg` / JS adapter coverage upload）
4. `packages/js/src/typeorm` + exports / peer / scripts
5. SQLite → Postgres → MySQL の順で契約テスト
6. Node / Bun 両ランタイムと CI・README → Codecov 75% 確認 → 版上げ

---

## 機能 × マイルストーン早見

| 機能 | v0.1.0 | v0.2.0 | v0.3.0 | v0.5.0 | v0.6.0 | v0.7.0 | v0.9.0 |
|------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| 共有契約・ビルダー型 | ✓ | | | | | | |
| `createCrud` / 生 `db` | ✓ | | | | | | |
| `create` / `read` / `update` / `delete` | ✓ | | | | | | |
| `search` / `list` + cursor | ✓ | | | | | | |
| 条件ビルダー（演算子・and/or） | ✓ | | | | | | |
| `transaction` | ✓ | | | | | | |
| `tsc` / `exports` / 誤 import ガード | ✓ | | | | | | |
| Core のインメモリテスト | ✓ | | | | | | |
| `upsert` / `duplicate` | | ✓ | | | | | |
| `bulk*` | | ✓ | | | | | |
| Extended のインメモリテスト | | ✓ | | | | | |
| テンプレ試し食い | | △ | | | | | |
| drizzle / prisma | | | ✓ | | | | |
| `count` / `SearchResult.total` | | | | ✓ | | | |
| libsql（`@libsql/client`） | | | | | ✓ | | |
| Go gorm（SQLite）/ libsql | | | | | | ✓ | |
| `exists` / `Exists` | | | | | | | ✓ |
| Go `PoolOptions` / `ApplyPool`（GORM 適用） | | | | | | | ✓ |

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
| **v0.9.0** | #106 `exists` / `Exists`（boolean 糖衣） |
| | #105 DB 接続プール／lifetime（Go/GORM 先行。JS は #73 / v0.10.0） |
| **v0.4.0** | #44 Docker / Dev Containers（全ランタイム 1 コンテナ + 実 DB E2E） |
| **v0.10.0** | #73 Dialect / MySQL・Postgres（JS プール含む。テスト: [`docs/tests/v0.10.0.md`](../tests/v0.10.0.md)） |
| **v0.11.0** | #43 TypeORM アダプタ / #96 codecov 75%（テスト: [`docs/tests/v0.11.0.md`](../tests/v0.11.0.md)） |

クローズ済み（方針変更により機能 Issue へ内包）: #10 / #11
