# PHP Module — 設計と進め方

JS / Go 版の CRUD 契約を PHP へ移植する方針のメモ。  
仕様の正は [`docs/main.md`](../main.md)（PHP 節）。マイルストーンは [`../roadmap.md`](../roadmap.md)。  
受け入れテストは [`docs/tests/v0.12.0.md`](../tests/v0.12.0.md)。  
関連 Issue: [#127](https://github.com/b4moss/crudian/issues/127)（マイルストーン v0.12.0）  
移植の参照実装: [`go-module.md`](./go-module.md) / `packages/go/crudian` / `packages/go/libsql`

## 製品意図

- 共通 CRUD を **Composer / Packagist `b4moss/crudian`** として配布する（言語あたり 1 配布物）
- メソッド語彙は JS / Go と同等。Laravel は無期限延期（設計対象外）
- 初版から Dialect（SQLite / Postgres / MySQL）を切る
- PDO で RDB、libSQL は公式 SDK を **technical preview** として薄い Executor で橋渡し

## 命名・パス

| 項目 | 値 |
|------|-----|
| Packagist | `b4moss/crudian` |
| 配置 | `packages/php/` |
| 名前空間 | `B4moss\Crudian\` |
| PDO | `B4moss\Crudian\Pdo\` |
| libSQL | `B4moss\Crudian\Libsql\` |
| PHP | **8.3+** |
| 初版 SemVer | **0.12.0**（タグ `packages/php/v0.12.0`） |

## 層分割

```text
packages/php/
  composer.json
  src/
    Executor.php / Crud.php / Where.php / Dialect.php / …
    Pdo/          # createCrud(PDO) + PdoExecutor
    Libsql/       # createCrud(SDK) + LibsqlExecutor（preview）
  tests/
```

| 層 | 役割 |
|----|------|
| 共有 | 型・Where・Dialect・Crud・Executor・エラー |
| PDO | `PDO` → 薄い Executor。Dialect で SQLite / Postgres / MySQL |
| libSQL | 公式 SDK → 薄い Executor（FFI 制約は境界に閉じる） |

## API 形

同期のみ（JS の sync/async 分裂なし。Go の `context` 相当は持たない）。

```php
use B4moss\Crudian\Pdo;
use B4moss\Crudian\Where;

$crud = Pdo\createCrud($pdo); // 接続は呼び出し側
$row = $crud->create('items', ['name' => 'alpha', 'score' => 1]);
$page = $crud->search('items', [
  'where' => Where::create()->eq('name', 'alpha'),
  'limit' => 20,
]);
```

- 入口は `createCrud($client, ?Options $options = null)`
- 生クライアントを公開（`$crud->db`）
- 行は `array<string, mixed>`（連想配列）
- 未ヒットの `read` / `update` / `duplicate` は `null`（例外にしない）
- プール第一級 API は持たない（呼び出し側が PDO 属性を設定）

## 意図的な非対応

- Laravel / Eloquent
- リモート Turso Cloud E2E
- 全文検索、orderBy 一般化
- JS / Go の破壊的変更
