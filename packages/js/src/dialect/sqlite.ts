import type { Dialect } from "./types.js"
import { assertIdent } from "./types.js"

/** SQLite / libSQL dialect: `"ident"`, `?`, PRAGMA, last_insert_rowid / RETURNING. */
export const sqliteDialect: Dialect = {
  name: "sqlite",
  supportsInsertReturning: true,

  quoteIdent(name: string): string {
    const n = assertIdent(name)
    return `"${n.replaceAll('"', '""')}"`
  },

  placeholder(_i: number): string {
    return "?"
  },

  lastInsertIdSql(): string {
    return "SELECT last_insert_rowid() AS id"
  },

  describeColumns(table: string) {
    const n = assertIdent(table)
    return {
      sql: `PRAGMA table_info(${sqliteDialect.quoteIdent(n)})`,
      args: [],
    }
  },
}
