import { describe, expect, it } from 'vitest'

import type { HttpRequest, HttpResponse, IHttpTransport } from '../contracts/http'
import type { ISleeper } from '../contracts/ports'
import type { IncomingEvent, StreamFault } from './apiTypes'
import { LichessClient } from './LichessClient'

class ImmediateSleeper implements ISleeper {
  async sleep(): Promise<void> {
    return undefined
  }
}

describe('LichessClient streams', () => {
  it('reads NDJSON with getReader and resumes after the socket goes quiet', async () => {
    const encoder = new TextEncoder()
    let sends = 0
    const faults: StreamFault[] = []
    const events: IncomingEvent[] = []
    const transport: IHttpTransport = {
      async send(): Promise<HttpResponse> {
        sends += 1
        if (sends === 1) {
          const payload = encoder.encode(
            '{"type":"gameStart","game":{"id":"reader1","color":"white","compat":{"board":true}}}\n',
          )
          let sent = false
          return {
            status: 200,
            headers: {},
            text: async () => '',
            body: {
              getReader: () => ({
                read: async () => {
                  if (sent) await new Promise(() => undefined)
                  sent = true
                  return { done: false, value: payload }
                },
                releaseLock: () => undefined,
              }),
              [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
                throw new Error('Safari would not use async iteration')
              },
            } as unknown as AsyncIterable<Uint8Array>,
          }
        }
        return {
          status: 200,
          headers: {},
          text: async () => '',
          body: (async function* quiet() {
            await new Promise(() => undefined)
          })(),
        }
      },
    }
    const client = new LichessClient({
      transport,
      sleeper: new ImmediateSleeper(),
      maxStreamResumes: 1,
      streamIdleMs: 20,
    })
    const stream = client.openEventStream('lip_testtokenvalue', new AbortController().signal, {
      onEvent: (event) => events.push(event),
      onFault: (fault) => faults.push(fault),
    })
    await stream.ready
    const started = Date.now()
    while (faults.length === 0 && Date.now() - started < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(events.some((event) => event.type === 'gameStart' && event.gameId === 'reader1')).toBe(true)
    expect(faults.some((fault) => fault.code === 'reconnect-exhausted')).toBe(true)
    expect(sends).toBeGreaterThan(1)
  })

  it('resets the resume budget after a chunk even when the next read times out', async () => {
    const encoder = new TextEncoder()
    let sends = 0
    const transport: IHttpTransport = {
      async send(): Promise<HttpResponse> {
        sends += 1
        if (sends === 1) {
          return { status: 500, headers: {}, text: async () => '', body: null }
        }
        if (sends > 2) {
          return {
            status: 200,
            headers: {},
            text: async () => '',
            body: (async function* quiet() {
              await new Promise(() => undefined)
            })(),
          }
        }
        const payload = encoder.encode('{"type":"gameStart","game":{"id":"chunk1","color":"white","compat":{"board":true}}}\n')
        let sent = false
        return {
          status: 200,
          headers: {},
          text: async () => '',
          body: {
            getReader: () => ({
              read: async () => {
                if (sent) await new Promise(() => undefined)
                sent = true
                return { done: false, value: payload }
              },
              releaseLock: () => undefined,
            }),
          } as unknown as AsyncIterable<Uint8Array>,
        }
      },
    }
    const faults: StreamFault[] = []
    const client = new LichessClient({
      transport,
      sleeper: new ImmediateSleeper(),
      maxStreamResumes: 1,
      streamIdleMs: 20,
    })
    const stream = client.openEventStream('lip_testtokenvalue', new AbortController().signal, {
      onEvent: () => undefined,
      onFault: (fault) => faults.push(fault),
    })
    await stream.ready
    const started = Date.now()
    while (faults.length === 0 && Date.now() - started < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(sends).toBe(3)
    expect(faults.some((fault) => fault.code === 'reconnect-exhausted')).toBe(true)
  })

  it('does not leave an unhandled rejection when the stream is aborted', async () => {
    const transport: IHttpTransport = {
      async send(_request: HttpRequest): Promise<HttpResponse> {
        return {
          status: 200,
          headers: {},
          text: async () => '',
          body: (async function* hang() {
            await new Promise(() => undefined)
          })(),
        }
      },
    }
    const client = new LichessClient({ transport, sleeper: new ImmediateSleeper(), streamIdleMs: 0 })
    const controller = new AbortController()
    const stream = client.openEventStream('lip_testtokenvalue', controller.signal, {
      onEvent: () => undefined,
      onFault: () => undefined,
    })
    await stream.ready
    controller.abort()
    await stream.completed
  })
})
