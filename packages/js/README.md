# @b4moss/crudian

CRUD abstraction for DDD repositories.

Single npm package with adapter subpaths. Shared contracts live at the package root; concrete backends are imported from subpaths.

## Install

```bash
npm install @b4moss/crudian
```

Adapter peers (install only what you use):

| Subpath | Peer dependencies |
|---------|-------------------|
| `@b4moss/crudian/bun-sqlite` | Bun (`bun:sqlite`) |
| `@b4moss/crudian/drizzle` | `drizzle-orm`, `better-sqlite3` |
| `@b4moss/crudian/prisma` | `@prisma/client` |

## Usage

### Shared contracts

```ts
import { where, CrudianError } from "@b4moss/crudian"
```

### Bun (`bun:sqlite`)

```ts
import { Database } from "bun:sqlite"
import { createCrud } from "@b4moss/crudian/bun-sqlite"
import { where } from "@b4moss/crudian"

const db = new Database(":memory:")
const crud = createCrud(db)

const row = crud.create("items", { name: "alpha", score: 1 })
const found = crud.read("items", { where: where().eq("id", row.id) })
```

Node.js must not import `@b4moss/crudian/bun-sqlite` (resolves to an explicit error stub).

### Drizzle (better-sqlite3)

```ts
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { createCrud } from "@b4moss/crudian/drizzle"

const sqlite = new Database(":memory:")
const db = drizzle(sqlite)
const crud = createCrud(db)
```

### Prisma (SQLite)

```ts
import { PrismaClient } from "@prisma/client"
import { createCrud } from "@b4moss/crudian/prisma"

const client = new PrismaClient()
const crud = createCrud(client)

await crud.create("items", { name: "alpha", score: 1 })
```

Prisma methods are async. Raw SQL goes through the injected client.

## API surface

`create` / `read` / `update` / `delete` / `search` / `list` / `upsert` / `duplicate` / `bulkCreate` / `bulkUpdate` / `bulkDelete` / `bulkUpsert` / `transaction`

- `search` is canonical; `list` is an alias
- Cursor pagination uses `id` ascending; response is `{ items, nextCursor, hasMore }`
- Conditions use the `where()` builder (`eq` / `ne` / `lt` / `gt` / `lte` / `gte` / `in` / `like` / `isNull` / `isNotNull`, nestable `and` / `or`)

## License

MIT © Bicycle for Mind LLC., Kohki SHIKATA
