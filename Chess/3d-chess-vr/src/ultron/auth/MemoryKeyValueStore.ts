import type { IKeyValueStore } from '../contracts/ports';

/** In-memory store for tests and for a session that must not touch disk. */
export class MemoryKeyValueStore implements IKeyValueStore {
  private readonly values = new Map<string, string>();

  /**
   * @param key - Storage key.
   * @returns The value, or null.
   */
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  /**
   * @param key - Storage key.
   * @param value - Value to keep.
   */
  set(key: string, value: string): void {
    this.values.set(key, value);
  }

  /**
   * @param key - Storage key.
   */
  delete(key: string): void {
    this.values.delete(key);
  }
}
