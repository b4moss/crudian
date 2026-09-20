/**
 * Shared contracts and types for @b4moss/crudian.
 * Adapter implementations live under subpath exports:
 * - @b4moss/crudian/bun-sqlite
 * - @b4moss/crudian/drizzle
 * - @b4moss/crudian/prisma
 * - @b4moss/crudian/libsql
 * - @b4moss/crudian/typeorm
 */

export { CrudianError, assertString } from "./errors.js"
export {
  WhereBuilder,
  where,
  isWhereBuilder,
  type Op,
  type CondNode,
  type GroupNode,
  type WhereNode,
} from "./where.js"
export type {
  Row,
  OffsetSearchResult,
  CursorSearchResult,
  SearchResult,
  WhereInput,
  ReadQuery,
  SearchQuery,
  CountQuery,
  DeleteQuery,
  UpdateQuery,
  DuplicateQuery,
  CreateCrudOptions,
  CreateCrudDialect,
} from "./types.js"
export type { PoolOptions } from "./pool.js"
