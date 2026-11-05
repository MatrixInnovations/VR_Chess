import { describe, expect, it } from 'vitest';

import type { HttpRequest, HttpResponse, IHttpTransport } from '../contracts/http';
import type { IDiagnosticLog, ISecureRandom, ISha256 } from '../contracts/ports';
import { MemoryKeyValueStore } from './MemoryKeyValueStore';
import { OAuthPkceClient } from './OAuthPkceClient';
import { PkceChallenge } from './PkceChallenge';
import { WebCryptoRandom } from './WebCryptoRandom';
import { WebCryptoSha256 } from './WebCryptoSha256';
import { WebStorageKeyValueStore } from './WebStorageKeyValueStore';

const REDIRECT = 'http://localhost:3000/oauth/lichess';
const CLIENT_ID = 'vr-chess.example';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const TOKEN = 'lip_testtokenvalue';

class CaptureLog implements IDiagnosticLog {
  readonly lines: string[] = [];

  write(event: string, detail: string): void {
    this.lines.push(`${event} ${detail}`);
  }

  text(): string {
    return this.lines.join('\n');
  }
}

class ScriptedTransport implements IHttpTransport {
  readonly sent: HttpRequest[] = [];

  constructor(private readonly handler: (request: HttpRequest) => Promise<HttpResponse> | HttpResponse) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.sent.push(request);
    return this.handler(request);
  }
}

class FixedDigest implements ISha256 {
  async digest(): Promise<Uint8Array> {
    return new Uint8Array(32).fill(7);
  }
}

class FixedRandom implements ISecureRandom {
  private calls = 0;

  randomBytes(length: number): Uint8Array {
    this.calls += 1;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) bytes[index] = (index * 17 + length + this.calls) % 255;
    return bytes;
  }
}

function jsonResponse(status: number, body: unknown): HttpResponse {
  const text = JSON.stringify(body);
  return { status, headers: {}, body: null, text: async () => text };
}

function client(overrides?: {
  transport?: IHttpTransport;
  log?: CaptureLog;
  now?: () => number;
  random?: ISecureRandom;
  digest?: ISha256;
  store?: MemoryKeyValueStore;
}): { oauth: OAuthPkceClient; transport: ScriptedTransport; log: CaptureLog; store: MemoryKeyValueStore } {
  const log = overrides?.log ?? new CaptureLog();
  const store = overrides?.store ?? new MemoryKeyValueStore();
  const transport =
    overrides?.transport instanceof ScriptedTransport
      ? overrides.transport
      : new ScriptedTransport(async () => jsonResponse(400, { error: 'invalid_grant' }));
  const oauth = new OAuthPkceClient({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    scopes: ['board:play', 'challenge:read', 'challenge:write'],
    store,
    random: overrides?.random ?? new FixedRandom(),
    digest: overrides?.digest ?? new FixedDigest(),
    transport,
    log,
    now: overrides?.now ?? (() => 1_700_000_000_000),
  });
  return { oauth, transport, log, store };
}

describe('PkceChallenge', () => {
  it('matches the RFC 7636 S256 appendix vector', async () => {
    const challenge = await PkceChallenge.fromVerifier(VERIFIER, new WebCryptoSha256());
    expect(challenge.method).toBe('S256');
    expect(challenge.verifier).toBe(VERIFIER);
    expect(challenge.challenge).toBe(RFC_CHALLENGE);
  });

  it('generates a verifier in the RFC unreserved set and a distinct state', async () => {
    const generated = await PkceChallenge.generate(new WebCryptoRandom(), new WebCryptoSha256());
    expect(generated.pkce.verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(generated.state).toMatch(/^[A-Za-z0-9\-._~]{16,128}$/);
    expect(generated.state).not.toBe(generated.pkce.verifier);
    expect(generated.pkce.challenge).not.toBe(generated.pkce.verifier);
  });

  it('rejects a verifier outside the RFC length', async () => {
    await expect(PkceChallenge.fromVerifier('short', new WebCryptoSha256())).rejects.toThrow(/verifier/i);
  });
});

describe('OAuthPkceClient', () => {
  it('builds the official authorization URL without the verifier', async () => {
    const { oauth, store } = client();
    const request = await oauth.beginAuthorization();
    const url = new URL(request.url);
    const stored = JSON.parse(store.get('ultron.oauth.transaction') ?? '{}') as { verifier: string; state: string };
    expect(`${url.origin}${url.pathname}`).toBe('https://lichess.org/oauth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('scope')).toBe('board:play challenge:read challenge:write');
    expect(url.searchParams.get('state')).toBe(request.state);
    expect(url.searchParams.get('code_verifier')).toBeNull();
    expect(request.url).not.toContain(stored.verifier);
    expect(stored.state).toBe(request.state);
    expect(stored.verifier).not.toBe(stored.state);
  });

  it('replaces an unfinished transaction when authorization starts again', async () => {
    const { oauth, store } = client();
    await oauth.beginAuthorization();
    const first = store.get('ultron.oauth.transaction');
    await oauth.beginAuthorization();
    expect(store.get('ultron.oauth.transaction')).not.toBe(first);
  });

  it('does not exchange a token when state mismatches', async () => {
    const transport = new ScriptedTransport(async () =>
      jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 }),
    );
    const { oauth } = client({ transport });
    const request = await oauth.beginAuthorization();
    const result = await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}nope`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state-mismatch');
    expect(transport.sent).toHaveLength(0);
    expect(oauth.getAccessToken()).toBeNull();
  });

  it('does not exchange a token when the user denies access', async () => {
    const transport = new ScriptedTransport(async () =>
      jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 }),
    );
    const { oauth } = client({ transport });
    const request = await oauth.beginAuthorization();
    const result = await oauth.completeAuthorization(
      `${REDIRECT}?error=access_denied&state=${request.state}&error_description=no`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('authorization-denied');
    expect(transport.sent).toHaveLength(0);
  });

  it('does not exchange a token when the callback has a different error', async () => {
    const transport = new ScriptedTransport(async () => jsonResponse(200, {}));
    const { oauth } = client({ transport });
    const request = await oauth.beginAuthorization();
    const result = await oauth.completeAuthorization(`${REDIRECT}?error=server_error&state=${request.state}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('authorization-failed');
    expect(transport.sent).toHaveLength(0);
  });

  it('fails closed when the callback omits state or code', async () => {
    const transport = new ScriptedTransport(async () => jsonResponse(200, {}));
    const { oauth } = client({ transport });
    await oauth.beginAuthorization();
    const missingState = await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc`);
    expect(missingState.ok).toBe(false);
    if (!missingState.ok) expect(missingState.reason).toBe('state-missing');
    const second = await oauth.beginAuthorization();
    const missingCode = await oauth.completeAuthorization(`${REDIRECT}?state=${second.state}`);
    expect(missingCode.ok).toBe(false);
    if (!missingCode.ok) expect(missingCode.reason).toBe('code-missing');
    expect(transport.sent).toHaveLength(0);
  });

  it('rejects a code that does not match the published token alphabet', async () => {
    const transport = new ScriptedTransport(async () =>
      jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 }),
    );
    const { oauth } = client({ transport });
    const request = await oauth.beginAuthorization();
    const result = await oauth.completeAuthorization(`${REDIRECT}?code=bad%20code&state=${request.state}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-code');
    expect(transport.sent).toHaveLength(0);
  });

  it('rejects a callback whose origin or path is not the stored redirect', async () => {
    const transport = new ScriptedTransport(async () =>
      jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 }),
    );
    const { oauth } = client({ transport });
    const request = await oauth.beginAuthorization();
    const result = await oauth.completeAuthorization(
      `https://evil.example/oauth/lichess?code=liu_abc&state=${request.state}`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('redirect-mismatch');
    expect(transport.sent).toHaveLength(0);
  });

  it('fails when there is no stored transaction', async () => {
    const { oauth } = client();
    const result = await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=anything`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('transaction-missing');
  });

  it('exchanges the code once and keeps the verifier out of logs', async () => {
    const transport = new ScriptedTransport(async () =>
      jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 }),
    );
    const log = new CaptureLog();
    const { oauth, store } = client({ transport, log });
    const request = await oauth.beginAuthorization();
    const stored = JSON.parse(store.get('ultron.oauth.transaction') ?? '{}') as { verifier: string };
    const result = await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}`);
    expect(result.ok).toBe(true);
    expect(transport.sent).toHaveLength(1);
    const post = transport.sent[0];
    expect(post?.method).toBe('POST');
    expect(post?.url).toBe('https://lichess.org/api/token');
    expect(post?.headers.Authorization).toBeUndefined();
    expect(post?.body).toContain('grant_type=authorization_code');
    expect(post?.body).toContain('code=liu_abc');
    expect(post?.body).toContain(`code_verifier=${encodeURIComponent(stored.verifier)}`);
    expect(post?.body).toContain(`client_id=${encodeURIComponent(CLIENT_ID)}`);
    expect(post?.body).toContain(`redirect_uri=${encodeURIComponent(REDIRECT)}`);
    expect(oauth.getAccessToken()).toBe(TOKEN);
    expect(store.get('ultron.oauth.transaction')).toBeNull();
    expect(log.text()).not.toContain(TOKEN);
    expect(log.text()).not.toContain(stored.verifier);
    const replay = await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}`);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe('transaction-missing');
    expect(transport.sent).toHaveLength(1);
  });

  it('does not store a token when the token endpoint rejects the code', async () => {
    const transport = new ScriptedTransport(async () => jsonResponse(400, { error: 'invalid_grant' }));
    const { oauth, store } = client({ transport });
    const request = await oauth.beginAuthorization();
    const verifier = (JSON.parse(store.get('ultron.oauth.transaction') ?? '{}') as { verifier: string }).verifier;
    const result = await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('token-rejected');
      expect(result.message).not.toContain(verifier);
    }
    expect(oauth.getAccessToken()).toBeNull();
  });

  it('redacts the verifier when the token request fails on the network', async () => {
    const failing = new ScriptedTransport(async () => {
      throw new Error('network will be replaced');
    });
    const log = new CaptureLog();
    const { oauth, store } = client({ transport: failing, log });
    const started = await oauth.beginAuthorization();
    const storedVerifier = (JSON.parse(store.get('ultron.oauth.transaction') ?? '{}') as { verifier: string }).verifier;
    failing.sent.length = 0;
    const leaking = new ScriptedTransport(async () => {
      throw new Error(`network ${storedVerifier} ${TOKEN}`);
    });
    const second = client({ transport: leaking, log, store });
    const result = await second.oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${started.state}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('network');
      expect(result.message).not.toContain(storedVerifier);
      expect(result.message).not.toContain(TOKEN);
    }
    expect(leaking.sent).toHaveLength(1);
  });

  it('refuses a token body that is not the published shape', async () => {
    const transport = new ScriptedTransport(async () =>
      jsonResponse(200, { token_type: 'Bearer', access_token: 'bad token', expires_in: 10 }),
    );
    const { oauth } = client({ transport });
    const request = await oauth.beginAuthorization();
    const result = await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-token');
    expect(oauth.getAccessToken()).toBeNull();
  });

  it('hides an expired access token', async () => {
    let now = 1_700_000_000_000;
    const transport = new ScriptedTransport(async () =>
      jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 }),
    );
    const { oauth } = client({ transport, now: () => now });
    const request = await oauth.beginAuthorization();
    await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}`);
    expect(oauth.getAccessToken()).toBe(TOKEN);
    now += 3600 * 1000 + 1;
    expect(oauth.getAccessToken()).toBeNull();
  });

  it('revokes the bearer token without logging it', async () => {
    const log = new CaptureLog();
    const transport = new ScriptedTransport(async (request) => {
      if (request.method === 'DELETE') return { status: 204, headers: {}, body: null, text: async () => '' };
      return jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 });
    });
    const { oauth } = client({ transport, log });
    const request = await oauth.beginAuthorization();
    await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}`);
    const revoked = await oauth.revoke();
    expect(revoked.ok).toBe(true);
    const deletion = transport.sent.find((entry) => entry.method === 'DELETE');
    expect(deletion?.url).toBe('https://lichess.org/api/token');
    expect(deletion?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(oauth.getAccessToken()).toBeNull();
    expect(log.text()).not.toContain(TOKEN);
  });

  it('keeps the stored token when revocation fails', async () => {
    const transport = new ScriptedTransport(async (request) => {
      if (request.method === 'DELETE') return jsonResponse(500, { error: 'nope' });
      return jsonResponse(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 3600 });
    });
    const { oauth } = client({ transport });
    const request = await oauth.beginAuthorization();
    await oauth.completeAuthorization(`${REDIRECT}?code=liu_abc&state=${request.state}`);
    const revoked = await oauth.revoke();
    expect(revoked.ok).toBe(false);
    expect(oauth.getAccessToken()).toBe(TOKEN);
  });

  it('rejects an empty client id', () => {
    expect(
      () =>
        new OAuthPkceClient({
          clientId: ' ',
          redirectUri: REDIRECT,
          scopes: ['board:play'],
          store: new MemoryKeyValueStore(),
          random: new FixedRandom(),
          digest: new FixedDigest(),
          transport: new ScriptedTransport(async () => jsonResponse(200, {})),
        }),
    ).toThrow(/client/i);
  });
});

describe('key/value stores', () => {
  it('round-trips memory and web storage', () => {
    const memory = new MemoryKeyValueStore();
    memory.set('a', 'b');
    expect(memory.get('a')).toBe('b');
    expect(memory.get('missing')).toBeNull();
    memory.delete('a');
    expect(memory.get('a')).toBeNull();

    const backing = new Map<string, string>();
    const web = new WebStorageKeyValueStore({
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
      removeItem: (key: string) => void backing.delete(key),
    });
    web.set('t', '1');
    expect(web.get('t')).toBe('1');
    web.delete('t');
    expect(web.get('t')).toBeNull();
  });
});
