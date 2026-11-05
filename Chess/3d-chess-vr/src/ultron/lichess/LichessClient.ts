import type { IHttpTransport, HttpRequest, HttpResponse } from '../contracts/http';
import type { IDiagnosticLog, IRetrySchedule, ISleeper } from '../contracts/ports';
import type {
  AccountResult,
  BoardGameEvent,
  ChallengeRequest,
  DeclineReason,
  IncomingEvent,
  SeekRequest,
  StreamFault,
  StreamListener,
} from './apiTypes';
import { BoardEventParser, GameStatuses } from './BoardEventParser';
import { BoardTimeControl } from './BoardTimeControl';
import { NdjsonStreamDecoder } from './NdjsonStreamDecoder';
import { StreamRetrySchedule } from './StreamRetrySchedule';
import { isAbortError } from './TimerSleeper';
import { TransportResult } from './TransportResult';
import type { GameStatusName } from '../contracts/types';

const ORIGIN = 'https://lichess.org';
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Dependencies for {@link LichessClient}. */
export interface LichessClientOptions {
  readonly transport: IHttpTransport;
  readonly sleeper: ISleeper;
  readonly schedule?: IRetrySchedule;
  readonly log?: IDiagnosticLog;
  /** Safety cap on extra GET attempts after the first. Not a Lichess-published number. */
  readonly maxStreamResumes?: number;
}

interface StreamHandle<T> {
  readonly ready: Promise<TransportResult>;
  readonly completed: Promise<void>;
  readonly listener: StreamListener<T>;
}

/**
 * Official Lichess Board API client for human accounts.
 * Moves and seeks are posted once. Dropped GET streams may resume.
 * Tokens are sent on the Authorization header and stripped from error text.
 */
export class LichessClient {
  private readonly transport: IHttpTransport;
  private readonly sleeper: ISleeper;
  private readonly schedule: IRetrySchedule;
  private readonly log: IDiagnosticLog;
  private readonly maxStreamResumes: number;
  private readonly parser = new BoardEventParser();

  /**
   * @param options - Transport, sleeper, and optional resume cap.
   */
  constructor(options: LichessClientOptions) {
    this.transport = options.transport;
    this.sleeper = options.sleeper;
    this.schedule = options.schedule ?? new StreamRetrySchedule();
    this.log = options.log ?? { write: () => undefined };
    this.maxStreamResumes = options.maxStreamResumes ?? 50;
  }

  /**
   * `POST /api/board/game/{gameId}/move/{move}`.
   * A network error, 429, or abort is returned once and not retried.
   * @param token - Bearer token.
   * @param gameId - Lichess game id.
   * @param uci - Lower-case UCI move.
   * @param signal - Abort signal. Aborting does not send a second move.
   * @param offeringDraw - When true, adds the official `offeringDraw` query.
   */
  async playMove(
    token: string,
    gameId: string,
    uci: string,
    signal: AbortSignal,
    offeringDraw = false,
  ): Promise<TransportResult> {
    if (!UCI.test(uci)) return TransportResult.fail('invalid', 'Move must be lowercase UCI');
    const suffix = offeringDraw ? '?offeringDraw=true' : '';
    const url = `${ORIGIN}/api/board/game/${encodeURIComponent(gameId)}/move/${uci}${suffix}`;
    return this.postOnce(token, url, undefined, signal);
  }

  /**
   * `POST /api/board/seek`. Closing the signal cancels the seek because Lichess
   * cancels a real-time seek when the client drops the connection.
   * @param token - Bearer token.
   * @param seek - Clock and color.
   * @param signal - Abort signal.
   */
  async createSeek(token: string, seek: SeekRequest, signal: AbortSignal): Promise<TransportResult> {
    const issue = BoardTimeControl.validateSeek(seek);
    if (issue) return TransportResult.fail('invalid', issue);
    const url = `${ORIGIN}/api/board/seek`;
    return this.postStreamOnce(token, url, this.seekBody(seek), signal);
  }

  /**
   * `POST /api/challenge/{username}`.
   * @param token - Bearer token.
   * @param username - Opponent username.
   * @param challenge - Clock in seconds, or correspondence days.
   * @param signal - Abort signal.
   */
  async createChallenge(
    token: string,
    username: string,
    challenge: ChallengeRequest,
    signal: AbortSignal,
  ): Promise<TransportResult> {
    const issue = BoardTimeControl.validateChallenge(challenge);
    if (issue) return TransportResult.fail('invalid', issue);
    const url = `${ORIGIN}/api/challenge/${encodeURIComponent(username)}`;
    return this.postOnce(token, url, this.challengeBody(challenge), signal);
  }

  /**
   * `POST /api/challenge/{challengeId}/accept`.
   * @param token - Bearer token.
   * @param challengeId - Challenge id.
   * @param signal - Abort signal.
   */
  async acceptChallenge(token: string, challengeId: string, signal: AbortSignal): Promise<TransportResult> {
    return this.postOnce(token, `${ORIGIN}/api/challenge/${encodeURIComponent(challengeId)}/accept`, undefined, signal);
  }

  /**
   * `POST /api/challenge/{challengeId}/decline`.
   * @param token - Bearer token.
   * @param challengeId - Challenge id.
   * @param reason - Official decline reason.
   * @param signal - Abort signal.
   */
  async declineChallenge(
    token: string,
    challengeId: string,
    reason: DeclineReason,
    signal: AbortSignal,
  ): Promise<TransportResult> {
    const body = new URLSearchParams({ reason }).toString();
    return this.postOnce(token, `${ORIGIN}/api/challenge/${encodeURIComponent(challengeId)}/decline`, body, signal);
  }

  /**
   * `POST /api/board/game/{gameId}/resign`.
   * @param token - Bearer token.
   * @param gameId - Game id.
   * @param signal - Abort signal.
   */
  async resign(token: string, gameId: string, signal: AbortSignal): Promise<TransportResult> {
    return this.postOnce(token, `${ORIGIN}/api/board/game/${encodeURIComponent(gameId)}/resign`, undefined, signal);
  }

  /**
   * `POST /api/board/game/{gameId}/abort`.
   * @param token - Bearer token.
   * @param gameId - Game id.
   * @param signal - Abort signal.
   */
  async abortGame(token: string, gameId: string, signal: AbortSignal): Promise<TransportResult> {
    return this.postOnce(token, `${ORIGIN}/api/board/game/${encodeURIComponent(gameId)}/abort`, undefined, signal);
  }

  /**
   * `GET /api/account`.
   * @param token - Bearer token.
   * @param signal - Abort signal.
   */
  async getAccount(token: string, signal: AbortSignal): Promise<AccountResult> {
    const result = await this.request(token, 'GET', `${ORIGIN}/api/account`, undefined, signal, false);
    if (!result.ok) return { ok: false, result: result.error };
    try {
      const body = JSON.parse(result.text) as { id?: unknown; username?: unknown };
      if (typeof body.id !== 'string' || typeof body.username !== 'string') {
        return { ok: false, result: TransportResult.fail('invalid', 'Account payload was incomplete', result.status) };
      }
      return { ok: true, id: body.id, username: body.username };
    } catch {
      return { ok: false, result: TransportResult.fail('invalid', 'Account payload was not JSON', result.status) };
    }
  }

  /**
   * `GET /api/stream/event`. Resolve `ready` once the first HTTP status is known
   * so a seek can be opened only after the event stream exists.
   * @param token - Bearer token.
   * @param signal - Abort signal. Aborting does not post a move.
   * @param listener - Incoming events and faults.
   */
  openEventStream(token: string, signal: AbortSignal, listener: StreamListener<IncomingEvent>): {
    ready: Promise<TransportResult>;
    completed: Promise<void>;
  } {
    return this.openStream(token, `${ORIGIN}/api/stream/event`, signal, listener, 'incoming');
  }

  /**
   * `GET /api/board/game/stream/{gameId}`.
   * Reconnects after a dropped connection until the game is terminal, the caller
   * aborts, or the resume cap is hit. 401 and 404 stop immediately.
   * @param token - Bearer token.
   * @param gameId - Game id.
   * @param signal - Abort signal.
   * @param listener - Board events and faults.
   */
  openGameStream(token: string, gameId: string, signal: AbortSignal, listener: StreamListener<BoardGameEvent>): {
    ready: Promise<TransportResult>;
    completed: Promise<void>;
  } {
    const url = `${ORIGIN}/api/board/game/stream/${encodeURIComponent(gameId)}`;
    return this.openStream(token, url, signal, listener, 'board');
  }

  private openStream<T>(
    token: string,
    url: string,
    signal: AbortSignal,
    listener: StreamListener<T>,
    kind: 'board' | 'incoming',
  ): { ready: Promise<TransportResult>; completed: Promise<void> } {
    let resolveReady: (result: TransportResult) => void = () => undefined;
    const ready = new Promise<TransportResult>((resolve) => {
      resolveReady = resolve;
    });
    const handle: StreamHandle<T> = { ready, completed: Promise.resolve(), listener };
    const completed = this.runStream(token, url, signal, handle, kind, resolveReady);
    return { ready, completed };
  }

  private async runStream<T>(
    token: string,
    url: string,
    signal: AbortSignal,
    handle: StreamHandle<T>,
    kind: 'board' | 'incoming',
    resolveReady: (result: TransportResult) => void,
  ): Promise<void> {
    let resumes = 0;
    let readySettled = false;
    let terminal = false;
    const settle = (result: TransportResult): void => {
      if (readySettled) return;
      readySettled = true;
      resolveReady(result);
    };
    while (!signal.aborted) {
      let response: HttpResponse;
      try {
        response = await this.transport.send(this.build(token, 'GET', url, undefined, signal, true));
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          settle(TransportResult.fail('cancelled', 'Stream aborted'));
          return;
        }
        if (!this.canResume(resumes)) {
          this.fault(handle, { code: 'reconnect-exhausted', message: 'Stopped resuming the stream' });
          settle(TransportResult.fail('network', 'Stream failed'));
          return;
        }
        resumes += 1;
        await this.sleep(this.schedule.delayFor('network', resumes - 1), signal);
        continue;
      }
      if (response.status === 401) {
        this.fault(handle, { code: 'unauthorized', message: 'Lichess rejected the token', httpStatus: 401 });
        settle(TransportResult.fail('unauthorized', 'Unauthorized', 401));
        return;
      }
      if (response.status === 404) {
        this.fault(handle, { code: 'not-found', message: 'Game stream was not found', httpStatus: 404 });
        settle(TransportResult.fail('not-found', 'Not found', 404));
        return;
      }
      if (response.status === 429) {
        if (!this.canResume(resumes)) {
          this.fault(handle, { code: 'reconnect-exhausted', message: 'Rate limited', httpStatus: 429 });
          settle(TransportResult.fail('rate-limited', 'Rate limited', 429));
          return;
        }
        resumes += 1;
        await this.sleep(this.schedule.delayFor('rate-limited', resumes - 1, this.retryAfterMs(response)), signal);
        continue;
      }
      if (response.status !== 200) {
        if (!this.canResume(resumes)) {
          this.fault(handle, { code: 'http', message: 'Stream request failed', httpStatus: response.status });
          settle(TransportResult.fail('http', 'Stream request failed', response.status));
          return;
        }
        resumes += 1;
        await this.sleep(this.schedule.delayFor('server', resumes - 1), signal);
        continue;
      }
      settle(TransportResult.ok());
      try {
        terminal = await this.readStream(response, signal, handle, kind, terminal);
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return;
        if (terminal) return;
        if (!this.canResume(resumes)) {
          this.fault(handle, { code: 'reconnect-exhausted', message: 'Stopped resuming the stream' });
          return;
        }
        resumes += 1;
        await this.sleep(this.schedule.delayFor('network', resumes - 1), signal);
        continue;
      }
      if (terminal || signal.aborted) return;
      if (!this.canResume(resumes)) {
        this.fault(handle, { code: 'reconnect-exhausted', message: 'Stream ended before the game finished' });
        return;
      }
      resumes += 1;
      await this.sleep(this.schedule.delayFor('network', resumes - 1), signal);
    }
    settle(TransportResult.fail('cancelled', 'Stream aborted'));
  }

  private canResume(resumes: number): boolean {
    return resumes < this.maxStreamResumes;
  }

  private async readStream<T>(
    response: HttpResponse,
    signal: AbortSignal,
    handle: StreamHandle<T>,
    kind: 'board' | 'incoming',
    alreadyTerminal: boolean,
  ): Promise<boolean> {
    let terminal = alreadyTerminal;
    const decoder = new NdjsonStreamDecoder();
    const deliver = (batch: { values: readonly unknown[]; errors: readonly string[] }): void => {
      for (const message of batch.errors) {
        this.fault(handle, { code: 'malformed', message });
      }
      for (const value of batch.values) {
        const parsed = this.parser.parse(value);
        if (parsed.kind === 'invalid') {
          this.fault(handle, { code: 'malformed', message: 'Unrecognized stream event' });
          continue;
        }
        if (parsed.kind === 'ignore') continue;
        if (kind === 'board' && parsed.kind === 'board') {
          terminal = terminal || this.isTerminalBoard(parsed.event);
          handle.listener.onEvent(parsed.event as T);
        } else if (kind === 'incoming' && parsed.kind === 'incoming') {
          handle.listener.onEvent(parsed.event as T);
        }
      }
    };
    if (!response.body) return terminal;
    const reading = (async (): Promise<void> => {
      for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        if (signal.aborted) throw abortFromSignal();
        deliver(decoder.push(chunk));
      }
      deliver(decoder.end());
    })();
    await Promise.race([reading, this.abortPromise(signal)]);
    if (signal.aborted) throw abortFromSignal();
    return terminal;
  }

  private isTerminalBoard(event: BoardGameEvent): boolean {
    if (event.type === 'gameState' || event.type === 'gameFull') {
      return GameStatuses.isTerminal(event.state.status as GameStatusName);
    }
    return false;
  }

  private async postOnce(token: string, url: string, body: string | undefined, signal: AbortSignal): Promise<TransportResult> {
    const outcome = await this.request(token, 'POST', url, body, signal, false);
    if (!outcome.ok) return outcome.error;
    return this.interpretJson(outcome.status, outcome.text);
  }

  private async postStreamOnce(token: string, url: string, body: string, signal: AbortSignal): Promise<TransportResult> {
    const outcome = await this.request(token, 'POST', url, body, signal, true);
    if (!outcome.ok) return outcome.error;
    if (outcome.response.body) {
      await Promise.race([this.drain(outcome.response.body, signal), this.abortPromise(signal)]);
    }
    if (signal.aborted) return TransportResult.fail('cancelled', 'Seek cancelled');
    return TransportResult.ok();
  }

  private async request(
    token: string,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body: string | undefined,
    signal: AbortSignal,
    stream: boolean,
  ): Promise<{ ok: true; status: number; text: string; response: HttpResponse } | { ok: false; error: TransportResult }> {
    try {
      const response = await this.transport.send(this.build(token, method, url, body, signal, stream));
      const mapped = this.mapStatus(response.status);
      if (mapped) return { ok: false, error: mapped };
      const text = stream ? '' : await response.text();
      return { ok: true, status: response.status, text, response };
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return { ok: false, error: TransportResult.fail('cancelled', 'Request cancelled') };
      const raw = error instanceof Error ? error.message : 'network';
      return { ok: false, error: TransportResult.fail('network', this.redact(raw, token)) };
    }
  }

  private mapStatus(status: number): TransportResult | null {
    if (status === 200 || status === 204) return null;
    if (status === 400) return TransportResult.fail('rejected', 'Lichess rejected the request', 400);
    if (status === 401) return TransportResult.fail('unauthorized', 'Unauthorized', 401);
    if (status === 404) return TransportResult.fail('not-found', 'Not found', 404);
    if (status === 429) return TransportResult.fail('rate-limited', 'Rate limited', 429);
    return TransportResult.fail('http', 'Unexpected HTTP status', status);
  }

  private interpretJson(status: number, text: string): TransportResult {
    if (!text) return TransportResult.ok();
    try {
      const body = JSON.parse(text) as { ok?: unknown };
      if (body.ok === false) return TransportResult.fail('rejected', 'Lichess rejected the move', status);
    } catch {
      return TransportResult.ok();
    }
    return TransportResult.ok();
  }

  private build(
    token: string,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body: string | undefined,
    signal: AbortSignal,
    stream: boolean,
  ): HttpRequest {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: stream ? 'application/x-ndjson' : 'application/json',
      'User-Agent': 'vr-chess-board/0.1',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    this.log.write('lichess.request', `${method} ${url.split('?')[0]}`);
    return { method, url, headers, body, signal };
  }

  private seekBody(seek: SeekRequest): string {
    const fields = new URLSearchParams();
    fields.set('rated', String(seek.rated ?? false));
    fields.set('variant', seek.variant ?? 'standard');
    if (seek.kind === 'realtime') {
      fields.set('time', String(seek.timeMinutes));
      fields.set('increment', String(seek.incrementSeconds));
    } else {
      fields.set('days', String(seek.days));
    }
    if (seek.color && seek.color !== 'random') fields.set('color', seek.color);
    if (seek.ratingRange) fields.set('ratingRange', seek.ratingRange);
    return fields.toString();
  }

  private challengeBody(challenge: ChallengeRequest): string {
    const fields = new URLSearchParams();
    fields.set('rated', String(challenge.rated ?? false));
    fields.set('variant', challenge.variant ?? 'standard');
    if (challenge.kind === 'realtime') {
      fields.set('clock.limit', String(challenge.limitSeconds));
      fields.set('clock.increment', String(challenge.incrementSeconds));
    } else {
      fields.set('days', String(challenge.days));
    }
    if (challenge.color && challenge.color !== 'random') fields.set('color', challenge.color);
    return fields.toString();
  }

  private retryAfterMs(response: HttpResponse): number | undefined {
    const header = response.headers['retry-after'] ?? response.headers['Retry-After'];
    if (!header || !/^\d+$/.test(header)) return undefined;
    return Number(header) * 1000;
  }

  private redact(message: string, secret: string): string {
    if (secret.length < 8) return 'request failed';
    return message.split(secret).join('[redacted]');
  }

  private fault<T>(handle: StreamHandle<T>, fault: StreamFault): void {
    handle.listener.onFault(fault);
  }

  private async drain(body: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<void> {
    for await (const _chunk of body) {
      if (signal.aborted) return;
    }
  }

  private async sleep(ms: number, signal: AbortSignal): Promise<void> {
    try {
      await this.sleeper.sleep(ms, signal);
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return;
      throw error;
    }
  }

  private abortPromise(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }
}

function abortFromSignal(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}
