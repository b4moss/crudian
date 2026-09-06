import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { CrudianError, where } from "../index.js"
import { createCrud } from "./index.js"

const ID_SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER,
    note TEXT
  );
`

const ITEM_ID_SCHEMA = `
  CREATE TABLE IF NOT EXISTS items_pk (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER,
    note TEXT
  );
`

let tempDir = ""
let client: PrismaClient

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "crudian-prisma-pk-"))
  const dbPath = join(tempDir, "test.db")
  process.env.DATABASE_URL = `file:${dbPath}`
  client = new PrismaClient()
  await client.$executeRawUnsafe(ID_SCHEMA)
  await client.$executeRawUnsafe(ITEM_ID_SCHEMA)
})

after(async () => {
  await client.$disconnect()
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
})

describe("prisma.createCrudPk", () => {
  test("正常系: カスタム PK で create / search paging / upsert / duplicate", async () => {
    await client.$executeRawUnsafe("DELETE FROM items_pk")
    const crud = createCrud(client, { pk: "item_id" })
    const created = await crud.create("items_pk", { name: "a", score: 1 })
    assert.equal(typeof created.item_id, "number")

    await crud.create("items_pk", { name: "b", score: 1 })
    await crud.create("items_pk", { name: "c", score: 1 })
    const page = await crud.search("items_pk", { paging: "cursor", limit: 2 })
    assert.equal(page.hasMore, true)
    assert.ok("nextCursor" in page)
    assert.equal(page.nextCursor, 2)

    const upserted = await crud.upsert("items_pk", {
      item_id: 10,
      name: "x",
      score: 9,
    })
    assert.equal(upserted.item_id, 10)

    const dup = await crud.duplicate("items_pk", {
      where: where().eq("item_id", created.item_id),
      overrides: { name: "dup" },
    })
    assert.ok(dup)
    assert.notEqual(dup!.item_id, created.item_id)
    assert.equal(dup!.name, "dup")
  })

  test("正常系: 省略時は id デフォルト", async () => {
    await client.$executeRawUnsafe("DELETE FROM items")
    const crud = createCrud(client)
    const row = await crud.create("items", { name: "a", score: 1 })
    assert.equal(row.id, 1)
  })

  test("異常系: 空 pk・列不存在・upsert PK 欠落", async () => {
    assert.throws(() => createCrud(client, { pk: "" }), CrudianError)

    const missing = createCrud(client, { pk: "item_id" })
    await assert.rejects(
      () => missing.create("items", { name: "a" }),
      CrudianError,
    )

    const crud = createCrud(client, { pk: "item_id" })
    await assert.rejects(
      () => crud.upsert("items_pk", { name: "a" }),
      CrudianError,
    )
  })
})
