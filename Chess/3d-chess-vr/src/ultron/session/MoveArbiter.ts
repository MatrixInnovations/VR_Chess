import type { IChessRules } from '../contracts/IChessRules';
import type { SessionMove } from '../contracts/SessionIntent';
import type { Color, LegalMove, PromotionLetter, RejectReason } from '../contracts/types';
import { SquareName } from '../contracts/types';

/** Facts the session already knows before a move is judged. */
export interface ArbiterInput {
  readonly intent: SessionMove;
  readonly mode: 'offline' | 'online';
  readonly ourColor: Color | 'both' | null;
  readonly terminal: boolean;
  readonly phase: 'idle' | 'seeking' | 'challenging' | 'playing' | 'finished';
  readonly variantSupported: boolean;
  readonly boardCompatible: boolean;
  readonly duplicateCommand: boolean;
}

/** A move the session may submit, or a question/rejection for the user. */
export type ArbiterDecision =
  | { readonly ok: true; readonly from: string; readonly to: string; readonly promotion?: PromotionLetter; readonly uci: string }
  | { readonly ok: false; readonly reason: RejectReason; readonly candidates?: readonly LegalMove[]; readonly from?: string; readonly to?: string };

/**
 * Decides whether a move intent is legal, ambiguous, or not this seat's turn.
 * It never posts to Lichess and never chooses among several origins.
 */
export class MoveArbiter {
  /**
   * @param rules - Current position.
   */
  constructor(private readonly rules: IChessRules) {}

  /**
   * @param input - Intent plus session facts.
   * @returns A single concrete move, or a rejection that names what is missing.
   */
  decide(input: ArbiterInput): ArbiterDecision {
    if (input.duplicateCommand) return { ok: false, reason: 'duplicate-command' };
    if (input.terminal || input.phase === 'finished') return { ok: false, reason: 'terminal' };
    if (!input.variantSupported) return { ok: false, reason: 'unsupported-variant' };
    if (!input.boardCompatible) return { ok: false, reason: 'not-board-game' };
    if (input.phase !== 'playing') return { ok: false, reason: 'no-active-game' };
    const seat = this.seat(input);
    if (!seat.ok) return seat;
    if (!SquareName.isValid(input.intent.to)) return { ok: false, reason: 'invalid-command' };
    if (input.intent.from && !SquareName.isValid(input.intent.from)) return { ok: false, reason: 'invalid-command' };
    return this.resolve(input.intent);
  }

  private seat(input: ArbiterInput): ArbiterDecision | { ok: true } {
    const turn = this.rules.turn();
    if (input.mode === 'offline') {
      if (!input.intent.seat) return { ok: false, reason: 'seat-required' };
      if (input.intent.seat !== turn) return { ok: false, reason: 'not-your-turn' };
      return { ok: true };
    }
    if (input.ourColor !== 'white' && input.ourColor !== 'black') return { ok: false, reason: 'color-unknown' };
    if (input.intent.seat && input.intent.seat !== input.ourColor) return { ok: false, reason: 'not-your-turn' };
    if (turn !== input.ourColor) return { ok: false, reason: 'not-your-turn' };
    return { ok: true };
  }

  private resolve(intent: SessionMove): ArbiterDecision {
    const legal = this.rules.legalMoves().filter((move) => move.to === intent.to && (!intent.from || move.from === intent.from));
    if (intent.promotion) {
      const exact = legal.filter((move) => move.promotion === intent.promotion);
      if (exact.length === 1 && exact[0]) return this.accept(exact[0]);
      if (legal.some((move) => !move.promotion)) return { ok: false, reason: 'promotion-not-needed' };
      return { ok: false, reason: 'illegal' };
    }
    const origins = unique(legal.map((move) => move.from));
    if (origins.length === 0) return { ok: false, reason: 'illegal' };
    if (!intent.from && origins.length > 1) {
      return { ok: false, reason: 'origin-required', candidates: onePerOrigin(legal) };
    }
    const from = intent.from ?? origins[0];
    const fromMoves = legal.filter((move) => move.from === from);
    if (fromMoves.some((move) => move.promotion)) {
      return { ok: false, reason: 'promotion-required', from, to: intent.to };
    }
    const chosen = fromMoves[0];
    if (!chosen) return { ok: false, reason: 'illegal' };
    return this.accept(chosen);
  }

  private accept(move: LegalMove): ArbiterDecision {
    return { ok: true, from: move.from, to: move.to, promotion: move.promotion, uci: move.uci };
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function onePerOrigin(moves: readonly LegalMove[]): LegalMove[] {
  const seen = new Set<string>();
  const chosen: LegalMove[] = [];
  for (const move of moves) {
    if (seen.has(move.from)) continue;
    seen.add(move.from);
    chosen.push(move);
  }
  return chosen;
}
