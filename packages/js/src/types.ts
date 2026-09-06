import type { WhereBuilder, WhereNode } from "./where.js"

export type Row = Record<string, unknown>

export type OffsetSearchResult<T = Row> = {
  items: T[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

export type CursorSearchResult<T = Row> = {
  items: T[]
  nextCursor: number | string | null
  hasMore: boolean
  /** Rows matching `where` (ignores limit/cursor). */
  total: number
}

export type SearchResult<T = Row> = OffsetSearchResult<T> | CursorSearchResult<T>

export type WhereInput = WhereBuilder | WhereNode

export type ReadQuery = {
  columns?: string[]
  where?: WhereInput
}

export type SearchQuery = {
  columns?: string[]
  where?: WhereInput
  limit?: number
  /** Pagination mode. Default: `"offset"`. */
  paging?: "offset" | "cursor"
  /** Offset for `paging: "offset"` (default `0`). */
  offset?: number
  /** Raw PK cursor (keyset; default column `id`) for `paging: "cursor"`. */
  cursor?: number | string | null
}

export type CountQuery = {
  where?: WhereInput
}

export type DeleteQuery = {
  where: WhereInput
}

export type UpdateQuery = {
  where: WhereInput
}

export type DuplicateQuery = {
  where: WhereInput
  overrides?: Record<string, unknown>
}

/** Options for `createCrud(db, options?)`. */
export type CreateCrudOptions = {
  /** Primary key column name. Default: `"id"`. */
  pk?: string
}
