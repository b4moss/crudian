import {
  CrudianError,
  isWhereBuilder,
  type WhereInput,
  type WhereNode,
} from "../index.js"
import type { Dialect } from "../dialect/types.js"
import { sqliteDialect } from "../dialect/sqlite.js"
import type { AggregateSpec, SearchQuery } from "../types.js"

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

const AGG_FNS = new Set(["count", "sum", "avg", "min", "max"])

export type SearchSqlExtras = {
  selectSql: string
  groupBySql: string
  orderBySql: string
  hasGroupBy: boolean
}

/** Validate orderBy / groupBy / aggregates against paging; throw CrudianError on reject. */
export function validateSearchExtras(
  query: SearchQuery,
  paging: "offset" | "cursor",
): void {
  const orderBy = query.orderBy
  if (orderBy !== undefined) {
    if (!Array.isArray(orderBy)) {
      throw new CrudianError("orderBy must be an array")
    }
    for (const clause of orderBy) {
      if (clause == null || typeof clause !== "object") {
        throw new CrudianError("orderBy clause must be an object")
      }
      if (typeof clause.column !== "string") {
        throw new CrudianError("orderBy.column must be a string")
      }
      if (
        clause.direction !== undefined &&
        clause.direction !== "asc" &&
        clause.direction !== "desc"
      ) {
        throw new CrudianError('orderBy.direction must be "asc" or "desc"')
      }
    }
  }

  const groupBy = query.groupBy
  if (groupBy !== undefined) {
    if (!Array.isArray(groupBy)) {
      throw new CrudianError("groupBy must be an array")
    }
    if (groupBy.length === 0) {
      throw new CrudianError("groupBy must not be empty")
    }
    for (const col of groupBy) {
      if (typeof col !== "string") {
        throw new CrudianError("groupBy column must be a string")
      }
    }
  }

  const aggregates = query.aggregates
  if (aggregates !== undefined) {
    if (!Array.isArray(aggregates)) {
      throw new CrudianError("aggregates must be an array")
    }
    if (!groupBy || groupBy.length === 0) {
      throw new CrudianError("aggregates require groupBy")
    }
    for (const agg of aggregates) {
      if (agg == null || typeof agg !== "object") {
        throw new CrudianError("aggregate must be an object")
      }
      if (typeof agg.fn !== "string" || !AGG_FNS.has(agg.fn)) {
        throw new CrudianError("aggregate.fn is invalid")
      }
      if (typeof agg.as !== "string" || agg.as.length === 0) {
        throw new CrudianError("aggregate.as must be a non-empty string")
      }
      if (agg.fn !== "count") {
        if (typeof agg.column !== "string" || agg.column.length === 0) {
          throw new CrudianError("aggregate.column is required")
        }
      } else if (agg.column !== undefined && typeof agg.column !== "string") {
        throw new CrudianError("aggregate.column must be a string")
      }
    }
  }

  const orderByNonEmpty = Array.isArray(orderBy) && orderBy.length > 0
  const groupByNonEmpty = Array.isArray(groupBy) && groupBy.length > 0
  if (paging === "cursor" && orderByNonEmpty) {
    throw new CrudianError("cursor paging does not accept orderBy")
  }
  if (paging === "cursor" && groupByNonEmpty) {
    throw new CrudianError("cursor paging does not accept groupBy")
  }
}

function aggregateSql(d: Dialect, agg: AggregateSpec): string {
  const alias = d.quoteIdent(agg.as)
  const fn = agg.fn.toUpperCase()
  if (agg.fn === "count" && (agg.column === undefined || agg.column === "")) {
    return `${fn}(*) AS ${alias}`
  }
  return `${fn}(${d.quoteIdent(agg.column!)}) AS ${alias}`
}

/** Build SELECT / GROUP BY / ORDER BY fragments for search. */
export function buildSearchSqlExtras(
  d: Dialect,
  query: SearchQuery,
  pk: string,
): SearchSqlExtras {
  const groupBy = query.groupBy
  const hasGroupBy = Array.isArray(groupBy) && groupBy.length > 0
  const aggregates = query.aggregates ?? []

  let selectSql: string
  let groupBySql = ""
  if (hasGroupBy) {
    const cols =
      query.columns && query.columns.length > 0 ? query.columns : groupBy!
    const parts = cols.map((c) => d.quoteIdent(c))
    for (const agg of aggregates) {
      parts.push(aggregateSql(d, agg))
    }
    selectSql = parts.join(", ")
    groupBySql =
      " GROUP BY " + groupBy!.map((c) => d.quoteIdent(c)).join(", ")
  } else {
    selectSql = !query.columns || query.columns.length === 0
      ? "*"
      : query.columns.map((c) => d.quoteIdent(c)).join(", ")
  }

  const orderBy = query.orderBy
  let orderBySql: string
  if (Array.isArray(orderBy) && orderBy.length > 0) {
    orderBySql =
      " ORDER BY " +
      orderBy
        .map((c) => {
          const dir = (c.direction ?? "asc").toUpperCase()
          return `${d.quoteIdent(c.column)} ${dir}`
        })
        .join(", ")
  } else if (hasGroupBy) {
    orderBySql = ` ORDER BY ${d.quoteIdent(groupBy![0]!)} ASC`
  } else {
    orderBySql = ` ORDER BY ${d.quoteIdent(pk)} ASC`
  }

  return { selectSql, groupBySql, orderBySql, hasGroupBy }
}
