import type { Dialect } from "./types.js"
import { assertIdent } from "./types.js"

/** Postgres dialect: `"ident"`, `$n`, RETURNING *, information_schema. */
export const postgresDialect: Dialect = {
  name: "postgres",
  supportsInsertReturning: true,

  quoteIdent(name: string): string {
    const n = assertIdent(name)
    return `"${n.replaceAll('"', '""')}"`
  },

  placeholder(i: number): string {
    return `$${i}`
  },

  lastInsertIdSql(): string {
    // Prefer RETURNING; this is a fallback for sync-style paths.
    return "SELECT lastval() AS id"
  },

  describeColumns(table: string) {
    const n = assertIdent(table)
    return {
      sql:
        `SELECT column_name AS name FROM information_schema.columns` +
        ` WHERE table_schema = current_schema() AND table_name = $1`,
      args: [n],
    }
  },
}
