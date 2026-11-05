import type { ISecureRandom } from '../contracts/ports';

/** `crypto.getRandomValues` random source for PKCE. */
export class WebCryptoRandom implements ISecureRandom {
  /**
   * @param length - Number of bytes.
   * @returns Cryptographic random bytes.
   */
  randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
}
