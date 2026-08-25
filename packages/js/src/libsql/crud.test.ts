import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, afterEach, before, describe, test } from "node:test"
import { createClient, type Client } from "@libsql/client"
import { CrudianError, where } from "../index.js"
import { createCrud } from "./index.js"

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER,
    note TEXT
  );
`

let tempDir = ""
let client: Client

async function resetTable(c: Client) {
  await c.execute("DELETE FROM items")
  try {
    await c.execute("DELETE FROM sqlite_sequence WHERE name = 'items'")
  } catch {
    // sqlite_sequence may be absent until the first AUTOINCREMENT insert
  }
}

async function crudFixture() {
  await resetTable(client)
  return createCrud(client)
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "crudian-libsql-"))
  const dbPath = join(tempDir, "test.db")
  client = createClient({ url: `file:${dbPath}` })
  await client.execute(SCHEMA)
})

afterEach(async () => {
  await resetTable(client)
})

after(() => {
  client.close()
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
})

describe("libsql.createCrud", () => {
  test("正常系: 注入クライアントと同一参照", async () => {
    const crud = await crudFixture()
    assert.equal(crud.db, client)
  })

  test("正常系: メソッド一式を持つ", async () => {
    const crud = await crudFixture()
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

describe("libsql.transaction", () => {
  test("正常系: コミットと戻り値", async () => {
    const crud = await crudFixture()
    const result = await crud.transaction(async () => {
      await crud.create("items", { name: "a", score: 1 })
      await crud.create("items", { name: "b", score: 2 })
      return "ok"
    })
    assert.equal(result, "ok")
    assert.equal((await crud.search("items")).items.length, 2)
  })

  test("異常系: throw でロールバック", async () => {
    const crud = await crudFixture()
    await assert.rejects(
      () =>
        crud.transaction(async () => {
          await crud.create("items", { name: "a", score: 1 })
          throw new Error("boom")
        }),
      /boom/,
    )
    assert.equal((await crud.search("items")).items.length, 0)
  })

  test("異常系: 非関数は拒否", async () => {
    const crud = await crudFixture()
    await assert.rejects(() => crud.transaction("nope" as never), CrudianError)
  })
})

describe("libsql.coreCrud", () => {
  test("正常系: create / read / update / delete", async () => {
    const crud = await crudFixture()
    const created = await crud.create("items", { name: "alpha", score: 10, note: "n" })
    assert.equal(created.id, 1)
    assert.deepEqual(
      await crud.read("items", {
        columns: ["id", "name"],
        where: where().eq("id", 1),
      }),
      { id: 1, name: "alpha" },
    )
    const updated = await crud.update(
      "items",
      { score: 9 },
      { where: where().eq("id", 1) },
    )
    assert.equal(updated?.score, 9)
    assert.equal(updated?.note, "n")
    assert.equal(await crud.delete("items", { where: where().eq("id", 1) }), 1)
  })

  test("異常系: 未ヒット・0件・検証", async () => {
    const crud = await crudFixture()
    assert.equal(await crud.read("items", { where: where().eq("id", 999) }), null)
    assert.equal(
      await crud.update("items", { score: 1 }, { where: where().eq("id", 999) }),
      null,
    )
    assert.equal(await crud.delete("items", { where: where().eq("id", 999) }), 0)
    await assert.rejects(() => crud.create(1 as never, { name: "a" }), CrudianError)
    await assert.rejects(() => crud.create("items", { score: 1 }))
  })
})

describe("libsql.count", () => {
  test("正常系: 空表 / 全件 / where", async () => {
    const crud = await crudFixture()
    assert.equal(await crud.count("items"), 0)
    await crud.create("items", { name: "a", score: 1 })
    await crud.create("items", { name: "b", score: 2 })
    assert.equal(await crud.count("items"), 2)
    assert.equal(await crud.count("items", { where: where().eq("name", "a") }), 1)
  })

  test("異常系: テーブル名 / in 空", async () => {
    const crud = await crudFixture()
    await assert.rejects(() => crud.count(1 as never), CrudianError)
    await assert.rejects(
      () => crud.count("items", { where: where().in("name", []) }),
      CrudianError,
    )
  })
})

describe("libsql.searchList", () => {
  test("正常系: ページングと list 別名", async () => {
    const crud = await crudFixture()
    for (let i = 0; i < 5; i++) {
      await crud.create("items", { name: `n${i}`, score: i })
    }
    const page1 = await crud.search("items", { limit: 2 })
    assert.equal(page1.items.length, 2)
    assert.equal(page1.hasMore, true)
    assert.equal(page1.nextCursor, 2)
    assert.equal(page1.total, 5)
    const page2 = await crud.search("items", { limit: 2, cursor: page1.nextCursor })
    assert.deepEqual(
      page2.items.map((i) => i.id),
      [3, 4],
    )
    assert.equal(page2.total, 5)
    const q = { limit: 10, where: where().eq("name", "n0") }
    assert.deepEqual(await crud.list("items", q), await crud.search("items", q))
  })

  test("正常系: where 演算子", async () => {
    const crud = await crudFixture()
    await crud.create("items", { name: "alice", score: 10, note: null })
    await crud.create("items", { name: "bob", score: 20, note: "x" })
    await crud.create("items", { name: "carol", score: 30, note: "y" })
    assert.equal(
      (await crud.search("items", { where: where().in("name", ["alice", "bob"]) }))
        .items.length,
      2,
    )
    assert.equal(
      (await crud.search("items", { where: where().like("name", "a%") })).items[0]
        ?.name,
      "alice",
    )
    assert.equal(
      (await crud.search("items", { where: where().isNull("note") })).items.length,
      1,
    )
  })

  test("異常系: limit / in 空", async () => {
    const crud = await crudFixture()
    await assert.rejects(() => crud.search("items", { limit: 0 }), CrudianError)
    await assert.rejects(
      () => crud.search("items", { where: where().in("name", []) }),
      CrudianError,
    )
  })
})

describe("libsql.extendedWrites", () => {
  test("正常系: upsert / duplicate / bulk*", async () => {
    const crud = await crudFixture()
    const inserted = await crud.upsert("items", { id: 10, name: "new", score: 1 })
    assert.equal(inserted.id, 10)
    await crud.upsert("items", { id: 10, name: "upd", score: 9 })
    assert.equal(
      (await crud.read("items", { where: where().eq("id", 10) }))?.name,
      "upd",
    )

    const source = await crud.create("items", { name: "a", score: 1, note: "n" })
    const copy = await crud.duplicate("items", {
      where: where().eq("id", source.id),
      overrides: { name: "b" },
    })
    assert.notEqual(copy?.id, source.id)
    assert.equal(copy?.name, "b")
    assert.equal(
      await crud.duplicate("items", { where: where().eq("id", 999) }),
      null,
    )

    assert.equal(
      await crud.bulkCreate("items", [
        { name: "x", score: 1 },
        { name: "y", score: 2 },
      ]),
      2,
    )
    assert.equal(await crud.bulkCreate("items", []), 0)
    assert.equal(
      await crud.bulkUpdate("items", { score: 8 }, { where: where().eq("name", "x") }),
      1,
    )
    assert.equal(await crud.bulkDelete("items", { where: where().eq("name", "y") }), 1)
    assert.equal(
      await crud.bulkUpsert("items", [
        { id: 100, name: "z", score: 1 },
        { id: 10, name: "z2", score: 2 },
      ]),
      2,
    )
  })

  test("異常系: id / where 欠落", async () => {
    const crud = await crudFixture()
    await assert.rejects(() => crud.upsert("items", { name: "a" }), CrudianError)
    await assert.rejects(() => crud.duplicate("items", {} as never), CrudianError)
    await assert.rejects(() => crud.bulkUpsert("items", [{ name: "a" }]), CrudianError)
    await assert.rejects(
      () => crud.bulkUpdate("items", { score: 1 }, {} as never),
      CrudianError,
    )
  })
})

describe("libsql.adapterExports", () => {
  test("正常系: createCrud を export する", async () => {
    const mod = await import("./index.js")
    assert.equal(typeof mod.createCrud, "function")
  })
})
