/**
 * TypeORM adapter for @b4moss/crudian.
 * Import via: `import { createCrud } from "@b4moss/crudian/typeorm"`
 */
export {
  createCrud,
  type TypeormCrud,
  type TypeormLikeDataSource,
  type TypeormLikeQuerier,
} from "./crud.js"
export type {
  Row,
  SearchResult,
  WhereInput,
  ReadQuery,
  SearchQuery,
  CountQuery,
  DeleteQuery,
  UpdateQuery,
  DuplicateQuery,
} from "../types.js"
export {
  CrudianError,
  where,
  WhereBuilder,
  type Op,
  type CondNode,
  type GroupNode,
  type WhereNode,
} from "../index.js"
