/**
 * Deterministic intent ids for tests and for a single running hall.
 * The session treats a repeated id as a second submit and rejects it.
 */
export class IntentIdSequence {
  private n = 0

  /** Next id, starting at `ms-intent-1`. */
  next(): string {
    this.n += 1
    return `ms-intent-${this.n}`
  }
}
