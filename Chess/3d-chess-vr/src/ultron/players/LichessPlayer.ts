import type { ITokenSource } from '../contracts/ports';
import type { ILichessInbox, IOnlinePlayer } from '../contracts/IOnlinePlayer';
import type { ChallengeRequest, DeclineReason, SeekRequest } from '../lichess/apiTypes';
import { LichessClient } from '../lichess/LichessClient';
import { TransportResult } from '../lichess/TransportResult';
import { Player } from './Player';

/**
 * The seated human's Lichess account.
 * Opens `GET /api/stream/event` before any seek, as the Board API manual requires.
 * Dispose aborts streams and does not post a move.
 */
export class LichessPlayer extends Player implements IOnlinePlayer {
  readonly kind = 'lichess-human' as const;
  private inbox: ILichessInbox | null = null;
  private events: AbortController | null = null;
  private seekAbort: AbortController | null = null;
  private gameAbort: AbortController | null = null;
  private activeGameId: string | null = null;
  private starting: Promise<TransportResult> | null = null;
  private accountLabel = 'Lichess';

  /**
   * @param client - Board API client.
   * @param tokens - Current access token.
   */
  constructor(private readonly client: LichessClient, private readonly tokens: ITokenSource) {
    super();
  }

  /** @returns The Lichess username once known, otherwise a placeholder. */
  get label(): string {
    return this.accountLabel;
  }

  /**
   * @param inbox - Session that receives authoritative events.
   */
  bindInbox(inbox: ILichessInbox): void {
    this.inbox = inbox;
  }

  /**
   * @param signal - Abort signal for the account read and the event stream.
   */
  start(signal: AbortSignal): Promise<TransportResult> {
    return this.ensureStarted(signal);
  }

  /**
   * @param gameId - Game id.
   * @param uci - Move already accepted by the session.
   * @param signal - Abort signal.
   */
  playMove(gameId: string, uci: string, signal: AbortSignal): Promise<TransportResult> {
    const token = this.tokens.getAccessToken();
    if (!token) return Promise.resolve(TransportResult.fail('unauthorized', 'No access token'));
    return this.client.playMove(token, gameId, uci, signal);
  }

  /**
   * @param request - Seek. Real-time seeks stay open until the signal aborts or Lichess closes them.
   * @param signal - Abort signal. This cancels the seek.
   */
  async seek(request: SeekRequest, signal: AbortSignal): Promise<TransportResult> {
    const ready = await this.ensureStarted(signal);
    if (!ready.ok) return ready;
    const token = this.tokens.getAccessToken();
    if (!token) return TransportResult.fail('unauthorized', 'No access token');
    this.seekAbort = new AbortController();
    const onAbort = (): void => this.seekAbort?.abort();
    if (signal.aborted) this.seekAbort.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.client.createSeek(token, request, this.seekAbort.signal);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  /** Close the seek connection. */
  cancelSeek(): void {
    this.seekAbort?.abort();
  }

  /**
   * @param username - Opponent.
   * @param request - Challenge parameters.
   * @param signal - Abort signal.
   */
  async challenge(username: string, request: ChallengeRequest, signal: AbortSignal): Promise<TransportResult> {
    const ready = await this.ensureStarted(signal);
    if (!ready.ok) return ready;
    const token = this.tokens.getAccessToken();
    if (!token) return TransportResult.fail('unauthorized', 'No access token');
    return this.client.createChallenge(token, username, request, signal);
  }

  /**
   * @param challengeId - Challenge id.
   * @param signal - Abort signal.
   */
  acceptChallenge(challengeId: string, signal: AbortSignal): Promise<TransportResult> {
    const token = this.tokens.getAccessToken();
    if (!token) return Promise.resolve(TransportResult.fail('unauthorized', 'No access token'));
    return this.client.acceptChallenge(token, challengeId, signal);
  }

  /**
   * @param challengeId - Challenge id.
   * @param reason - Decline reason.
   * @param signal - Abort signal.
   */
  declineChallenge(challengeId: string, reason: DeclineReason, signal: AbortSignal): Promise<TransportResult> {
    const token = this.tokens.getAccessToken();
    if (!token) return Promise.resolve(TransportResult.fail('unauthorized', 'No access token'));
    return this.client.declineChallenge(token, challengeId, reason, signal);
  }

  /**
   * @param gameId - Game id.
   * @param signal - Abort signal.
   */
  resign(gameId: string, signal: AbortSignal): Promise<TransportResult> {
    const token = this.tokens.getAccessToken();
    if (!token) return Promise.resolve(TransportResult.fail('unauthorized', 'No access token'));
    return this.client.resign(token, gameId, signal);
  }

  /**
   * @param gameId - Game id.
   * @param signal - Abort signal.
   */
  abortGame(gameId: string, signal: AbortSignal): Promise<TransportResult> {
    const token = this.tokens.getAccessToken();
    if (!token) return Promise.resolve(TransportResult.fail('unauthorized', 'No access token'));
    return this.client.abortGame(token, gameId, signal);
  }

  /** Abort the event stream, the seek, and the game stream. */
  protected onDispose(): void {
    this.events?.abort();
    this.seekAbort?.abort();
    this.gameAbort?.abort();
    this.inbox = null;
  }

  private ensureStarted(signal: AbortSignal): Promise<TransportResult> {
    if (this.isDisposed) return Promise.resolve(TransportResult.fail('cancelled', 'Player is disposed'));
    if (!this.tokens.getAccessToken()) return Promise.resolve(TransportResult.fail('unauthorized', 'No access token'));
    if (this.starting) return this.starting;
    this.starting = this.openEvents(signal);
    return this.starting;
  }

  private async openEvents(signal: AbortSignal): Promise<TransportResult> {
    const token = this.tokens.getAccessToken();
    if (!token) return TransportResult.fail('unauthorized', 'No access token');
    const account = await this.client.getAccount(token, signal);
    if (!account.ok) {
      this.inbox?.onStreamFault({
        code: account.result.code === 'unauthorized' ? 'unauthorized' : 'http',
        message: account.result.message,
        httpStatus: account.result.httpStatus,
      });
      return account.result;
    }
    this.accountLabel = account.username;
    this.inbox?.onAccount(account.username, account.id);
    this.events = new AbortController();
    if (signal.aborted) this.events.abort();
    else signal.addEventListener('abort', () => this.events?.abort(), { once: true });
    const opened = this.client.openEventStream(token, this.events.signal, {
      onEvent: (event) => {
        this.inbox?.onIncoming(event);
        if (event.type === 'gameStart') this.watchGame(token, event.gameId);
      },
      onFault: (fault) => this.inbox?.onStreamFault(fault),
    });
    return opened.ready;
  }

  private watchGame(token: string, gameId: string): void {
    if (this.activeGameId === gameId) return;
    this.activeGameId = gameId;
    this.gameAbort?.abort();
    this.gameAbort = new AbortController();
    this.client.openGameStream(token, gameId, this.gameAbort.signal, {
      onEvent: (event) => this.inbox?.onBoardEvent(event),
      onFault: (fault) => this.inbox?.onStreamFault(fault),
    });
  }
}
