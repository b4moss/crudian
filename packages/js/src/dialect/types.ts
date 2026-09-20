import { assertString } from "../index.js"

/** Supported SQL dialect names. */
export type DialectName = "sqlite" | "postgres" | "mysql"

/** Result of compiling a column-description query for PK checks. */
export type DescribeColumnsQuery = {
  sql: string
  args: unknown[]
}

/**
 * SQL dialect hooks for shared CRUD.
 * Pool / connection lifetime is intentionally not part of this interface.
 */
export type Dialect = {
  readonly name: DialectName
  quoteIdent(name: string): string
  /** 1-based placeholder index into the statement args. */
  placeholder(i: number): string
  /** When true, async create prefers `INSERT … RETURNING *`. */
  readonly supportsInsertReturning: boolean
  /** Query returning a single column `id` for fetch-after-insert. */
  lastInsertIdSql(): string
  /** List column names (`name` field) for a table. */
  describeColumns(table: string): DescribeColumnsQuery
}

export function assertIdent(name: string): string {
  assertString(name, "identifier")
  return name
}
