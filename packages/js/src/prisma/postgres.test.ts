import { registerPrismaServerDialectTests } from "./server-dialect-harness.js"

// Requires DATABASE_URL_POSTGRES (set by test:prisma:postgres script or CI).
// @ts-expect-error generated client output
import { PrismaClient } from "../../node_modules/.prisma-postgres-client/index.js"

registerPrismaServerDialectTests({
  dialect: "postgres",
  envKey: "DATABASE_URL_POSTGRES",
  createClient: () => new PrismaClient(),
  createItemsDDL: `
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      score INTEGER,
      note TEXT
    )
  `,
  dropItemsDDL: `DROP TABLE IF EXISTS items`,
  createAltPkDDL: `
    CREATE TABLE IF NOT EXISTS alt_items (
      item_id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )
  `,
  dropAltPkDDL: `DROP TABLE IF EXISTS alt_items`,
})
