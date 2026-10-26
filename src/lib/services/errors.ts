/** Errors services throw for expected situations; actions turn them into messages. */

export class NotFoundError extends Error {
  constructor(public readonly entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

/** A request that conflicts with the current state, e.g. shares over 100%. */
export class ConflictError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ConflictError";
  }
}
