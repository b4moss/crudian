import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import type BetterSqlite3 from "better-sqlite3"
import { CrudianError } from "../index.js"
import {
  createSyncSqliteCrud,
  type SyncSqliteCrud,
} from "../sqlite/sync-crud.js"

type DrizzleSqliteDb = BetterSQLite3Database<Record<string, unknown>> & {
  $client: BetterSqlite3.Database
}

export type DrizzleCrud = SyncSqliteCrud<DrizzleSqliteDb>

/**
 * Create a Crud bound to a Drizzle better-sqlite3 database.
 * Raw SQL goes through the underlying better-sqlite3 client (`db.$client`).
 */
export function createCrud(db: DrizzleSqliteDb): DrizzleCrud {
  if (db == null) {
    throw new CrudianError("db is required")
  }
  if (typeof db !== "object" || typeof (db as DrizzleSqliteDb).$client !== "object") {
    throw new CrudianError("db must be a drizzle better-sqlite3 database")
  }
  const client = (db as DrizzleSqliteDb).$client
  if (client == null || typeof client.prepare !== "function") {
    throw new CrudianError("db.$client must be a better-sqlite3 Database")
  }

  return createSyncSqliteCrud(db, {
    run(sql, args = []) {
      const result = client.prepare(sql).run(...args)
      return { changes: Number(result.changes ?? 0) }
    },
    get(sql, args = []) {
      return client.prepare(sql).get(...args) as Record<string, unknown> | undefined
    },
    all(sql, args = []) {
      return client.prepare(sql).all(...args) as Record<string, unknown>[]
    },
    transaction(fn) {
      return client.transaction(fn)()
    },
  })
}
