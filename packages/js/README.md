# @b4moss/crudian

CRUD abstraction for DDD repositories.

One npm package, adapter subpaths. Shared contracts live at the package root; backends are imported from subpaths. Callers inject their own DB/client — crudian never opens connections or reads env secrets for you.

**Versioning:** this npm package has its own SemVer (`package.json`). It is independent of the Go module (`packages/go/VERSION`). Shipping Go `0.7.0` does not require bumping this package.

## Install

```bash
npm install @b4moss/crudian
```

Install only the peer deps for the adapter you use:

| Subpath | Runtime | Sync / async | Peer dependencies |
|---------|---------|--------------|-------------------|
| `@b4moss/crudian/bun-sqlite` | Bun | sync | Bun (`bun:sqlite`) |
| `@b4moss/crudian/drizzle` | Node.js 24+ | sync | `drizzle-orm`, `better-sqlite3` |
| `@b4moss/crudian/prisma` | Node.js 24+ | async | `@prisma/client` |
| `@b4moss/crudian/libsql` | Node.js 24+ / Bun | async | `@libsql/client` |

Node must not import `@b4moss/crudian/bun-sqlite` (resolves to an explicit error stub).

## Quick start (adapters)

### Shared contracts

```ts
import { where, CrudianError } from "@b4moss/crudian"
```

### Bun (`bun:sqlite`) — sync

```ts
import { Database } from "bun:sqlite"
import { createCrud } from "@b4moss/crudian/bun-sqlite"
import { where } from "@b4moss/crudian"

const db = new Database(":memory:")
db.exec(`
  CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER,
    note TEXT
  )
`)
const crud = createCrud(db)
// raw DB is also available as crud.db
```

### Drizzle (better-sqlite3) — sync

```ts
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { createCrud } from "@b4moss/crudian/drizzle"

const sqlite = new Database(":memory:")
sqlite.exec(`CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER,
  note TEXT
)`)
const db = drizzle(sqlite)
const crud = createCrud(db)
```

### Prisma (SQLite) — async

```ts
import { PrismaClient } from "@prisma/client"
import { createCrud } from "@b4moss/crudian/prisma"

const client = new PrismaClient()
const crud = createCrud(client)

await crud.create("items", { name: "alpha", score: 1 })
```

### libSQL (`@libsql/client`) — async

```ts
import { createClient } from "@libsql/client"
import { createCrud } from "@b4moss/crudian/libsql"

const client = createClient({
  url: process.env.LIBSQL_URL ?? "file:local.db",
  authToken: process.env.LIBSQL_AUTH_TOKEN, // optional; set for remote hosts
})
const crud = createCrud(client)

await crud.create("items", { name: "alpha", score: 1 })
```

URL / auth token belong on the caller-created client (typically from `.env`).

---

## API reference (all methods)

Examples below use the **sync** Bun adapter. For `prisma` / `libsql`, `await` every call (same shapes).

Assume a table:

```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER,
  note TEXT
);
```

```ts
import { Database } from "bun:sqlite"
import { createCrud } from "@b4moss/crudian/bun-sqlite"
import { where } from "@b4moss/crudian"

const db = new Database(":memory:")
db.exec(/* schema above */)
const crud = createCrud(db)

type Item = { id: number; name: string; score: number | null; note: string | null }
```

### `create(table, cols)` → row

Inserts one row and returns it (including generated `id`).

```ts
const row = crud.create<Item>("items", { name: "alpha", score: 10, note: "n" })
// { id: 1, name: "alpha", score: 10, note: "n" }
```

### `read(table, query?)` → row | `null`

Reads one row. Misses return `null` (does not throw).

```ts
const found = crud.read<Item>("items", {
  columns: ["id", "name"],
  where: where().eq("id", row.id),
})
// { id: 1, name: "alpha" }

const missing = crud.read<Item>("items", { where: where().eq("id", 999) })
// null
```

### `update(table, cols, query)` → row | `null`

Updates matching rows; returns the updated row. Zero matches → `null`. `where` is required.

```ts
const updated = crud.update<Item>(
  "items",
  { score: 9 },
  { where: where().eq("id", row.id) },
)
// { id: 1, name: "alpha", score: 9, note: "n" }
```

### `delete(table, query)` → number

Deletes matching rows; returns affected count. `where` is required.

```ts
const deleted = crud.delete("items", { where: where().eq("id", row.id) })
// 1
```

### `search(table, query?)` → `{ items, nextCursor, hasMore, total }`

Canonical list API. Cursor pagination on `id` ascending. `total` is the full where-match count (ignores `limit` / `cursor`).

`SearchQuery` fields:

| Field | Meaning |
|-------|---------|
| `columns?` | Column list for `SELECT` (same idea as `read`). Omit → `*` |
| `where?` | Condition builder / node |
| `limit?` | Page size (default `20`) |
| `cursor?` | Raw `id` cursor (keyset); rows with `id > cursor` |

```ts
for (let i = 0; i < 5; i++) {
  crud.create("items", { name: `n${i}`, score: i })
}

const page1 = crud.search<Item>("items", { limit: 2 })
// {
//   items: [ { id: 1, ... }, { id: 2, ... } ],
//   nextCursor: 2,
//   hasMore: true,
//   total: 5,
// }

const page2 = crud.search<Item>("items", {
  limit: 2,
  cursor: page1.nextCursor,
})
// items ids [3, 4], total still 5

const filtered = crud.search<Item>("items", {
  columns: ["id", "name"],
  where: where().gte("score", 3),
  limit: 10,
})
// each item is { id, name } only
```

### `list(table, query?)` → same as `search`

Thin alias of `search` (same `SearchQuery`, including `columns`).

```ts
const a = crud.list<Item>("items", {
  columns: ["id", "name"],
  limit: 10,
})
const b = crud.search<Item>("items", {
  columns: ["id", "name"],
  limit: 10,
})
// a and b are deep-equal
```

### `count(table, query?)` → number

Where-match count only (`CountQuery` is `{ where? }`). No `limit` / `cursor` / `columns`.

```ts
crud.count("items") // 5
crud.count("items", { where: where().eq("name", "n0") }) // 1
```

### `upsert(table, cols)` → row

Conflict target is primary key `id`. Inserts or updates; returns the row. `id` is required in `cols`.

```ts
const inserted = crud.upsert<Item>("items", { id: 10, name: "new", score: 1 })
const again = crud.upsert<Item>("items", { id: 10, name: "upd", score: 9 })
// again.name === "upd"
```

### `duplicate(table, query)` → row | `null`

Copies the first matching row (new `id`). Optional `overrides`. Zero matches → `null`. `where` is required.

```ts
const source = crud.create<Item>("items", { name: "a", score: 1, note: "n" })
const copy = crud.duplicate<Item>("items", {
  where: where().eq("id", source.id),
  overrides: { name: "b" },
})
// copy.id !== source.id, copy.name === "b"

const none = crud.duplicate<Item>("items", { where: where().eq("id", 999) })
// null
```

### `bulkCreate(table, rows)` → number

Inserts many rows; returns inserted count. Empty array → `0`.

```ts
const n = crud.bulkCreate("items", [
  { name: "x", score: 1 },
  { name: "y", score: 2 },
])
// 2
```

### `bulkUpdate(table, cols, query)` → number

Updates many rows; returns affected count. `where` is required.

```ts
const n = crud.bulkUpdate(
  "items",
  { score: 8 },
  { where: where().eq("name", "x") },
)
// 1
```

### `bulkDelete(table, query)` → number

Deletes many rows; returns affected count. `where` is required.

```ts
const n = crud.bulkDelete("items", { where: where().eq("name", "y") })
// 1
```

### `bulkUpsert(table, rows)` → number

Upserts many rows (each row needs `id`); returns processed count. Empty array → `0`.

```ts
const n = crud.bulkUpsert("items", [
  { id: 100, name: "z", score: 1 },
  { id: 10, name: "z2", score: 2 },
])
// 2
```

### `transaction(fn)` → `fn` return value

Runs `fn` inside a transaction helper. Crudian does **not** auto-wrap each CRUD call; use this when you need atomic multi-step work. Success commits; throw rolls back.

```ts
const result = crud.transaction(() => {
  crud.create("items", { name: "a", score: 1 })
  crud.create("items", { name: "b", score: 2 })
  return "ok"
})
// result === "ok"; both rows visible afterward

try {
  crud.transaction(() => {
    crud.create("items", { name: "c", score: 3 })
    throw new Error("boom")
  })
} catch {
  // partial writes from that callback are rolled back
}
```

Async adapters:

```ts
await crud.transaction(async () => {
  await crud.create("items", { name: "a", score: 1 })
  await crud.create("items", { name: "b", score: 2 })
})
```

---

## `where()` builder

```ts
import { where } from "@b4moss/crudian"

where().eq("name", "alpha")
where().ne("score", 0)
where().lt("score", 10)
where().lte("score", 10)
where().gt("score", 0)
where().gte("score", 0)
where().in("name", ["a", "b"])
where().like("name", "a%")
where().isNull("note")
where().isNotNull("note")

where()
  .eq("name", "alpha")
  .and(where().gte("score", 5))

where()
  .eq("name", "alpha")
  .or(where().eq("name", "beta"))
```

Nestable `and` / `or`. Empty `in([])` is rejected.

---

## Behavior notes

| Topic | Behavior |
|-------|----------|
| Entry | `createCrud(db)` — inject a caller-owned client; exposed as `crud.db` |
| Sync vs async | `bun-sqlite` / `drizzle` sync; `prisma` / `libsql` return `Promise`s |
| `read` / `update` / `duplicate` miss | `null` |
| `delete` / bulk miss | `0` |
| Upsert conflict | primary key `id` |
| Pagination | cursor on `id` ASC only (no offset) |
| `columns` | optional on `read` / `search` / `list`; omit → `*` |
| `search.total` / `count` | full where count; not page length |
| Errors | minimal `CrudianError`; other errors propagate from the driver |
| Identifiers | string required; no format validation |
| Out of scope | relations, migrations, full-text search, ORM models |

## License

MIT © Bicycle for Mind LLC., Kohki SHIKATA
