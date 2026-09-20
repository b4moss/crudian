# TypeORM Adapter — 設計と進め方

`@b4moss/crudian/typeorm` を、既存の async CRUD 契約で追加する方針のメモ。  
仕様の正は [`docs/main.md`](../main.md)。マイルストーン割当は [`roadmap.md`](./roadmap.md)。  
関連 Issue: [#43](https://github.com/b4moss/crudian/issues/43)（マイルストーン **v0.11.0**）  
前提: [#73](https://github.com/b4moss/crudian/issues/73)（Dialect / MySQL・Postgres）が **MySQL まで完了**していること（受け入れ: [`docs/tests/v0.10.0.md`](../tests/v0.10.0.md)、ゲート達成済み）。  
本マイルストーンの受け入れ: [`docs/tests/v0.11.0.md`](../tests/v0.11.0.md)。

## 製品意図

- Node.js / Bun から **TypeORM `DataSource`** 経由で、既存 CRUD 契約を使えるようにする
- 公開 API の第一級は **表名文字列**（他アダプタと同じ）。Entity クラスは補助（メタデータ参照など）に留め、必須にはしない
- 初版から **SQLite + Postgres + MySQL** を必須対象とする（Dialect 層 #73 の成果を前提）

## 命名

| 項目 | 値 |
|------|-----|
| npm subpath | `@b4moss/crudian/typeorm` |
| ソース | `packages/js/src/typeorm/` |
| peer | `typeorm`（optional） |
| 注入 | `DataSource` のみ（Repository / EntityManager を入口にしない） |
| テストスクリプト | `test:typeorm`（Node 24+ と Bun の両方） |

## 依存・着手条件

| 項目 | 決定 |
|------|------|
| 着手タイミング | **#73 のあと**。最初から MySQL / Postgres も視野に入れる |
| ゲート | #73 が **MySQL まで完了**してから実装着手 |
| Dialect | #73 で切り出した方言を利用。TypeORM アダプタ内に SQLite 方言を再発明しない |

## 層分割

| 層 | 置き場 | 役割 |
|----|--------|------|
| 契約 | `@b4moss/crudian` | 既存の型・`where`・`CrudianError`（変更なしが原則） |
| Dialect | #73 成果物 | sqlite / postgres / mysql の SQL 生成 |
| 具象 | `@b4moss/crudian/typeorm` | `DataSource` を executor に橋渡し。QueryBuilder / Repository を積極利用 |

prisma / libsql と同様、**薄いアダプタ + 共有 CRUD** を基本形とする。TypeORM の強み（QueryBuilder / Repository）は、生 SQL 一辺倒よりそちらを優先してよい。

## API 形

```ts
import { DataSource } from "typeorm"
import { createCrud } from "@b4moss/crudian/typeorm"
import { where } from "@b4moss/crudian"

const dataSource = new DataSource({
  type: "sqlite",
  database: ":memory:",
  // entities / migrations は呼び出し側の責任
})
await dataSource.initialize()

const crud = createCrud(dataSource)

await crud.create("items", { name: "alpha", score: 1 })
await crud.search("items", { where: where().eq("name", "alpha") })
```

- 入口は `createCrud(dataSource)`。接続生成・`initialize` は呼び出し側
- 生の `DataSource` を `crud.db` で公開（JOIN・QueryBuilder 直叩き等の非 CRUD 用）
- メソッドは既存 async 面と同等（`create` / `read` / `update` / `delete` / `search` / `list` / `count` / `upsert` / `duplicate` / `bulk*` / `transaction`）
- 第一引数の表名は **文字列**。Entity クラスを渡す API は初版の必須ではない

## 実装方針

| 項目 | 方針 |
|------|------|
| 注入面 | `DataSource` のみ。呼び出し側が driver / entities / pool を構成済みであること |
| QueryBuilder / Repository | **積極利用**（単なる raw SQL ラッパにしない） |
| 表名 | 公開 API は表名文字列が正。Entity メタデータは表名解決や型補助に使ってよい |
| Dialect | DataSource の `options.type`（または同等）から dialect を選択 |
| トランザクション | TypeORM の `dataSource.transaction` / QueryRunner を `transaction()` ヘルパに接続 |
| プール | 接続プールは DataSource オプション側。#73 / #105 の文書化方針に合わせる |

## テスト方針

| 項目 | 値 |
|------|-----|
| ランタイム | **Node.js 24+** と **Bun** の両方で必須 |
| DB（初版必須） | SQLite + Postgres + MySQL |
| 契約 | 既存 v0.1 / v0.2 / v0.5 / v0.8 相当を typeorm で一式 |
| 受け入れ | [`docs/tests/v0.11.0.md`](../tests/v0.11.0.md) |
| 非対象（初版） | リモート Cloud 専用 E2E、PHP、ORM の全機能網羅 |

## 目標 / 非目標（Q9）

### 目標（初版で視野に入れる）

1. TypeORM **migrations** と併用できること（呼び出し側が migration を回し、crudian は表名で CRUD）
2. **relations** があっても単表 CRUD が破綻しないこと（JOIN 付き複合読みは契約外で `crud.db` へ）
3. **subscribers** 利用下でも CRUD 経路が安全に動くこと（副作用の保証範囲はドキュメント化）
4. Entity は **補助**（メタデータ・型）。公開 CRUD の第一級にはしない（Q10）

### 非目標

5. Cloud 上のフルマネージド DB 向け専用 E2E
6. PHP パッケージ

## 梱包

- `package.json` の `exports["./typeorm"]`
- optional peerDependencies: `typeorm`
- CI: Node と Bun の両方で `test:typeorm`（SQLite は常時。Postgres / MySQL は CI サービスまたは Testcontainers 方針を #73 / #44 と揃える）

## 意図的な非対応

- Entity クラスを `create` / `search` の第一引数にする第一級 API
- TypeORM の関係グラフを横断する CRUD（単表契約のまま）
- ライブラリ内部での DataSource 自動生成・env からの秘密情報読み込み
- `#73` 未完了のうちの Postgres / MySQL 先行実装

## 決定事項（#43 Q&A）

| # | 項目 | 決定 |
|---|------|------|
| Q1 | 着手順 | **B** — #73 後。最初から MySQL / PG も視野 |
| Q2 | 注入 | **A** — `DataSource` のみ |
| Q3 | サブパス | **A** — `@b4moss/crudian/typeorm` |
| Q4 | テストランタイム | **B** — Node 24+ **と** Bun 両方必須 |
| Q5 | 実装スタイル | **B** — QueryBuilder / Repository を積極利用 |
| Q6 | 表の指定 | **A** — 公開 API は表名文字列 |
| Q7 | 着手ゲート | **B** — #73 が **MySQL まで完了**してから |
| Q8 | 初版 DB | **A** — SQLite + Postgres + MySQL すべて必須 |
| Q9 | 目標/非目標 | 1〜4 は目標（Entity は補助に読み替え）、5・6 は非目標 |
| Q10 | Entity の位置づけ | **A** — 表名が正。Entity は補助 |

---

## Issue #43 本文案

以下を Issue 本文として使う（権限が付けば API で反映。それまではこの節が正本）。

```markdown
## Summary

Node.js / Bun 向けに TypeORM アダプタ `@b4moss/crudian/typeorm` を追加する。  
公開 CRUD は既存契約どおり **表名文字列** を第一級とし、TypeORM の `DataSource` だけを注入する。  
**#73（Dialect / MySQL・Postgres）が MySQL まで完了したあと**に着手し、初版から SQLite + Postgres + MySQL を必須とする。

## 背景

- 既存 JS アダプタ（bun-sqlite / drizzle / prisma / libsql）は SQLite（および libSQL）中心
- TypeORM 利用者向けに同じ CRUD 語彙を届けたいが、方言抜きでは MySQL / Postgres に届かない
- Entity / Repository 中心の ORM でも、DDD Repository 層からは表名ベースの薄い Facade が欲しい

## 方針

| 項目 | 内容 |
|------|------|
| サブパス | `@b4moss/crudian/typeorm` |
| 注入 | `DataSource` のみ（接続生成・initialize は呼び出し側） |
| 表の指定 | 公開 API は表名文字列。Entity は補助（メタデータ等） |
| 実装 | QueryBuilder / Repository を積極利用 |
| Dialect | #73 の成果を利用。アダプタ内に方言を再発明しない |
| ランタイム試験 | Node.js 24+ と Bun の両方 |

### 着手条件

- [ ] #73 が MySQL まで完了していること

## スコープ（このイシュー）

- [ ] `packages/js/src/typeorm` + `exports["./typeorm"]` + optional peer `typeorm`
- [ ] `createCrud(dataSource)` と既存 async CRUD 面の実装
- [ ] SQLite / Postgres / MySQL それぞれで契約テストが通ること
- [ ] Node 24+ と Bun の両方でテストが通ること
- [ ] migrations / relations / subscribers 利用下での単表 CRUD の振る舞いをドキュメント化
- [ ] README / 設計メモ（`docs/plans/typeorm-adapter.md`）の更新

## 非目標

- Entity クラスを第一引数にする第一級 API
- 関係グラフ横断 CRUD（単表契約のまま。複合は `crud.db`）
- Cloud 専用 E2E
- PHP パッケージ
- #73 より前の着手、または Dialect の TypeORM 内再実装

## 関連

- #73 — Dialect / MySQL・Postgres（**前提・着手ゲート**）
- #105 — プール／lifetime（JS は #73 連動。TypeORM は DataSource オプション側）
- 設計メモ: `docs/plans/typeorm-adapter.md`

## Acceptance

- [ ] `@b4moss/crudian/typeorm` から `createCrud(DataSource)` が使える
- [ ] 既存契約（CRUD / search / count / bulk* / transaction 等）が TypeORM 経路で通る
- [ ] SQLite + Postgres + MySQL のテストが緑
- [ ] Node 24+ と Bun の両方でテストが緑
- [ ] ドキュメントに注入面・表名第一級・非目標が明記されている
```
