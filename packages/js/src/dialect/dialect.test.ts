import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CrudianError } from "../index.js"
import {
  mysqlDialect,
  postgresDialect,
  resolveDialect,
  sqliteDialect,
} from "./index.js"

describe("dialect.resolveDialect", () => {
  test("defaults to sqlite when omitted", () => {
    assert.equal(resolveDialect(undefined).name, "sqlite")
  })

  test("returns named dialects", () => {
    assert.equal(resolveDialect("sqlite").name, "sqlite")
    assert.equal(resolveDialect("postgres").name, "postgres")
    assert.equal(resolveDialect("mysql").name, "mysql")
  })

  test("rejects unknown dialect names", () => {
    assert.throws(
      () => resolveDialect("mariadb" as "sqlite"),
      (err: unknown) =>
        err instanceof CrudianError &&
        String(err.message).includes("unknown dialect"),
    )
  })
})

describe("dialect.sqlite", () => {
  test("quotes identifiers and doubles internal quotes", () => {
    assert.equal(sqliteDialect.quoteIdent("items"), `"items"`)
    assert.equal(sqliteDialect.quoteIdent('a"b'), `"a""b"`)
  })

  test("placeholder is always ?", () => {
    assert.equal(sqliteDialect.placeholder(1), "?")
    assert.equal(sqliteDialect.placeholder(9), "?")
  })

  test("supports RETURNING and last_insert_rowid", () => {
    assert.equal(sqliteDialect.supportsInsertReturning, true)
    assert.match(sqliteDialect.lastInsertIdSql(), /last_insert_rowid/i)
  })

  test("describeColumns uses PRAGMA table_info", () => {
    const q = sqliteDialect.describeColumns("items")
    assert.match(q.sql, /PRAGMA table_info\("items"\)/)
    assert.deepEqual(q.args, [])
  })

  test("rejects non-string identifiers", () => {
    assert.throws(() => sqliteDialect.quoteIdent(1 as unknown as string))
  })
})

describe("dialect.postgres", () => {
  test("quotes identifiers and uses $n placeholders", () => {
    assert.equal(postgresDialect.quoteIdent("items"), `"items"`)
    assert.equal(postgresDialect.quoteIdent('a"b'), `"a""b"`)
    assert.equal(postgresDialect.placeholder(1), "$1")
    assert.equal(postgresDialect.placeholder(3), "$3")
  })

  test("supports RETURNING and lastval fallback", () => {
    assert.equal(postgresDialect.supportsInsertReturning, true)
    assert.match(postgresDialect.lastInsertIdSql(), /lastval/i)
  })

  test("describeColumns queries information_schema with $1", () => {
    const q = postgresDialect.describeColumns("items")
    assert.match(q.sql, /information_schema\.columns/i)
    assert.match(q.sql, /\$1/)
    assert.deepEqual(q.args, ["items"])
  })
})

describe("dialect.mysql", () => {
  test("backtick-quotes identifiers and uses ?", () => {
    assert.equal(mysqlDialect.quoteIdent("items"), "`items`")
    assert.equal(mysqlDialect.quoteIdent("a`b"), "`a``b`")
    assert.equal(mysqlDialect.placeholder(1), "?")
    assert.equal(mysqlDialect.placeholder(4), "?")
  })

  test("does not support RETURNING; uses LAST_INSERT_ID", () => {
    assert.equal(mysqlDialect.supportsInsertReturning, false)
    assert.match(mysqlDialect.lastInsertIdSql(), /LAST_INSERT_ID/i)
  })

  test("describeColumns queries information_schema with ?", () => {
    const q = mysqlDialect.describeColumns("items")
    assert.match(q.sql, /information_schema\.COLUMNS/i)
    assert.match(q.sql, /\?/)
    assert.deepEqual(q.args, ["items"])
  })
})
