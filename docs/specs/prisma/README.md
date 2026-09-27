# prisma アダプタ仕様

`@b4moss/crudian/prisma` — Prisma（**async**。SQLite / Postgres / MySQL は `options.dialect`）。

## 概要

bun-sqlite と同じ共有契約を、PrismaClient 相当の注入で提供する。  
契約の正は [`../contract/`](../contract/)。Dialect の詳細は [`../dialect/`](../dialect/)。

## 振る舞い

- 入口: `createCrud(client, options?)`。接続生成は呼び出し側。生クライアントを公開
- メソッド面は共有契約どおり（async）
- SQLite は常時テスト。Postgres / MySQL は `test:prisma:postgres` / `test:prisma:mysql`
- 接続プール／lifetime は Prisma datasource 等・呼び出し側設定が本体
- ランタイム / テスト: Node.js 24+ + `node:test`

## 関連

- テスト: [`../../tests/prisma/adapter.md`](../../tests/prisma/adapter.md)
- Dialect: [`../dialect/`](../dialect/)
- 契約: [`../contract/`](../contract/)
- pillar: [`../../README.md`](../../README.md)
