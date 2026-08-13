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
read(table, query)          // 1件 or null
list / search(table, query) // rows + cursor
update / delete / upsert / duplicate
bulkCreate / bulkUpdate / bulkDelete / bulkUpsert
```

- Go の `scan(*sql.Rows)` ではなく、JS では `Record<string, unknown>`（またはその配列）を返す
- JOIN 等の非 CRUD 用に、生の `Database`（`bun:sqlite`）を露出する（iron-rule の `*sql.DB` 露出と同趣旨）
- ドメイン Repository は生 SQL を散在させず、本パッケージ経由とする（charter の薄い DDD）

### 意図的な非対応

- ORM 風モデル、リレーション、マイグレーション
- 全文検索
- offset ページング（cursor のみ）
- アダプタ横断の共有テストスイート（bun-sqlite は `bun:test` のみ）

### 実装前に決める事項（仕様穴）

実装開始前に `docs/main.md` へ反映する。

| 項目 | 論点 |
|------|------|
| cursor | キーセットの形（例: `id` 昇順）。nook / iron-rule の offset とは意図的に異なる新標準 |
| and / or | iron-rule は実質 AND のみ。ネスト可能な条件木か、1 段のみか |
| upsert / bulkUpsert | conflict 対象（PK か、unique 列の指定か） |
| エラー | `NotFound` / `Invalid` / `Conflict` 程度に固定 |
| 識別子 | テーブル・カラム名のサニタイズ（iron-rule の ident 制約相当） |

## 進め方

### Phase A — 契約固定

1. `packages/js/src/index.ts` に型・エラー・演算子を置く（実装は空でよい）
2. iron-rule のメソッド一覧と `docs/main.md` を突き合わせ、上記仕様穴を文書化する

### Phase B — bun-sqlite 実装（v0.1.0 / v0.2.0）

Issue 順を基本とし、**メソッド単位で実装とインメモリ DB テストを同時に閉じる**（v0.1 と v0.2 を厳密分離しない）。

1. 基本 CRUD + `list`（cursor）
2. `upsert` / `duplicate`
3. `bulk*`
4. `search`（比較演算子・and/or・複合条件・cursor）

テストは Bun + `bun:test`、DB は `:memory:`。  
ライブラリ側が実書き込みを担保し、プロダクト側 Repository テストは Mock でよい、という責任分界を崩さない。

### Phase C — パッケージとして使える形

1. `exports` / ビルド（または Bun 向け配布形態）を整える
2. Bun 向けテンプレートリポジトリへ 1 件試し食いし、ドメイン Repository が生 SQL なしで書けることを確認する
3. 問題なければ v0.1.0 タグ

成功条件: **Bun テンプレのドメイン Repository が、単表 CRUD について生 SQL を書かずに済むこと。**

### Phase D — 他アダプタ・他言語

1. 契約が安定してから drizzle / prisma（Node.js 22 + `node:test`）
2. PHP（Composer / Laravel）・Go（module）は、iron-rule / nook からの移植として、JS 契約固定後に進める

## まとめ

- 最初から汎用 ORM に広げず、**単表 CRUD Facade + Adapter** に閉じる
- 正典は iron-rule、最初の出荷物は bun-sqlite
- 配布とテンプレ取り込みが製品の意思中核であり、アダプタ実装はそのための手段
