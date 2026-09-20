/**
 * Optional pool / lifetime hints for documentation and future driver adapters.
 * Prisma owns pooling via datasource / engine settings — callers configure that
 * on the PrismaClient they inject. crudian does not open connections.
 *
 * Not part of the Dialect interface (#105 / #73).
 */
export type PoolOptions = {
  /** Max open connections (driver-dependent). */
  maxOpenConns?: number
  /** Max idle connections. */
  maxIdleConns?: number
  /** Max connection lifetime in milliseconds. */
  connMaxLifetimeMs?: number
  /** Max idle time in milliseconds. */
  connMaxIdleTimeMs?: number
}
