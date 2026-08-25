# bun:sqlite Adapter — 設計と進め方

`@b4moss/crudian/bun-sqlite` を最初の参照実装とする方針のメモ。  
仕様の正は [`docs/main.md`](../main.md)。マイルストーン割当は [`roadmap.md`](./roadmap.md)。  
本ドキュメントは実装に入る前の設計・進め方を固定する。

## 製品意図（前提）

- charter / 薄い DDD における **共通 CRUD（CRUDTrait / CrudRepository）** を、言語横断でパッケージ化する
- 正典実装の思想は **iron-rule の `internal/db/crud`**（および nook の `CrudTrait`）
- 配布形態:
  - JS/TS → **npm**（`@b4moss/crudian`）
  - PHP → **Composer / Laravel package**
  - Go → **Go module**
- 取り込み先は各言語の **別リポのテンプレート**
- biogon / orgboss など charter 以前のプロダクトは対象外の歴史的経緯として扱う

## 設計方針

### 層分割

| 層 | 置き場 | 役割 |
|----|--------|------|
| 契約 | `@b4moss/crudian` | 型・演算子・エラー・Repository インタフェース |
| 実装 | `@b4moss/crudian/bun-sqlite` | `bun:sqlite` の具象（参照実装） |

後続の drizzle / prisma（および PHP / Go）は、この契約に合わせる。  
bun-sqlite を参照実装とし、他アダプタはそれとの互換で測る。

### API 形

iron-rule に準拠し、単表 + カラム map + 条件、という粒度を維持する。

```ts
const crud = createCrud(db)

crud.create(table, cols)            // 対象行を返す
crud.read<T>(table, query)          // 1件 or null
crud.search<T>(table, query)        // 正式。{ items, nextCursor, hasMore, total } / nextCursor は生 id
crud.list<T>(table, query)          // search の別名
crud.count(table, query?)           // where 全件数（number）。CountQuery は { where? }
crud.update / upsert / duplicate    // 対象行。0件なら null
crud.delete                         // 影響件数
crud.bulkCreate / bulkUpdate / bulkDelete / bulkUpsert  // 件数のみ
crud.transaction(fn)                // ヘルパ（自動 TX は張らない）
```

- 行データはジェネリクスで型付けする（例: `read<T>(...)`）
- 条件はビルダー API を主とし、and/or 木は内部表現
- 演算子: `eq/ne/lt/gt/lte/gte/in/like/isNull/isNotNull`
- 入口は `createCrud(db)`。呼び出し側が作った `Database` を注入する
- JOIN 等の非 CRUD 用に、生の `Database`（`bun:sqlite`）を最初から公開する
- 識別子は文字列必須のみ（形式検証なし）。不正時は SQLite エラー
- 独自エラーは最小限。他は SQLite 例外を伝播
- ドメイン Repository は生 SQL を散在させず、本パッケージ経由とする（charter の薄い DDD）
- JS の契約は PHP/Go にも写せる共通語彙として先に寄せる

### 意図的な非対応

- ORM 風モデル、リレーション、マイグレーション
- 全文検索
- offset ページング（cursor のみ）
- アダプタ横断の共有テストスイート（bun-sqlite は `bun:test` のみ）
- ライブラリ内部での自動トランザクション（ヘルパは提供する）

### 決定事項（2026-08-13）

#### 第1弾

| # | 項目 | 決定 |
|---|------|------|
| 1 | `read` 未ヒット | `null` を返す（throw しない） |
| 2 | `list` / `search` | 実質同じ。片方を正式、もう片方を薄い別名 |
| 3 | cursor | 当面 `id` 昇順固定 |
| 4 | 条件 | ネスト可能な and/or 条件木 |
| 5 | upsert conflict | 主キー（`id`）前提 |
| 6 | 行型 | ジェネリクス |
| 7 | DB 生成 | 呼び出し側の `Database` を注入 |
| 8 | 生 `Database` | 最初から公開 |
| 9 | npm 配布 | 単一パッケージ + `dist`。subpath / `exports` 条件で Bun と Node を出し分ける |
| 10 | 契約の寄せ方 | PHP/Go にも写せる共通語彙として先に寄せる |

#### 第2弾

| # | 項目 | 決定 |
|---|------|------|
| 1 | 正式 API 名 | `search` を正式、`list` は別名 |
| 2 | 条件 API | ビルダーを主とし、木構造は内部表現 |
| 3 | 演算子 | `eq/ne/lt/gt/lte/gte/in/like` + `isNull` / `isNotNull` |
| 4 | cursor レスポンス | `{ items, nextCursor, hasMore }`（v0.5.0 で `total` を追加） |
| 5 | 書き込み戻り値 | `create`/`update`/`upsert`/`duplicate` は対象行、`delete` は影響件数 |
| 6 | エラー | 独自は最小限。他は SQLite 例外を伝播 |
| 7 | 識別子 | 形式検証なし（文字列必須のみ） |
| 8 | トランザクション | 自動では張らない。`transaction()` ヘルパを同時実装 |
| 9 | ビルド | `tsc` で `dist` を生成 |
| 10 | Node からの誤 import | 読み込み時に「誤って import していませんか？」と明示エラー |

#### 第3弾

| # | 項目 | 決定 |
|---|------|------|
| 1 | `update` / `duplicate` の0件 | `null` を返す |
| 2 | `nextCursor` | 生の `id` |
| 3 | `bulk*` 戻り値 | すべて件数のみ |
| 4 | ファクトリ名 | `createCrud(db)` |

詳細は [`docs/main.md`](../main.md) の「契約決定事項」も参照。

### まだ決めていない事項（低優先・実装中で可）

| 項目 | 論点 |
|------|------|
| テスト用スキーマ | テスト内 DDL か fixture か |
| テンプレ試し食い | v0.1.0 の必須ゲートにするか |

## 進め方

### Phase A — 契約固定

1. `packages/js/src/index.ts` に型・ビルダー・演算子・`createCrud` / `transaction` シグネチャを置く
2. 決定済み事項に沿い、必要なら `docs/main.md` を微修正する

### Phase B — v0.1.0 Core

詳細は [`roadmap.md`](./roadmap.md)。要約:

1. 基本 CRUD + `search`/`list` + 条件ビルダー + `transaction`
2. 各機能のインメモリテスト
3. `tsc` / `exports` / 誤 import ガード

### Phase C — v0.2.0 Extended writes

1. `upsert` / `duplicate` / `bulk*` + テスト
2. Bun テンプレ試し食い（推奨）→ タグ

成功条件: **Bun テンプレのドメイン Repository が、単表 CRUD について生 SQL を書かずに済むこと。**

### Phase D — v0.3.0 他アダプタ・他言語

1. drizzle / prisma（Node.js 22 + `node:test`）
2. PHP / Go は契約語彙が安定したあとの後続

## まとめ

- 最初から汎用 ORM に広げず、**単表 CRUD Facade + Adapter** に閉じる
- 正典は iron-rule、最初の出荷物は bun-sqlite
- 配布とテンプレ取り込みが製品の意思中核であり、アダプタ実装はそのための手段
