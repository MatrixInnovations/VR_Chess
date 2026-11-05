/**
 * Monotonic millisecond clock used by the chess clock.
 *
 * `Date.now()` can jump backward or forward when the operating system
 * adjusts civil time. A chess countdown must not inherit those jumps, and it
 * must not accumulate `requestAnimationFrame` deltas. Callers sample this
 * source when they need a display value.
 */
export interface MonotonicTimeSource {
  /**
   * Milliseconds since an arbitrary origin.
   * Each reading is greater than or equal to the previous reading.
   */
  now(): number
}

/**
 * Production time source backed by `performance.now()`.
 * The origin is navigation or process start, not the Unix epoch.
 */
export class SystemMonotonicTimeSource implements MonotonicTimeSource {
  /** @inheritdoc */
  now(): number {
    return globalThis.performance.now()
  }
}

/**
 * Deterministic monotonic clock for tests and offline replays.
 * Time moves only when {@link ManualMonotonicTimeSource.advance} is called.
 */
export class ManualMonotonicTimeSource implements MonotonicTimeSource {
  private currentMs: number

  /**
   * @param startMs - Non-negative finite origin. Defaults to 0.
   */
  constructor(startMs = 0) {
    if (!Number.isFinite(startMs) || startMs < 0) {
      throw new RangeError("Monotonic origin must be a non-negative finite number.")
    }
    this.currentMs = startMs
  }

  /** @inheritdoc */
  now(): number {
    return this.currentMs
  }

  /**
   * Move the clock forward.
   * @param ms - Non-negative finite duration. Zero is a no-op.
   */
  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError("Monotonic advance must be a non-negative finite number.")
    }
    this.currentMs += ms
  }
}
