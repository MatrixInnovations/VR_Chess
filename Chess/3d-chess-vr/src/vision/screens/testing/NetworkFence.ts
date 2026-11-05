/**
 * Replaces `fetch` with a function that records the URL and throws.
 * Screen tests install this so a live Lichess call fails the test instead of
 * leaving the machine. It does not open a connection of its own.
 */
export class NetworkFence {
  /** URLs passed to `fetch` while the fence was installed. */
  readonly hits: string[] = []
  private original: typeof fetch | undefined
  private installed = false

  /** Install the fence. A second call is ignored so the original `fetch` is not lost. */
  install(): void {
    if (this.installed) return
    this.original = globalThis.fetch
    const fence = this
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      fence.hits.push(url)
      throw new Error(`Blocked live network call to ${url}`)
    }) as typeof fetch
    this.installed = true
  }

  /** Restore the previous `fetch`. A second call is ignored. */
  restore(): void {
    if (!this.installed) return
    globalThis.fetch = this.original as typeof fetch
    this.installed = false
  }
}
