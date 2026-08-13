import type { Database, SQLQueryBindings } from "bun:sqlite"
import { CrudianError } from "../index.js"
import {
  createSyncSqliteCrud,
  type SyncSqliteCrud,
} from "../sqlite/sync-crud.js"

function bindings(args: unknown[]): SQLQueryBindings[] {
  return args as SQLQueryBindings[]
}

export type BunSqliteCrud = SyncSqliteCrud<Database>

/**
 * Create a Crud bound to a Bun SQLite Database.
 * The same Database instance is reused for every operation.
 */
export function createCrud(db: Database): BunSqliteCrud {
  if (db == null) {
    throw new CrudianError("db is required")
  }
  if (typeof db !== "object" || typeof (db as Database).query !== "function") {
    throw new CrudianError("db must be a bun:sqlite Database")
  }

  return createSyncSqliteCrud(db, {
    run(sql, args = []) {
      const result = db.query(sql).run(...bindings(args))
      return { changes: Number(result.changes ?? 0) }
    },
    get(sql, args = []) {
      return db.query(sql).get(...bindings(args)) as
        | Record<string, unknown>
        | undefined
    },
    all(sql, args = []) {
      return db.query(sql).all(...bindings(args)) as Record<string, unknown>[]
    },
    transaction(fn) {
      return db.transaction(fn)()
    },
  })
}
