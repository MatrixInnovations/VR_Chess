import type { ISecureRandom, ISha256 } from '../contracts/ports';

/**
 * PKCE S256 material. The verifier stays in storage until the callback.
 * It is never placed on the authorization URL. Lichess accepts only S256.
 */
export class PkceChallenge {
  private constructor(
    readonly verifier: string,
    readonly challenge: string,
    readonly method: 'S256',
  ) {}

  /**
   * @param verifier - RFC 7636 verifier, 43 to 128 unreserved characters.
   * @param digest - SHA-256 implementation.
   * @returns The S256 challenge for that verifier.
   */
  static async fromVerifier(verifier: string, digest: ISha256): Promise<PkceChallenge> {
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) {
      throw new Error('PKCE verifier must be 43-128 unreserved characters');
    }
    const hash = await digest.digest(new TextEncoder().encode(verifier));
    return new PkceChallenge(verifier, Base64Url.encode(hash), 'S256');
  }

  /**
   * @param random - CSPRNG.
   * @param digest - SHA-256 implementation.
   * @returns A new verifier, its challenge, and a separate OAuth state.
   */
  static async generate(random: ISecureRandom, digest: ISha256): Promise<{ pkce: PkceChallenge; state: string }> {
    const pkce = await PkceChallenge.fromVerifier(Base64Url.encode(random.randomBytes(32)), digest);
    const state = Base64Url.encode(random.randomBytes(16));
    return { pkce, state };
  }
}

/** Base64url without padding, as required by the PKCE RFC. */
export class Base64Url {
  /**
   * @param bytes - Raw bytes.
   * @returns Unpadded base64url.
   */
  static encode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}
