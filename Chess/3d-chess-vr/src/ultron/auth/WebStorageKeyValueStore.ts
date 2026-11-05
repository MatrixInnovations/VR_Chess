import type { IKeyValueStore } from '../contracts/ports';

/** Minimal Storage surface so tests do not need a browser. */
export interface StorageLike {
  /**
   * @param key - Storage key.
   */
  getItem(key: string): string | null;
  /**
   * @param key - Storage key.
   * @param value - Value.
   */
  setItem(key: string, value: string): void;
  /**
   * @param key - Storage key.
   */
  removeItem(key: string): void;
}

/**
 * Adapter over `sessionStorage` or `localStorage`.
 * The OAuth verifier belongs in session storage so a closed tab drops it.
 */
export class WebStorageKeyValueStore implements IKeyValueStore {
  /**
   * @param storage - Browser storage or a fake.
   */
  constructor(private readonly storage: StorageLike) {}

  /**
   * @param key - Storage key.
   * @returns The value, or null.
   */
  get(key: string): string | null {
    return this.storage.getItem(key);
  }

  /**
   * @param key - Storage key.
   * @param value - Value.
   */
  set(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  /**
   * @param key - Storage key.
   */
  delete(key: string): void {
    this.storage.removeItem(key);
  }
}
