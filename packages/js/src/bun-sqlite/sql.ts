import type { WhereNode } from "../index.js"
import { sqliteDialect } from "../dialect/sqlite.js"
import {
  compileWhere as compileWhereDialect,
  quoteIdent,
  resolveWhere,
  type CompiledWhere,
} from "../sqlite/sql.js"

export { quoteIdent, resolveWhere }

/** SQLite-default compileWhere (compat for bun-sqlite tests). */
export function compileWhere(
  node: WhereNode | undefined,
  startIndex = 1,
): CompiledWhere {
  return compileWhereDialect(sqliteDialect, node, startIndex)
}
