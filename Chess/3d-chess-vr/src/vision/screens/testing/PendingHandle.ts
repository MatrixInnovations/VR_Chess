/**
 * A promise a test or the demo lobby can resolve later.
 * The extra `catch` marks a rejection handled if cancel wins before `await`,
 * and the original promise still rejects for the lobby controller.
 */
export class PendingHandle<T> {
  /** Promise the lobby port returns. */
  readonly promise: Promise<T>
  private resolvePromise!: (value: T) => void
  private rejectPromise!: (error: Error) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve
      this.rejectPromise = reject
    })
    this.promise.catch(() => undefined)
  }

  /**
   * @param value - Value the awaiting screen receives.
   */
  resolve(value: T): void {
    this.resolvePromise(value)
  }

  /**
   * @param error - Rejection the awaiting screen receives.
   */
  reject(error: Error): void {
    this.rejectPromise(error)
  }
}
