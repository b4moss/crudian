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

describe("upsert", () => {
  test("正常系: 未存在 id は挿入される", () => {
    const crud = crudFixture()
    const row = crud.upsert("items", { id: 10, name: "new", score: 1 })
    expect(row).toEqual({ id: 10, name: "new", score: 1, note: null })
    expect(crud.read("items", { where: where().eq("id", 10) })).toEqual(row)
  })

  test("正常系: 既存 id は更新される", () => {
    const crud = crudFixture()
    crud.create("items", { name: "old", score: 1, note: "keep" })
    const row = crud.upsert("items", { id: 1, name: "updated", score: 9 })
    expect(row?.name).toBe("updated")
    expect(row?.score).toBe(9)
    expect(row?.note).toBe("keep")
  })

  test("正常系: 未指定カラムは維持", () => {
    const crud = crudFixture()
    crud.create("items", { name: "a", score: 1, note: "n" })
    const row = crud.upsert("items", { id: 1, score: 2 })
    expect(row).toEqual({ id: 1, name: "a", score: 2, note: "n" })
  })

  test("異常系: テーブル名が文字列でない", () => {
    const crud = crudFixture()
    expect(() => crud.upsert(1 as never, { id: 1, name: "a" })).toThrow(CrudianError)
  })

  test("異常系: cols 空 / id 無しは拒否", () => {
    const crud = crudFixture()
    expect(() => crud.upsert("items", {})).toThrow(CrudianError)
    expect(() => crud.upsert("items", { name: "a" })).toThrow(CrudianError)
  })

  test("異常系: 存在しないテーブルは SQLite 例外", () => {
    const crud = crudFixture()
    expect(() => crud.upsert("missing", { id: 1, name: "a" })).toThrow()
  })
})

describe("duplicate", () => {
  test("正常系: 新しい id でコピーされる", () => {
    const crud = crudFixture()
    const source = crud.create("items", { name: "a", score: 1, note: "n" })
    const copy = crud.duplicate("items", { where: where().eq("id", source.id) })
    expect(copy).not.toBeNull()
    expect(copy!.id).not.toBe(source.id)
    expect(copy!.name).toBe("a")
    expect(copy!.score).toBe(1)
    expect(copy!.note).toBe("n")
  })

  test("正常系: overrides が差し替わる", () => {
    const crud = crudFixture()
    const source = crud.create("items", { name: "a", score: 1 })
    const copy = crud.duplicate("items", {
      where: where().eq("id", source.id),
      overrides: { name: "b", score: 2 },
    })
    expect(copy).toEqual({ id: 2, name: "b", score: 2, note: null })
  })

  test("正常系: 元行は変わらない", () => {
    const crud = crudFixture()
    const source = crud.create("items", { name: "a", score: 1 })
    crud.duplicate("items", {
      where: where().eq("id", source.id),
      overrides: { name: "b" },
    })
    expect(crud.read("items", { where: where().eq("id", source.id) })?.name).toBe("a")
  })

  test("異常系: 0件は null", () => {
    const crud = crudFixture()
    expect(crud.duplicate("items", { where: where().eq("id", 999) })).toBeNull()
  })

  test("異常系: where 必須 / テーブル名検証", () => {
    const crud = crudFixture()
    expect(() => crud.duplicate("items", {} as never)).toThrow(CrudianError)
    expect(() =>
      crud.duplicate(null as never, { where: where().eq("id", 1) }),
    ).toThrow(CrudianError)
  })

  test("異常系: 一意制約違反は SQLite 例外", () => {
    const crud = crudFixture()
    crud.db.exec("CREATE UNIQUE INDEX items_name_unique ON items(name)")
    const source = crud.create("items", { name: "unique-name", score: 1 })
    expect(() =>
      crud.duplicate("items", { where: where().eq("id", source.id) }),
    ).toThrow()
  })
})
