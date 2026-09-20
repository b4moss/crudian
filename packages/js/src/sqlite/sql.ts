import {
  CrudianError,
  isWhereBuilder,
  type WhereInput,
  type WhereNode,
} from "../index.js"
import type { Dialect } from "../dialect/types.js"
import { sqliteDialect } from "../dialect/sqlite.js"

/** @deprecated Prefer dialect.quoteIdent; kept for local helper call sites. */
export function quoteIdent(name: string): string {
  return sqliteDialect.quoteIdent(name)
}

export function resolveWhere(input: WhereInput | undefined): WhereNode | undefined {
  if (input === undefined) return undefined
  if (isWhereBuilder(input)) return input.toNode()
  return input
}

export type CompiledWhere = {
  sql: string
  args: unknown[]
  /** Next 1-based placeholder index after this fragment. */
  nextIndex: number
}

/**
 * Compile a where AST using dialect placeholders.
 * @param startIndex 1-based index for the first placeholder in this fragment.
 */
export function compileWhere(
  dialect: Dialect,
  node: WhereNode | undefined,
  startIndex = 1,
): CompiledWhere {
  if (!node) return { sql: "", args: [], nextIndex: startIndex }

  if (node.type === "and" || node.type === "or") {
    if (node.children.length === 0) return { sql: "", args: [], nextIndex: startIndex }
    const parts: string[] = []
    const args: unknown[] = []
    let idx = startIndex
    for (const child of node.children) {
      const compiled = compileWhere(dialect, child, idx)
      if (!compiled.sql) continue
      parts.push(`(${compiled.sql})`)
      args.push(...compiled.args)
      idx = compiled.nextIndex
    }
    if (parts.length === 0) return { sql: "", args: [], nextIndex: startIndex }
    if (parts.length === 1) {
      return { sql: parts[0]!.slice(1, -1), args, nextIndex: idx }
    }
    const joiner = node.type === "and" ? " AND " : " OR "
    return { sql: parts.join(joiner), args, nextIndex: idx }
  }

  if (node.type !== "cond") {
    throw new CrudianError("invalid where node")
  }

  const col = dialect.quoteIdent(node.column)
  let idx = startIndex
  switch (node.op) {
    case "eq":
      return {
        sql: `${col} = ${dialect.placeholder(idx)}`,
        args: [node.value],
        nextIndex: idx + 1,
      }
    case "ne":
      return {
        sql: `${col} <> ${dialect.placeholder(idx)}`,
        args: [node.value],
        nextIndex: idx + 1,
      }
    case "lt":
      return {
        sql: `${col} < ${dialect.placeholder(idx)}`,
        args: [node.value],
        nextIndex: idx + 1,
      }
    case "gt":
      return {
        sql: `${col} > ${dialect.placeholder(idx)}`,
        args: [node.value],
        nextIndex: idx + 1,
      }
    case "lte":
      return {
        sql: `${col} <= ${dialect.placeholder(idx)}`,
        args: [node.value],
        nextIndex: idx + 1,
      }
    case "gte":
      return {
        sql: `${col} >= ${dialect.placeholder(idx)}`,
        args: [node.value],
        nextIndex: idx + 1,
      }
    case "like":
      return {
        sql: `${col} LIKE ${dialect.placeholder(idx)}`,
        args: [node.value],
        nextIndex: idx + 1,
      }
    case "isNull":
      return { sql: `${col} IS NULL`, args: [], nextIndex: idx }
    case "isNotNull":
      return { sql: `${col} IS NOT NULL`, args: [], nextIndex: idx }
    case "in": {
      const values = node.value
      if (!Array.isArray(values)) {
        throw new CrudianError("in value must be an array")
      }
      if (values.length === 0) {
        throw new CrudianError("in requires a non-empty array")
      }
      const placeholders = values.map(() => dialect.placeholder(idx++)).join(", ")
      return { sql: `${col} IN (${placeholders})`, args: values, nextIndex: idx }
    }
    default:
      throw new CrudianError(`unknown op: ${(node as { op: string }).op}`)
  }
}
