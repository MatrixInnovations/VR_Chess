/**
 * Issues readable ids for local-only records such as the offline demo.
 * Not used for Lichess game ids; those come from {@link GameHandle}.
 */
export class SequentialIdFactory {
  private nextNumber = 0

  /**
   * @param prefix - Short label, for example `offline-demo`.
   * @returns `${prefix}-${n}` with `n` starting at 1.
   */
  next(prefix: string): string {
    this.nextNumber += 1
    return `${prefix}-${this.nextNumber}`
  }
}
