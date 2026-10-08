# drizzle アダプタ仕様

`@b4moss/crudian/drizzle` — Drizzle + better-sqlite3（**sync・SQLite のみ**）。

## 概要

bun-sqlite と同じ共有契約を、Node.js 向け Drizzle クライアント経由で提供する。  
契約の正は [`../contract/`](../contract/)。参照実装の観測結果は bun-sqlite。

## 振る舞い

- 入口: `createCrud(db, options?)`。呼び出し側が作った Drizzle DB を注入。生クライアントを公開
- `options.pk` で PK 列名を変更可（共有契約どおり）
- メソッド面は共有契約どおり（CRUD / search / list / count / exists / upsert / duplicate / bulk* / transaction）
- SQL 方言は SQLite。Postgres / MySQL の Drizzle subpath は現行対象外
- ランタイム / テスト: Node.js 24+ + `node:test`

## 関連

- テスト: [`../../tests/drizzle/adapter.md`](../../tests/drizzle/adapter.md)
- 契約: [`../contract/`](../contract/)
- pillar: [`../../README.md`](../../README.md)
