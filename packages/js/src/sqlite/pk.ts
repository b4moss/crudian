import { CrudianError, type CreateCrudOptions } from "../index.js"
import type { Dialect } from "../dialect/types.js"
import { sqliteDialect } from "../dialect/sqlite.js"

/** Resolve PK column name from createCrud options. Default: `"id"`. */
export function resolvePk(options?: CreateCrudOptions): string {
  if (options == null || options.pk === undefined) {
    return "id"
  }
  if (typeof options.pk !== "string") {
    throw new CrudianError("pk must be a string")
  }
  if (options.pk === "") {
    throw new CrudianError("pk must not be empty")
  }
  return options.pk
}

type RowLike = Record<string, unknown>

/**
 * Ensure `pk` exists on `table` via dialect.describeColumns. Caches per table.
 * Throws CrudianError when the column is missing.
 */
export function createPkGuard(
  pk: string,
  dialect: Dialect,
  all: (sql: string, args?: unknown[]) => RowLike[],
) {
  const ok = new Set<string>()
  return function ensurePkColumn(table: string): void {
    if (ok.has(table)) return
    const q = dialect.describeColumns(table)
    const rows = all(q.sql, q.args)
    const names = new Set(
      rows.map((r) => String(r.name ?? "")).filter((n) => n.length > 0),
    )
    if (!names.has(pk)) {
      throw new CrudianError(
        `pk column "${pk}" does not exist on table "${table}"`,
      )
    }
    ok.add(table)
  }
}

export function createAsyncPkGuard(
  pk: string,
  dialect: Dialect,
  all: (sql: string, args?: unknown[]) => Promise<RowLike[]>,
) {
  const ok = new Set<string>()
  return async function ensurePkColumn(table: string): Promise<void> {
    if (ok.has(table)) return
    const q = dialect.describeColumns(table)
    const rows = await all(q.sql, q.args)
    const names = new Set(
      rows.map((r) => String(r.name ?? "")).filter((n) => n.length > 0),
    )
    if (!names.has(pk)) {
      throw new CrudianError(
        `pk column "${pk}" does not exist on table "${table}"`,
      )
    }
    ok.add(table)
  }
}

/** @deprecated Prefer createPkGuard(pk, dialect, all). */
export function createPkGuardSqlite(
  pk: string,
  get: (sql: string, args?: unknown[]) => RowLike | undefined,
  all: (sql: string, args?: unknown[]) => RowLike[],
) {
  void get
  return createPkGuard(pk, sqliteDialect, all)
}
