import type { IIdSource } from '../contracts/ports';

/** Deterministic ids for tests and for session-local command numbers. */
export class SequentialIds implements IIdSource {
  private nextNumber = 0;

  /**
   * @param prefix - Id prefix.
   */
  constructor(private readonly prefix: string) {}

  /** @returns The next prefixed id. */
  next(): string {
    this.nextNumber += 1;
    return `${this.prefix}-${this.nextNumber}`;
  }
}
