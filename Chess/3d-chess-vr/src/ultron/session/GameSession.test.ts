import { describe, expect, it, vi } from 'vitest';

import type { IClockPort, ClockReading } from '../contracts/IClockPort';
import type { IInputController } from '../contracts/IInputController';
import type { Color, MoveIntent } from '../contracts/types';
import { LocalPlayer } from '../players/LocalPlayer';
import { ChessJsRules } from '../rules/ChessJsRules';
import { GameSession, GameSessionHost } from './GameSession';
import { SequentialIds } from './SequentialIds';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function offline(): GameSession {
  return GameSession.offline({
    rules: new ChessJsRules(),
    ids: new SequentialIds('s'),
    now: () => 0,
    sessionId: 'session-offline',
    white: new LocalPlayer('white', 'Left'),
    black: new LocalPlayer('black', 'Right'),
  });
}

class FlagClock implements IClockPort {
  flagged: Color | null = null;
  disposed = false;

  private reading(): ClockReading {
    return {
      whiteMs: this.flagged === 'white' ? 0 : 1000,
      blackMs: this.flagged === 'black' ? 0 : 1000,
      flagged: this.flagged,
    };
  }

  sync(): ClockReading {
    return this.reading();
  }

  onMovePlayed(): ClockReading {
    return this.reading();
  }

  read(): ClockReading {
    return this.reading();
  }

  arm(): ClockReading {
    return this.reading();
  }

  stop(): void {
    return undefined;
  }

  dispose(): void {
    this.disposed = true;
  }
}

class RecordingController implements IInputController {
  readonly kind = 'pointer' as const;
  private attached = false;
  private grabbing = false;

  constructor(private readonly session: GameSession) {}

  attach(): void {
    this.attached = true;
  }

  detach(): void {
    this.cancel('detached');
    this.attached = false;
  }

  isGrabbing(): boolean {
    return this.grabbing;
  }

  cancel(reason: 'pointer-cancel' | 'tracking-loss' | 'released-origin' | 'detached' | 'rejected'): void {
    this.grabbing = false;
    this.session.cancelPendingMove(reason);
  }

  hold(): void {
    this.grabbing = true;
  }

  release(intent: MoveIntent): boolean {
    if (!this.attached || !this.grabbing) return false;
    this.grabbing = false;
    return this.session.submitMoveIntent(intent);
  }
}

describe('LocalPlayer', () => {
  it('is a same-device human and never selects a move', () => {
    const player = new LocalPlayer('white', 'Left');
    expect(player.kind).toBe('local-human');
    expect(player.canAct('white')).toBe(true);
    expect(player.canAct('black')).toBe(false);
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(player));
    expect(names.join(' ')).not.toMatch(/engine|suggest|bestMove/i);
    player.dispose();
    expect(player.isDisposed).toBe(true);
    player.dispose();
  });
});

describe('offline GameSession', () => {
  it('lets two humans alternate and exposes legal moves for voice', async () => {
    const session = offline();
    expect(session.legalMoveCandidates().some((move) => move.uci === 'e2e4')).toBe(true);
    const voice = await session.submit({ kind: 'move', id: 'v1', source: 'voice', to: 'e4', seat: 'white' });
    expect(voice.ok).toBe(true);
    if (voice.ok && voice.kind === 'move') expect(voice.uci).toBe('e2e4');
    expect(session.snapshot.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    const black = await session.submit({
      kind: 'move',
      id: 'b1',
      source: 'pointer',
      from: 'e7',
      to: 'e5',
      seat: 'black',
    });
    expect(black.ok).toBe(true);
    expect(session.snapshot.turn).toBe('white');
  });

  it('rejects the wrong seat, a missing seat, and an illegal move without changing the fen', async () => {
    const session = offline();
    const wrong = await session.submit({ kind: 'move', id: '1', source: 'local', from: 'e7', to: 'e5', seat: 'black' });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBe('not-your-turn');
    const missing = await session.submit({ kind: 'move', id: '2', source: 'local', from: 'e2', to: 'e4' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('seat-required');
    const illegal = await session.submit({ kind: 'move', id: '3', source: 'local', from: 'e2', to: 'e5', seat: 'white' });
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) expect(illegal.reason).toBe('illegal');
    expect(session.snapshot.fen).toBe(START);
  });

  it('asks for an origin when several pieces can move there and never guesses', async () => {
    const session = GameSession.offline({
      rules: new ChessJsRules('4k3/8/8/8/8/8/2N1N3/4K3 w - - 0 1'),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'knights',
      white: new LocalPlayer('white', 'Left'),
      black: new LocalPlayer('black', 'Right'),
    });
    const events: string[] = [];
    session.subscribe((event) => events.push(event.type));
    const ambiguous = await session.submit({ kind: 'move', id: 'a', source: 'voice', to: 'd4', seat: 'white' });
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) {
      expect(ambiguous.reason).toBe('origin-required');
      expect(ambiguous.candidates?.map((move) => move.from).sort()).toEqual(['c2', 'e2']);
    }
    expect(events).toContain('origin-required');
    expect(session.snapshot.fen).toContain('2N1N3');
    const unique = await session.submit({ kind: 'move', id: 'b', source: 'voice', to: 'a3', seat: 'white' });
    expect(unique.ok).toBe(true);
    if (unique.ok && unique.kind === 'move') expect(unique.uci).toBe('c2a3');
  });

  it('asks for a promotion piece and rejects a promotion on a quiet move', async () => {
    const session = GameSession.offline({
      rules: new ChessJsRules('k7/4P3/8/8/8/8/8/4K3 w - - 0 1'),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'promo',
      white: new LocalPlayer('white', 'Left'),
      black: new LocalPlayer('black', 'Right'),
    });
    const events: string[] = [];
    session.subscribe((event) => events.push(event.type));
    const asked = await session.submit({ kind: 'move', id: 'p', source: 'voice', from: 'e7', to: 'e8', seat: 'white' });
    expect(asked.ok).toBe(false);
    if (!asked.ok) expect(asked.reason).toBe('promotion-required');
    expect(events).toContain('promotion-required');
    const played = await session.submit({
      kind: 'move',
      id: 'q',
      source: 'voice',
      from: 'e7',
      to: 'e8',
      promotion: 'q',
      seat: 'white',
    });
    expect(played.ok).toBe(true);
    const quiet = offline();
    const extra = await quiet.submit({
      kind: 'move',
      id: 'e',
      source: 'pointer',
      from: 'e2',
      to: 'e4',
      promotion: 'q',
      seat: 'white',
    });
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.reason).toBe('promotion-not-needed');
  });

  it('rejects duplicate command ids and moves after checkmate', async () => {
    const session = offline();
    await session.submit({ kind: 'move', id: 'same', source: 'pointer', from: 'e2', to: 'e4', seat: 'white' });
    const again = await session.submit({ kind: 'move', id: 'same', source: 'pointer', from: 'e2', to: 'e4', seat: 'white' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('duplicate-command');

    const mate = offline();
    const moves: Array<[Color, string, string]> = [
      ['white', 'f2', 'f3'],
      ['black', 'e7', 'e5'],
      ['white', 'g2', 'g4'],
      ['black', 'd8', 'h4'],
    ];
    for (const [seat, from, to] of moves) {
      expect((await mate.submit({ kind: 'move', id: `${from}${to}`, source: 'local', from, to, seat })).ok).toBe(true);
    }
    expect(mate.snapshot.outcome?.status).toBe('mate');
    expect(mate.snapshot.outcome?.winner).toBe('black');
    const late = await mate.submit({ kind: 'move', id: 'late', source: 'local', from: 'a2', to: 'a3', seat: 'white' });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('terminal');
  });

  it('does not submit a move when input is cancelled or the session is disposed', async () => {
    const session = offline();
    const controller = new RecordingController(session);
    controller.attach();
    controller.hold();
    expect(controller.isGrabbing()).toBe(true);
    controller.cancel('pointer-cancel');
    expect(controller.isGrabbing()).toBe(false);
    expect(session.getLastCancelReason()).toBe('pointer-cancel');
    expect(session.snapshot.fen).toBe(START);
    controller.detach();
    expect(
      controller.release({
        intentId: 'x',
        pieceId: 'white-pawn-5',
        from: { file: 4, rank: 6 },
        to: { file: 4, rank: 4 },
        source: 'pointer',
      }),
    ).toBe(false);
    expect(session.snapshot.fen).toBe(START);
    session.dispose();
    const after = await session.submit({ kind: 'move', id: 'z', source: 'pointer', from: 'e2', to: 'e4', seat: 'white' });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe('disposed');
    expect(session.snapshot.fen).toBe(START);
  });

  it('keeps the same session across seated and immersive view changes', () => {
    const session = offline();
    const host = new GameSessionHost();
    host.attach(session);
    const version = session.snapshot.positionVersion;
    host.setView('immersive');
    host.setView('seated');
    expect(host.current).toBe(session);
    expect(session.id).toBe('session-offline');
    expect(session.snapshot.fen).toBe(START);
    expect(session.snapshot.positionVersion).toBe(version);
    expect(session.snapshot.viewMode).toBe('seated');
    expect(() => host.attach(offline())).toThrow(/session/i);
  });

  it('adjudicates a flagged clock offline and only reads it online as provisional', () => {
    const clock = new FlagClock();
    const session = GameSession.offline({
      rules: new ChessJsRules(),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'clock',
      white: new LocalPlayer('white', 'Left'),
      black: new LocalPlayer('black', 'Right'),
      clock,
    });
    clock.flagged = 'white';
    session.tick(1);
    expect(session.snapshot.outcome?.status).toBe('outoftime');
    expect(session.snapshot.outcome?.winner).toBe('black');
    session.dispose();
    expect(clock.disposed).toBe(true);
  });

  it('draws an offline flag when the opponent has no mating material', () => {
    const clock = new FlagClock();
    const session = GameSession.offline({
      rules: new ChessJsRules('k7/8/8/8/8/8/8/K7 w - - 0 1'),
      ids: new SequentialIds('s'),
      now: () => 0,
      sessionId: 'bare',
      white: new LocalPlayer('white', 'Left'),
      black: new LocalPlayer('black', 'Right'),
      clock,
    });
    clock.flagged = 'white';
    session.tick(1);
    expect(session.snapshot.outcome?.status).toBe('draw');
    expect(session.snapshot.outcome?.winner).toBeNull();
  });

  it('never calls fetch while two humans play offline', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('network forbidden');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const session = offline();
    await session.submit({ kind: 'move', id: '1', source: 'local', from: 'e2', to: 'e4', seat: 'white' });
    await session.submit({ kind: 'move', id: '2', source: 'local', from: 'e7', to: 'e5', seat: 'black' });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    const resigned = await session.submit({ kind: 'resign', id: 'r', source: 'local', seat: 'white' });
    expect(resigned.ok).toBe(true);
    expect(session.snapshot.outcome?.winner).toBe('black');
    const abort = await session.submit({ kind: 'abort', id: 'ab', source: 'local' });
    expect(abort.ok).toBe(false);
    if (!abort.ok) expect(abort.reason).toBe('terminal');
  });

  it('exposes a read-only view port with no submit surface', () => {
    const session = offline();
    const view = session.asViewPort();
    expect(view.id).toBe(session.id);
    expect(view.getSnapshot().fen).toBe(START);
    expect(view.legalMoveCandidates().length).toBeGreaterThan(0);
    expect('submit' in view).toBe(false);
    expect('seek' in view).toBe(false);
  });
});
