import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserSpeechRecognitionFactory,
  WebSpeechRecognitionAdapter,
  type SpeechRecognitionFactory,
  type SpeechRecognitionLike,
} from '../WebSpeechRecognitionAdapter'

class FakeRecognition implements SpeechRecognitionLike {
  lang = ''
  continuous = true
  interimResults = false
  onresult: SpeechRecognitionLike['onresult'] = null
  onerror: SpeechRecognitionLike['onerror'] = null
  onend: SpeechRecognitionLike['onend'] = null
  onstart: SpeechRecognitionLike['onstart'] = null
  started = 0
  aborted = 0
  startError: unknown = null
  abortError: Error | null = null
  /** What `start` does after recording the call. */
  behavior: 'ok' | 'error' | 'end' | 'silent' = 'ok'
  errorName = 'not-allowed'

  start(): void {
    this.started += 1
    if (this.startError) throw this.startError
    if (this.behavior === 'ok') this.onstart?.()
    if (this.behavior === 'error') this.onerror?.({ error: this.errorName })
    if (this.behavior === 'end') this.onend?.()
  }

  stop(): void {
    this.abort()
  }

  abort(): void {
    this.aborted += 1
    if (this.abortError) throw this.abortError
    this.onend?.()
  }

  emitFinal(text: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: text }, length: 1 }],
    })
  }

  emitParts(parts: Array<{ text: string; isFinal: boolean }>): void {
    this.onresult?.({
      resultIndex: 0,
      results: parts.map((part) => ({ isFinal: part.isFinal, 0: { transcript: part.text }, length: 1 })),
    })
  }
}

class FakeFactory implements SpeechRecognitionFactory {
  readonly created: FakeRecognition[] = []
  supported = true
  createError: Error | null = null

  isSupported(): boolean {
    return this.supported
  }

  create(): SpeechRecognitionLike {
    if (this.createError) throw this.createError
    const recognition = new FakeRecognition()
    this.created.push(recognition)
    return recognition
  }
}

describe('WebSpeechRecognitionAdapter', () => {
  it('starts listening and records the recognizer settings', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    expect(adapter.status()).toBe('idle')
    expect(adapter.readFinal()).toBe('')
    await adapter.start()
    const recognition = factory.created[0]
    expect(adapter.status()).toBe('listening')
    expect(recognition.lang).toBe('en-US')
    expect(recognition.continuous).toBe(false)
    expect(recognition.interimResults).toBe(true)
    expect(factory.created).toHaveLength(1)
  })

  it('is a no-op when start is called while already listening', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await adapter.start()
    factory.created[0].emitFinal('pawn to e4')
    await adapter.start()
    expect(factory.created).toHaveLength(1)
    expect(adapter.readFinal()).toBe('pawn to e4')
    expect(adapter.status()).toBe('listening')
  })

  it('soft-fails when the environment has no speech API', async () => {
    const factory = new FakeFactory()
    factory.supported = false
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await expect(adapter.start()).resolves.toBeUndefined()
    expect(adapter.status()).toBe('unsupported')
    expect(factory.created).toHaveLength(0)
  })

  it('soft-fails to denied on permission errors from the recognizer', async () => {
    const factory = new FakeFactory()
    factory.created
    const denied = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(denied)
    denied.create = () => {
      const recognition = new FakeRecognition()
      recognition.behavior = 'error'
      recognition.errorName = 'not-allowed'
      denied.created.push(recognition)
      return recognition
    }
    await adapter.start()
    expect(adapter.status()).toBe('denied')
    await adapter.stop()
    expect(adapter.status()).toBe('denied')

    const service = new FakeFactory()
    const serviceAdapter = new WebSpeechRecognitionAdapter(service)
    service.create = () => {
      const recognition = new FakeRecognition()
      recognition.behavior = 'error'
      recognition.errorName = 'service-not-allowed'
      service.created.push(recognition)
      return recognition
    }
    await serviceAdapter.start()
    expect(serviceAdapter.status()).toBe('denied')
  })

  it('soft-fails to idle on no-speech, network, audio-capture, aborted, and unknown errors', async () => {
    for (const errorName of ['no-speech', 'network', 'audio-capture', 'aborted', 'bad-grammar']) {
      const factory = new FakeFactory()
      const adapter = new WebSpeechRecognitionAdapter(factory)
      factory.create = () => {
        const recognition = new FakeRecognition()
        recognition.behavior = 'error'
        recognition.errorName = errorName
        factory.created.push(recognition)
        return recognition
      }
      await adapter.start()
      expect(adapter.status()).toBe('idle')
    }
  })

  it('resolves start when the recognizer ends without a start event', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    factory.create = () => {
      const recognition = new FakeRecognition()
      recognition.behavior = 'end'
      factory.created.push(recognition)
      return recognition
    }
    await adapter.start()
    expect(adapter.status()).toBe('idle')
  })

  it('maps a thrown permission error to denied and any other throw to idle', async () => {
    const denied = new FakeFactory()
    const deniedError = new Error('permission blocked')
    deniedError.name = 'NotAllowedError'
    denied.createError = deniedError
    const deniedAdapter = new WebSpeechRecognitionAdapter(denied)
    await deniedAdapter.start()
    expect(deniedAdapter.status()).toBe('denied')

    const message = new FakeFactory()
    message.createError = new Error('not-allowed by the user')
    const messageAdapter = new WebSpeechRecognitionAdapter(message)
    await messageAdapter.start()
    expect(messageAdapter.status()).toBe('denied')

    const stringFactory = new FakeFactory()
    const stringAdapter = new WebSpeechRecognitionAdapter(stringFactory)
    stringFactory.create = () => {
      throw 'permission missing'
    }
    await stringAdapter.start()
    expect(stringAdapter.status()).toBe('denied')

    const generic = new FakeFactory()
    generic.createError = new Error('boom')
    const genericAdapter = new WebSpeechRecognitionAdapter(generic)
    await genericAdapter.start()
    expect(genericAdapter.status()).toBe('idle')

    const thrownStart = new FakeFactory()
    const thrownAdapter = new WebSpeechRecognitionAdapter(thrownStart)
    thrownStart.create = () => {
      const recognition = new FakeRecognition()
      recognition.startError = new Error('InvalidStateError')
      thrownStart.created.push(recognition)
      return recognition
    }
    await thrownAdapter.start()
    expect(thrownAdapter.status()).toBe('idle')
  })

  it('stores only final text, joining segments, and ignores interim hypotheses', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    const heard: string[] = []
    const unsubscribe = adapter.onFinal((transcript) => heard.push(transcript))
    await adapter.start()
    const recognition = factory.created[0]
    recognition.emitParts([{ text: 'pawn ', isFinal: false }])
    expect(adapter.readFinal()).toBe('')
    expect(heard).toEqual([])
    recognition.emitParts([
      { text: 'pawn ', isFinal: true },
      { text: 'to e4', isFinal: true },
    ])
    expect(adapter.readFinal()).toBe('pawn to e4')
    expect(heard).toEqual(['pawn to e4'])
    unsubscribe()
    recognition.emitFinal('knight to f3')
    expect(heard).toEqual(['pawn to e4'])
    expect(adapter.readFinal()).toBe('knight to f3')
  })

  it('does not notify listeners after stop, and ignores a result delivered after abort', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    const heard: string[] = []
    adapter.onFinal((transcript) => heard.push(transcript))
    await adapter.start()
    const recognition = factory.created[0]
    await adapter.stop()
    expect(recognition.aborted).toBe(1)
    expect(adapter.status()).toBe('idle')
    recognition.emitFinal('pawn to e4')
    expect(adapter.readFinal()).toBe('')
    expect(heard).toEqual([])
  })

  it('keeps a transcript that already finalized and drops a later one after stop', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await adapter.start()
    factory.created[0].emitFinal('pawn to e4')
    await adapter.stop()
    factory.created[0].emitFinal('knight to f3')
    expect(adapter.readFinal()).toBe('pawn to e4')
  })

  it('swallows abort errors and still returns to idle', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await adapter.start()
    factory.created[0].abortError = new Error('already ended')
    await expect(adapter.stop()).resolves.toBeUndefined()
    expect(adapter.status()).toBe('idle')
  })

  it('stop before start stays idle', async () => {
    const adapter = new WebSpeechRecognitionAdapter(new FakeFactory())
    await adapter.stop()
    expect(adapter.status()).toBe('idle')
  })

  it('returns to idle when the recognizer ends after a phrase', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await adapter.start()
    factory.created[0].onend?.()
    expect(adapter.status()).toBe('idle')
  })

  it('clears a previous transcript when a new listen starts', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await adapter.start()
    factory.created[0].emitFinal('pawn to e4')
    await adapter.stop()
    await adapter.start()
    expect(adapter.readFinal()).toBe('')
    expect(adapter.status()).toBe('listening')
  })

  it('dispose cancels the recognizer', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await adapter.start()
    await adapter.dispose()
    expect(factory.created[0].aborted).toBe(1)
    expect(adapter.status()).toBe('idle')
  })

  it('notifies every listener even if the first unsubscribes itself', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    const heard: string[] = []
    let unsubscribe: () => void = () => undefined
    unsubscribe = adapter.onFinal(() => {
      unsubscribe()
      heard.push('a')
    })
    adapter.onFinal(() => heard.push('b'))
    await adapter.start()
    factory.created[0].emitFinal('pawn to e4')
    expect(heard).toEqual(['a', 'b'])
  })

  it('does not publish a final that arrives before listening has started', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    const heard: string[] = []
    adapter.onFinal((transcript) => heard.push(transcript))
    factory.create = () => {
      const recognition = new FakeRecognition()
      recognition.behavior = 'silent'
      factory.created.push(recognition)
      return recognition
    }
    const pending = adapter.start()
    factory.created[0].emitFinal('too early')
    factory.created[0].onstart?.()
    await pending
    expect(heard).toEqual([])
    expect(adapter.readFinal()).toBe('')
  })

  it('accepts a custom language', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory, 'en-GB')
    await adapter.start()
    expect(factory.created[0].lang).toBe('en-GB')
  })

  it('moves from listening to denied if permission is revoked mid-phrase', async () => {
    const factory = new FakeFactory()
    const adapter = new WebSpeechRecognitionAdapter(factory)
    await adapter.start()
    factory.created[0].onerror?.({ error: 'not-allowed' })
    expect(adapter.status()).toBe('denied')
    factory.created[0].onerror?.({ error: 'no-speech' })
    expect(adapter.status()).toBe('denied')
  })
})

describe('BrowserSpeechRecognitionFactory', () => {
  const keys = ['SpeechRecognition', 'webkitSpeechRecognition'] as const

  afterEach(() => {
    for (const key of keys) {
      delete (globalThis as Record<string, unknown>)[key]
    }
  })

  it('is unsupported and refuses to construct when neither constructor exists', () => {
    for (const key of keys) delete (globalThis as Record<string, unknown>)[key]
    const factory = new BrowserSpeechRecognitionFactory()
    expect(factory.isSupported()).toBe(false)
    expect(() => factory.create()).toThrow(/unsupported/i)
  })

  it('prefers the standard constructor over the webkit prefix', () => {
    class Standard {
      label = 'standard'
    }
    class Prefixed {
      label = 'webkit'
    }
    ;(globalThis as Record<string, unknown>).SpeechRecognition = Standard
    ;(globalThis as Record<string, unknown>).webkitSpeechRecognition = Prefixed
    const factory = new BrowserSpeechRecognitionFactory()
    expect(factory.isSupported()).toBe(true)
    expect((factory.create() as unknown as { label: string }).label).toBe('standard')
  })

  it('uses webkitSpeechRecognition when that is the only constructor', () => {
    class Prefixed {
      label = 'webkit'
    }
    delete (globalThis as Record<string, unknown>).SpeechRecognition
    ;(globalThis as Record<string, unknown>).webkitSpeechRecognition = Prefixed
    const factory = new BrowserSpeechRecognitionFactory()
    expect(factory.isSupported()).toBe(true)
    expect((factory.create() as unknown as { label: string }).label).toBe('webkit')
  })
})

describe('WebSpeechRecognitionAdapter default factory', () => {
  it('constructs against the browser factory without throwing when speech is missing', async () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
    const adapter = new WebSpeechRecognitionAdapter()
    await adapter.start()
    expect(adapter.status()).toBe('unsupported')
    vi.unstubAllGlobals()
  })
})
