import type { KeyValueStore } from './KeyValueStore'

export class WebStorageStore implements KeyValueStore {
  constructor(private readonly area: 'session' | 'local') {}

  get(key: string): string | null {
    return this.bag()?.getItem(key) ?? null
  }

  set(key: string, value: string): void {
    this.bag()?.setItem(key, value)
  }

  remove(key: string): void {
    this.bag()?.removeItem(key)
  }

  private bag(): Storage | null {
    if (typeof window === 'undefined') return null
    try {
      return this.area === 'session' ? window.sessionStorage : window.localStorage
    } catch {
      return null
    }
  }
}
