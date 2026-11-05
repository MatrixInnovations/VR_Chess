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

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.sent.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error(`unexpected ${request.method} ${request.url}`);
    return handler(request);
  }
}

class StaticToken implements ITokenSource {
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
    expect(urls[1]).toContain('/api/stream/event');
    expect(urls[2]).toContain('/api/board/seek');
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
});
