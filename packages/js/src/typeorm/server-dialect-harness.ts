/**
 * Shared contract suite for TypeORM against Postgres / MySQL.
 * Skipped automatically when the DATABASE_URL_* env var is unset.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { DataSource } from "typeorm"
import { CrudianError, where } from "../index.js"
import { createCrud } from "./index.js"

export type DialectName = "postgres" | "mysql"

export type TypeormServerDbHarness = {
  dialect: DialectName
  envKey: "DATABASE_URL_POSTGRES" | "DATABASE_URL_MYSQL"
  createDataSource: (url: string) => DataSource
  createItemsDDL: string
  dropItemsDDL: string
  createAltPkDDL: string
  dropAltPkDDL: string
}

export function registerTypeormServerDialectTests(h: TypeormServerDbHarness) {
  const url = process.env[h.envKey]
  const suite = describe

  suite(`typeorm.${h.dialect}`, { skip: !url }, () => {
    let dataSource: DataSource
    let crud: ReturnType<typeof createCrud>

    before(async () => {
      if (!url) return
      dataSource = h.createDataSource(url)
      await dataSource.initialize()
      await dataSource.query(h.dropItemsDDL)
      await dataSource.query(h.createItemsDDL)
      crud = createCrud(dataSource, { dialect: h.dialect })
    })

    after(async () => {
      if (!url || !dataSource?.isInitialized) return
      try {
        await dataSource.query(h.dropItemsDDL)
        await dataSource.query(h.dropAltPkDDL)
      } catch {
        /* ignore */
      }
      await dataSource.destroy()
    })

    async function reset() {
      await dataSource.query(h.dropItemsDDL)
      await dataSource.query(h.createItemsDDL)
    }

    test("正常系: create / read / update / delete", async () => {
      await reset()
      const created = await crud.create("items", { name: "alice", score: 10 })
      assert.equal(created.name, "alice")
      assert.ok(created.id != null)

      const got = await crud.read("items", {
        where: where().eq("id", created.id),
      })
      assert.equal(got?.name, "alice")

      const updated = await crud.update(
        "items",
        { score: 20 },
        { where: where().eq("id", created.id) },
      )
      assert.equal(updated?.score, 20)

      const n = await crud.delete("items", {
        where: where().eq("id", created.id),
      })
      assert.equal(n, 1)
      assert.equal(
        await crud.read("items", { where: where().eq("id", created.id) }),
        null,
      )
    })

    test("正常系: count / exists / search offset / cursor", async () => {
      await reset()
      await crud.bulkCreate("items", [
        { name: "a", score: 1 },
        { name: "b", score: 2 },
        { name: "c", score: 3 },
      ])
      assert.equal(await crud.count("items"), 3)
      assert.equal(await crud.exists("items", { where: where().eq("name", "b") }), true)
      assert.equal(await crud.exists("items", { where: where().eq("name", "z") }), false)

      const page = await crud.search("items", { limit: 2, offset: 0 })
      assert.equal(page.items.length, 2)
      assert.equal("total" in page && page.total, 3)
      assert.equal("hasMore" in page && page.hasMore, true)

      const cursorPage = await crud.search("items", {
        paging: "cursor",
        limit: 2,
      })
      assert.equal(cursorPage.items.length, 2)
      assert.ok("nextCursor" in cursorPage)
    })

    test("正常系: upsert / duplicate / transaction", async () => {
      await reset()
      const a = await crud.create("items", { name: "x", score: 1 })
      const up = await crud.upsert("items", {
        id: a.id,
        name: "x",
        score: 9,
      })
      assert.equal(up.score, 9)

      const dup = await crud.duplicate("items", {
        where: where().eq("id", a.id),
        overrides: { name: "y" },
      })
      assert.ok(dup)
      assert.notEqual(dup.id, a.id)
      assert.equal(dup.name, "y")

      await crud.transaction(async () => {
        await crud.create("items", { name: "tx", score: 1 })
      })
      assert.equal(await crud.exists("items", { where: where().eq("name", "tx") }), true)
    })

    test("正常系: 可変 PK", async () => {
      await reset()
      await dataSource.query(h.dropAltPkDDL)
      await dataSource.query(h.createAltPkDDL)
      const alt = createCrud(dataSource, { dialect: h.dialect, pk: "item_id" })
      const row = await alt.create("alt_items", { name: "pk" })
      assert.ok(row.item_id != null)
      const got = await alt.read("alt_items", {
        where: where().eq("item_id", row.item_id),
      })
      assert.equal(got?.name, "pk")
      await dataSource.query(h.dropAltPkDDL)
    })

    test("異常系: 空 in / 不正 dialect は拒否", async () => {
      await reset()
      await assert.rejects(
        () =>
          crud.search("items", {
            where: where().in("id", []),
          }),
        CrudianError,
      )
      assert.throws(
        () => createCrud(dataSource, { dialect: "nope" as never }),
        CrudianError,
      )
    })
  })
}
