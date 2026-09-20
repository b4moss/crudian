import "reflect-metadata"
import { DataSource } from "typeorm"
import { registerTypeormServerDialectTests } from "./server-dialect-harness.js"

// Requires DATABASE_URL_MYSQL (set by test:typeorm:mysql script or CI).
registerTypeormServerDialectTests({
  dialect: "mysql",
  envKey: "DATABASE_URL_MYSQL",
  createDataSource: (url) => {
    const parsed = new URL(url)
    return new DataSource({
      type: "mysql",
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
    })
  },
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
