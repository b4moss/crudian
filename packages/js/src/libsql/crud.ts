import { CrudianError } from "../index.js"
import {
  createAsyncSqliteCrud,
  type AsyncSqliteCrud,
} from "../sqlite/async-crud.js"
import type { Row } from "../types.js"

/** Result shape used by the libSQL executor bridge. */
export type LibsqlResultSet = {
  rows: Array<Row | unknown>
  rowsAffected: number
}

/** Minimal execute surface shared by Client and Transaction. */
export type LibsqlExecutor = {
  execute(
    stmt: { sql: string; args?: unknown[] } | string,
  ): Promise<LibsqlResultSet>
}

/** Minimal surface of @libsql/client Client used by the adapter. */
export type LibsqlLikeClient = LibsqlExecutor & {
  transaction(
    mode?: "write" | "read" | "deferred",
  ): Promise<LibsqlLikeTransaction>
}

export type LibsqlLikeTransaction = LibsqlExecutor & {
  commit(): Promise<void>
  rollback(): Promise<void>
  close(): void
}

export type LibsqlCrud = AsyncSqliteCrud<LibsqlLikeClient>

function normalizeRow(row: unknown): Row {
  if (row == null || typeof row !== "object") {
    throw new CrudianError("expected row object")
  }
  const out: Row = { ...(row as Row) }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "bigint") out[k] = Number(v)
  }
  return out
}

/**
 * Create a Crud bound to a libSQL client (`@libsql/client`).
 * Methods are async. The injected client is exposed as `crud.db`.
 * Auth / URL are configured on the caller-created client (e.g. from env).
 */
export function createCrud(client: LibsqlLikeClient): LibsqlCrud {
  if (client == null) {
    throw new CrudianError("db is required")
  }
  if (
    typeof client !== "object" ||
    typeof client.execute !== "function" ||
    typeof client.transaction !== "function"
  ) {
    throw new CrudianError("db must be a libSQL client")
  }

  let active: LibsqlExecutor = client

  return createAsyncSqliteCrud(client, {
    async run(sql, args = []) {
      const result = await active.execute({ sql, args })
      return { changes: Number(result.rowsAffected ?? 0) }
    },
    async get(sql, args = []) {
      const result = await active.execute({ sql, args })
      const row = result.rows[0]
      return row == null ? undefined : normalizeRow(row)
    },
    async all(sql, args = []) {
      const result = await active.execute({ sql, args })
      return result.rows.map((row) => normalizeRow(row))
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const tx = await client.transaction("write")
      const prev = active
      active = tx
      try {
        const value = await fn()
        await tx.commit()
        return value
      } catch (err) {
        await tx.rollback()
        throw err
      } finally {
        active = prev
        tx.close()
      }
    },
  })
}
