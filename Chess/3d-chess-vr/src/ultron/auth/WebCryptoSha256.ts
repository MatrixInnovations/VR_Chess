import type { ISha256 } from '../contracts/ports';

/** SHA-256 via Web Crypto. Available in current browsers and Node. */
export class WebCryptoSha256 implements ISha256 {
  /**
   * @param bytes - Message.
   * @returns The SHA-256 digest.
   */
  async digest(bytes: Uint8Array): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(digest);
  }
}
