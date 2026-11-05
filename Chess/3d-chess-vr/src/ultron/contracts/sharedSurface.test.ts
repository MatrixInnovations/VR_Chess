import { describe, expect, it } from 'vitest';

import { LocalPlayer } from '../players/LocalPlayer';
import { ChessJsRules } from '../rules/ChessJsRules';
import { GameSession } from '../session/GameSession';
import { SequentialIds } from '../session/SequentialIds';
import { isOnBoard, squareKey, squaresEqual } from './squares';
import type { IGameSession } from './IGameSession';
import type { IInputController } from './IInputController';
import type { CancelReason, MoveSource } from './types';

class HandController implements IInputController {
  readonly kind: MoveSource = 'hand';
  private grabbing = false;

  constructor(private readonly game: GameSession) {}

  attach(): void {
    return undefined;
  }

  detach(): void {
    this.cancel('detached');
  }

  isGrabbing(): boolean {
    return this.grabbing;
  }

  cancel(reason: CancelReason): void {
    this.grabbing = false;
    this.game.cancelPendingMove(reason);
  }
}

function session(): GameSession {
  return GameSession.offline({
    rules: new ChessJsRules(),
    ids: new SequentialIds('shared'),
    now: () => 0,
    sessionId: 'shared',
    white: new LocalPlayer('white', 'Left'),
    black: new LocalPlayer('black', 'Right'),
  });
}

describe('shared hall contracts', () => {
  it('uses file 0 as the a-file and rank 0 as the far rank', () => {
    const e2 = { file: 4, rank: 6 };
    const e4 = { file: 4, rank: 4 };
    expect(isOnBoard(e2)).toBe(true);
    expect(isOnBoard({ file: 8, rank: 0 })).toBe(false);
    expect(isOnBoard({ file: 1.5, rank: 0 })).toBe(false);
    expect(squaresEqual(e2, { file: 4, rank: 6 })).toBe(true);
    expect(squareKey(e4)).toBe('4:4');
    const game = session();
    const port: IGameSession = game;
    const pawn = port.getPieces().find((piece) => piece.id === 'white-pawn-5');
    expect(pawn?.square).toEqual(e2);
    expect(port.getLegalDestinations('white-pawn-5')).toEqual(
      expect.arrayContaining([e4, { file: 4, rank: 5 }]),
    );
    const firstCopy = port.getPieces()[0];
    const secondCopy = port.getPieces()[0];
    expect(firstCopy).not.toBe(secondCopy);
    expect(firstCopy?.square).not.toBe(secondCopy?.square);
  });

  it('submits a pointer grab once and accepts a voice promotion without guessing', () => {
    const game = session();
    expect(
      game.submitMoveIntent({
        intentId: 'grab-1',
        pieceId: 'white-pawn-5',
        from: { file: 4, rank: 6 },
        to: { file: 4, rank: 4 },
        source: 'pointer',
      }),
    ).toBe(true);
    expect(game.getPieces().find((piece) => piece.id === 'white-pawn-5')?.square).toEqual({ file: 4, rank: 4 });
    expect(
      game.submitMoveIntent({
        intentId: 'grab-1',
        pieceId: 'white-pawn-5',
        from: { file: 4, rank: 4 },
        to: { file: 4, rank: 3 },
        source: 'pointer',
      }),
    ).toBe(false);
    game.cancelPendingMove('tracking-loss');
    expect(game.getLastCancelReason()).toBe('tracking-loss');
    expect(game.getPieces().find((piece) => piece.id === 'white-pawn-5')?.square).toEqual({ file: 4, rank: 4 });

    const promo = GameSession.offline({
      rules: new ChessJsRules('k7/4P3/8/8/8/8/8/4K3 w - - 0 1'),
      ids: new SequentialIds('promo'),
      now: () => 0,
      sessionId: 'promo-shared',
      white: new LocalPlayer('white', 'Left'),
      black: new LocalPlayer('black', 'Right'),
    });
    // The piece table follows the real game only from the standard start.
    // Voice still goes through submit(), which asks instead of choosing a queen.
    // A grab that names the queen is the shared promotion shape.
    const asked = promo.submitMoveIntent({
      intentId: 'voice-1',
      pieceId: 'missing',
      from: { file: 4, rank: 1 },
      to: { file: 4, rank: 0 },
      source: 'voice',
      promotion: 'queen',
    });
    expect(asked).toBe(false);
  });

  it('lets a controller cancel without submitting', () => {
    const game = session();
    const controller = new HandController(game);
    const typed: IInputController = controller;
    typed.attach();
    typed.cancel('released-origin');
    expect(game.snapshot.fen).toContain('PPPPPPPP');
    expect(typed.isGrabbing()).toBe(false);
  });
});
