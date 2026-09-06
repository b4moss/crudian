import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { CrudianError, where } from "../index.js"
import { createCrud } from "./index.js"

function openIdTable() {
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

function openItemIdTable() {
  const db = new Database(":memory:")
  db.exec(`
    CREATE TABLE items (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER,
      note TEXT
    );
  `)
  return db
}

const dbs: Database[] = []

afterEach(() => {
  while (dbs.length > 0) {
    dbs.pop()?.close()
  }
})

describe("bun.createCrudPk", () => {
  test("正常系: 第2引数省略は id を PK として使う", () => {
    const db = openIdTable()
    dbs.push(db)
    const crud = createCrud(db)
    const created = crud.create("items", { name: "a", score: 1 })
    expect(created.id).toBe(1)
    expect(crud.read("items", { where: where().eq("id", 1) })?.name).toBe("a")
    const upserted = crud.upsert("items", { id: 1, name: "b" })
    expect(upserted.name).toBe("b")
  })

  test("正常系: { pk: \"id\" } 明示も省略と同じ", () => {
    const db = openIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "id" })
    const created = crud.create("items", { name: "a", score: 1 })
    expect(created.id).toBe(1)
    expect(crud.upsert("items", { id: 1, score: 9 }).score).toBe(9)
  })

  test("正常系: { pk: \"item_id\" } で採番された item_id が返る", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    const created = crud.create("items", { name: "a", score: 1 })
    expect(typeof created.item_id).toBe("number")
    expect(created.item_id).toBeGreaterThan(0)
    expect(created.name).toBe("a")
  })

  test("異常系: pk 空文字は拒否", () => {
    const db = openIdTable()
    dbs.push(db)
    expect(() => createCrud(db, { pk: "" })).toThrow(CrudianError)
  })

  test("異常系: pk が文字列でないとき拒否", () => {
    const db = openIdTable()
    dbs.push(db)
    expect(() => createCrud(db, { pk: 1 as never })).toThrow(CrudianError)
    expect(() => createCrud(db, { pk: null as never })).toThrow(CrudianError)
  })
})

describe("bun.pkColumnMissing", () => {
  test("正常系: 列が存在するカスタム PK 表では create 成功", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    expect(crud.create("items", { name: "ok", score: 1 }).name).toBe("ok")
  })

  test("異常系: 指定 PK 列がテーブルに無いとき拒否", () => {
    const db = openIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    expect(() => crud.create("items", { name: "a", score: 1 })).toThrow(CrudianError)
    try {
      crud.create("items", { name: "a", score: 1 })
    } catch (e) {
      expect(e).toBeInstanceOf(CrudianError)
      const msg = (e as Error).message
      expect(msg).toContain("item_id")
      expect(msg).toContain("items")
    }
  })

  test("異常系: read / search / upsert でも列不存在を拒否", () => {
    const db = openIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    expect(() => crud.read("items", { where: where().eq("id", 1) })).toThrow(CrudianError)
    expect(() => crud.search("items", { limit: 1 })).toThrow(CrudianError)
    expect(() => crud.upsert("items", { item_id: 1, name: "a" })).toThrow(CrudianError)
  })
})

describe("bun.pkCreateRead", () => {
  test("正常系: create 後に item_id で read できる", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    const created = crud.create("items", { name: "a", score: 1 })
    const read = crud.read("items", {
      where: where().eq("item_id", created.item_id),
    })
    expect(read).toEqual(created)
  })

  test("正常系: create 時に item_id を明示できる", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    const created = crud.create("items", { item_id: 42, name: "x", score: 3 })
    expect(created.item_id).toBe(42)
    expect(
      crud.read("items", { where: where().eq("item_id", 42) })?.name,
    ).toBe("x")
  })

  test("正常系: columns 付き read で item_id を投影できる", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    const created = crud.create("items", { name: "a", score: 1 })
    const read = crud.read("items", {
      columns: ["item_id", "name"],
      where: where().eq("item_id", created.item_id),
    })
    expect(read).toEqual({ item_id: created.item_id, name: "a" })
  })
})

describe("bun.pkSearchPaging", () => {
  test("正常系: offset は item_id 昇順", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    for (const name of ["a", "b", "c", "d", "e"]) {
      crud.create("items", { name, score: 1 })
    }
    const page1 = crud.search("items", { limit: 2 })
    expect(page1).toMatchObject({
      offset: 0,
      limit: 2,
      total: 5,
      hasMore: true,
    })
    expect("nextCursor" in page1).toBe(false)
    expect(page1.items.map((r) => r.item_id)).toEqual([1, 2])

    const page2 = crud.search("items", { limit: 2, offset: 2 })
    expect(page2.items.map((r) => r.item_id)).toEqual([3, 4])
    expect(page2).toMatchObject({ offset: 2, hasMore: true, total: 5 })
  })

  test("正常系: cursor の nextCursor は生の item_id", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    for (const name of ["a", "b", "c", "d", "e"]) {
      crud.create("items", { name, score: 1 })
    }
    const page1 = crud.search("items", { paging: "cursor", limit: 2 })
    expect(page1).toMatchObject({ hasMore: true, nextCursor: 2, total: 5 })
    expect("offset" in page1).toBe(false)

    const page2 = crud.search("items", {
      paging: "cursor",
      limit: 2,
      cursor: "nextCursor" in page1 ? page1.nextCursor : null,
    })
    expect(page2.items.map((r) => r.item_id)).toEqual([3, 4])
    expect(page2).toMatchObject({ hasMore: true, nextCursor: 4, total: 5 })

    const page3 = crud.search("items", {
      paging: "cursor",
      limit: 2,
      cursor: "nextCursor" in page2 ? page2.nextCursor : null,
    })
    expect(page3.items.map((r) => r.item_id)).toEqual([5])
    expect(page3).toMatchObject({ hasMore: false, nextCursor: null, total: 5 })
  })

  test("正常系: list は search と同結果", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    crud.create("items", { name: "a", score: 1 })
    crud.create("items", { name: "b", score: 2 })
    const q = { limit: 10, paging: "cursor" as const }
    expect(crud.list("items", q)).toEqual(crud.search("items", q))
  })
})

describe("bun.pkUpsertDuplicateBulk", () => {
  test("正常系: upsert insert / update", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    const inserted = crud.upsert("items", {
      item_id: 10,
      name: "new",
      score: 1,
    })
    expect(inserted).toEqual({ item_id: 10, name: "new", score: 1, note: null })

    const updated = crud.upsert("items", { item_id: 10, name: "upd" })
    expect(updated.name).toBe("upd")
    expect(updated.score).toBe(1)
  })

  test("正常系: duplicate は PK をコピーせず overrides が効く", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    const source = crud.create("items", { name: "a", score: 1, note: "n" })
    const copy = crud.duplicate("items", {
      where: where().eq("item_id", source.item_id),
      overrides: { name: "dup" },
    })
    expect(copy).not.toBeNull()
    expect(copy!.item_id).not.toBe(source.item_id)
    expect(copy!.name).toBe("dup")
    expect(copy!.score).toBe(1)
    expect(
      crud.read("items", { where: where().eq("item_id", source.item_id) })?.name,
    ).toBe("a")
  })

  test("正常系: bulkUpsert は件数どおり", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    const n = crud.bulkUpsert("items", [
      { item_id: 1, name: "a", score: 1 },
      { item_id: 2, name: "b", score: 2 },
    ])
    expect(n).toBe(2)
    expect(crud.count("items")).toBe(2)
  })

  test("異常系: upsert / bulkUpsert で PK 欠落は拒否", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    expect(() => crud.upsert("items", { name: "a" })).toThrow(CrudianError)
    expect(() =>
      crud.bulkUpsert("items", [{ name: "a", score: 1 }]),
    ).toThrow(CrudianError)
    try {
      crud.upsert("items", { name: "a" })
    } catch (e) {
      expect((e as Error).message).toContain("item_id")
    }
  })

  test("異常系: duplicate 対象0件は null", () => {
    const db = openItemIdTable()
    dbs.push(db)
    const crud = createCrud(db, { pk: "item_id" })
    expect(
      crud.duplicate("items", { where: where().eq("item_id", 999) }),
    ).toBeNull()
  })
})

describe("bun.pkRegressionDefaultId", () => {
  test("正常系: 省略時は従来どおり id 契約", () => {
    const db = openIdTable()
    dbs.push(db)
    const crud = createCrud(db)
    expect(() => crud.upsert("items", { name: "a" })).toThrow(CrudianError)
    const source = crud.create("items", { name: "a", score: 1 })
    const copy = crud.duplicate("items", { where: where().eq("id", source.id) })
    expect(copy!.id).not.toBe(source.id)
    const page = crud.search("items", { paging: "cursor", limit: 10 })
    expect(page).toMatchObject({ nextCursor: null, hasMore: false, total: 2 })
    expect(crud.count("items")).toBe(2)
  })
})
