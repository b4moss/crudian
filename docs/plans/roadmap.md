# Roadmap — bun:sqlite CRUD Trait

`@b4moss/crudian/bun-sqlite` を参照実装として、機能をマイルストーンに割り当てる。  
仕様の正は [`docs/main.md`](../main.md)。設計詳細は [`bun-sqlite-adapter.md`](./bun-sqlite-adapter.md)。

## 方針

- 入口は `createCrud(db)`。単表 CRUD Facade + Adapter
- **機能単位で実装とインメモリ DB テスト（Bun + `bun:test`）を同時に閉じる**
- 旧定義の「v0.1 = 全メソッド実装 / v0.2 = テストのみ」は改め、下表の分割に更新する
- v0.3.0 以降で drizzle / prisma（および将来 PHP / Go）へ同じ語彙を展開する

## マイルストーン一覧

| バージョン | テーマ | 完了条件（要約） |
|------------|--------|------------------|
| **v0.1.0** | Core CRUD Trait | 基本 CRUD + `search`/`list` + 条件ビルダー + `transaction` + 梱包骨格が、インメモリテスト付きで使える |
| **v0.2.0** | Extended writes | `upsert` / `duplicate` / `bulk*` が同水準で揃い、Bun テンプレに載せられる |
| **v0.3.0** | Other JS adapters | drizzle / prisma が bun-sqlite と同等 API・テストで通る |

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
| `search` | 正式 API。`{ items, nextCursor, hasMore }` | `nextCursor` は生 `id`。cursor は `id` 昇順 |
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

## 機能 × マイルストーン早見

| 機能 | v0.1.0 | v0.2.0 | v0.3.0 |
|------|:------:|:------:|:------:|
| 共有契約・ビルダー型 | ✓ | | |
| `createCrud` / 生 `db` | ✓ | | |
| `create` / `read` / `update` / `delete` | ✓ | | |
| `search` / `list` + cursor | ✓ | | |
| 条件ビルダー（演算子・and/or） | ✓ | | |
| `transaction` | ✓ | | |
| `tsc` / `exports` / 誤 import ガード | ✓ | | |
| Core のインメモリテスト | ✓ | | |
| `upsert` / `duplicate` | | ✓ | |
| `bulk*` | | ✓ | |
| Extended のインメモリテスト | | ✓ | |
| テンプレ試し食い | | △ | |
| drizzle / prisma | | | ✓ |

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

クローズ済み（方針変更により機能 Issue へ内包）: #10 / #11
