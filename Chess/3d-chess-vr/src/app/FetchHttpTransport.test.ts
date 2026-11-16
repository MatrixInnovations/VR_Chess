import { describe, expect, it } from 'vitest'
import { FetchHttpTransport } from './FetchHttpTransport'

describe('FetchHttpTransport', () => {
  it('calls fetch with the global object as this', async () => {
    const seen: unknown[] = []
    const original = globalThis.fetch
    globalThis.fetch = function (this: unknown): Promise<Response> {
      seen.push(this)
      return Promise.resolve(new Response('ok', { status: 200 }))
    } as typeof fetch
    try {
      const transport = new FetchHttpTransport()
      const response = await transport.send({
        method: 'GET',
        url: 'https://lichess.org/api/account',
        headers: { Accept: 'application/json' },
        signal: new AbortController().signal,
      })
      expect(seen).toEqual([globalThis])
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('ok')
    } finally {
      globalThis.fetch = original
    }
  })
})
