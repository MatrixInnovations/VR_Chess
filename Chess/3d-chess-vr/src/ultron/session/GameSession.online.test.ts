import { describe, expect, it } from 'vitest';

import type { BoardGameEvent, IncomingEvent, SeekRequest } from '../lichess/apiTypes';
import type { ILichessInbox, IOnlinePlayer } from '../contracts/IOnlinePlayer';
import { TransportResult } from '../lichess/TransportResult';
import { ChessJsRules } from '../rules/ChessJsRules';
import { GameSession } from './GameSession';
import { SequentialIds } from './SequentialIds';

class FakeOnlinePlayer implements IOnlinePlayer {
  inbox: ILichessInbox | null = null;
  readonly moves: Array<{ gameId: string; uci: string; signal: AbortSignal }> = [];
  readonly seeks: SeekRequest[] = [];
  moveResult: TransportResult = TransportResult.ok();
  seekResult: TransportResult = TransportResult.ok();
  hangMoves = false;
  hangSeek = false;
  cancelSeekCount = 0;
  resignCount = 0;
  disposed = false;

  bindInbox(inbox: ILichessInbox): void {
    this.inbox = inbox;
  }

  async start(): Promise<TransportResult> {
    return TransportResult.ok();
  }

  async playMove(gameId: string, uci: string, signal: AbortSignal): Promise<TransportResult> {
    this.moves.push({ gameId, uci, signal });
    if (signal.aborted) return TransportResult.fail('cancelled', 'cancelled');
    if (this.hangMoves) {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(TransportResult.fail('cancelled', 'cancelled')), { once: true });
      });
    }
    return this.moveResult;
  }

  async seek(request: SeekRequest, signal: AbortSignal): Promise<TransportResult> {
    this.seeks.push(request);
    if (this.hangSeek) {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(TransportResult.fail('cancelled', 'cancelled')), { once: true });
      });
    }
    return this.seekResult;
  }

  cancelSeek(): void {
    this.cancelSeekCount += 1;
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
    this.resignCount += 1;
    return TransportResult.ok();
  }

  async abortGame(): Promise<TransportResult> {
    return TransportResult.ok();
  }

  dispose(): void {
    this.disposed = true;
  }
}

function full(moves: string, status: BoardGameEvent extends never ? never : string = 'started', clocks?: { wtime: number; btime: number }): BoardGameEvent {
  return {
    type: 'gameFull',
    id: 'qP8XaFtN',
    initialFen: 'startpos',
    variant: 'standard',
    whiteId: 'ada',
    blackId: 'salma',
    state: {
      moves: moves ? moves.split(' ') : [],
      wtime: clocks?.wtime ?? 600000,
      btime: clocks?.btime ?? 600000,
      winc: 0,
      binc: 0,
      status: status as 'started',
      winner: null,
      wdraw: false,
      bdraw: false,
    },
  };
}

function state(moves: string, status = 'started', extra?: Partial<BoardGameEvent extends { type: 'gameState' } ? never : Record<string, never>>): BoardGameEvent {
  return {
    type: 'gameState',
    state: {
      moves: moves ? moves.split(' ') : [],
      wtime: 500000,
      btime: 500000,
      winc: 0,
      binc: 0,
      status: status as 'started',
      winner: status === 'outoftime' || status === 'resign' ? 'black' : status === 'mate' ? 'white' : null,
      wdraw: false,
      bdraw: false,
      ...(extra ?? {}),
    },
  };
}

function online(player: FakeOnlinePlayer): GameSession {
  return GameSession.online({
    rules: new ChessJsRules(),
    ids: new SequentialIds('s'),
    now: () => 0,
    sessionId: 'session-online',
    player,
  });
}

function arm(session: GameSession, player: FakeOnlinePlayer): void {
  player.inbox?.onAccount('Ada', 'ada');
  player.inbox?.onIncoming({ type: 'gameStart', gameId: 'qP8XaFtN', color: 'white', compatBoard: true });
  player.inbox?.onBoardEvent(full(''));
  expect(session.snapshot.phase).toBe('playing');
  expect(session.snapshot.ourColor).toBe('white');
}

describe('online GameSession', () => {
  it('updates the position only when the stream echoes the move', async () => {
    const player = new FakeOnlinePlayer();
    const session = online(player);
    arm(session, player);
    const pending = session.submit({ kind: 'move', id: 'm1', source: 'pointer', from: 'e2', to: 'e4' });
    expect(session.snapshot.fen).toContain('PPPPPPPP');
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'move') expect(result.authority).toBe('lichess-accepted');
    expect(player.moves).toHaveLength(1);
    expect(player.moves[0]?.uci).toBe('e2e4');
    expect(session.snapshot.moves).toEqual([]);
    player.inbox?.onBoardEvent(state('e2e4'));
    expect(session.snapshot.moves).toEqual(['e2e4']);
    expect(session.snapshot.turn).toBe('black');
  });

  it('does not change the fen when Lichess rejects the move, then allows a new command id', async () => {
    const player = new FakeOnlinePlayer();
    player.moveResult = TransportResult.fail('rejected', 'illegal', 400);
    const session = online(player);
    arm(session, player);
    const rejected = await session.submit({ kind: 'move', id: 'm1', source: 'pointer', from: 'e2', to: 'e4' });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe('rejected-by-lichess');
    expect(session.snapshot.moves).toEqual([]);
    player.moveResult = TransportResult.ok();
    const retry = await session.submit({ kind: 'move', id: 'm2', source: 'pointer', from: 'e2', to: 'e4' });
    expect(retry.ok).toBe(true);
    expect(player.moves).toHaveLength(2);
    const duplicate = await session.submit({ kind: 'move', id: 'm2', source: 'pointer', from: 'e2', to: 'e4' });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.reason).toBe('duplicate-command');
    expect(player.moves).toHaveLength(2);
  });

  it('does not automatically repost after a network error and reconciles from gameFull', async () => {
    const player = new FakeOnlinePlayer();
    player.moveResult = TransportResult.fail('network', 'reset');
    const session = online(player);
    arm(session, player);
    const events: string[] = [];
    session.subscribe((event) => events.push(event.type));
    const unconfirmed = await session.submit({ kind: 'move', id: 'm1', source: 'xr-controller', from: 'e2', to: 'e4' });
    expect(unconfirmed.ok).toBe(true);
    if (unconfirmed.ok && unconfirmed.kind === 'move') expect(unconfirmed.authority).toBe('lichess-unconfirmed');
    expect(player.moves).toHaveLength(1);
    expect(events).toContain('move-unconfirmed');
    const blocked = await session.submit({ kind: 'move', id: 'm2', source: 'pointer', from: 'e2', to: 'e4' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('duplicate-move');
    expect(player.moves).toHaveLength(1);
    player.inbox?.onBoardEvent(state('', 'started'));
    expect(player.moves).toHaveLength(1);
    player.inbox?.onBoardEvent(full(''));
    player.moveResult = TransportResult.ok();
    const retry = await session.submit({ kind: 'move', id: 'm3', source: 'pointer', from: 'e2', to: 'e4' });
    expect(retry.ok).toBe(true);
    expect(player.moves).toHaveLength(2);
  });

  it('confirms a pending move when the reconnect snapshot already contains it', async () => {
    const player = new FakeOnlinePlayer();
    player.moveResult = TransportResult.fail('network', 'reset');
    const session = online(player);
    arm(session, player);
    await session.submit({ kind: 'move', id: 'm1', source: 'pointer', from: 'e2', to: 'e4' });
    player.inbox?.onBoardEvent(full('e2e4'));
    expect(session.snapshot.moves).toEqual(['e2e4']);
    const again = await session.submit({ kind: 'move', id: 'm2', source: 'pointer', from: 'e2', to: 'e4' });
    expect(again.ok).toBe(false);
    expect(player.moves).toHaveLength(1);
  });

  it('ignores a duplicate stream snapshot and treats clock zero as provisional', () => {
    const player = new FakeOnlinePlayer();
    const session = online(player);
    arm(session, player);
    const version = session.snapshot.positionVersion;
    player.inbox?.onBoardEvent(full(''));
    expect(session.snapshot.positionVersion).toBe(version);
    player.inbox?.onBoardEvent({
      type: 'gameState',
      state: {
        moves: [],
        wtime: 0,
        btime: 600000,
        winc: 0,
        binc: 0,
        status: 'started',
        winner: null,
        wdraw: false,
        bdraw: false,
      },
    });
    expect(session.snapshot.clockProvisional).toBe(true);
    expect(session.snapshot.phase).toBe('playing');
    expect(session.snapshot.outcome).toBeNull();
    player.inbox?.onBoardEvent({
      type: 'gameState',
      state: {
        moves: [],
        wtime: 0,
        btime: 600000,
        winc: 0,
        binc: 0,
        status: 'outoftime',
        winner: 'black',
        wdraw: false,
        bdraw: false,
      },
    });
    expect(session.snapshot.phase).toBe('finished');
    expect(session.snapshot.outcome?.status).toBe('outoftime');
    expect(session.snapshot.clockProvisional).toBe(false);
  });

  it('rejects moves when it is not our turn, the variant is unsupported, or the stream says the game is over', async () => {
    const player = new FakeOnlinePlayer();
    const session = online(player);
    arm(session, player);
    player.inbox?.onBoardEvent(state('e2e4'));
    const opponentTurn = await session.submit({ kind: 'move', id: 'b', source: 'pointer', from: 'e7', to: 'e5' });
    expect(opponentTurn.ok).toBe(false);
    if (!opponentTurn.ok) expect(opponentTurn.reason).toBe('not-your-turn');
    expect(player.moves).toHaveLength(0);

    player.inbox?.onBoardEvent({
      type: 'gameFull',
      id: 'qP8XaFtN',
      initialFen: 'startpos',
      variant: 'chess960',
      whiteId: 'ada',
      blackId: 'salma',
      state: {
        moves: [],
        wtime: 600000,
        btime: 600000,
        winc: 0,
        binc: 0,
        status: 'started',
        winner: null,
        wdraw: false,
        bdraw: false,
      },
    });
    const variant = await session.submit({ kind: 'move', id: 'v', source: 'pointer', from: 'e2', to: 'e4' });
    expect(variant.ok).toBe(false);
    if (!variant.ok) expect(variant.reason).toBe('unsupported-variant');

    const matePlayer = new FakeOnlinePlayer();
    const finished = online(matePlayer);
    arm(finished, matePlayer);
    matePlayer.inbox?.onBoardEvent(state('e2e4', 'mate'));
    const late = await finished.submit({ kind: 'move', id: 'late', source: 'pointer', from: 'a2', to: 'a3' });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('terminal');
  });

  it('does not post a move when the gesture is cancelled or the session is disposed', async () => {
    const player = new FakeOnlinePlayer();
    player.hangMoves = true;
    const session = online(player);
    arm(session, player);
    const pending = session.submit({ kind: 'move', id: 'm', source: 'hand', from: 'e2', to: 'e4' });
    await Promise.resolve();
    expect(player.moves).toHaveLength(1);
    const cancel = await session.submit({ kind: 'cancel', id: 'c', source: 'hand' });
    expect(cancel.ok).toBe(true);
    if (cancel.ok) expect(cancel.kind).toBe('cancelled');
    expect(player.moves[0]?.signal.aborted).toBe(true);
    await pending;
    expect(player.moves).toHaveLength(1);
    expect(session.snapshot.moves).toEqual([]);

    const second = new FakeOnlinePlayer();
    const other = online(second);
    arm(other, second);
    other.dispose();
    const after = await other.submit({ kind: 'move', id: 'z', source: 'pointer', from: 'e2', to: 'e4' });
    expect(after.ok).toBe(false);
    expect(second.moves).toHaveLength(0);
    expect(second.disposed).toBe(true);
  });

  it('refuses a blitz seek locally and aborts a rapid seek without posting a move', async () => {
    const player = new FakeOnlinePlayer();
    player.hangSeek = true;
    const session = online(player);
    const blitz = await session.seek({ kind: 'realtime', timeMinutes: 5, incrementSeconds: 0 });
    expect(blitz.ok).toBe(false);
    if (!blitz.ok) expect(blitz.reason).toBe('invalid-time-control');
    expect(player.seeks).toHaveLength(0);
    const pending = session.seek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 });
    await Promise.resolve();
    expect(player.seeks).toHaveLength(1);
    expect(player.seeks[0]?.kind).toBe('realtime');
    await session.submit({ kind: 'cancel', id: 'c', source: 'pointer' });
    expect(player.cancelSeekCount).toBe(1);
    await pending;
    expect(player.moves).toHaveLength(0);
  });

  it('latches 401 and will not post another move until the caller clears it', async () => {
    const player = new FakeOnlinePlayer();
    const session = online(player);
    arm(session, player);
    player.inbox?.onStreamFault({ code: 'unauthorized', message: 'expired' });
    const blocked = await session.submit({ kind: 'move', id: 'm', source: 'pointer', from: 'e2', to: 'e4' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('unauthorized');
    expect(player.moves).toHaveLength(0);
  });

  it('keeps one session id when the view changes during an online game', async () => {
    const player = new FakeOnlinePlayer();
    const session = online(player);
    arm(session, player);
    await session.submit({ kind: 'move', id: 'm', source: 'pointer', from: 'e2', to: 'e4' });
    player.inbox?.onBoardEvent(state('e2e4'));
    const fen = session.snapshot.fen;
    session.noteViewMode('immersive');
    session.noteViewMode('seated');
    expect(session.id).toBe('session-online');
    expect(session.snapshot.fen).toBe(fen);
    expect(session.snapshot.viewMode).toBe('seated');
  });

  it('surfaces an incoming challenge without starting a move', () => {
    const player = new FakeOnlinePlayer();
    const session = online(player);
    const events: IncomingEvent['type'][] = [];
    session.subscribe((event) => {
      if (event.type === 'challenge') events.push('challenge');
    });
    player.inbox?.onIncoming({ type: 'challenge', challengeId: 'ch1' });
    expect(events).toEqual(['challenge']);
    expect(player.moves).toHaveLength(0);
  });

  it('sends resign once and waits for the stream before finishing', async () => {
    const player = new FakeOnlinePlayer();
    const session = online(player);
    arm(session, player);
    const sent = await session.submit({ kind: 'resign', id: 'r', source: 'pointer' });
    expect(sent.ok).toBe(true);
    expect(player.resignCount).toBe(1);
    expect(session.snapshot.phase).toBe('playing');
    player.inbox?.onBoardEvent(state('', 'resign'));
    expect(session.snapshot.phase).toBe('finished');
    expect(session.snapshot.outcome?.winner).toBe('black');
  });
});
