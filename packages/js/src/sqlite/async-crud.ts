import {
  CrudianError,
  assertString,
  type CountQuery,
  type CreateCrudOptions,
  type DeleteQuery,
  type DuplicateQuery,
  type ReadQuery,
  type Row,
  type SearchQuery,
  type SearchResult,
  type UpdateQuery,
} from "../index.js"
import type { Dialect } from "../dialect/types.js"
import { sqliteDialect } from "../dialect/sqlite.js"
import { createAsyncPkGuard, resolvePk } from "./pk.js"
import { compileWhere, resolveWhere } from "./sql.js"

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
  exists(table: string, query?: CountQuery): Promise<boolean>
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

function requireWhere(query: { where?: unknown }, label: string) {
  if (query.where === undefined || query.where === null) {
    throw new CrudianError(`${label} requires where`)
  }
}

function selectColumns(d: Dialect, columns: string[] | undefined): string {
  if (!columns || columns.length === 0) return "*"
  return columns.map((c) => d.quoteIdent(c)).join(", ")
}

function rowFromObject(value: unknown): Row {
  if (value === null || typeof value !== "object") {
    throw new CrudianError("expected row object")
  }
  return { ...(value as Row) }
}

/** Dialect-aware async CRUD factory. */
export function createAsyncCrud<TDb>(
  db: TDb,
  ex: AsyncSqliteExecutor,
  dialect: Dialect,
  options?: CreateCrudOptions,
): AsyncSqliteCrud<TDb> {
  const pk = resolvePk(options)
  const ensurePkColumn = createAsyncPkGuard(pk, dialect, ex.all)
  const d = dialect

  const crud: AsyncSqliteCrud<TDb> = {
    db,

    async create<T extends Row = Row>(
      table: string,
      cols: Record<string, unknown>,
    ): Promise<T> {
      assertString(table, "table")
      await ensurePkColumn(table)
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }

      const tbl = d.quoteIdent(table)
      const colSql = keys.map((k) => d.quoteIdent(k)).join(", ")
      let idx = 1
      const placeholders = keys.map(() => d.placeholder(idx++)).join(", ")
      const args = keys.map((k) => cols[k])

      if (d.supportsInsertReturning) {
        // Single-statement insert+fetch avoids last_insert_rowid() across pooled
        // connections (Prisma SQLite), which can return an empty row after COUNT.
        const row = await ex.get(
          `INSERT INTO ${tbl} (${colSql}) VALUES (${placeholders}) RETURNING *`,
          args,
        )
        return rowFromObject(row) as T
      }

      await ex.run(`INSERT INTO ${tbl} (${colSql}) VALUES (${placeholders})`, args)
      const pkValue = Object.prototype.hasOwnProperty.call(cols, pk)
        ? cols[pk]
        : Number((await ex.get(d.lastInsertIdSql()))?.id)
      const row = await ex.get(
        `SELECT * FROM ${tbl} WHERE ${d.quoteIdent(pk)} = ${d.placeholder(1)}`,
        [pkValue],
      )
      return rowFromObject(row) as T
    },

    async read<T extends Row = Row>(
      table: string,
      query: ReadQuery = {},
    ): Promise<T | null> {
      assertString(table, "table")
      await ensurePkColumn(table)
      const tbl = d.quoteIdent(table)
      const where = compileWhere(d, resolveWhere(query.where))
      const sql =
        `SELECT ${selectColumns(d, query.columns)} FROM ${tbl}` +
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
      await ensurePkColumn(table)
      requireWhere(query, "update")
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }

      const tbl = d.quoteIdent(table)
      let idx = 1
      const sets = keys.map((k) => `${d.quoteIdent(k)} = ${d.placeholder(idx++)}`).join(", ")
      const where = compileWhere(d, resolveWhere(query.where), idx)
      if (!where.sql) {
        throw new CrudianError("update requires where")
      }
      const args = [...keys.map((k) => cols[k]), ...where.args]
      const result = await ex.run(
        `UPDATE ${tbl} SET ${sets} WHERE ${where.sql}`,
        args,
      )
      if (result.changes === 0) return null

      const fetchWhere = compileWhere(d, resolveWhere(query.where))
      const row = await ex.get(
        `SELECT * FROM ${tbl} WHERE ${fetchWhere.sql} LIMIT 1`,
        fetchWhere.args,
      )
      return row == null ? null : (rowFromObject(row) as T)
    },

    async delete(table: string, query: DeleteQuery): Promise<number> {
      assertString(table, "table")
      await ensurePkColumn(table)
      requireWhere(query, "delete")
      const tbl = d.quoteIdent(table)
      const where = compileWhere(d, resolveWhere(query.where))
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
      await ensurePkColumn(table)
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

      const tbl = d.quoteIdent(table)
      const where = compileWhere(d, resolveWhere(query.where))
      const total = await crud.count(table, { where: query.where })

      if (paging === "offset") {
        const offset = query.offset ?? 0
        if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0) {
          throw new CrudianError("offset must be a non-negative number")
        }
        const args: unknown[] = [...where.args]
        let idx = where.nextIndex
        const whereSql = where.sql ? ` WHERE ${where.sql}` : ""
        const sql =
          `SELECT ${selectColumns(d, query.columns)} FROM ${tbl}` +
          whereSql +
          ` ORDER BY ${d.quoteIdent(pk)} ASC LIMIT ${d.placeholder(idx++)} OFFSET ${d.placeholder(idx++)}`
        args.push(limit, offset)
        const items = (await ex.all(sql, args)).map((r) => rowFromObject(r) as T)
        return {
          items,
          total,
          offset,
          limit,
          hasMore: offset + items.length < total,
        }
      }

      const args: unknown[] = [...where.args]
      let idx = where.nextIndex
      const parts: string[] = []
      if (where.sql) parts.push(`(${where.sql})`)
      if (query.cursor != null) {
        parts.push(`${d.quoteIdent(pk)} > ${d.placeholder(idx++)}`)
        args.push(query.cursor)
      }
      const whereSql = parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : ""
      const sql =
        `SELECT ${selectColumns(d, query.columns)} FROM ${tbl}` +
        whereSql +
        ` ORDER BY ${d.quoteIdent(pk)} ASC LIMIT ${d.placeholder(idx++)}`
      args.push(limit + 1)

      const rows = (await ex.all(sql, args)).map((r) => rowFromObject(r) as T)
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const last = items[items.length - 1]
      const pkVal = last != null ? last[pk] : undefined
      const nextCursor =
        hasMore && last != null && (typeof pkVal === "number" || typeof pkVal === "string")
          ? pkVal
          : null

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
      await ensurePkColumn(table)
      const tbl = d.quoteIdent(table)
      const where = compileWhere(d, resolveWhere(query.where))
      const sql =
        `SELECT COUNT(*) AS ${d.quoteIdent("row_count")} FROM ${tbl}` +
        (where.sql ? ` WHERE ${where.sql}` : "")
      const row = await ex.get(sql, where.args)
      return Number(row?.row_count ?? 0)
    },

    async exists(table: string, query: CountQuery = {}): Promise<boolean> {
      assertString(table, "table")
      await ensurePkColumn(table)
      const tbl = d.quoteIdent(table)
      const where = compileWhere(d, resolveWhere(query.where))
      const sql =
        `SELECT 1 AS ${d.quoteIdent("ok")} FROM ${tbl}` +
        (where.sql ? ` WHERE ${where.sql}` : "") +
        ` LIMIT 1`
      const row = await ex.get(sql, where.args)
      return row != null
    },

    async upsert<T extends Row = Row>(
      table: string,
      cols: Record<string, unknown>,
    ): Promise<T> {
      assertString(table, "table")
      await ensurePkColumn(table)
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }
      if (!Object.prototype.hasOwnProperty.call(cols, pk)) {
        throw new CrudianError(`upsert requires cols.${pk}`)
      }

      const id = cols[pk]
      const existing = await crud.read<T>(table, {
        where: { type: "cond", op: "eq", column: pk, value: id },
      })
      if (existing != null) {
        const patch = { ...cols }
        delete patch[pk]
        if (Object.keys(patch).length === 0) return existing
        const updated = await crud.update<T>(table, patch, {
          where: { type: "cond", op: "eq", column: pk, value: id },
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
      await ensurePkColumn(table)
      requireWhere(query, "duplicate")
      const source = await crud.read<T>(table, { where: query.where })
      if (source == null) return null

      const rest = { ...source }
      delete rest[pk]
      const overrides =
        query.overrides != null &&
        typeof query.overrides === "object" &&
        !Array.isArray(query.overrides)
          ? query.overrides
          : {}
      const cols = { ...rest, ...overrides }
      delete cols[pk]
      return crud.create<T>(table, cols)
    },

    async bulkCreate(table: string, rows: Record<string, unknown>[]): Promise<number> {
      assertString(table, "table")
      await ensurePkColumn(table)
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
      await ensurePkColumn(table)
      requireWhere(query, "bulkUpdate")
      if (cols == null || typeof cols !== "object" || Array.isArray(cols)) {
        throw new CrudianError("cols must be an object")
      }
      const keys = Object.keys(cols)
      if (keys.length === 0) {
        throw new CrudianError("cols must not be empty")
      }

      const tbl = d.quoteIdent(table)
      let idx = 1
      const sets = keys.map((k) => `${d.quoteIdent(k)} = ${d.placeholder(idx++)}`).join(", ")
      const where = compileWhere(d, resolveWhere(query.where), idx)
      if (!where.sql) {
        throw new CrudianError("bulkUpdate requires where")
      }
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
      await ensurePkColumn(table)
      if (!Array.isArray(rows)) {
        throw new CrudianError("rows must be an array")
      }
      if (rows.length === 0) return 0
      let count = 0
      for (const row of rows) {
        if (row == null || typeof row !== "object" || Array.isArray(row)) {
          throw new CrudianError("each row must be an object")
        }
        if (!Object.prototype.hasOwnProperty.call(row, pk)) {
          throw new CrudianError(`bulkUpsert requires each row to have ${pk}`)
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

/** SQLite async CRUD (compat). */
export function createAsyncSqliteCrud<TDb>(
  db: TDb,
  ex: AsyncSqliteExecutor,
  options?: CreateCrudOptions,
): AsyncSqliteCrud<TDb> {
  return createAsyncCrud(db, ex, sqliteDialect, options)
}
