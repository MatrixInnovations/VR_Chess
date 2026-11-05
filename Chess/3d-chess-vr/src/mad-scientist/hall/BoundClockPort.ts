import type { IFridaeClockPort, IFridaeClockSnapshot } from '../contracts/IFridaeClockPort'

/**
 * In-memory {@link IFridaeClockPort}.
 *
 * Holds whatever snapshot the caller last published. It does not advance time.
 * Replace this class with Fridae's subscription when PR #3's fields land.
 * Callers should depend on {@link IFridaeClockPort}, not on this type.
 */
export class BoundClockPort implements IFridaeClockPort {
  private snapshot: IFridaeClockSnapshot | null

  private readonly listeners = new Set<(snapshot: IFridaeClockSnapshot | null) => void>()

  /**
   * @param snapshot - Initial reading. Null until a game has a clock.
   */
  constructor(snapshot: IFridaeClockSnapshot | null = null) {
    this.snapshot = snapshot
  }

  /** @inheritdoc */
  read(): IFridaeClockSnapshot | null {
    return this.snapshot
  }

  /**
   * Replace the published snapshot and notify listeners.
   * @param snapshot - The new reading, or null to clear the faces.
   */
  publish(snapshot: IFridaeClockSnapshot | null): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener(snapshot)
  }

  /** @inheritdoc */
  subscribe(listener: (snapshot: IFridaeClockSnapshot | null) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
