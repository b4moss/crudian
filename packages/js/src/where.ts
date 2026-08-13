import { CrudianError, assertString } from "./errors.js"

export type Op =
  | "eq"
  | "ne"
  | "lt"
  | "gt"
  | "lte"
  | "gte"
  | "in"
  | "like"
  | "isNull"
  | "isNotNull"

export type CondNode = {
  type: "cond"
  op: Op
  column: string
  value?: unknown
}

export type GroupNode = {
  type: "and" | "or"
  children: WhereNode[]
}

export type WhereNode = CondNode | GroupNode

function cond(op: Op, column: string, value?: unknown): CondNode {
  assertString(column, "column")
  return { type: "cond", op, column, value }
}

/** Public where builder. Tree shape is an internal representation via `toNode()`. */
export class WhereBuilder {
  private readonly node: WhereNode

  private constructor(node: WhereNode) {
    this.node = node
  }

  static create(): WhereBuilder {
    return new WhereBuilder({ type: "and", children: [] })
  }

  static from(node: WhereNode): WhereBuilder {
    return new WhereBuilder(node)
  }

  private appendCond(op: Op, column: string, value?: unknown): WhereBuilder {
    const next = cond(op, column, value)
    if (this.node.type === "and") {
      return new WhereBuilder({ type: "and", children: [...this.node.children, next] })
    }
    return new WhereBuilder({ type: "and", children: [this.node, next] })
  }

  eq(column: string, value: unknown): WhereBuilder {
    return this.appendCond("eq", column, value)
  }

  ne(column: string, value: unknown): WhereBuilder {
    return this.appendCond("ne", column, value)
  }

  lt(column: string, value: unknown): WhereBuilder {
    return this.appendCond("lt", column, value)
  }

  gt(column: string, value: unknown): WhereBuilder {
    return this.appendCond("gt", column, value)
  }

  lte(column: string, value: unknown): WhereBuilder {
    return this.appendCond("lte", column, value)
  }

  gte(column: string, value: unknown): WhereBuilder {
    return this.appendCond("gte", column, value)
  }

  in(column: string, value: unknown[]): WhereBuilder {
    if (!Array.isArray(value)) {
      throw new CrudianError("in value must be an array")
    }
    return this.appendCond("in", column, value)
  }

  like(column: string, value: unknown): WhereBuilder {
    return this.appendCond("like", column, value)
  }

  isNull(column: string): WhereBuilder {
    return this.appendCond("isNull", column)
  }

  isNotNull(column: string): WhereBuilder {
    return this.appendCond("isNotNull", column)
  }

  and(...others: WhereBuilder[]): WhereBuilder {
    const children = [this.toNode(), ...others.map((b) => b.toNode())]
    return new WhereBuilder({ type: "and", children })
  }

  or(...others: WhereBuilder[]): WhereBuilder {
    const children = [this.toNode(), ...others.map((b) => b.toNode())]
    return new WhereBuilder({ type: "or", children })
  }

  toNode(): WhereNode {
    return this.node
  }
}

export function where(): WhereBuilder {
  return WhereBuilder.create()
}

export function isWhereBuilder(value: unknown): value is WhereBuilder {
  return value instanceof WhereBuilder
}
