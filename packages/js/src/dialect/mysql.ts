import type { Dialect } from "./types.js"
import { assertIdent } from "./types.js"

/** MySQL dialect: `` `ident` ``, `?`, LAST_INSERT_ID, information_schema (no RETURNING). */
export const mysqlDialect: Dialect = {
  name: "mysql",
  supportsInsertReturning: false,

  quoteIdent(name: string): string {
    const n = assertIdent(name)
    return `\`${n.replaceAll("`", "``")}\``
  },

  placeholder(_i: number): string {
    return "?"
  },

  lastInsertIdSql(): string {
    return "SELECT LAST_INSERT_ID() AS id"
  },

  describeColumns(table: string) {
    const n = assertIdent(table)
    return {
      sql:
        `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS` +
        ` WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      args: [n],
    }
  },
}
