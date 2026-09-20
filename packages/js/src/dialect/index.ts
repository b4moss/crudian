import { CrudianError } from "../index.js"
import { mysqlDialect } from "./mysql.js"
import { postgresDialect } from "./postgres.js"
import { sqliteDialect } from "./sqlite.js"
import type { Dialect, DialectName } from "./types.js"

export type { Dialect, DialectName, DescribeColumnsQuery } from "./types.js"
export { sqliteDialect } from "./sqlite.js"
export { postgresDialect } from "./postgres.js"
export { mysqlDialect } from "./mysql.js"

export function resolveDialect(name: DialectName | undefined): Dialect {
  switch (name ?? "sqlite") {
    case "sqlite":
      return sqliteDialect
    case "postgres":
      return postgresDialect
    case "mysql":
      return mysqlDialect
    default:
      throw new CrudianError(`unknown dialect: ${String(name)}`)
  }
}
