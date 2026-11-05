import type { ISleeper } from '../contracts/ports';

/** Production sleeper. Tests inject a fake so a 60 second 429 wait does not block the suite. */
export class TimerSleeper implements ISleeper {
  /**
   * @param ms - Delay. Zero resolves on the next timer turn.
   * @param signal - Abort signal. Already-aborted waits reject immediately.
   */
  sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/** @returns An Error whose name is AbortError. */
export function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

/** @param error - Thrown value. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
