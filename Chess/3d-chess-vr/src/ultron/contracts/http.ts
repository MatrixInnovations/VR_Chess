/**
 * HTTP port used by OAuth and the Board API client.
 * Tests pass a scripted transport. No method in this lane calls the network itself.
 */

/** Outbound request. `signal` aborts the attempt; callers must not retry a move after that. */
export interface HttpRequest {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
}

/** Response body is either buffered text or an NDJSON byte stream. */
export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<Uint8Array> | null;
  /** @returns The whole body as text. Stream consumers should ignore this. */
  text(): Promise<string>;
}

/** Single-request transport. Streaming endpoints still use one `send` and then read `body`. */
export interface IHttpTransport {
  /**
   * @param request - Fully built request. The URL is always an official Lichess URL.
   * @returns The HTTP response. Throw to signal a transport failure.
   */
  send(request: HttpRequest): Promise<HttpResponse>;
}
