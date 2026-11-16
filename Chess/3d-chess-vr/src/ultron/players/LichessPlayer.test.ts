import { describe, expect, it } from 'vitest';

import type { HttpRequest, HttpResponse, IHttpTransport } from '../contracts/http';
import type { ISleeper, ITokenSource } from '../contracts/ports';
import { LichessClient } from '../lichess/LichessClient';
import { ChessJsRules } from '../rules/ChessJsRules';
import { GameSession } from '../session/GameSession';
import { SequentialIds } from '../session/SequentialIds';
import { LichessPlayer } from './LichessPlayer';

class ManualSleeper implements ISleeper {
  async sleep(): Promise<void> {
    return undefined;
  }
}

class MockTransport implements IHttpTransport {
  readonly sent: HttpRequest[] = [];
  readonly handlers: Array<(request: HttpRequest) => Promise<HttpResponse> | HttpResponse> = [];

  playing: readonly { gameId: string }[] = [];
  playingStatus = 200;

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.sent.push(request);
    if (request.url.includes('/api/account/playing')) {
      if (this.playingStatus !== 200) return json({ error: 'down' }, this.playingStatus);
      return json({ nowPlaying: this.playing });
    }
    const handler = this.handlers.shift();
    if (!handler) throw new Error(`unexpected ${request.method} ${request.url}`);
    return handler(request);
  }
}

class StaticToken implements ITokenSource {
  /**
   * Creates the instance.
   */
  constructor(private readonly token: string | null) {}

  getAccessToken(): string | null {
    return this.token;
  }
}

function json(body: unknown, status = 200): HttpResponse {
  const text = JSON.stringify(body);
  return { status, headers: {}, body: null, text: async () => text };
}

function hanging(status = 200): HttpResponse {
  return {
    status,
    headers: {},
    body: (async function* body() {
      await new Promise(() => undefined);
    })(),
    text: async () => '',
  };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) throw new Error(`timeout ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('LichessPlayer', () => {
  it('opens the event stream before a seek and does not post a move on dispose', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => json({ id: 'ada', username: 'Ada' }));
    transport.handlers.push(async () => hanging());
    transport.handlers.push(async () => hanging());
    const lichess = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0 });
    const player = new LichessPlayer(lichess, new StaticToken('lip_testtokenvalue'));
    const session = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'live',
      player,
    });
    const pending = session.seek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 });
    await waitFor(() => transport.sent.some((entry) => entry.url.includes('/api/board/seek')), 'seek');
    const urls = transport.sent.map((entry) => entry.url);
    expect(urls[0]).toContain('/api/account');
    expect(urls[1]).toContain('/api/account/playing');
    expect(urls[2]).toContain('/api/stream/event');
    expect(urls[3]).toContain('/api/board/seek');
    expect(urls.indexOf(urls.find((url) => url.includes('/api/account/playing'))!)).toBeLessThan(
      urls.indexOf(urls.find((url) => url.includes('/api/stream/event'))!),
    );
    expect(urls.some((url) => url.includes('/move/'))).toBe(false);
    session.dispose();
    await pending;
    expect(transport.sent.some((entry) => entry.url.includes('/move/'))).toBe(false);
    expect(player.isDisposed).toBe(true);
  });

  it('does not seek when the account token is missing or the event stream is unauthorized', async () => {
    const transport = new MockTransport();
    const lichess = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0 });
    const player = new LichessPlayer(lichess, new StaticToken(null));
    const session = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'no-token',
      player,
    });
    const missing = await session.seek({ kind: 'realtime', timeMinutes: 15, incrementSeconds: 0 });
    expect(missing.ok).toBe(false);
    expect(transport.sent).toHaveLength(0);

    transport.handlers.push(async () => json({ id: 'ada', username: 'Ada' }));
    transport.handlers.push(async () => json({ error: 'nope' }, 401));
    const authed = new LichessPlayer(lichess, new StaticToken('lip_testtokenvalue'));
    const second = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'denied',
      player: authed,
    });
    const denied = await second.seek({ kind: 'realtime', timeMinutes: 15, incrementSeconds: 0 });
    expect(denied.ok).toBe(false);
    expect(transport.sent.some((entry) => entry.url.includes('/api/board/seek'))).toBe(false);
  });

  it('does not join a game that was already running when the stream opened', async () => {
    const transport = new MockTransport();
    const encoder = new TextEncoder();
    let followUp = '';
    let closed = false;
    transport.playing = [{ gameId: 'oldGame1' }];
    transport.handlers.push(async () => json({ id: 'ada', username: 'Ada' }));
    transport.handlers.push(async () => ({
      status: 200,
      headers: {},
      text: async () => '',
      body: (async function* body() {
        await new Promise((resolve) => setTimeout(resolve, 60));
        yield encoder.encode(
          '{"type":"gameStart","game":{"id":"oldGame1","color":"white","compat":{"board":true}}}\n',
        );
        for (;;) {
          if (followUp) {
            const line = followUp;
            followUp = '';
            yield encoder.encode(line);
          }
          if (closed) return;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      })(),
    }));
    transport.handlers.push(async () => hanging());
    transport.handlers.push(async () => hanging());
    const lichess = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0, streamIdleMs: 0 });
    const player = new LichessPlayer(lichess, new StaticToken('lip_testtokenvalue'));
    const session = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'pick',
      player,
    });
    const pending = session.seek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 });
    await waitFor(() => transport.sent.some((entry) => entry.url.includes('/api/board/seek')), 'seek');
    expect(session.snapshot.gameId).toBeNull();
    followUp = '{"type":"gameStart","game":{"id":"newGame1","color":"black","compat":{"board":true}}}\n';
    await waitFor(() => session.snapshot.gameId === 'newGame1', 'new game');
    expect(session.snapshot.gameId).not.toBe('oldGame1');
    closed = true;
    session.dispose();
    await pending;
  });

  it('ignores an old gameStart that is already in the opening stream burst', async () => {
    const transport = new MockTransport();
    const encoder = new TextEncoder();
    let followUp = '';
    transport.playing = [{ gameId: 'oldGame1' }];
    transport.handlers.push(async () => json({ id: 'ada', username: 'Ada' }));
    transport.handlers.push(async () => ({
      status: 200,
      headers: {},
      text: async () => '',
      body: (async function* body() {
        yield encoder.encode(
          '{"type":"gameStart","game":{"id":"oldGame1","color":"white","compat":{"board":true}}}\n',
        );
        for (;;) {
          if (followUp) {
            const line = followUp;
            followUp = '';
            yield encoder.encode(line);
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      })(),
    }));
    transport.handlers.push(async () => hanging());
    const lichess = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0, streamIdleMs: 0 });
    const player = new LichessPlayer(lichess, new StaticToken('lip_testtokenvalue'));
    const session = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'burst',
      player,
    });
    const pending = session.seek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 });
    await waitFor(() => transport.sent.some((entry) => entry.url.includes('/api/board/seek')), 'seek');
    const playingAt = transport.sent.findIndex((entry) => entry.url.includes('/api/account/playing'));
    const streamAt = transport.sent.findIndex((entry) => entry.url.includes('/api/stream/event'));
    expect(playingAt).toBeGreaterThanOrEqual(0);
    expect(playingAt).toBeLessThan(streamAt);
    expect(session.snapshot.gameId).toBeNull();
    followUp = '{"type":"gameStart","game":{"id":"newGame1","color":"black","compat":{"board":true}}}\n';
    await waitFor(() => session.snapshot.gameId === 'newGame1', 'new game');
    session.dispose();
    await pending;
  });

  it('adopts nothing and reports an error when the playing list fails', async () => {
    const transport = new MockTransport();
    transport.playingStatus = 500;
    transport.handlers.push(async () => json({ id: 'ada', username: 'Ada' }));
    const lichess = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0 });
    const player = new LichessPlayer(lichess, new StaticToken('lip_testtokenvalue'));
    const session = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'playing-down',
      player,
    });
    const faults: string[] = [];
    session.subscribe((event) => {
      if (event.type === 'stream-fault') faults.push(event.message);
    });
    const result = await session.seek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 });
    expect(result.ok).toBe(false);
    expect(session.snapshot.gameId).toBeNull();
    expect(transport.sent.some((entry) => entry.url.includes('/api/stream/event'))).toBe(false);
    expect(transport.sent.some((entry) => entry.url.includes('/api/board/seek'))).toBe(false);
    expect(faults.length).toBeGreaterThan(0);
  });

  it('posts decline, resign, and abort, and refuses them without a token', async () => {
    const transport = new MockTransport();
    const lichess = new LichessClient({ transport, sleeper: new ManualSleeper(), maxStreamResumes: 0 });
    const signedOut = new LichessPlayer(lichess, new StaticToken(null));
    const signal = new AbortController().signal;
    expect((await signedOut.playMove('g', 'e2e4', signal)).ok).toBe(false);
    expect((await signedOut.declineChallenge('c', 'generic', signal)).ok).toBe(false);
    expect((await signedOut.resign('g', signal)).ok).toBe(false);
    expect((await signedOut.abortGame('g', signal)).ok).toBe(false);

    const signedIn = new LichessPlayer(lichess, new StaticToken('lip_testtokenvalue'));
    transport.handlers.push(async () => json({ ok: true }));
    transport.handlers.push(async () => json({ ok: true }));
    transport.handlers.push(async () => json({ ok: true }));
    expect((await signedIn.declineChallenge('c1', 'later', signal)).ok).toBe(true);
    expect((await signedIn.resign('game1', signal)).ok).toBe(true);
    expect((await signedIn.abortGame('game1', signal)).ok).toBe(true);
    const urls = transport.sent.map((entry) => entry.url);
    expect(urls.some((url) => url.includes('/challenge/c1/decline'))).toBe(true);
    expect(urls.some((url) => url.endsWith('/resign'))).toBe(true);
    expect(urls.some((url) => url.endsWith('/abort'))).toBe(true);
  });
});
