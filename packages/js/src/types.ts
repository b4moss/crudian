import type { WhereBuilder, WhereNode } from "./where.js"

export type Row = Record<string, unknown>

export type SearchResult<T = Row> = {
  items: T[]
  nextCursor: number | string | null
  hasMore: boolean
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

export type DeleteQuery = {
  where: WhereInput
}

export type UpdateQuery = {
  where: WhereInput
}
