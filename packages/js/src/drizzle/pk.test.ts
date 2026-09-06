import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { CrudianError, where } from "../index.js"
import { createCrud } from "./index.js"

const ID_SCHEMA = `
  CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER,
    note TEXT
  );
`

const ITEM_ID_SCHEMA = `
  CREATE TABLE items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER,
    note TEXT
  );
`

type Sqlite = InstanceType<typeof Database>
const dbs: Sqlite[] = []

function openDb(schema: string) {
  const sqlite = new Database(":memory:")
  sqlite.exec(schema)
  dbs.push(sqlite)
  return drizzle(sqlite)
}

afterEach(() => {
  while (dbs.length > 0) {
    dbs.pop()?.close()
  }
})

describe("drizzle.createCrudPk", () => {
  test("正常系: pk: item_id で create / search(cursor) / upsert / duplicate", () => {
    const crud = createCrud(openDb(ITEM_ID_SCHEMA), { pk: "item_id" })
    const created = crud.create("items", { name: "a", score: 1 })
    assert.equal(typeof created.item_id, "number")
    assert.ok((created.item_id as number) > 0)

    for (const name of ["b", "c", "d"]) {
      crud.create("items", { name, score: 1 })
    }
    const page1 = crud.search("items", { paging: "cursor", limit: 2 })
    assert.equal(page1.hasMore, true)
    assert.equal("nextCursor" in page1 && page1.nextCursor, 2)

    const upserted = crud.upsert("items", {
      item_id: 10,
      name: "x",
      score: 9,
    })
    assert.equal(upserted.item_id, 10)

    const dup = crud.duplicate("items", {
      where: where().eq("item_id", created.item_id),
      overrides: { name: "dup" },
    })
    assert.ok(dup)
    assert.notEqual(dup!.item_id, created.item_id)
    assert.equal(dup!.name, "dup")
  })

  test("正常系: 第2引数省略は id デフォルト", () => {
    const crud = createCrud(openDb(ID_SCHEMA))
    const row = crud.create("items", { name: "a", score: 1 })
    assert.equal(row.id, 1)
  })

  test("異常系: 空 pk・列不存在・upsert PK 欠落", () => {
    assert.throws(() => createCrud(openDb(ID_SCHEMA), { pk: "" }), CrudianError)

    const missing = createCrud(openDb(ID_SCHEMA), { pk: "item_id" })
    assert.throws(() => missing.create("items", { name: "a" }), CrudianError)

    const crud = createCrud(openDb(ITEM_ID_SCHEMA), { pk: "item_id" })
    assert.throws(() => crud.upsert("items", { name: "a" }), CrudianError)
  })
})
