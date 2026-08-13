import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { CrudianError, where } from "../index.js"
import { createCrud } from "./index.js"

function openMemory() {
  const db = new Database(":memory:")
  db.exec(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER,
      note TEXT
    );
  `)
  return db
}

const dbs: Database[] = []

function crudFixture() {
  const db = openMemory()
  dbs.push(db)
  return createCrud(db)
}

afterEach(() => {
  while (dbs.length > 0) {
    dbs.pop()?.close()
  }
})

describe("createCrud", () => {
  test("正常系: 注入した Database と同じ参照を公開する", () => {
    const db = openMemory()
    dbs.push(db)
    const crud = createCrud(db)
    expect(crud.db).toBe(db)
  })

  test("正常系: CRUD / search / list / transaction を持つ", () => {
    const crud = crudFixture()
    expect(typeof crud.create).toBe("function")
    expect(typeof crud.read).toBe("function")
    expect(typeof crud.update).toBe("function")
    expect(typeof crud.delete).toBe("function")
    expect(typeof crud.search).toBe("function")
    expect(typeof crud.list).toBe("function")
    expect(typeof crud.transaction).toBe("function")
  })

  test("正常系: :memory: で初期化できる", () => {
    expect(() => crudFixture()).not.toThrow()
  })

  test("異常系: db が null / undefined なら拒否", () => {
    expect(() => createCrud(null as never)).toThrow(CrudianError)
    expect(() => createCrud(undefined as never)).toThrow(CrudianError)
  })

  test("異常系: db が Database 以外なら拒否", () => {
    expect(() => createCrud("not-db" as never)).toThrow(CrudianError)
  })
})

describe("transaction", () => {
  test("正常系: 複数 create をコミットし戻り値を返す", () => {
    const crud = crudFixture()
    const result = crud.transaction(() => {
      crud.create("items", { name: "a", score: 1 })
      crud.create("items", { name: "b", score: 2 })
      return "ok"
    })
    expect(result).toBe("ok")
    expect(crud.search("items").items).toHaveLength(2)
  })

  test("正常系: 一連の書き込みが見える", () => {
    const crud = crudFixture()
    crud.transaction(() => {
      crud.create("items", { name: "a", score: 1 })
      const row = crud.read("items", { where: where().eq("name", "a") })
      expect(row?.name).toBe("a")
    })
  })

  test("異常系: throw 時はロールバックされる", () => {
    const crud = crudFixture()
    expect(() =>
      crud.transaction(() => {
        crud.create("items", { name: "a", score: 1 })
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(crud.search("items").items).toHaveLength(0)
  })

  test("異常系: TX 外の create は他失敗と独立して残る", () => {
    const crud = crudFixture()
    crud.create("items", { name: "kept", score: 1 })
    expect(() =>
      crud.transaction(() => {
        crud.create("items", { name: "temp", score: 2 })
        throw new Error("fail")
      }),
    ).toThrow("fail")
    const items = crud.search("items").items
    expect(items).toHaveLength(1)
    expect(items[0]?.name).toBe("kept")
  })

  test("異常系: 非関数コールバックは拒否", () => {
    const crud = crudFixture()
    expect(() => crud.transaction("nope" as never)).toThrow(CrudianError)
  })
})

describe("create", () => {
  test("正常系: 行が返り id が採番される", () => {
    const crud = crudFixture()
    const row = crud.create("items", { name: "alpha", score: 10 })
    expect(row.id).toBe(1)
    expect(row.name).toBe("alpha")
    expect(row.score).toBe(10)
  })

  test("正常系: read で同等の行が得られる", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "alpha", score: 10 })
    const read = crud.read("items", { where: where().eq("id", created.id) })
    expect(read).toEqual(created)
  })

  test("異常系: テーブル名が文字列でない", () => {
    const crud = crudFixture()
    expect(() => crud.create(1 as never, { name: "a" })).toThrow(CrudianError)
  })

  test("異常系: 存在しないテーブルは SQLite 例外", () => {
    const crud = crudFixture()
    expect(() => crud.create("missing", { name: "a" })).toThrow()
  })

  test("異常系: NOT NULL 違反は SQLite 例外", () => {
    const crud = crudFixture()
    expect(() => crud.create("items", { score: 1 })).toThrow()
  })
})

describe("read", () => {
  test("正常系: 存在する id で行が返る", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "a", score: 1 })
    expect(crud.read("items", { where: where().eq("id", created.id) })?.name).toBe("a")
  })

  test("正常系: columns を制限できる", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "a", score: 1, note: "n" })
    const row = crud.read("items", {
      columns: ["id", "name"],
      where: where().eq("id", created.id),
    })
    expect(row).toEqual({ id: created.id, name: "a" })
  })

  test("正常系: 複数マッチでも1行", () => {
    const crud = crudFixture()
    crud.create("items", { name: "a", score: 1 })
    crud.create("items", { name: "a", score: 2 })
    const row = crud.read("items", { where: where().eq("name", "a") })
    expect(row?.id).toBe(1)
  })

  test("異常系: 未ヒットは null", () => {
    const crud = crudFixture()
    expect(crud.read("items", { where: where().eq("id", 999) })).toBeNull()
  })

  test("異常系: テーブル名が文字列でない", () => {
    const crud = crudFixture()
    expect(() => crud.read(null as never)).toThrow(CrudianError)
  })
})

describe("update", () => {
  test("正常系: 更新後の行が返る", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "a", score: 1 })
    const updated = crud.update(
      "items",
      { score: 9 },
      { where: where().eq("id", created.id) },
    )
    expect(updated?.score).toBe(9)
    expect(updated?.name).toBe("a")
  })

  test("正常系: read でも同じ値", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "a", score: 1 })
    crud.update("items", { name: "b" }, { where: where().eq("id", created.id) })
    expect(crud.read("items", { where: where().eq("id", created.id) })?.name).toBe("b")
  })

  test("正常系: 未指定カラムは維持", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "a", score: 1, note: "keep" })
    const updated = crud.update(
      "items",
      { score: 2 },
      { where: where().eq("id", created.id) },
    )
    expect(updated?.note).toBe("keep")
  })

  test("異常系: 0件は null", () => {
    const crud = crudFixture()
    expect(
      crud.update("items", { score: 1 }, { where: where().eq("id", 999) }),
    ).toBeNull()
  })

  test("異常系: where 必須", () => {
    const crud = crudFixture()
    expect(() => crud.update("items", { score: 1 }, {} as never)).toThrow(CrudianError)
  })
})

describe("delete", () => {
  test("正常系: 1件削除で 1 を返し read は null", () => {
    const crud = crudFixture()
    const created = crud.create("items", { name: "a", score: 1 })
    expect(crud.delete("items", { where: where().eq("id", created.id) })).toBe(1)
    expect(crud.read("items", { where: where().eq("id", created.id) })).toBeNull()
  })

  test("正常系: 複数件削除の件数", () => {
    const crud = crudFixture()
    crud.create("items", { name: "a", score: 1 })
    crud.create("items", { name: "a", score: 2 })
    expect(crud.delete("items", { where: where().eq("name", "a") })).toBe(2)
  })

  test("正常系: 0件は 0", () => {
    const crud = crudFixture()
    expect(crud.delete("items", { where: where().eq("id", 999) })).toBe(0)
  })

  test("異常系: where 必須", () => {
    const crud = crudFixture()
    expect(() => crud.delete("items", {} as never)).toThrow(CrudianError)
  })

  test("異常系: テーブル名が文字列でない", () => {
    const crud = crudFixture()
    expect(() =>
      crud.delete(123 as never, { where: where().eq("id", 1) }),
    ).toThrow(CrudianError)
  })
})

describe("search / list", () => {
  test("正常系: id 昇順", () => {
    const crud = crudFixture()
    crud.create("items", { name: "b", score: 2 })
    crud.create("items", { name: "a", score: 1 })
    const { items } = crud.search("items")
    expect(items.map((i) => i.id)).toEqual([1, 2])
  })

  test("正常系: limit 未満は hasMore=false / nextCursor=null", () => {
    const crud = crudFixture()
    crud.create("items", { name: "a", score: 1 })
    const result = crud.search("items", { limit: 10 })
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  test("正常系: ページングで続きが取れる", () => {
    const crud = crudFixture()
    for (let i = 0; i < 5; i++) {
      crud.create("items", { name: `n${i}`, score: i })
    }
    const page1 = crud.search("items", { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    expect(page1.nextCursor).toBe(2)

    const page2 = crud.search("items", { limit: 2, cursor: page1.nextCursor })
    expect(page2.items.map((i) => i.id)).toEqual([3, 4])
    expect(page2.hasMore).toBe(true)

    const page3 = crud.search("items", { limit: 2, cursor: page2.nextCursor })
    expect(page3.items.map((i) => i.id)).toEqual([5])
    expect(page3.hasMore).toBe(false)
    expect(page3.nextCursor).toBeNull()
  })

  test("正常系: list は search と同結果", () => {
    const crud = crudFixture()
    crud.create("items", { name: "a", score: 1 })
    const q = { limit: 10, where: where().eq("name", "a") }
    expect(crud.list("items", q)).toEqual(crud.search("items", q))
  })

  test("異常系: limit 不正は拒否", () => {
    const crud = crudFixture()
    expect(() => crud.search("items", { limit: 0 })).toThrow(CrudianError)
    expect(() => crud.search("items", { limit: -1 })).toThrow(CrudianError)
  })
})

describe("whereBuilder", () => {
  test("正常系: eq / and / or / 比較 / in / like / null", () => {
    const crud = crudFixture()
    crud.create("items", { name: "alice", score: 10, note: null })
    crud.create("items", { name: "bob", score: 20, note: "x" })
    crud.create("items", { name: "carol", score: 30, note: "y" })

    expect(
      crud.search("items", { where: where().eq("name", "alice") }).items,
    ).toHaveLength(1)

    expect(
      crud.search("items", {
        where: where().eq("name", "bob").and(where().gte("score", 20)),
      }).items,
    ).toHaveLength(1)

    expect(
      crud.search("items", {
        where: where().eq("name", "alice").or(where().eq("name", "carol")),
      }).items.map((i) => i.name),
    ).toEqual(["alice", "carol"])

    expect(
      crud.search("items", { where: where().in("name", ["alice", "bob"]) }).items,
    ).toHaveLength(2)

    expect(
      crud.search("items", { where: where().like("name", "a%") }).items[0]?.name,
    ).toBe("alice")

    expect(
      crud.search("items", { where: where().isNull("note") }).items,
    ).toHaveLength(1)

    expect(
      crud.search("items", { where: where().isNotNull("note") }).items,
    ).toHaveLength(2)

    expect(
      crud.search("items", { where: where().gt("score", 15).lt("score", 25) }).items[0]
        ?.name,
    ).toBe("bob")
  })

  test("異常系: in 空配列は拒否", () => {
    const crud = crudFixture()
    expect(() =>
      crud.search("items", { where: where().in("name", []) }),
    ).toThrow(CrudianError)
  })

  test("異常系: カラム名が文字列でない", () => {
    expect(() => where().eq(1 as never, "x")).toThrow(CrudianError)
  })
})

describe("bunSqliteExportGuard", () => {
  test("正常系: Bun から createCrud を import できる", async () => {
    const mod = await import("./index.js")
    expect(typeof mod.createCrud).toBe("function")
  })

  test("異常系: Node 向け stub は誤 import を明示する", () => {
    const stubPath = new URL("./node-stub.ts", import.meta.url).pathname
    const proc = Bun.spawnSync({
      cmd: ["node", "--experimental-strip-types", stubPath],
      stdout: "pipe",
      stderr: "pipe",
    })
    const err =
      new TextDecoder().decode(proc.stderr) + new TextDecoder().decode(proc.stdout)
    expect(proc.exitCode).not.toBe(0)
    expect(err).toContain("誤って import")
  })
})
