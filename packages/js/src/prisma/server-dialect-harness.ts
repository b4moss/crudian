/**
 * Shared contract suite for Prisma against Postgres / MySQL.
 * Skipped automatically when the DATABASE_URL_* env var is unset.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { CrudianError, where } from "../index.js"
import { createCrud, type PrismaLikeClient } from "./index.js"

export type DialectName = "postgres" | "mysql"

export type ServerDbHarness = {
  dialect: DialectName
  envKey: "DATABASE_URL_POSTGRES" | "DATABASE_URL_MYSQL"
  createClient: () => PrismaLikeClient & { $disconnect(): Promise<void>; $executeRawUnsafe(q: string, ...a: unknown[]): Promise<number> }
  createItemsDDL: string
  dropItemsDDL: string
  createAltPkDDL: string
  dropAltPkDDL: string
}

export function registerPrismaServerDialectTests(h: ServerDbHarness) {
  const url = process.env[h.envKey]
  const suite = describe

  suite(`prisma.${h.dialect}`, { skip: !url }, () => {
    let client: ReturnType<typeof h.createClient>
    let crud: ReturnType<typeof createCrud>

    before(async () => {
      if (!url) return
      process.env[h.envKey] = url
      client = h.createClient()
      await client.$executeRawUnsafe(h.dropItemsDDL)
      await client.$executeRawUnsafe(h.createItemsDDL)
      crud = createCrud(client, { dialect: h.dialect })
    })

    after(async () => {
      if (!url) return
      try {
        await client.$executeRawUnsafe(h.dropItemsDDL)
        await client.$executeRawUnsafe(h.dropAltPkDDL)
      } catch {
        /* ignore */
      }
      await client.$disconnect()
    })

    async function reset() {
      await client.$executeRawUnsafe(h.dropItemsDDL)
      await client.$executeRawUnsafe(h.createItemsDDL)
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
      await client.$executeRawUnsafe(h.dropAltPkDDL)
      await client.$executeRawUnsafe(h.createAltPkDDL)
      const alt = createCrud(client, { dialect: h.dialect, pk: "item_id" })
      const row = await alt.create("alt_items", { name: "pk" })
      assert.ok(row.item_id != null)
      const got = await alt.read("alt_items", {
        where: where().eq("item_id", row.item_id),
      })
      assert.equal(got?.name, "pk")
      await client.$executeRawUnsafe(h.dropAltPkDDL)
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
        () => createCrud(client, { dialect: "nope" as never }),
        CrudianError,
      )
    })
  })
}
