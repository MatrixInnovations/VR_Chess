/**
 * A human participant. Subclasses never consult an engine.
 * Dispose is idempotent so a view teardown can call it twice.
 */
export abstract class Player {
  private disposed = false;

  /** Distinguishes the local seat from the Lichess account. */
  abstract readonly kind: 'local-human' | 'lichess-human';

  /** Display label. Not a secret. */
  abstract readonly label: string;

  /** @returns Whether {@link Player.dispose} has run. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Release resources. A second call does nothing. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onDispose();
  }

  /** Subclass cleanup. */
  protected abstract onDispose(): void;
}
