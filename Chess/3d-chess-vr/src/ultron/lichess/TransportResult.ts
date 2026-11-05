/** Codes a Board API or OAuth call can return to the session. */
export type TransportCode =
  | 'ok'
  | 'unauthorized'
  | 'rate-limited'
  | 'rejected'
  | 'network'
  | 'cancelled'
  | 'not-found'
  | 'invalid'
  | 'http';

/**
 * Result of one HTTP attempt.
 * `ok` is false for every failure, including rate limits. The client does not
 * hide a retry inside this object for moves or seeks.
 */
export class TransportResult {
  private constructor(
    readonly ok: boolean,
    readonly code: TransportCode,
    readonly message: string,
    readonly httpStatus?: number,
  ) {}

  /**
   * @param message - Short success note. Must not include a token.
   * @returns A successful result.
   */
  static ok(message = 'ok'): TransportResult {
    return new TransportResult(true, 'ok', message);
  }

  /**
   * @param code - Failure code other than `ok`.
   * @param message - Redacted explanation.
   * @param httpStatus - HTTP status when one was received.
   * @returns A failed result.
   */
  static fail(code: Exclude<TransportCode, 'ok'>, message: string, httpStatus?: number): TransportResult {
    return new TransportResult(false, code, message, httpStatus);
  }
}
