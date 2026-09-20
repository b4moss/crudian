import { registerPrismaServerDialectTests } from "./server-dialect-harness.js"

// Requires DATABASE_URL_MYSQL (set by test:prisma:mysql script or CI).
// @ts-expect-error generated client output
import { PrismaClient } from "../../node_modules/.prisma-mysql-client/index.js"

registerPrismaServerDialectTests({
  dialect: "mysql",
  envKey: "DATABASE_URL_MYSQL",
  createClient: () => new PrismaClient(),
  createItemsDDL: `
    CREATE TABLE IF NOT EXISTS items (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      score INT NULL,
      note TEXT NULL
    ) ENGINE=InnoDB
  `,
  dropItemsDDL: `DROP TABLE IF EXISTS items`,
  createAltPkDDL: `
    CREATE TABLE IF NOT EXISTS alt_items (
      item_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB
  `,
  dropAltPkDDL: `DROP TABLE IF EXISTS alt_items`,
})
