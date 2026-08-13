import {
  CrudianError,
  assertString,
  isWhereBuilder,
  type WhereInput,
  type WhereNode,
} from "../index.js"

export function quoteIdent(name: string): string {
  assertString(name, "identifier")
  return `"${name.replaceAll('"', '""')}"`
}

export function resolveWhere(input: WhereInput | undefined): WhereNode | undefined {
  if (input === undefined) return undefined
  if (isWhereBuilder(input)) return input.toNode()
  return input
}

export function compileWhere(node: WhereNode | undefined): { sql: string; args: unknown[] } {
  if (!node) return { sql: "", args: [] }

  if (node.type === "and" || node.type === "or") {
    if (node.children.length === 0) return { sql: "", args: [] }
    const parts: string[] = []
    const args: unknown[] = []
    for (const child of node.children) {
      const compiled = compileWhere(child)
      if (!compiled.sql) continue
      parts.push(`(${compiled.sql})`)
      args.push(...compiled.args)
    }
    if (parts.length === 0) return { sql: "", args: [] }
    if (parts.length === 1) return { sql: parts[0]!.slice(1, -1), args }
    const joiner = node.type === "and" ? " AND " : " OR "
    return { sql: parts.join(joiner), args }
  }

  if (node.type !== "cond") {
    throw new CrudianError("invalid where node")
  }

  const col = quoteIdent(node.column)
  switch (node.op) {
    case "eq":
      return { sql: `${col} = ?`, args: [node.value] }
    case "ne":
      return { sql: `${col} <> ?`, args: [node.value] }
    case "lt":
      return { sql: `${col} < ?`, args: [node.value] }
    case "gt":
      return { sql: `${col} > ?`, args: [node.value] }
    case "lte":
      return { sql: `${col} <= ?`, args: [node.value] }
    case "gte":
      return { sql: `${col} >= ?`, args: [node.value] }
    case "like":
      return { sql: `${col} LIKE ?`, args: [node.value] }
    case "isNull":
      return { sql: `${col} IS NULL`, args: [] }
    case "isNotNull":
      return { sql: `${col} IS NOT NULL`, args: [] }
    case "in": {
      const values = node.value
      if (!Array.isArray(values)) {
        throw new CrudianError("in value must be an array")
      }
      if (values.length === 0) {
        throw new CrudianError("in requires a non-empty array")
      }
      const placeholders = values.map(() => "?").join(", ")
      return { sql: `${col} IN (${placeholders})`, args: values }
    }
    default:
      throw new CrudianError(`unknown op: ${(node as { op: string }).op}`)
  }
}
