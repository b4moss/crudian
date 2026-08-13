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

describe("bulkCreate", () => {
  test("正常系: 複数行を挿入し件数を返す", () => {
    const crud = crudFixture()
    const n = crud.bulkCreate("items", [
      { name: "a", score: 1 },
      { name: "b", score: 2 },
    ])
    expect(n).toBe(2)
    expect(crud.search("items").items).toHaveLength(2)
  })

  test("正常系: 空配列は 0", () => {
    const crud = crudFixture()
    expect(crud.bulkCreate("items", [])).toBe(0)
  })

  test("異常系: テーブル名 / 行要素の検証", () => {
    const crud = crudFixture()
    expect(() => crud.bulkCreate(1 as never, [{ name: "a" }])).toThrow(CrudianError)
    expect(() => crud.bulkCreate("items", ["x"] as never)).toThrow(CrudianError)
  })

  test("異常系: 制約違反は SQLite 例外", () => {
    const crud = crudFixture()
    expect(() => crud.bulkCreate("items", [{ score: 1 }])).toThrow()
  })
})

describe("bulkUpdate", () => {
  test("正常系: 複数行を更新し件数を返す", () => {
    const crud = crudFixture()
    crud.bulkCreate("items", [
      { name: "a", score: 1 },
      { name: "a", score: 2 },
      { name: "b", score: 3 },
    ])
    const n = crud.bulkUpdate("items", { score: 9 }, { where: where().eq("name", "a") })
    expect(n).toBe(2)
    expect(
      crud.search("items", { where: where().eq("name", "a") }).items.every((r) => r.score === 9),
    ).toBe(true)
  })

  test("正常系: 0件は 0", () => {
    const crud = crudFixture()
    expect(
      crud.bulkUpdate("items", { score: 1 }, { where: where().eq("id", 999) }),
    ).toBe(0)
  })

  test("異常系: where / cols / テーブル名", () => {
    const crud = crudFixture()
    expect(() => crud.bulkUpdate("items", { score: 1 }, {} as never)).toThrow(CrudianError)
    expect(() =>
      crud.bulkUpdate("items", {}, { where: where().eq("id", 1) }),
    ).toThrow(CrudianError)
    expect(() =>
      crud.bulkUpdate(null as never, { score: 1 }, { where: where().eq("id", 1) }),
    ).toThrow(CrudianError)
  })
})

describe("bulkDelete", () => {
  test("正常系: 複数行削除", () => {
    const crud = crudFixture()
    crud.bulkCreate("items", [
      { name: "a", score: 1 },
      { name: "a", score: 2 },
      { name: "b", score: 3 },
    ])
    expect(crud.bulkDelete("items", { where: where().eq("name", "a") })).toBe(2)
    expect(crud.search("items").items.map((r) => r.name)).toEqual(["b"])
  })

  test("正常系: 0件は 0", () => {
    const crud = crudFixture()
    expect(crud.bulkDelete("items", { where: where().eq("id", 999) })).toBe(0)
  })

  test("異常系: where 必須", () => {
    const crud = crudFixture()
    expect(() => crud.bulkDelete("items", {} as never)).toThrow(CrudianError)
  })
})

describe("bulkUpsert", () => {
  test("正常系: 新規のみ", () => {
    const crud = crudFixture()
    const n = crud.bulkUpsert("items", [
      { id: 1, name: "a", score: 1 },
      { id: 2, name: "b", score: 2 },
    ])
    expect(n).toBe(2)
    expect(crud.search("items").items).toHaveLength(2)
  })

  test("正常系: 既存更新と混在", () => {
    const crud = crudFixture()
    crud.create("items", { name: "a", score: 1 })
    const n = crud.bulkUpsert("items", [
      { id: 1, name: "a2", score: 9 },
      { id: 2, name: "b", score: 2 },
    ])
    expect(n).toBe(2)
    expect(crud.read("items", { where: where().eq("id", 1) })?.name).toBe("a2")
    expect(crud.read("items", { where: where().eq("id", 2) })?.name).toBe("b")
  })

  test("正常系: 空配列は 0", () => {
    const crud = crudFixture()
    expect(crud.bulkUpsert("items", [])).toBe(0)
  })

  test("異常系: id 無し / テーブル名", () => {
    const crud = crudFixture()
    expect(() => crud.bulkUpsert("items", [{ name: "a" }])).toThrow(CrudianError)
    expect(() => crud.bulkUpsert(1 as never, [{ id: 1, name: "a" }])).toThrow(CrudianError)
  })
})
