# Docker / Dev Containers (issue #44)

単体・結合はモック、DB 単体はインメモリ SQLite のまま。  
最終的な E2E 相当だけ、このスタック上の実 DB で担保する。

## 何が入っているか

**1 コンテナ (`dev`)** に言語ランタイムをまとめる:

| ランタイム | 版 |
|------------|----|
| Node.js | **24.x** |
| Bun | **latest**（イメージビルド時） |
| Go | **1.26.x** |
| PHP + Composer | Debian 同梱（`packages/php/*` 用） |

**DB サービス**（compose）:

| サービス | イメージ | ホストポート |
|----------|----------|--------------|
| `postgres` | Postgres 16 | 5432 |
| `mysql` | MySQL 8.4 | 3306 |
| `mariadb` | MariaDB 11.4 | 3307 |

接続情報（compose 既定）はユーザー / パスワード / DB 名いずれも `crudian`。  
コンテナ内では `DATABASE_URL_POSTGRES` / `DATABASE_URL_MYSQL` / `DATABASE_URL_MARIADB` が渡る。

## 使い方

前提: Docker / Docker Compose v2。

```bash
# イメージビルド + ランタイム確認
make docker-build
make docker-check

# 実 DB を含めて起動（dev は sleep infinity）
make docker-up

# シェル（Node / Bun / Go / PHP が同じ環境）
make docker-shell

# 停止
make docker-down
```

VS Code / Cursor の Dev Containers は `.devcontainer/devcontainer.json` が  
`docker/compose.yaml` の `dev` サービスを開く。

## ファイル

| パス | 役割 |
|------|------|
| `docker/Dockerfile` | 全ランタイム入りイメージ |
| `docker/compose.yaml` | `dev` + Postgres / MySQL / MariaDB |
| `docker/scripts/check-runtimes.sh` | 版チェック |
| `.devcontainer/devcontainer.json` | IDE 用 |

## 方針メモ

- ランタイム別コンテナは作らない（#44: 全部入りを 1 つ）
- E2E 用 DB は compose の実インスタンス。アダプタ実装が進んだらここから叩く
- CI の通常ジョブ（モック / `:memory:`）とは分離。イメージのスモークは `docker-image` workflow
