import type { IRetrySchedule } from '../contracts/ports';

/**
 * Backoff for idempotent Board API GET streams only.
 * A 429 waits at least 60 seconds, matching the rate-limit section of the API manual.
 * Longer Retry-After values are honored. This schedule is not used for moves or seeks.
 */
export class StreamRetrySchedule implements IRetrySchedule {
  /**
   * @param kind - Failure class.
   * @param attempt - Zero-based resume counter.
   * @param retryAfterMs - Server-provided delta in milliseconds, when present.
   * @returns Delay before the next GET.
   */
  delayFor(kind: 'rate-limited' | 'network' | 'server', attempt: number, retryAfterMs?: number): number {
    if (kind === 'rate-limited') {
      return Math.max(60_000, retryAfterMs ?? 0);
    }
    const exponent = Math.min(attempt, 6);
    return Math.min(30_000, 500 * 2 ** exponent);
  }
}
