import type { IGameSession } from '../mad-scientist/contracts/IGameSession'
import type { Square } from '../mad-scientist/contracts/types'
import { squaresEqual } from '../mad-scientist/contracts/squares'
import type { ChessHall } from '../mad-scientist/hall/ChessHall'
import { MOVE_DURATION_MS } from '../mad-scientist/hall/metrics'
import type { MoveAnimator } from '../mad-scientist/hall/MoveAnimator'

/**
 * Keeps hall meshes on the session's pieces.
 *
 * Local grabs may slide ahead of an online echo. Those piece ids are held
 * until the session square catches up, or until the echo is rejected.
 * Opponent moves, captures, and castling slides are started here.
 * This class does not submit moves.
 */
export class HallBoardSync {
  private readonly holds = new Map<string, Square>()

  /**
   * @param hall - Piece meshes.
   * @param session - Source of truth for which piece is on which square.
   * @param animator - Visual slides. Completion does not submit.
   */
  constructor(
    private readonly hall: ChessHall,
    private session: IGameSession,
    private readonly animator: MoveAnimator,
  ) {}

  /**
   * Follow a replacement session. A view toggle does not call this.
   * @param session - Next game.
   */
  retarget(session: IGameSession): void {
    this.session = session
    this.holds.clear()
  }

  /**
   * Remember that `pieceId` is visually committed to `to` before the session echoes it.
   * @param pieceId - Piece that just left the hand.
   * @param to - Square the grab submitted.
   */
  hold(pieceId: string, to: Square): void {
    this.holds.set(pieceId, { file: to.file, rank: to.rank })
  }

  /** Drop every optimistic hold so the next reconcile follows the session. */
  releaseHolds(): void {
    this.holds.clear()
  }

  /**
   * Add, remove, promote, or slide meshes so they match {@link IGameSession.getPieces}.
   * A piece already sliding, or held ahead of the echo, is left alone.
   */
  reconcile(): void {
    const next = this.session.getPieces()
    const nextIds = new Set(next.map((piece) => piece.id))
    for (const model of this.hall.getPieces()) {
      if (nextIds.has(model.id)) continue
      if (this.animator.isAnimating(model.id)) continue
      this.hall.removePiece(model.id)
      this.holds.delete(model.id)
    }
    for (const piece of next) {
      const model = this.hall.getPiece(piece.id)
      if (!model || model.kind !== piece.kind) {
        if (model && this.animator.isAnimating(model.id)) continue
        this.hall.upsertPiece(piece)
        this.holds.delete(piece.id)
        continue
      }
      if (squaresEqual(model.getSquare(), piece.square)) {
        this.holds.delete(piece.id)
        continue
      }
      if (this.animator.isAnimating(piece.id)) continue
      const held = this.holds.get(piece.id)
      if (held && squaresEqual(model.getSquare(), held) && !squaresEqual(piece.square, held)) {
        continue
      }
      this.holds.delete(piece.id)
      model.applyFinish('idle')
      this.animator.animate(model, piece.square, MOVE_DURATION_MS)
    }
  }
}
