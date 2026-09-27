---
状態: 方針確定
マイルストーン: unscheduled
---

# PHP パッケージ（`b4moss/crudian`）を実装する

関連 Issue: [#127](https://github.com/b4moss/crudian/issues/127)

## 目的

JS / Go と同じ CRUD 契約を、Composer / Packagist 向けの単一 PHP パッケージとして配布する。

## ざっくり範囲

- やること:
  - Packagist **`b4moss/crudian`** 1 本（`packages/php/`・単一 `composer.json`）
  - MySQL / Postgres / SQLite は **PDO**（ORM 不使用）。方言は Dialect
  - libSQL は公式 SDK（`turso/libsql` 等）を **テクニカルプレビュー**として採用
  - PDO / libSQL とも薄い **Executor** に橋渡しし、共有 CRUD は Executor + Dialect のみに依存（Go `libsql` と同型）
  - git タグ `packages/php/vX.Y.Z`（言語独立 SemVer）
- やらぬこと:
  - アダプタ別 Packagist パッケージ（`pdo-mysql` 等）は切らない
  - **Laravel 実装は無期限延期**（設計・実装仕様の対象外。レイアウトや API に考慮しない）

## 層

| 層 | 役割 |
|----|------|
| 共有 | 契約・Where・Dialect・CRUD |
| Executor | Dialect 非依存の SQL 実行（Run / Get / All / Transaction）。具象はアダプタ側 |
| PDO アダプタ | `PDO` → 薄い Executor。Dialect で SQLite / Postgres / MySQL |
| libSQL アダプタ | 公式 SDK 接続 → 薄い Executor（technical preview。SDK / FFI 前提の制約はアダプタ境界に閉じる） |

## メモ

- 契約語彙の正は [`../../README.md`](../../README.md) と [`../../specs/contract/`](../../specs/contract/)
- 実装完了後は本ファイルを `docs/specs/php/` へ**移動**する（plans に残さない）
