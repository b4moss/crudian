# bun:sqlite Adapter — 設計と進め方

`@b4moss/crudian/bun-sqlite` を最初の参照実装とする方針のメモ。  
仕様の正は [`docs/main.md`](../main.md)。本ドキュメントは実装に入る前の設計・進め方を固定する。

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
create(table, cols)
read<T>(table, query)          // 1件 or null
list / search<T>(table, query) // 実質同義（片方正式・片方別名）、rows + cursor
update / delete / upsert / duplicate
bulkCreate / bulkUpdate / bulkDelete / bulkUpsert
```

- 行データはジェネリクスで型付けする（例: `read<T>(...)`）
- 呼び出し側が作った `Database` を注入する（パスや `:memory:` の内部生成はしない）
- JOIN 等の非 CRUD 用に、生の `Database`（`bun:sqlite`）を最初から公開する（iron-rule の `*sql.DB` 露出と同趣旨）
- ドメイン Repository は生 SQL を散在させず、本パッケージ経由とする（charter の薄い DDD）
- JS の契約は PHP/Go にも写せる共通語彙として先に寄せる

### 意図的な非対応

- ORM 風モデル、リレーション、マイグレーション
- 全文検索
- offset ページング（cursor のみ）
- アダプタ横断の共有テストスイート（bun-sqlite は `bun:test` のみ）

### 決定事項（2026-08-13）

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

詳細は [`docs/main.md`](../main.md) の「契約決定事項」も参照。

### まだ決めていない事項

| 項目 | 論点 |
|------|------|
| エラー | `Invalid` / `Conflict` 等の種別と throw 方針（`read` 未ヒットは `null` で確定済み） |
| 識別子 | テーブル・カラム名のサニタイズ（iron-rule の ident 制約相当） |
| `list` / `search` の正式名 | どちらを正式 API にするか |

## 進め方

### Phase A — 契約固定

1. `packages/js/src/index.ts` に型・エラー・演算子・条件木を置く（実装は空でよい）
2. 残りの未決事項（エラー種別、識別子、`list`/`search` の正式名）を `docs/main.md` に反映する

### Phase B — bun-sqlite 実装（v0.1.0 / v0.2.0）

Issue 順を基本とし、**メソッド単位で実装とインメモリ DB テストを同時に閉じる**（v0.1 と v0.2 を厳密分離しない）。

1. 基本 CRUD + `list`/`search`（cursor: `id` 昇順）
2. `upsert` / `duplicate`（conflict は `id`）
3. `bulk*`
4. 条件木（比較演算子・ネスト可能な and/or）を `search` に接続

テストは Bun + `bun:test`、DB は呼び出し側注入の `:memory:`。  
ライブラリ側が実書き込みを担保し、プロダクト側 Repository テストは Mock でよい、という責任分界を崩さない。

### Phase C — パッケージとして使える形

1. `dist` ビルドと `exports`（Bun / Node の出し分けを含む）を整える
2. Bun 向けテンプレートリポジトリへ 1 件試し食いし、ドメイン Repository が生 SQL なしで書けることを確認する
3. 問題なければ v0.1.0 タグ

成功条件: **Bun テンプレのドメイン Repository が、単表 CRUD について生 SQL を書かずに済むこと。**

### Phase D — 他アダプタ・他言語

1. JS 契約（共通語彙）が安定してから drizzle / prisma（Node.js 22 + `node:test`）
2. PHP（Composer / Laravel）・Go（module）は、同じ語彙への移植として進める

## まとめ

- 最初から汎用 ORM に広げず、**単表 CRUD Facade + Adapter** に閉じる
- 正典は iron-rule、最初の出荷物は bun-sqlite
- 配布とテンプレ取り込みが製品の意思中核であり、アダプタ実装はそのための手段
