import {
  CrudianError,
  assertString,
  type CountQuery,
  type DeleteQuery,
  type DuplicateQuery,
  type ReadQuery,
  type Row,
  type SearchQuery,
  type SearchResult,
  type UpdateQuery,
} from "../index.js"
import { compileWhere, quoteIdent, resolveWhere } from "./sql.js"

export type SyncSqliteExecutor = {
  run(sql: string, args?: unknown[]): { changes: number }
  get(sql: string, args?: unknown[]): Row | undefined
  all(sql: string, args?: unknown[]): Row[]
  transaction<T>(fn: () => T): T
}

export type SyncSqliteCrud<TDb> = {
  readonly db: TDb
  create<T extends Row = Row>(table: string, cols: Record<string, unknown>): T
  read<T extends Row = Row>(table: string, query?: ReadQuery): T | null
  update<T extends Row = Row>(
    table: string,
    cols: Record<string, unknown>,
    query: UpdateQuery,
  ): T | null
  delete(table: string, query: DeleteQuery): number
  upsert<T extends Row = Row>(table: string, cols: Record<string, unknown>): T
  duplicate<T extends Row = Row>(table: string, query: DuplicateQuery): T | null
  bulkCreate(table: string, rows: Record<string, unknown>[]): number
  bulkUpdate(
    table: string,
    cols: Record<string, unknown>,
    query: UpdateQuery,
  ): number
  bulkDelete(table: string, query: DeleteQuery): number
  bulkUpsert(table: string, rows: Record<string, unknown>[]): number
  search<T extends Row = Row>(table: string, query?: SearchQuery): SearchResult<T>
  list<T extends Row = Row>(table: string, query?: SearchQuery): SearchResult<T>
  count(table: string, query?: CountQuery): number
  transaction<T>(fn: () => T): T
}

function requireWhere(query: { where?: unknown }, label: string) {
  if (query.where === undefined || query.where === null) {
    throw new CrudianError(`${label} requires where`)
  }
}

function selectColumns(columns: string[] | undefined): string {
  if (!columns || columns.length === 0) return "*"
  return columns.map((c) => quoteIdent(c)).join(", ")
}

function rowFromObject(value: unknown): Row {
  if (value === null || typeof value !== "object") {
    throw new CrudianError("expected row object")
  }
  return { ...(value as Row) }
}

export function createSyncSqliteCrud<TDb>(
  db: TDb,
  ex: SyncSqliteExecutor,
): SyncSqliteCrud<TDb> {
  const crud: SyncSqliteCrud<TDb> = {
    db,

    create<T extends Row = Row>(table: string, cols: Record<string, unknown>): T {
      assertString(table, "table")
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }

      const tbl = quoteIdent(table)
      const colSql = keys.map((k) => quoteIdent(k)).join(", ")
      const placeholders = keys.map(() => "?").join(", ")
      const args = keys.map((k) => cols[k])
      ex.run(`INSERT INTO ${tbl} (${colSql}) VALUES (${placeholders})`, args)

      const idRow = ex.get("SELECT last_insert_rowid() AS id")
      const id = Number(idRow?.id)
      const row = ex.get(`SELECT * FROM ${tbl} WHERE "id" = ?`, [id])
      return rowFromObject(row) as T
    },

    read<T extends Row = Row>(table: string, query: ReadQuery = {}): T | null {
      assertString(table, "table")
      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      const sql =
        `SELECT ${selectColumns(query.columns)} FROM ${tbl}` +
        (where.sql ? ` WHERE ${where.sql}` : "") +
        ` LIMIT 1`
      const row = ex.get(sql, where.args)
      return row == null ? null : (rowFromObject(row) as T)
    },

    update<T extends Row = Row>(
      table: string,
      cols: Record<string, unknown>,
      query: UpdateQuery,
    ): T | null {
      assertString(table, "table")
      requireWhere(query, "update")
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }

      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      if (!where.sql) {
        throw new CrudianError("update requires where")
      }
      const sets = keys.map((k) => `${quoteIdent(k)} = ?`).join(", ")
      const args = [...keys.map((k) => cols[k]), ...where.args]
      const result = ex.run(`UPDATE ${tbl} SET ${sets} WHERE ${where.sql}`, args)
      if (result.changes === 0) return null

      const row = ex.get(`SELECT * FROM ${tbl} WHERE ${where.sql} LIMIT 1`, where.args)
      return row == null ? null : (rowFromObject(row) as T)
    },

    delete(table: string, query: DeleteQuery): number {
      assertString(table, "table")
      requireWhere(query, "delete")
      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      if (!where.sql) {
        throw new CrudianError("delete requires where")
      }
      const result = ex.run(`DELETE FROM ${tbl} WHERE ${where.sql}`, where.args)
      return Number(result.changes ?? 0)
    },

    search<T extends Row = Row>(table: string, query: SearchQuery = {}): SearchResult<T> {
      assertString(table, "table")
      const limit = query.limit ?? 20
      if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
        throw new CrudianError("limit must be a positive number")
      }

      const paging = query.paging ?? "offset"
      if (paging !== "offset" && paging !== "cursor") {
        throw new CrudianError('paging must be "offset" or "cursor"')
      }
      if (paging === "offset" && query.cursor !== undefined) {
        throw new CrudianError("offset paging does not accept cursor")
      }
      if (paging === "cursor" && query.offset !== undefined) {
        throw new CrudianError("cursor paging does not accept offset")
      }
      if (
        query.cursor != null &&
        typeof query.cursor !== "number" &&
        typeof query.cursor !== "string"
      ) {
        throw new CrudianError("cursor must be a number, string, or null")
      }

      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      const total = crud.count(table, { where: query.where })

      if (paging === "offset") {
        const offset = query.offset ?? 0
        if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0) {
          throw new CrudianError("offset must be a non-negative number")
        }
        const args: unknown[] = [...where.args]
        const whereSql = where.sql ? ` WHERE ${where.sql}` : ""
        const sql =
          `SELECT ${selectColumns(query.columns)} FROM ${tbl}` +
          whereSql +
          ` ORDER BY ${quoteIdent("id")} ASC LIMIT ? OFFSET ?`
        args.push(limit, offset)
        const items = ex.all(sql, args).map((r) => rowFromObject(r) as T)
        return {
          items,
          total,
          offset,
          limit,
          hasMore: offset + items.length < total,
        }
      }

      const args: unknown[] = [...where.args]
      const parts: string[] = []
      if (where.sql) parts.push(`(${where.sql})`)
      if (query.cursor != null) {
        parts.push(`${quoteIdent("id")} > ?`)
        args.push(query.cursor)
      }
      const whereSql = parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : ""
      const sql =
        `SELECT ${selectColumns(query.columns)} FROM ${tbl}` +
        whereSql +
        ` ORDER BY ${quoteIdent("id")} ASC LIMIT ?`
      args.push(limit + 1)

      const rows = ex.all(sql, args).map((r) => rowFromObject(r) as T)
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const last = items[items.length - 1]
      const nextCursor =
        hasMore && last != null && (typeof last.id === "number" || typeof last.id === "string")
          ? last.id
          : null

      return { items, nextCursor, hasMore, total }
    },

    list<T extends Row = Row>(table: string, query?: SearchQuery): SearchResult<T> {
      return crud.search<T>(table, query)
    },

    count(table: string, query: CountQuery = {}): number {
      assertString(table, "table")
      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      const sql =
        `SELECT COUNT(*) AS ${quoteIdent("row_count")} FROM ${tbl}` +
        (where.sql ? ` WHERE ${where.sql}` : "")
      const row = ex.get(sql, where.args)
      return Number(row?.row_count ?? 0)
    },

    upsert<T extends Row = Row>(table: string, cols: Record<string, unknown>): T {
      assertString(table, "table")
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }
      if (!Object.prototype.hasOwnProperty.call(cols, "id")) {
        throw new CrudianError("upsert requires cols.id")
      }

      const id = cols.id
      const existing = crud.read<T>(table, {
        where: { type: "cond", op: "eq", column: "id", value: id },
      })
      if (existing != null) {
        const { id: _id, ...patch } = cols
        if (Object.keys(patch).length === 0) return existing
        const updated = crud.update<T>(table, patch, {
          where: { type: "cond", op: "eq", column: "id", value: id },
        })
        if (updated == null) {
          throw new CrudianError("upsert update failed")
        }
        return updated
      }

      return crud.create<T>(table, cols)
    },

    duplicate<T extends Row = Row>(table: string, query: DuplicateQuery): T | null {
      assertString(table, "table")
      requireWhere(query, "duplicate")
      const source = crud.read<T>(table, { where: query.where })
      if (source == null) return null

      const { id: _id, ...rest } = source
      const overrides =
        query.overrides != null &&
        typeof query.overrides === "object" &&
        !Array.isArray(query.overrides)
          ? query.overrides
          : {}
      const cols = { ...rest, ...overrides }
      delete cols.id
      return crud.create<T>(table, cols)
    },

    bulkCreate(table: string, rows: Record<string, unknown>[]): number {
      assertString(table, "table")
      if (!Array.isArray(rows)) {
        throw new CrudianError("rows must be an array")
      }
      if (rows.length === 0) return 0
      let count = 0
      for (const row of rows) {
        if (row == null || typeof row !== "object" || Array.isArray(row)) {
          throw new CrudianError("each row must be an object")
        }
        crud.create(table, row)
        count += 1
      }
      return count
    },

    bulkUpdate(
      table: string,
      cols: Record<string, unknown>,
      query: UpdateQuery,
    ): number {
      assertString(table, "table")
      requireWhere(query, "bulkUpdate")
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }

      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      if (!where.sql) {
        throw new CrudianError("bulkUpdate requires where")
      }
      const sets = keys.map((k) => `${quoteIdent(k)} = ?`).join(", ")
      const args = [...keys.map((k) => cols[k]), ...where.args]
      const result = ex.run(`UPDATE ${tbl} SET ${sets} WHERE ${where.sql}`, args)
      return Number(result.changes ?? 0)
    },

    bulkDelete(table: string, query: DeleteQuery): number {
      return crud.delete(table, query)
    },

    bulkUpsert(table: string, rows: Record<string, unknown>[]): number {
      assertString(table, "table")
      if (!Array.isArray(rows)) {
        throw new CrudianError("rows must be an array")
      }
      if (rows.length === 0) return 0
      let count = 0
      for (const row of rows) {
        if (row == null || typeof row !== "object" || Array.isArray(row)) {
          throw new CrudianError("each row must be an object")
        }
        if (!Object.prototype.hasOwnProperty.call(row, "id")) {
          throw new CrudianError("bulkUpsert requires each row to have id")
        }
        crud.upsert(table, row)
        count += 1
      }
      return count
    },

    transaction<T>(fn: () => T): T {
      if (typeof fn !== "function") {
        throw new CrudianError("transaction callback must be a function")
      }
      return ex.transaction(fn)
    },
  }

  return crud
}
