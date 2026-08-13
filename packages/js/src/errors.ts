/** Minimal library error for invalid arguments. SQLite errors propagate as-is. */
export class CrudianError extends Error {
  readonly code = "INVALID" as const

  constructor(message: string) {
    super(message)
    this.name = "CrudianError"
  }
}

export function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new CrudianError(`${label} must be a string`)
  }
}
