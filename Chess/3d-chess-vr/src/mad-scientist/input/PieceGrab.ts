import type { IGameSession } from '../contracts/IGameSession'
import { isOnBoard, squaresEqual } from '../contracts/squares'
import type { CancelReason, MoveIntent, MoveSource, PieceSnapshot, Square, Vec3 } from '../contracts/types'
import type { BoardModel } from '../hall/BoardModel'
import type { ClockTapTarget } from '../hall/ClockTapTarget'
import { MOVE_DURATION_MS } from '../hall/metrics'
import type { MoveAnimator } from '../hall/MoveAnimator'
import type { PieceModel } from '../hall/PieceModel'
import { IntentIdSequence } from './IntentIdSequence'

/** Looks up the mesh for a piece id. The hall implements this. */
export interface IPieceLookup {
  get(id: string): PieceModel | undefined
}

/** Supplies {@link MoveIntent.intentId}. */
export interface IIntentIds {
  next(): string
}

/** Collaborators for {@link PieceGrab}. */
export interface PieceGrabOptions {
  session: IGameSession
  pieces: IPieceLookup
  animator: MoveAnimator
  board: BoardModel
  source: MoveSource
  ids?: IIntentIds
  clockTap?: ClockTapTarget | null
  moveDurationMs?: number
}

/**
 * One held piece, shared by pointer, controller, and hand input.
 *
 * A completed gesture calls {@link IGameSession.submitMoveIntent} exactly once.
 * The grab never writes the board. On reject or cancel the mesh snaps home.
 */
export class PieceGrab {
  private readonly session: IGameSession

  private readonly pieces: IPieceLookup

  private readonly animator: MoveAnimator

  private readonly board: BoardModel

  private readonly ids: IIntentIds

  private readonly clockTap: ClockTapTarget | null

  private readonly moveDurationMs: number

  private source: MoveSource

  private grabbed: { piece: PieceSnapshot; origin: Square } | null = null

  private submitted = false

  constructor(options: PieceGrabOptions) {
    this.session = options.session
    this.pieces = options.pieces
    this.animator = options.animator
    this.board = options.board
    this.source = options.source
    this.ids = options.ids ?? new IntentIdSequence()
    this.clockTap = options.clockTap ?? null
    this.moveDurationMs = options.moveDurationMs ?? MOVE_DURATION_MS
  }

  /** Which device will be written onto the next intent. */
  setSource(source: MoveSource): void {
    this.source = source
  }

  /** True while a piece is held and the gesture has not finished. */
  isGrabbing(): boolean {
    return this.grabbed !== null
  }

  /**
   * Pick up `piece` and highlight the session's legal squares.
   * Returns false when a grab is already active or the square is off the board.
   */
  begin(piece: PieceSnapshot): boolean {
    if (this.grabbed) return false
    if (!isOnBoard(piece.square)) return false
    this.grabbed = {
      piece: { ...piece, square: { ...piece.square } },
      origin: { ...piece.square },
    }
    this.submitted = false
    const model = this.pieces.get(piece.id)
    if (model) model.applyFinish('selected')
    this.board.highlight(this.session.getLegalDestinations(piece.id))
    return true
  }

  /** Hover the mesh. No session call. */
  preview(world: Vec3): void {
    if (!this.grabbed) return
    const model = this.pieces.get(this.grabbed.piece.id)
    if (!model) return
    model.setPreviewPosition(world)
    model.applyFinish('dragging')
  }

  /**
   * End the gesture on `target`.
   * Returns the session's answer. A null, off-board, or origin target cancels
   * instead of submitting. A second call for the same grab does not submit again.
   */
  release(target: Square | null): boolean {
    if (!this.grabbed || this.submitted) return false
    const origin = this.grabbed.origin
    const piece = this.grabbed.piece
    if (target === null || !isOnBoard(target) || squaresEqual(target, origin)) {
      this.session.cancelPendingMove('released-origin')
      this.restore(origin, piece.id)
      this.board.clearHighlights()
      this.grabbed = null
      return false
    }

    // Flip the latch before the session call. Quest can re-enter release from
    // selectend while the first call is still on the stack.
    this.submitted = true
    const intent: MoveIntent = {
      intentId: this.ids.next(),
      pieceId: piece.id,
      from: { file: origin.file, rank: origin.rank },
      to: { file: target.file, rank: target.rank },
      source: this.source,
    }
    const accepted = this.session.submitMoveIntent(intent)
    if (accepted) {
      const model = this.pieces.get(piece.id)
      if (model) {
        this.animator.cancel(model.id)
        model.snapToSquare(origin)
        model.applyFinish('idle')
        this.animator.animate(
          model,
          { file: target.file, rank: target.rank },
          this.moveDurationMs,
        )
      }
    } else {
      this.restore(origin, piece.id)
    }
    this.board.clearHighlights()
    this.grabbed = null
    this.submitted = false
    return accepted
  }

  /**
   * Abort the grab. No intent is submitted.
   * If a submit is already in flight, this is a no-op so we do not undo a
   * move the session has accepted.
   */
  cancel(reason: CancelReason): void {
    if (!this.grabbed || this.submitted) return
    this.session.cancelPendingMove(reason)
    this.restore(this.grabbed.origin, this.grabbed.piece.id)
    this.board.clearHighlights()
    this.grabbed = null
  }

  /** Forward a clock tap. Does not submit a chess move. */
  tapClock(): void {
    this.clockTap?.tap()
  }

  private restore(square: Square, pieceId: string): void {
    this.animator.cancel(pieceId)
    const model = this.pieces.get(pieceId)
    if (!model) return
    model.snapToSquare(square)
    model.applyFinish('idle')
  }
}
