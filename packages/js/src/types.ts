import type { WhereBuilder, WhereNode } from "./where.js"

export type Row = Record<string, unknown>

export type SearchResult<T = Row> = {
  items: T[]
  nextCursor: number | string | null
  hasMore: boolean
  /** Rows matching `where` (ignores limit/cursor). */
  total: number
}

export type WhereInput = WhereBuilder | WhereNode

export type ReadQuery = {
  columns?: string[]
  where?: WhereInput
}

export type SearchQuery = {
  columns?: string[]
  where?: WhereInput
  limit?: number
  /** Raw `id` cursor (keyset). */
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
