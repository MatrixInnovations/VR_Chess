import type { IHttpTransport } from '../contracts/http';
import type { IDiagnosticLog, IKeyValueStore, ISecureRandom, ISha256, ITokenSource } from '../contracts/ports';
import { PkceChallenge } from './PkceChallenge';

const ORIGIN = 'https://lichess.org';
const TRANSACTION_KEY = 'ultron.oauth.transaction';
const TOKEN_KEY = 'ultron.oauth.token';
const TOKEN_PATTERN = /^[A-Za-z0-9_]+$/;

/** Options for {@link OAuthPkceClient}. There is no client secret; Lichess public PKCE forbids one. */
export interface OAuthPkceOptions {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly store: IKeyValueStore;
  readonly random: ISecureRandom;
  readonly digest: ISha256;
  readonly transport: IHttpTransport;
  readonly log?: IDiagnosticLog;
  readonly now?: () => number;
}

/** Browser redirect that starts the authorization code flow. */
export interface AuthorizationRequest {
  readonly url: string;
  readonly state: string;
}

/** Why a callback did not become an access token. */
export type TokenFailureReason =
  | 'state-mismatch'
  | 'state-missing'
  | 'code-missing'
  | 'authorization-denied'
  | 'authorization-failed'
  | 'transaction-missing'
  | 'redirect-mismatch'
  | 'invalid-code'
  | 'token-rejected'
  | 'invalid-token'
  | 'network';

/** Result of the token exchange. The access token itself is not returned to logs. */
export type TokenExchangeResult = { ok: true } | { ok: false; reason: TokenFailureReason; message: string };

interface StoredTransaction {
  verifier: string;
  state: string;
  redirectUri: string;
  clientId: string;
}

interface StoredToken {
  accessToken: string;
  tokenType: string;
  expiresAtMs: number;
}

/**
 * Authorization Code + PKCE client for Lichess.
 * State is checked before the token endpoint is called. The verifier is deleted
 * once a callback is consumed so it cannot be replayed. Tokens are not written to the log.
 */
export class OAuthPkceClient implements ITokenSource {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly scopes: readonly string[];
  private readonly store: IKeyValueStore;
  private readonly random: ISecureRandom;
  private readonly digest: ISha256;
  private readonly transport: IHttpTransport;
  private readonly log: IDiagnosticLog;
  private readonly now: () => number;

  /**
   * @param options - Public client id, redirect URI, and injected ports.
   */
  constructor(options: OAuthPkceOptions) {
    this.clientId = options.clientId.trim();
    if (!this.clientId) throw new Error('OAuth client id is required');
    this.redirectUri = options.redirectUri;
    this.scopes = options.scopes;
    this.store = options.store;
    this.random = options.random;
    this.digest = options.digest;
    this.transport = options.transport;
    this.log = options.log ?? { write: () => undefined };
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Start login. Stores the verifier and state, then returns the Lichess authorize URL.
   * @returns The URL the browser should open and the state to expect on the way back.
   */
  async beginAuthorization(): Promise<AuthorizationRequest> {
    const generated = await PkceChallenge.generate(this.random, this.digest);
    const transaction: StoredTransaction = {
      verifier: generated.pkce.verifier,
      state: generated.state,
      redirectUri: this.redirectUri,
      clientId: this.clientId,
    };
    this.store.set(TRANSACTION_KEY, JSON.stringify(transaction));
    const url = new URL(`${ORIGIN}/oauth`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('code_challenge_method', generated.pkce.method);
    url.searchParams.set('code_challenge', generated.pkce.challenge);
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', generated.state);
    this.log.write('oauth.begin', 'authorization url created');
    return { url: url.toString(), state: generated.state };
  }

  /**
   * Finish login from the redirect URL. Failures do not call the token endpoint
   * except for an actual code exchange.
   * @param callback - Absolute redirect URL including the query string.
   */
  async completeAuthorization(callback: string): Promise<TokenExchangeResult> {
    const transaction = this.readTransaction();
    if (!transaction) return this.fail('transaction-missing', 'No authorization is in progress');
    let url: URL;
    try {
      url = new URL(callback);
    } catch {
      this.store.delete(TRANSACTION_KEY);
      return this.fail('authorization-failed', 'Callback URL was not absolute');
    }
    this.store.delete(TRANSACTION_KEY);
    const expected = new URL(transaction.redirectUri);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname) {
      return this.fail('redirect-mismatch', 'Callback did not match the stored redirect URI');
    }
    const error = url.searchParams.get('error');
    if (error === 'access_denied') return this.fail('authorization-denied', 'The user denied authorization');
    if (error) return this.fail('authorization-failed', 'Authorization failed');
    const state = url.searchParams.get('state');
    if (!state) return this.fail('state-missing', 'Callback did not include state');
    if (state !== transaction.state) return this.fail('state-mismatch', 'OAuth state did not match');
    const code = url.searchParams.get('code');
    if (!code) return this.fail('code-missing', 'Callback did not include an authorization code');
    if (!TOKEN_PATTERN.test(code)) return this.fail('invalid-code', 'Authorization code did not match the published alphabet');
    return this.exchange(transaction, code);
  }

  /**
   * @returns The current access token, or null if it is missing or expired.
   */
  getAccessToken(): string | null {
    const stored = this.readToken();
    if (!stored) return null;
    if (this.now() >= stored.expiresAtMs) return null;
    return stored.accessToken;
  }

  /**
   * `DELETE /api/token`. The token is removed locally only after Lichess returns 204.
   */
  async revoke(): Promise<{ ok: boolean; message: string }> {
    const stored = this.readToken();
    if (!stored) return { ok: false, message: 'No token is stored' };
    try {
      const response = await this.transport.send({
        method: 'DELETE',
        url: `${ORIGIN}/api/token`,
        headers: { Authorization: `Bearer ${stored.accessToken}`, Accept: 'application/json' },
        signal: new AbortController().signal,
      });
      if (response.status !== 204) return { ok: false, message: 'Revocation was rejected' };
      this.store.delete(TOKEN_KEY);
      this.log.write('oauth.revoke', 'token revoked');
      return { ok: true, message: 'revoked' };
    } catch {
      return { ok: false, message: 'Revocation failed' };
    }
  }

  /** Drop the local token without calling Lichess. */
  forget(): void {
    this.store.delete(TOKEN_KEY);
  }

  private async exchange(transaction: StoredTransaction, code: string): Promise<TokenExchangeResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: transaction.verifier,
      redirect_uri: transaction.redirectUri,
      client_id: transaction.clientId,
    });
    try {
      const response = await this.transport.send({
        method: 'POST',
        url: `${ORIGIN}/api/token`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
        signal: new AbortController().signal,
      });
      const text = await response.text();
      if (response.status !== 200) {
        return this.fail('token-rejected', 'Token endpoint rejected the authorization code');
      }
      const parsed = JSON.parse(text) as { token_type?: unknown; access_token?: unknown; expires_in?: unknown };
      if (typeof parsed.access_token !== 'string' || !TOKEN_PATTERN.test(parsed.access_token)) {
        return this.fail('invalid-token', 'Token response did not contain a usable access token');
      }
      if (parsed.token_type !== 'Bearer' || typeof parsed.expires_in !== 'number') {
        return this.fail('invalid-token', 'Token response did not match the published shape');
      }
      const stored: StoredToken = {
        accessToken: parsed.access_token,
        tokenType: 'Bearer',
        expiresAtMs: this.now() + parsed.expires_in * 1000,
      };
      this.store.set(TOKEN_KEY, JSON.stringify(stored));
      this.log.write('oauth.authorized', 'access token stored');
      return { ok: true };
    } catch {
      return this.fail('network', 'Token request failed');
    }
  }

  private fail(reason: TokenFailureReason, message: string): TokenExchangeResult {
    this.log.write('oauth.fail', reason);
    return { ok: false, reason, message };
  }

  private readTransaction(): StoredTransaction | null {
    const raw = this.store.get(TRANSACTION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredTransaction;
      if (typeof parsed.verifier !== 'string' || typeof parsed.state !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private readToken(): StoredToken | null {
    const raw = this.store.get(TOKEN_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredToken;
      if (typeof parsed.accessToken !== 'string' || typeof parsed.expiresAtMs !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
