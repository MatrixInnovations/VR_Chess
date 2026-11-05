import type { Square } from '../contracts/types'
import type { BoardModel } from './BoardModel'
import { MOVE_ARC_LIFT_M } from './metrics'
import type { PieceModel } from './PieceModel'

/** Clock used to sample animation time. Tests pass a manual one. */
export interface IClock {
  now(): number
}

interface ActiveMove {
  piece: PieceModel
  from: Square
  to: Square
  startMs: number
  durationMs: number
  startX: number
  startY: number
  startZ: number
  endX: number
  endY: number
  endZ: number
  onComplete?: () => void
}

/**
 * Slides a piece mesh from its current pose to a square.
 *
 * The arc is visual. Completion does not submit a move and does not edit the
 * session. {@link cancel} puts the mesh back on the square it left so a
 * mid-air piece cannot stay stuck after tracking loss.
 */
export class MoveAnimator {
  private readonly active = new Map<string, ActiveMove>()

  constructor(private readonly board: BoardModel, private readonly clock: IClock) {}

  /**
   * Start (or restart) the slide for `piece`.
   * A second call for the same piece cancels the first without its completion callback.
   */
  animate(piece: PieceModel, to: Square, durationMs: number, onComplete?: () => void): void {
    if (this.active.has(piece.id)) this.cancel(piece.id)
    const from = piece.getSquare()
    const start = piece.object.position
    const end = this.board.worldPosition(to)
    piece.object.userData.msAnimating = true
    this.active.set(piece.id, {
      piece,
      from,
      to: { file: to.file, rank: to.rank },
      startMs: this.clock.now(),
      durationMs,
      startX: start.x,
      startY: start.y,
      startZ: start.z,
      endX: end.x,
      endY: end.y,
      endZ: end.z,
      onComplete,
    })
  }

  /**
   * Advance every in-flight slide.
   * Pass `now` in milliseconds. When omitted, the constructor clock is used.
   */
  update(now: number = this.clock.now()): void {
    const finished: ActiveMove[] = []
    for (const move of this.active.values()) {
      const t =
        move.durationMs <= 0
          ? 1
          : Math.min(1, Math.max(0, (now - move.startMs) / move.durationMs))
      this.pose(move, t)
      if (t >= 1) finished.push(move)
    }
    for (const move of finished) this.finish(move)
  }

  /**
   * Stop one slide, or every slide when `pieceId` is omitted.
   * The mesh is snapped back to the square captured at the start. The
   * completion callback is not invoked.
   */
  cancel(pieceId?: string): void {
    const moves = pieceId === undefined ? [...this.active.values()] : [this.active.get(pieceId)]
    for (const move of moves) {
      if (!move) continue
      this.active.delete(move.piece.id)
      move.piece.object.userData.msAnimating = false
      // Snap before dropping the record so a same-turn reader cannot see the lifted pose.
      move.piece.snapToSquare(move.from)
    }
  }

  /** True when any slide is running, or when `pieceId` is the one running. */
  isAnimating(pieceId?: string): boolean {
    if (pieceId === undefined) return this.active.size > 0
    return this.active.has(pieceId)
  }

  private pose(move: ActiveMove, t: number): void {
    // sin(0) and sin(pi) are 0, so the piece starts and ends on the board
    // and only lifts in between. A cancel then has a square to return to.
    const lift = Math.sin(t * Math.PI) * MOVE_ARC_LIFT_M
    move.piece.object.position.set(
      move.startX + (move.endX - move.startX) * t,
      move.startY + (move.endY - move.startY) * t + lift,
      move.startZ + (move.endZ - move.startZ) * t,
    )
  }

  private finish(move: ActiveMove): void {
    this.active.delete(move.piece.id)
    move.piece.object.userData.msAnimating = false
    move.piece.snapToSquare(move.to)
    move.onComplete?.()
  }
}
