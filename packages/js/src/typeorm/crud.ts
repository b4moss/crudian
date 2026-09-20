import {
  CrudianError,
  type CreateCrudDialect,
  type CreateCrudOptions,
} from "../index.js"
import { resolveDialect } from "../dialect/index.js"
import {
  createAsyncCrud,
  type AsyncSqliteCrud,
} from "../sqlite/async-crud.js"
import type { Row } from "../types.js"

/** Minimal EntityManager / QueryRunner query surface used by the adapter. */
export type TypeormLikeQuerier = {
  query(query: string, parameters?: unknown[]): Promise<unknown>
}

/**
 * Minimal DataSource surface used by the adapter.
 * Callers own `initialize` / entities / pool configuration.
 */
export type TypeormLikeDataSource = TypeormLikeQuerier & {
  options: { type?: string }
  transaction<T>(
    runInTransaction: (entityManager: TypeormLikeQuerier) => Promise<T>,
  ): Promise<T>
}

export type TypeormCrud = AsyncSqliteCrud<TypeormLikeDataSource>

function normalizeRow(row: Row): Row {
  const out: Row = { ...row }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "bigint") out[k] = Number(v)
  }
  return out
}

function normalizeQueryResult(result: unknown): Row[] {
  if (result == null) return []
  if (Array.isArray(result)) {
    return result.filter(isPlainRow)
  }
  if (isPlainRow(result)) return [result]
  return []
}

function isPlainRow(value: unknown): value is Row {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function mapDataSourceType(type: string | undefined): CreateCrudDialect {
  switch (type) {
    case "postgres":
    case "aurora-postgres":
      return "postgres"
    case "mysql":
    case "mariadb":
    case "aurora-mysql":
      return "mysql"
    case "sqlite":
    case "better-sqlite3":
    case "capacitor":
    case "cordova":
    case "react-native":
    case "expo":
    case "sqljs":
    case undefined:
      return "sqlite"
    default:
      throw new CrudianError(`unsupported DataSource type: ${String(type)}`)
  }
}

/**
 * Create a Crud bound to a TypeORM DataSource.
 * Methods are async. The injected DataSource is exposed as `crud.db`.
 * Dialect defaults from `dataSource.options.type`; override with `options.dialect`.
 */
export function createCrud(
  dataSource: TypeormLikeDataSource,
  options?: CreateCrudOptions,
): TypeormCrud {
  if (dataSource == null) {
    throw new CrudianError("db is required")
  }
  if (
    typeof dataSource !== "object" ||
    typeof dataSource.query !== "function" ||
    typeof dataSource.transaction !== "function" ||
    dataSource.options == null ||
    typeof dataSource.options !== "object"
  ) {
    throw new CrudianError("db must be a TypeORM DataSource")
  }

  let active: TypeormLikeQuerier = dataSource
  const dialectName = options?.dialect ?? mapDataSourceType(dataSource.options.type)
  const dialect = resolveDialect(dialectName)

  return createAsyncCrud(
    dataSource,
    {
      async run(sql, args = []) {
        if (dialect.name === "postgres") {
          const trimmed = sql.trim()
          if (/^(UPDATE|DELETE)\b/i.test(trimmed)) {
            const wrapped =
              `WITH _crudian_write AS (${trimmed} RETURNING 1) ` +
              `SELECT COUNT(*)::int AS changes FROM _crudian_write`
            const rows = normalizeQueryResult(await active.query(wrapped, args))
            return { changes: Number(rows[0]?.changes ?? 0) }
          }
        }
        const result = await active.query(sql, args)
        return { changes: await resolveChanges(active, dialect.name, result) }
      },
      async get(sql, args = []) {
        const rows = normalizeQueryResult(await active.query(sql, args))
        const row = rows[0]
        return row == null ? undefined : normalizeRow(row)
      },
      async all(sql, args = []) {
        return normalizeQueryResult(await active.query(sql, args)).map(normalizeRow)
      },
      async transaction<T>(fn: () => Promise<T>): Promise<T> {
        return dataSource.transaction(async (manager) => {
          const prev = active
          active = manager
          try {
            return await fn()
          } finally {
            active = prev
          }
        })
      },
    },
    dialect,
    options,
  )
}

async function resolveChanges(
  querier: TypeormLikeQuerier,
  dialectName: CreateCrudDialect,
  result: unknown,
): Promise<number> {
  if (dialectName === "sqlite") {
    // better-sqlite3 via TypeORM returns lastInsertRowid for writes, not changes.
    const rows = normalizeQueryResult(await querier.query("SELECT changes() AS changes"))
    return Number(rows[0]?.changes ?? 0)
  }

  if (dialectName === "mysql") {
    const header = mysqlResultHeader(result)
    if (header != null) return Number(header.affectedRows ?? 0)
  }

  if (result != null && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>
    if ("affected" in obj) return Number(obj.affected ?? 0)
    if ("affectedRows" in obj) return Number(obj.affectedRows ?? 0)
    if ("rowCount" in obj) return Number(obj.rowCount ?? 0)
  }

  // Postgres (and similar): TypeORM often returns [] and drops rowCount.
  if (dialectName === "postgres" && typeof result === "number") {
    return result
  }

  return 0
}

function mysqlResultHeader(
  result: unknown,
): { affectedRows?: unknown } | null {
  if (result == null) return null
  if (Array.isArray(result)) {
    const first = result[0]
    if (first != null && typeof first === "object" && "affectedRows" in first) {
      return first as { affectedRows?: unknown }
    }
    return null
  }
  if (typeof result === "object" && "affectedRows" in result) {
    return result as { affectedRows?: unknown }
  }
  return null
}
