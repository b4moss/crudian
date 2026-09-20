import "reflect-metadata"
import { DataSource } from "typeorm"
import { registerTypeormServerDialectTests } from "./server-dialect-harness.js"

// Requires DATABASE_URL_POSTGRES (set by test:typeorm:postgres script or CI).
registerTypeormServerDialectTests({
  dialect: "postgres",
  envKey: "DATABASE_URL_POSTGRES",
  createDataSource: (url) =>
    new DataSource({
      type: "postgres",
      url,
    }),
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
