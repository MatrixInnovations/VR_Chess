/**
 * Dependency-injected ports. Tests supply fakes; production supplies Web Crypto,
 * storage, and a sleeper. Nothing in this lane reads a real OAuth token from disk
 * unless a caller passes a store that already holds one.
 */

/** Diagnostic sink. Implementations must tolerate redacted text only. */
export interface IDiagnosticLog {
  /**
   * @param event - Stable event name, never a token or verifier.
   * @param detail - Human detail that has already been redacted.
   */
  write(event: string, detail: string): void;
}

/** CSPRNG used for the PKCE verifier and the OAuth state. */
export interface ISecureRandom {
  /**
   * @param length - Number of bytes.
   * @returns A fresh buffer of that length.
   */
  randomBytes(length: number): Uint8Array;
}

/** SHA-256 for the S256 code challenge. */
export interface ISha256 {
  /**
   * @param bytes - Message bytes.
   * @returns 32-byte digest.
   */
  digest(bytes: Uint8Array): Promise<Uint8Array>;
}

/** Tiny string store for the PKCE transaction and the access token. */
export interface IKeyValueStore {
  /**
   * @param key - Storage key.
   * @returns The stored string, or null.
   */
  get(key: string): string | null;
  /**
   * @param key - Storage key.
   * @param value - Value to persist.
   */
  set(key: string, value: string): void;
  /**
   * @param key - Storage key to remove.
   */
  delete(key: string): void;
}

/** Clock used by stream backoff. Tests record the delays and return immediately. */
export interface ISleeper {
  /**
   * @param ms - Delay in milliseconds.
   * @param signal - Aborts the wait. An abort must not cause a move to be sent.
   */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

/**
 * Delays before reopening an idempotent GET stream.
 * Move and seek posts must not consult this schedule.
 */
export interface IRetrySchedule {
  /**
   * @param kind - Why the stream attempt failed.
   * @param attempt - Zero-based resume index.
   * @param retryAfterMs - Parsed Retry-After delta, when the server sent one.
   * @returns Milliseconds to wait before another GET.
   */
  delayFor(kind: 'rate-limited' | 'network' | 'server', attempt: number, retryAfterMs?: number): number;
}

/** Monotonic ids for sessions and internal commands. */
export interface IIdSource {
  /** @returns The next id. */
  next(): string;
}

/** Time source so expiry tests do not sleep. */
export interface ITimeSource {
  /** @returns Epoch milliseconds. */
  now(): number;
}

/** Read access to the current Lichess bearer token. */
export interface ITokenSource {
  /** @returns The token, or null when the user is signed out or the token expired. */
  getAccessToken(): string | null;
}
