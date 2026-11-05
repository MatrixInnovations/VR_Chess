export class Pkce {
  readonly verifier: string
  readonly challenge: string
  readonly state: string

  constructor(verifier: string, challenge: string, state: string) {
    this.verifier = verifier
    this.challenge = challenge
    this.state = state
  }

  static async create(): Promise<Pkce> {
    const verifier = Pkce.random(64)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    return new Pkce(verifier, Pkce.base64url(new Uint8Array(digest)), Pkce.random(16))
  }

  private static random(bytes: number): string {
    const buffer = new Uint8Array(bytes)
    crypto.getRandomValues(buffer)
    return Pkce.base64url(buffer)
  }

  private static base64url(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }
}
