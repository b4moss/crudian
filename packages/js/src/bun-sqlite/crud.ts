import type { Database, SQLQueryBindings } from "bun:sqlite"
import {
  CrudianError,
  assertString,
  type DeleteQuery,
  type DuplicateQuery,
  type ReadQuery,
  type Row,
  type SearchQuery,
  type SearchResult,
  type UpdateQuery,
} from "../index.js"
import { compileWhere, quoteIdent, resolveWhere } from "./sql.js"

function bindings(args: unknown[]): SQLQueryBindings[] {
  return args as SQLQueryBindings[]
}

export type BunSqliteCrud = {
  readonly db: Database
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
  search<T extends Row = Row>(table: string, query?: SearchQuery): SearchResult<T>
  list<T extends Row = Row>(table: string, query?: SearchQuery): SearchResult<T>
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

export function createCrud(db: Database): BunSqliteCrud {
  if (db == null) {
    throw new CrudianError("db is required")
  }
  if (typeof db !== "object" || typeof (db as Database).query !== "function") {
    throw new CrudianError("db must be a bun:sqlite Database")
  }

  const crud: BunSqliteCrud = {
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
      db.query(
        `INSERT INTO ${tbl} (${colSql}) VALUES (${placeholders})`,
      ).run(...bindings(args))

      const idRow = db.query("SELECT last_insert_rowid() AS id").get() as
        | { id: number | bigint }
        | null
      const id = Number(idRow?.id)
      const row = db.query(`SELECT * FROM ${tbl} WHERE "id" = ?`).get(id)
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
      const row = db.query(sql).get(...bindings(where.args))
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
      const result = db
        .query(`UPDATE ${tbl} SET ${sets} WHERE ${where.sql}`)
        .run(...bindings(args))
      if (result.changes === 0) return null

      const row = db
        .query(`SELECT * FROM ${tbl} WHERE ${where.sql} LIMIT 1`)
        .get(...bindings(where.args))
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
      const result = db
        .query(`DELETE FROM ${tbl} WHERE ${where.sql}`)
        .run(...bindings(where.args))
      return Number(result.changes ?? 0)
    },

    search<T extends Row = Row>(table: string, query: SearchQuery = {}): SearchResult<T> {
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

      const rows = db
        .query(sql)
        .all(...bindings(args))
        .map((r) => rowFromObject(r) as T)
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const last = items[items.length - 1]
      const nextCursor =
        hasMore && last != null && (typeof last.id === "number" || typeof last.id === "string")
          ? last.id
          : null

      return { items, nextCursor, hasMore }
    },

    list<T extends Row = Row>(table: string, query?: SearchQuery): SearchResult<T> {
      return crud.search<T>(table, query)
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
      const existing = crud.read<T>(table, { where: { type: "cond", op: "eq", column: "id", value: id } })
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

    transaction<T>(fn: () => T): T {
      if (typeof fn !== "function") {
        throw new CrudianError("transaction callback must be a function")
      }
      const run = db.transaction(fn)
      return run()
    },
  }

  return crud
}
