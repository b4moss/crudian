import { CrudianError } from "../index.js"
import {
  createAsyncSqliteCrud,
  type AsyncSqliteCrud,
} from "../sqlite/async-crud.js"
import type { Row } from "../types.js"

/** Minimal surface of PrismaClient used by the adapter (raw SQL + TX). */
export type PrismaLikeClient = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
  $transaction<T>(fn: (tx: PrismaLikeClient) => Promise<T>): Promise<T>
}

export type PrismaCrud = AsyncSqliteCrud<PrismaLikeClient>

function normalizeRow(row: Row): Row {
  const out: Row = { ...row }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "bigint") out[k] = Number(v)
  }
  return out
}

/**
 * Create a Crud bound to a PrismaClient (SQLite).
 * Methods are async. The injected client is exposed as `crud.db`.
 */
export function createCrud(client: PrismaLikeClient): PrismaCrud {
  if (client == null) {
    throw new CrudianError("db is required")
  }
  if (
    typeof client !== "object" ||
    typeof client.$executeRawUnsafe !== "function" ||
    typeof client.$queryRawUnsafe !== "function" ||
    typeof client.$transaction !== "function"
  ) {
    throw new CrudianError("db must be a PrismaClient")
  }

  let active: PrismaLikeClient = client

  return createAsyncSqliteCrud(client, {
    async run(sql, args = []) {
      const changes = await active.$executeRawUnsafe(sql, ...args)
      return { changes: Number(changes ?? 0) }
    },
    async get(sql, args = []) {
      const rows = (await active.$queryRawUnsafe<Row[]>(sql, ...args)) ?? []
      const row = rows[0]
      return row == null ? undefined : normalizeRow(row)
    },
    async all(sql, args = []) {
      const rows = (await active.$queryRawUnsafe<Row[]>(sql, ...args)) ?? []
      return rows.map(normalizeRow)
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => {
        const prev = active
        active = tx
        try {
          return await fn()
        } finally {
          active = prev
        }
      })
    },
  })
}
