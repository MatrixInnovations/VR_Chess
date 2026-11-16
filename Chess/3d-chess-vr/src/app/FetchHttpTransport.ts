import type { HttpRequest, HttpResponse, IHttpTransport } from '../ultron/contracts/http'

/**
 * `fetch` transport for OAuth and the Board API.
 *
 * Tokens travel on the Authorization header the caller already set.
 * This class does not log the request, the body, or the response.
 */
export class FetchHttpTransport implements IHttpTransport {
  /**
   * @param fetchImpl - `fetch` implementation. Tests pass a fake.
   */
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /**
   * Send one request.
   * @param request - Fully built Lichess request.
   * @returns Status, headers, and either a byte stream or buffered text.
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    const response = await this.fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    })
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return {
      status: response.status,
      headers,
      body: response.body as AsyncIterable<Uint8Array> | null,
      text: () => response.text(),
    }
  }
}
