import { describe, expect, it } from 'vitest';

import type { HttpRequest, HttpResponse, IHttpTransport } from '../contracts/http';
import type { ISleeper } from '../contracts/ports';
import { LichessClient } from './LichessClient';
import { StreamRetrySchedule } from './StreamRetrySchedule';
import { TimerSleeper } from './TimerSleeper';

const TOKEN = 'lip_testtokenvalue';

class ManualSleeper implements ISleeper {
  readonly delays: number[] = [];

  async sleep(ms: number, signal: AbortSignal): Promise<void> {
    this.delays.push(ms);
    if (signal.aborted) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
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

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  const text = JSON.stringify(body);
  return { status, headers, body: null, text: async () => text };
}

function streamResponse(status: number, chunks: string[], headers: Record<string, string> = {}): HttpResponse {
  const encoder = new TextEncoder();
  return {
    status,
    headers,
    body: (async function* body() {
      for (const chunk of chunks) yield encoder.encode(chunk);
    })(),
    text: async () => chunks.join(''),
  };
}

function makeClient(transport: MockTransport, sleeper: ManualSleeper = new ManualSleeper(), maxStreamResumes = 3): {
  client: LichessClient;
  sleeper: ManualSleeper;
} {
  return {
    sleeper,
    client: new LichessClient({ transport, sleeper, maxStreamResumes }),
  };
}

describe('StreamRetrySchedule', () => {
  const schedule = new StreamRetrySchedule();

  it('waits at least one minute on 429 and honors a longer Retry-After', () => {
    expect(schedule.delayFor('rate-limited', 0)).toBe(60_000);
    expect(schedule.delayFor('rate-limited', 2, 90_000)).toBe(90_000);
    expect(schedule.delayFor('rate-limited', 0, 1_000)).toBe(60_000);
  });

  it('backs off idempotent stream drops without treating them as move retries', () => {
    expect(schedule.delayFor('network', 0)).toBe(500);
    expect(schedule.delayFor('server', 1)).toBe(1000);
    expect(schedule.delayFor('network', 10)).toBe(30_000);
  });
});

describe('TimerSleeper', () => {
  it('resolves immediately for a zero delay and rejects when already aborted', async () => {
    const sleeper = new TimerSleeper();
    const open = new AbortController();
    await sleeper.sleep(0, open.signal);
    const closed = new AbortController();
    closed.abort();
    await expect(sleeper.sleep(10, closed.signal)).rejects.toThrow(/abort/i);
  });
});

describe('LichessClient moves and seeks', () => {
  it('posts one UCI move and does not retry a network failure', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => {
      throw new Error(`socket ${TOKEN}`);
    });
    const { client } = makeClient(transport);
    const result = await client.playMove(TOKEN, 'abc', 'e2e4', new AbortController().signal);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('network');
    expect(result.message).not.toContain(TOKEN);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.method).toBe('POST');
    expect(transport.sent[0]?.url).toBe('https://lichess.org/api/board/game/abc/move/e2e4');
    expect(transport.sent[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('does not retry a rejected, rate-limited, or not-found move', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => jsonResponse(400, { error: 'bad move' }));
    transport.handlers.push(async () => jsonResponse(429, { error: 'slow down' }, { 'retry-after': '1' }));
    transport.handlers.push(async () => jsonResponse(404, { error: 'missing' }));
    const { client, sleeper } = makeClient(transport);
    const signal = new AbortController().signal;
    expect((await client.playMove(TOKEN, 'abc', 'e2e4', signal)).code).toBe('rejected');
    expect((await client.playMove(TOKEN, 'abc', 'e2e4', signal)).code).toBe('rate-limited');
    expect((await client.playMove(TOKEN, 'abc', 'e2e4', signal)).code).toBe('not-found');
    expect(transport.sent).toHaveLength(3);
    expect(sleeper.delays).toEqual([]);
  });

  it('accepts a 200 ok move and can offer a draw on that post', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => jsonResponse(200, { ok: true }));
    const { client } = makeClient(transport);
    const result = await client.playMove(TOKEN, 'abc', 'e7e8q', new AbortController().signal, true);
    expect(result.ok).toBe(true);
    expect(transport.sent[0]?.url).toBe('https://lichess.org/api/board/game/abc/move/e7e8q?offeringDraw=true');
  });

  it('refuses a malformed UCI locally', async () => {
    const transport = new MockTransport();
    const { client } = makeClient(transport);
    const result = await client.playMove(TOKEN, 'abc', 'e7e8Q', new AbortController().signal);
    expect(result.code).toBe('invalid');
    expect(transport.sent).toHaveLength(0);
  });

  it('cancels an in-flight move without a second post', async () => {
    const transport = new MockTransport();
    transport.handlers.push(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const { client } = makeClient(transport);
    const controller = new AbortController();
    const pending = client.playMove(TOKEN, 'abc', 'e2e4', controller.signal);
    controller.abort();
    const result = await pending;
    expect(result.code).toBe('cancelled');
    expect(transport.sent).toHaveLength(1);
  });

  it('does not open a seek for a blitz clock and does not retry a failed rapid seek', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => {
      throw new Error(`down ${TOKEN}`);
    });
    const { client } = makeClient(transport);
    const signal = new AbortController().signal;
    const blitz = await client.createSeek(TOKEN, { kind: 'realtime', timeMinutes: 5, incrementSeconds: 0 }, signal);
    expect(blitz.code).toBe('invalid');
    expect(transport.sent).toHaveLength(0);
    const failed = await client.createSeek(TOKEN, { kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 }, signal);
    expect(failed.code).toBe('network');
    expect(failed.message).not.toContain(TOKEN);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.url).toBe('https://lichess.org/api/board/seek');
    expect(transport.sent[0]?.body).toContain('time=10');
    expect(transport.sent[0]?.body).toContain('increment=0');
    expect(transport.sent[0]?.body).toContain('rated=false');
    expect(transport.sent[0]?.body).not.toContain('color=');
  });

  it('encodes a direct challenge in seconds and allows blitz', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => jsonResponse(200, { id: 'ch1' }));
    const { client } = makeClient(transport);
    const result = await client.createChallenge(
      TOKEN,
      'Salma',
      { kind: 'realtime', limitSeconds: 300, incrementSeconds: 2, color: 'white' },
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    expect(transport.sent[0]?.url).toBe('https://lichess.org/api/challenge/Salma');
    expect(transport.sent[0]?.body).toContain('clock.limit=300');
    expect(transport.sent[0]?.body).toContain('clock.increment=2');
    expect(transport.sent[0]?.body).toContain('color=white');
  });

  it('posts accept, decline, resign, and account reads to the documented paths', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => jsonResponse(200, { ok: true }));
    transport.handlers.push(async () => jsonResponse(200, { ok: true }));
    transport.handlers.push(async () => jsonResponse(200, { ok: true }));
    transport.handlers.push(async () => jsonResponse(200, { id: 'ada', username: 'Ada' }));
    const { client } = makeClient(transport);
    const signal = new AbortController().signal;
    expect((await client.acceptChallenge(TOKEN, 'ch1', signal)).ok).toBe(true);
    expect((await client.declineChallenge(TOKEN, 'ch1', 'tooFast', signal)).ok).toBe(true);
    expect((await client.resign(TOKEN, 'abc', signal)).ok).toBe(true);
    const account = await client.getAccount(TOKEN, signal);
    expect(account.ok).toBe(true);
    if (account.ok) expect(account.username).toBe('Ada');
    expect(transport.sent.map((entry) => `${entry.method} ${entry.url}`)).toEqual([
      'POST https://lichess.org/api/challenge/ch1/accept',
      'POST https://lichess.org/api/challenge/ch1/decline',
      'POST https://lichess.org/api/board/game/abc/resign',
      'GET https://lichess.org/api/account',
    ]);
    expect(transport.sent[1]?.body).toContain('reason=tooFast');
  });
});

describe('LichessClient streams', () => {
  const stateLine =
    '{"type":"gameState","moves":"e2e4","wtime":1,"btime":2,"winc":0,"binc":0,"status":"started"}\n';

  it('emits events from fragmented NDJSON chunks', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () =>
      streamResponse(200, [
        '{"type":"gameState","moves":"e2e4","wtime":1,"btime":2,"winc":0,"binc":0,"status":"started"}\n{"type":"ga',
        'meState","moves":"e2e4 e7e5","wtime":3,"btime":4,"winc":0,"binc":0,"status":"started"}\n',
      ]),
    );
    const { client } = makeClient(transport);
    const events: string[] = [];
    const handle = client.openGameStream(TOKEN, 'abc', new AbortController().signal, {
      onEvent: (event) => {
        if (event.type === 'gameState') events.push(event.state.moves.join(' '));
      },
      onFault: () => undefined,
    });
    expect((await handle.ready).ok).toBe(true);
    await handle.completed;
    expect(events).toEqual(['e2e4', 'e2e4 e7e5']);
  });

  it('reconnects a dropped game stream and stops after mate', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => ({
      status: 200,
      headers: {},
      body: (async function* body() {
        yield new TextEncoder().encode(stateLine);
        throw new Error('reset');
      })(),
      text: async () => '',
    }));
    transport.handlers.push(async () =>
      streamResponse(200, [
        '{"type":"gameState","moves":"e2e4 e7e5","wtime":1,"btime":2,"winc":0,"binc":0,"status":"mate","winner":"white"}\n',
      ]),
    );
    const { client, sleeper } = makeClient(transport);
    const statuses: string[] = [];
    const handle = client.openGameStream(TOKEN, 'abc', new AbortController().signal, {
      onEvent: (event) => {
        if (event.type === 'gameState') statuses.push(event.state.status);
      },
      onFault: () => undefined,
    });
    await handle.completed;
    expect(statuses).toEqual(['started', 'mate']);
    expect(transport.sent).toHaveLength(2);
    expect(sleeper.delays[0]).toBe(500);
    expect(transport.sent.every((entry) => !entry.url.includes('/move/'))).toBe(true);
  });

  it('does not reconnect after 401 or after the server closes a finished game', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => jsonResponse(401, { error: 'nope' }));
    const { client } = makeClient(transport);
    const faults: string[] = [];
    const unauthorized = client.openGameStream(TOKEN, 'abc', new AbortController().signal, {
      onEvent: () => undefined,
      onFault: (fault) => faults.push(fault.code),
    });
    await unauthorized.completed;
    expect(faults).toEqual(['unauthorized']);
    expect(transport.sent).toHaveLength(1);

    transport.handlers.push(async () =>
      streamResponse(200, [
        '{"type":"gameState","moves":"e2e4","wtime":0,"btime":1,"winc":0,"binc":0,"status":"outoftime","winner":"black"}\n',
      ]),
    );
    const finished = client.openGameStream(TOKEN, 'abc', new AbortController().signal, {
      onEvent: () => undefined,
      onFault: (fault) => faults.push(fault.code),
    });
    await finished.completed;
    expect(transport.sent).toHaveLength(2);
  });

  it('waits the documented minute before resuming a 429 stream and does not post a move', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => jsonResponse(429, { error: 'slow' }));
    transport.handlers.push(async () => streamResponse(200, [stateLine]));
    const { client, sleeper } = makeClient(transport, new ManualSleeper(), 1);
    const handle = client.openGameStream(TOKEN, 'abc', new AbortController().signal, {
      onEvent: () => undefined,
      onFault: () => undefined,
    });
    await handle.completed;
    expect(sleeper.delays).toEqual([60_000]);
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent.every((entry) => entry.method === 'GET')).toBe(true);
  });

  it('stops when the caller aborts and does not resume', async () => {
    const transport = new MockTransport();
    transport.handlers.push(
      (request) =>
        new Promise<HttpResponse>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const { client } = makeClient(transport);
    const controller = new AbortController();
    const events: string[] = [];
    const handle = client.openEventStream(TOKEN, controller.signal, {
      onEvent: () => events.push('event'),
      onFault: (fault) => events.push(fault.code),
    });
    controller.abort();
    await handle.completed;
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.url).toBe('https://lichess.org/api/stream/event');
    expect(events).not.toContain('event');
  });

  it('skips a bad line and still delivers the following event', async () => {
    const transport = new MockTransport();
    transport.handlers.push(async () => streamResponse(200, [`not-json\n${stateLine}`]));
    const { client } = makeClient(transport);
    const seen: string[] = [];
    const faults: string[] = [];
    const handle = client.openGameStream(TOKEN, 'abc', new AbortController().signal, {
      onEvent: (event) => {
        if (event.type === 'gameState') seen.push(event.state.moves.join(' '));
      },
      onFault: (fault) => faults.push(fault.code),
    });
    await handle.completed;
    expect(seen).toEqual(['e2e4']);
    expect(faults).toContain('malformed');
  });
});
