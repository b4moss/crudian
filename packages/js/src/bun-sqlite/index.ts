/**
 * Bun `bun:sqlite` adapter for @b4moss/crudian.
 * Import via: `import { createCrud } from "@b4moss/crudian/bun-sqlite"`
 *
 * Node.js resolves `package.json` exports to `node-stub` instead of this file.
 */

export { createCrud, type BunSqliteCrud } from "./crud.js"
export {
  CrudianError,
  where,
  WhereBuilder,
  type Row,
  type SearchResult,
  type OffsetSearchResult,
  type CursorSearchResult,
  type PagingMode,
  type SearchQuery,
  type CountQuery,
  type ReadQuery,
} from "../index.js"
