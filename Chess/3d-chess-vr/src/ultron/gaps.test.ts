import { describe, expect, it } from 'vitest';

import type { HttpRequest, HttpResponse, IHttpTransport } from './contracts/http';
import type { ISleeper, ITokenSource } from './contracts/ports';
import { BoardEventParser } from './lichess/BoardEventParser';
import { LichessClient } from './lichess/LichessClient';
import { TimerSleeper } from './lichess/TimerSleeper';
import { TransportResult } from './lichess/TransportResult';
import { LichessPlayer } from './players/LichessPlayer';
import { LocalPlayer } from './players/LocalPlayer';
import { ChessJsRules } from './rules/ChessJsRules';
import { GameSession, GameSessionHost } from './session/GameSession';
import { SequentialIds } from './session/SequentialIds';
import type { ILichessInbox, IOnlinePlayer } from './contracts/IOnlinePlayer';
import type { SeekRequest } from './lichess/apiTypes';

class ManualSleeper implements ISleeper {
  async sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    await Promise.resolve(ms);
  }
}

class MockTransport implements IHttpTransport {
  readonly sent: HttpRequest[] = [];
  handlers: Array<(request: HttpRequest) => Promise<HttpResponse> | HttpResponse> = [];

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.sent.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error(`unexpected ${request.url}`);
    return handler(request);
  }
}

function json(status: number, body: unknown): HttpResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, headers: {}, body: null, text: async () => text };
}

class Token implements ITokenSource {
  constructor(private value: string | null) {}
  getAccessToken(): string | null {
    return this.value;
  }
}

class FakePlayer implements IOnlinePlayer {
  inbox: ILichessInbox | null = null;
  seekResult = TransportResult.ok();
  moveResult = TransportResult.ok();
  resignResult = TransportResult.ok();
  seeks: SeekRequest[] = [];
  bindInbox(inbox: ILichessInbox): void {
    this.inbox = inbox;
  }
  async start(): Promise<TransportResult> {
    return TransportResult.ok();
  }
  async playMove(): Promise<TransportResult> {
    return this.moveResult;
  }
  async seek(request: SeekRequest): Promise<TransportResult> {
    this.seeks.push(request);
    return this.seekResult;
  }
  cancelSeek(): void {
    return undefined;
  }
  async challenge(): Promise<TransportResult> {
    return TransportResult.ok();
  }
  async acceptChallenge(): Promise<TransportResult> {
    return TransportResult.ok();
  }
  async declineChallenge(): Promise<TransportResult> {
    return TransportResult.ok();
  }
  async resign(): Promise<TransportResult> {
    return this.resignResult;
  }
  async abortGame(): Promise<TransportResult> {
    return TransportResult.ok();
  }
  dispose(): void {
    return undefined;
  }
}

function online(player: FakePlayer): GameSession {
  return GameSession.online({
    rules: new ChessJsRules(),
    ids: new SequentialIds('g'),
    now: () => 5,
    sessionId: 'gap',
    player,
  });
}

describe('coverage gaps', () => {
  it('covers account, abort, correspondence seek, and stream status branches', async () => {
    const transport = new MockTransport();
    const client = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0 });
    const signal = new AbortController().signal;
    transport.handlers.push(async () => json(200, { id: 1, username: 'Ada' }));
    expect((await client.getAccount('lip_testtokenvalue', signal)).ok).toBe(false);
    transport.handlers.push(async () => json(200, 'not-json'));
    expect((await client.getAccount('lip_testtokenvalue', signal)).ok).toBe(false);
    transport.handlers.push(async () => json(401, { error: 'no' }));
    expect((await client.getAccount('lip_testtokenvalue', signal)).ok).toBe(false);
    transport.handlers.push(async () => json(200, { ok: true }));
    expect((await client.abortGame('lip_testtokenvalue', 'abc', signal)).ok).toBe(true);
    transport.handlers.push(async () => json(200, { ok: false }));
    expect((await client.playMove('lip_testtokenvalue', 'abc', 'e2e4', signal)).code).toBe('rejected');
    transport.handlers.push(async () => json(500, { error: 'down' }));
    expect((await client.playMove('lip_testtokenvalue', 'abc', 'e2e4', signal)).code).toBe('http');
    transport.handlers.push(async () => json(200, { id: 'seek1' }));
    const seek = await client.createSeek(
      'lip_testtokenvalue',
      { kind: 'correspondence', days: 3, color: 'black', ratingRange: '1500-1800' },
      signal,
    );
    expect(seek.ok).toBe(true);
    expect(transport.sent.at(-1)?.body).toContain('days=3');
    expect(transport.sent.at(-1)?.body).toContain('color=black');
    expect(
      (await client.createChallenge('lip_testtokenvalue', 'ada', { kind: 'realtime', limitSeconds: 30, incrementSeconds: 0 }, signal))
        .code,
    ).toBe('invalid');

    transport.handlers.push(async () => json(404, { error: 'missing' }));
    const missing = client.openGameStream('lip_testtokenvalue', 'gone', signal, {
      onEvent: () => undefined,
      onFault: () => undefined,
    });
    await missing.completed;
    transport.handlers.push(async () => json(429, { error: 'slow' }, ));
    const limited = client.openGameStream('lip_testtokenvalue', 'slow', signal, {
      onEvent: () => undefined,
      onFault: () => undefined,
    });
    await limited.completed;
    transport.handlers.push(async () => json(500, { error: 'nope' }));
    const failed = client.openGameStream('lip_testtokenvalue', 'bad', signal, {
      onEvent: () => undefined,
      onFault: () => undefined,
    });
    await failed.completed;
    transport.handlers.push(async () => ({ status: 200, headers: {}, body: null, text: async () => '' }));
    const empty = client.openGameStream('lip_testtokenvalue', 'empty', signal, {
      onEvent: () => undefined,
      onFault: () => undefined,
    });
    await empty.completed;
    const seen: string[] = [];
    transport.handlers.push(async () => ({
      status: 200,
      headers: {},
      body: (async function* body() {
        yield new TextEncoder().encode(
          '{"type":"gameStart","game":{"id":"abc","color":"white"}}\n{"type":"chatLine","room":"player","username":"a","text":"hi"}\n',
        );
      })(),
      text: async () => '',
    }));
    const events = client.openEventStream('lip_testtokenvalue', signal, {
      onEvent: (event) => seen.push(event.type),
      onFault: () => undefined,
    });
    await events.completed;
    expect(seen).toContain('gameStart');
  });

  it('aborts a timer sleep that is already scheduled', async () => {
    const sleeper = new TimerSleeper();
    const controller = new AbortController();
    const pending = sleeper.sleep(30, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/abort/i);
  });

  it('parses the remaining official event shapes', () => {
    const parser = new BoardEventParser();
    expect(parser.parse({ type: 'gameFinish', game: { gameId: 'abc' } }).kind).toBe('incoming');
    expect(parser.parse({ type: 'gameFinish', game: {} }).kind).toBe('invalid');
    expect(parser.parse({ type: 'challengeCanceled', challenge: { id: 'c' } }).kind).toBe('incoming');
    expect(parser.parse({ type: 'challengeDeclined', challenge: { id: 'c' } }).kind).toBe('incoming');
    expect(parser.parse({ type: 'challenge', challenge: 'nope' }).kind).toBe('invalid');
    expect(parser.parse({ type: 'gameFull', id: 'a' }).kind).toBe('invalid');
    expect(parser.parse({ type: 'gameStart', game: { id: 'abc', color: 'white' } }).kind).toBe('incoming');
    expect(parser.parse({ type: 'opponentGone', gone: 'yes' }).kind).toBe('invalid');
    expect(parser.parse({ type: 'unknown' }).kind).toBe('invalid');
  });

  it('drives the Lichess player methods and a gameStart watch', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => json(200, { id: 'ada', username: 'Ada' }));
    transport.handlers.push(async () => ({
      status: 200,
      headers: {},
      body: (async function* body() {
        yield new TextEncoder().encode('{"type":"gameStart","game":{"gameId":"abc","color":"black","compat":{"board":false}}}\n');
        await new Promise(() => undefined);
      })(),
      text: async () => '',
    }));
    transport.handlers.push(async () => ({
      status: 200,
      headers: {},
      body: (async function* body() {
        yield new TextEncoder().encode(
          '{"type":"gameFull","id":"abc","variant":{"key":"standard"},"initialFen":"startpos","white":{"id":"x"},"black":{"id":"ada"},"state":{"type":"gameState","moves":"","wtime":1,"btime":1,"winc":0,"binc":0,"status":"started"}}\n',
        );
      })(),
      text: async () => '',
    }));
    const lichess = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0 });
    const player = new LichessPlayer(lichess, new Token('lip_testtokenvalue'));
    const session = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('p'),
      now: () => 1,
      sessionId: 'player-gap',
      player,
    });
    expect((await player.start(new AbortController().signal)).ok).toBe(true);
    expect(player.label).toBe('Ada');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(session.snapshot.gameId).toBe('abc');
    expect(session.snapshot.ourColor).toBe('black');
    const signal = new AbortController().signal;
    transport.handlers.push(async () => json(200, { id: 'ch' }));
    expect((await player.challenge('Sam', { kind: 'correspondence', days: 1 }, signal)).ok).toBe(true);
    transport.handlers.push(async () => json(200, { ok: true }));
    expect((await player.acceptChallenge('ch', signal)).ok).toBe(true);
    transport.handlers.push(async () => json(200, { ok: true }));
    expect((await player.declineChallenge('ch', 'later', signal)).ok).toBe(true);
    transport.handlers.push(async () => json(200, { ok: true }));
    expect((await player.resign('abc', signal)).ok).toBe(true);
    transport.handlers.push(async () => json(200, { ok: true }));
    expect((await player.abortGame('abc', signal)).ok).toBe(true);
    transport.handlers.push(async () => json(200, { ok: true }));
    expect((await player.playMove('abc', 'e7e5', signal)).ok).toBe(true);
    const quiet = new LichessPlayer(lichess, new Token(null));
    expect((await quiet.playMove('abc', 'e2e4', signal)).code).toBe('unauthorized');
    expect((await quiet.resign('abc', signal)).code).toBe('unauthorized');
    player.dispose();
    player.dispose();
    expect(player.isDisposed).toBe(true);
  });

  it('covers session edges: filters, seek results, reconciliation, and host disposal', async () => {
    expect(() =>
      GameSession.offline({
        rules: new ChessJsRules(),
        ids: new SequentialIds('b'),
        now: () => 0,
        sessionId: 'bad',
        white: new LocalPlayer('black', 'nope'),
        black: new LocalPlayer('black', 'also'),
      }),
    ).toThrow(/white/i);
    const local = new LocalPlayer('white', 'Left');
    expect(local.label).toBe('Left');
    const session = GameSession.offline({
      rules: new ChessJsRules(),
      ids: new SequentialIds('o'),
      now: () => 0,
      sessionId: 'edges',
      white: local,
      black: new LocalPlayer('black', 'Right'),
    });
    const stop = session.subscribe(() => undefined);
    stop();
    expect(session.legalMovesFrom('e2').some((move) => move.uci === 'e2e4')).toBe(true);
    expect(session.legalMovesTo('e4').map((move) => move.from)).toEqual(['e2']);
    expect((await session.submit({ kind: 'move', id: ' ', source: 'local', to: 'e4', seat: 'white' })).ok).toBe(false);
    expect((await session.submit({ kind: 'resign', id: 'rs', source: 'local' })).ok).toBe(false);
    expect((await session.submit({ kind: 'abort', id: 'ab', source: 'local' })).ok).toBe(false);
    session.tick(1);
    const host = new GameSessionHost();
    expect(() => host.setView('seated')).toThrow(/session/i);
    host.attach(session);
    host.dispose();
    expect(host.current).toBeNull();

    const player = new FakePlayer();
    const live = online(player);
    const opened = await live.seek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 });
    expect(opened.ok).toBe(true);
    player.seekResult = TransportResult.fail('unauthorized', 'nope', 401);
    const denied = await live.seek({ kind: 'realtime', timeMinutes: 15, incrementSeconds: 0 });
    expect(denied.ok).toBe(false);
    player.inbox?.onAccount('Ada', 'ada');
    player.inbox?.onBoardEvent({
      type: 'gameFull',
      id: 'g1',
      initialFen: 'startpos',
      variant: 'standard',
      whiteId: 'ada',
      blackId: 'bee',
      state: {
        moves: [],
        wtime: 1000,
        btime: 1000,
        winc: 0,
        binc: 0,
        status: 'started',
        winner: null,
        wdraw: true,
        bdraw: false,
      },
    });
    expect(live.snapshot.ourColor).toBe('white');
    expect(live.snapshot.whiteOfferingDraw).toBe(true);
    player.moveResult = TransportResult.fail('unauthorized', 'expired', 401);
    const unauthorized = await live.submit({ kind: 'move', id: 'u', source: 'pointer', from: 'e2', to: 'e4' });
    expect(unauthorized.ok).toBe(false);
    player.moveResult = TransportResult.fail('network', 'reset');
    const again = online(new FakePlayer());
    again.onAccount('Ada', 'ada');
    again.onIncoming({ type: 'gameStart', gameId: 'g2', color: 'white', compatBoard: true });
    again.onBoardEvent({
      type: 'gameFull',
      id: 'g2',
      initialFen: 'startpos',
      variant: 'standard',
      whiteId: 'ada',
      blackId: 'bee',
      state: {
        moves: [],
        wtime: 1000,
        btime: 1000,
        winc: 0,
        binc: 0,
        status: 'started',
        winner: null,
        wdraw: false,
        bdraw: false,
      },
    });
    const mover = new FakePlayer();
    const third = online(mover);
    third.onIncoming({ type: 'gameStart', gameId: 'g3', color: 'white', compatBoard: true });
    third.onBoardEvent({
      type: 'gameFull',
      id: 'g3',
      initialFen: 'startpos',
      variant: 'standard',
      whiteId: 'ada',
      blackId: 'bee',
      state: {
        moves: [],
        wtime: 1000,
        btime: 1000,
        winc: 0,
        binc: 0,
        status: 'started',
        winner: null,
        wdraw: false,
        bdraw: false,
      },
    });
    mover.moveResult = TransportResult.fail('network', 'reset');
    await third.submit({ kind: 'move', id: 'p', source: 'pointer', from: 'e2', to: 'e4' });
    third.onBoardEvent({
      type: 'gameState',
      state: {
        moves: ['d2d4'],
        wtime: 900,
        btime: 1000,
        winc: 0,
        binc: 0,
        status: 'started',
        winner: null,
        wdraw: false,
        bdraw: false,
      },
    });
    expect(third.snapshot.moves).toEqual(['d2d4']);
    third.onBoardEvent({
      type: 'gameState',
      state: {
        moves: ['e2e5'],
        wtime: 1,
        btime: 1,
        winc: 0,
        binc: 0,
        status: 'started',
        winner: null,
        wdraw: false,
        bdraw: false,
      },
    });
    third.onIncoming({ type: 'challengeCanceled', challengeId: 'c1' });
    third.onIncoming({ type: 'challengeDeclined', challengeId: 'c2' });
    third.onIncoming({ type: 'gameFinish', gameId: 'g3' });
    expect((await third.submit({ kind: 'abort', id: 'abort', source: 'pointer' })).ok).toBe(true);
    const bare = online(new FakePlayer());
    expect((await bare.submit({ kind: 'resign', id: 'r', source: 'pointer' })).ok).toBe(false);
    bare.dispose();
    bare.noteViewMode('immersive');
    bare.dispose();
  });

  it('finishes a local game by stalemate', async () => {
    const session = GameSession.offline({
      rules: new ChessJsRules('7k/8/5QK1/8/8/8/8/8 w - - 0 1'),
      ids: new SequentialIds('st'),
      now: () => 0,
      sessionId: 'stale',
      white: new LocalPlayer('white', 'W'),
      black: new LocalPlayer('black', 'B'),
    });
    const result = await session.submit({ kind: 'move', id: 'm', source: 'local', from: 'f6', to: 'f7', seat: 'white' });
    expect(result.ok).toBe(true);
    expect(session.snapshot.outcome?.status === 'stalemate' || session.snapshot.outcome?.status === 'draw').toBe(true);
  });
});
