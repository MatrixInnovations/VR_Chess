import type { LegalMove } from './types';
import type { SessionEvent } from './SessionEvent';
import type { GameSnapshot } from './GameSnapshot';

/**
 * Read-only view of one Ultron session.
 *
 * Vision's stub `src/vision/ports/IGameSessionViewPort.ts` currently exposes only `id`.
 * This is the richer session-side port. On rebase, that stub should re-export this
 * interface. It has no submit, seek, resign, or dispose method, so a HUD cannot
 * apply a move through the type it uses to draw the board.
 */
export interface IGameSessionViewPort {
  /** Stable id. Object identity of the session also stays put across view toggles. */
  readonly id: string;
  /**
   * @returns The latest immutable snapshot, including FEN, clocks, and legal moves.
   */
  getSnapshot(): GameSnapshot;
  /**
   * @returns Legal moves for the side to move. Voice parsing uses this list and must not invent moves.
   */
  legalMoveCandidates(): readonly LegalMove[];
  /**
   * @param listener - Receives session facts. The listener cannot submit.
   * @returns Unsubscribe.
   */
  subscribe(listener: (event: SessionEvent) => void): () => void;
}
