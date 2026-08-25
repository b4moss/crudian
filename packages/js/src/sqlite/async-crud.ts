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

export type AsyncSqliteExecutor = {
  run(sql: string, args?: unknown[]): Promise<{ changes: number }>
  get(sql: string, args?: unknown[]): Promise<Row | undefined>
  all(sql: string, args?: unknown[]): Promise<Row[]>
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

export type AsyncSqliteCrud<TDb> = {
  readonly db: TDb
  create<T extends Row = Row>(
    table: string,
    cols: Record<string, unknown>,
  ): Promise<T>
  read<T extends Row = Row>(table: string, query?: ReadQuery): Promise<T | null>
  update<T extends Row = Row>(
    table: string,
    cols: Record<string, unknown>,
    query: UpdateQuery,
  ): Promise<T | null>
  delete(table: string, query: DeleteQuery): Promise<number>
  upsert<T extends Row = Row>(
    table: string,
    cols: Record<string, unknown>,
  ): Promise<T>
  duplicate<T extends Row = Row>(
    table: string,
    query: DuplicateQuery,
  ): Promise<T | null>
  bulkCreate(table: string, rows: Record<string, unknown>[]): Promise<number>
  bulkUpdate(
    table: string,
    cols: Record<string, unknown>,
    query: UpdateQuery,
  ): Promise<number>
  bulkDelete(table: string, query: DeleteQuery): Promise<number>
  bulkUpsert(table: string, rows: Record<string, unknown>[]): Promise<number>
  search<T extends Row = Row>(
    table: string,
    query?: SearchQuery,
  ): Promise<SearchResult<T>>
  list<T extends Row = Row>(
    table: string,
    query?: SearchQuery,
  ): Promise<SearchResult<T>>
  count(table: string, query?: CountQuery): Promise<number>
  transaction<T>(fn: () => Promise<T>): Promise<T>
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

export function createAsyncSqliteCrud<TDb>(
  db: TDb,
  ex: AsyncSqliteExecutor,
): AsyncSqliteCrud<TDb> {
  const crud: AsyncSqliteCrud<TDb> = {
    db,

    async create<T extends Row = Row>(
      table: string,
      cols: Record<string, unknown>,
    ): Promise<T> {
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
      // Single-statement insert+fetch avoids last_insert_rowid() across pooled
      // connections (Prisma SQLite), which can return an empty row after COUNT.
      const row = await ex.get(
        `INSERT INTO ${tbl} (${colSql}) VALUES (${placeholders}) RETURNING *`,
        args,
      )
      return rowFromObject(row) as T
    },

    async read<T extends Row = Row>(
      table: string,
      query: ReadQuery = {},
    ): Promise<T | null> {
      assertString(table, "table")
      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      const sql =
        `SELECT ${selectColumns(query.columns)} FROM ${tbl}` +
        (where.sql ? ` WHERE ${where.sql}` : "") +
        ` LIMIT 1`
      const row = await ex.get(sql, where.args)
      return row == null ? null : (rowFromObject(row) as T)
    },

    async update<T extends Row = Row>(
      table: string,
      cols: Record<string, unknown>,
      query: UpdateQuery,
    ): Promise<T | null> {
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
      const result = await ex.run(
        `UPDATE ${tbl} SET ${sets} WHERE ${where.sql}`,
        args,
      )
      if (result.changes === 0) return null

      const row = await ex.get(
        `SELECT * FROM ${tbl} WHERE ${where.sql} LIMIT 1`,
        where.args,
      )
      return row == null ? null : (rowFromObject(row) as T)
    },

    async delete(table: string, query: DeleteQuery): Promise<number> {
      assertString(table, "table")
      requireWhere(query, "delete")
      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      if (!where.sql) {
        throw new CrudianError("delete requires where")
      }
      const result = await ex.run(`DELETE FROM ${tbl} WHERE ${where.sql}`, where.args)
      return Number(result.changes ?? 0)
    },

    async search<T extends Row = Row>(
      table: string,
      query: SearchQuery = {},
    ): Promise<SearchResult<T>> {
      assertString(table, "table")
      const limit = query.limit ?? 20
      if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
        throw new CrudianError("limit must be a positive number")
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

      const rows = (await ex.all(sql, args)).map((r) => rowFromObject(r) as T)
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const last = items[items.length - 1]
      const nextCursor =
        hasMore && last != null && (typeof last.id === "number" || typeof last.id === "string")
          ? last.id
          : null

      const total = await crud.count(table, { where: query.where })
      return { items, nextCursor, hasMore, total }
    },

    async list<T extends Row = Row>(
      table: string,
      query?: SearchQuery,
    ): Promise<SearchResult<T>> {
      return crud.search<T>(table, query)
    },

    async count(table: string, query: CountQuery = {}): Promise<number> {
      assertString(table, "table")
      const tbl = quoteIdent(table)
      const where = compileWhere(resolveWhere(query.where))
      const sql =
        `SELECT COUNT(*) AS ${quoteIdent("row_count")} FROM ${tbl}` +
        (where.sql ? ` WHERE ${where.sql}` : "")
      const row = await ex.get(sql, where.args)
      return Number(row?.row_count ?? 0)
    },

    async upsert<T extends Row = Row>(
      table: string,
      cols: Record<string, unknown>,
    ): Promise<T> {
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
      const existing = await crud.read<T>(table, {
        where: { type: "cond", op: "eq", column: "id", value: id },
      })
      if (existing != null) {
        const { id: _id, ...patch } = cols
        if (Object.keys(patch).length === 0) return existing
        const updated = await crud.update<T>(table, patch, {
          where: { type: "cond", op: "eq", column: "id", value: id },
        })
        if (updated == null) {
          throw new CrudianError("upsert update failed")
        }
        return updated
      }

      return crud.create<T>(table, cols)
    },

    async duplicate<T extends Row = Row>(
      table: string,
      query: DuplicateQuery,
    ): Promise<T | null> {
      assertString(table, "table")
      requireWhere(query, "duplicate")
      const source = await crud.read<T>(table, { where: query.where })
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

    async bulkCreate(table: string, rows: Record<string, unknown>[]): Promise<number> {
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
        await crud.create(table, row)
        count += 1
      }
      return count
    },

    async bulkUpdate(
      table: string,
      cols: Record<string, unknown>,
      query: UpdateQuery,
    ): Promise<number> {
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
      const result = await ex.run(
        `UPDATE ${tbl} SET ${sets} WHERE ${where.sql}`,
        args,
      )
      return Number(result.changes ?? 0)
    },

    async bulkDelete(table: string, query: DeleteQuery): Promise<number> {
      return crud.delete(table, query)
    },

    async bulkUpsert(table: string, rows: Record<string, unknown>[]): Promise<number> {
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
        await crud.upsert(table, row)
        count += 1
      }
      return count
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (typeof fn !== "function") {
        throw new CrudianError("transaction callback must be a function")
      }
      return ex.transaction(fn)
    },
  }

  return crud
}
