import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { CrudianError, where } from "../index.js"
import { createCrud } from "./index.js"

const SCHEMA = `
  CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER,
    note TEXT
  );
`

type Sqlite = InstanceType<typeof Database>

const dbs: Sqlite[] = []

function openDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec(SCHEMA)
  dbs.push(sqlite)
  return drizzle(sqlite)
}

function crudFixture() {
  return createCrud(openDb())
}

afterEach(() => {
  while (dbs.length > 0) {
    dbs.pop()?.close()
  }
})

describe("drizzle.createCrud", () => {
  test("正常系: 注入クライアントと同一参照", () => {
    const db = openDb()
    const crud = createCrud(db)
    assert.equal(crud.db, db)
  })

  test("正常系: メソッド一式を持つ", () => {
    const crud = crudFixture()
    for (const name of [
      "create",
      "read",
      "update",
      "delete",
      "upsert",
      "duplicate",
      "bulkCreate",
      "bulkUpdate",
      "bulkDelete",
      "bulkUpsert",
      "search",
      "list",
      "count",
      "transaction",
    ] as const) {
      assert.equal(typeof crud[name], "function")
    }
  })

  test("異常系: null / undefined / 想定外型は拒否", () => {
    assert.throws(() => createCrud(null as never), CrudianError)
    assert.throws(() => createCrud(undefined as never), CrudianError)
    assert.throws(() => createCrud("not-db" as never), CrudianError)
  })
})

describe("drizzle.transaction", () => {
  test("正常系: コミットと戻り値", () => {
    const crud = crudFixture()
    const result = crud.transaction(() => {
      crud.create("items", { name: "a", score: 1 })
      crud.create("items", { name: "b", score: 2 })
      return "ok"
    })
    assert.equal(result, "ok")
    assert.equal(crud.search("items").items.length, 2)
  })

  test("異常系: throw でロールバック", () => {
    const crud = crudFixture()
    assert.throws(
      () =>
        crud.transaction(() => {
          crud.create("items", { name: "a", score: 1 })
          throw new Error("boom")
        }),
      /boom/,
    )
    assert.equal(crud.search("items").items.length, 0)
  })

  test("異常系: 非関数は拒否", () => {
    const crud = crudFixture()
    assert.throws(() => crud.transaction("nope" as never), CrudianError)
  })
})

describe("drizzle.coreCrud", () => {
  test("正常系: create / read / update / delete", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "alpha", score: 10, note: "n" })
    assert.equal(created.id, 1)
    assert.deepEqual(
      crud.read("items", { columns: ["id", "name"], where: where().eq("id", 1) }),
      { id: 1, name: "alpha" },
    )
    const updated = crud.update("items", { score: 9 }, { where: where().eq("id", 1) })
    assert.equal(updated?.score, 9)
    assert.equal(updated?.note, "n")
    assert.equal(crud.delete("items", { where: where().eq("id", 1) }), 1)
  })

  test("異常系: 未ヒット・0件・検証", () => {
    const crud = crudFixture()
    assert.equal(crud.read("items", { where: where().eq("id", 999) }), null)
    assert.equal(
      crud.update("items", { score: 1 }, { where: where().eq("id", 999) }),
      null,
    )
    assert.equal(crud.delete("items", { where: where().eq("id", 999) }), 0)
    assert.throws(() => crud.create(1 as never, { name: "a" }), CrudianError)
    assert.throws(() => crud.create("items", { score: 1 }))
  })
})

describe("drizzle.count", () => {
  test("正常系: 空表 / 全件 / where", () => {
    const crud = crudFixture()
    assert.equal(crud.count("items"), 0)
    crud.create("items", { name: "a", score: 1 })
    crud.create("items", { name: "b", score: 2 })
    assert.equal(crud.count("items"), 2)
    assert.equal(crud.count("items", { where: where().eq("name", "a") }), 1)
  })

  test("異常系: テーブル名 / in 空", () => {
    const crud = crudFixture()
    assert.throws(() => crud.count(1 as never), CrudianError)
    assert.throws(
      () => crud.count("items", { where: where().in("name", []) }),
      CrudianError,
    )
  })
})

describe("drizzle.searchList", () => {
  test("正常系: ページングと list 別名", () => {
    const crud = crudFixture()
    for (let i = 0; i < 5; i++) crud.create("items", { name: `n${i}`, score: i })
    const page1 = crud.search("items", { limit: 2 })
    assert.equal(page1.items.length, 2)
    assert.equal(page1.hasMore, true)
    assert.equal(page1.nextCursor, 2)
    assert.equal(page1.total, 5)
    const page2 = crud.search("items", { limit: 2, cursor: page1.nextCursor })
    assert.deepEqual(
      page2.items.map((i) => i.id),
      [3, 4],
    )
    assert.equal(page2.total, 5)
    const q = { limit: 10, where: where().eq("name", "n0") }
    assert.deepEqual(crud.list("items", q), crud.search("items", q))
  })

  test("正常系: where 演算子", () => {
    const crud = crudFixture()
    crud.create("items", { name: "alice", score: 10, note: null })
    crud.create("items", { name: "bob", score: 20, note: "x" })
    crud.create("items", { name: "carol", score: 30, note: "y" })
    assert.equal(
      crud.search("items", { where: where().in("name", ["alice", "bob"]) }).items
        .length,
      2,
    )
    assert.equal(
      crud.search("items", { where: where().like("name", "a%") }).items[0]?.name,
      "alice",
    )
    assert.equal(crud.search("items", { where: where().isNull("note") }).items.length, 1)
  })

  test("異常系: limit / in 空", () => {
    const crud = crudFixture()
    assert.throws(() => crud.search("items", { limit: 0 }), CrudianError)
    assert.throws(
      () => crud.search("items", { where: where().in("name", []) }),
      CrudianError,
    )
  })
})

describe("drizzle.extendedWrites", () => {
  test("正常系: upsert / duplicate / bulk*", () => {
    const crud = crudFixture()
    const inserted = crud.upsert("items", { id: 10, name: "new", score: 1 })
    assert.equal(inserted.id, 10)
    crud.upsert("items", { id: 10, name: "upd", score: 9 })
    assert.equal(crud.read("items", { where: where().eq("id", 10) })?.name, "upd")

    const source = crud.create("items", { name: "a", score: 1, note: "n" })
    const copy = crud.duplicate("items", {
      where: where().eq("id", source.id),
      overrides: { name: "b" },
    })
    assert.notEqual(copy?.id, source.id)
    assert.equal(copy?.name, "b")
    assert.equal(crud.duplicate("items", { where: where().eq("id", 999) }), null)

    assert.equal(
      crud.bulkCreate("items", [
        { name: "x", score: 1 },
        { name: "y", score: 2 },
      ]),
      2,
    )
    assert.equal(crud.bulkCreate("items", []), 0)
    assert.equal(
      crud.bulkUpdate("items", { score: 8 }, { where: where().eq("name", "x") }),
      1,
    )
    assert.equal(crud.bulkDelete("items", { where: where().eq("name", "y") }), 1)
    assert.equal(
      crud.bulkUpsert("items", [
        { id: 100, name: "z", score: 1 },
        { id: 10, name: "z2", score: 2 },
      ]),
      2,
    )
  })

  test("異常系: id / where 欠落", () => {
    const crud = crudFixture()
    assert.throws(() => crud.upsert("items", { name: "a" }), CrudianError)
    assert.throws(() => crud.duplicate("items", {} as never), CrudianError)
    assert.throws(() => crud.bulkUpsert("items", [{ name: "a" }]), CrudianError)
    assert.throws(
      () => crud.bulkUpdate("items", { score: 1 }, {} as never),
      CrudianError,
    )
  })
})

describe("drizzle.adapterExports", () => {
  test("正常系: createCrud を export する", async () => {
    const mod = await import("./index.js")
    assert.equal(typeof mod.createCrud, "function")
  })
})
