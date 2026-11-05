import type { IGameSession } from '../contracts/IGameSession'
import type { ChessHall } from '../hall/ChessHall'
import { ChessHall as Hall } from '../hall/ChessHall'
import type { FrameReport, PerformanceLogger } from '../hall/PerformanceBudget'
import { PerformanceBudget } from '../hall/PerformanceBudget'
import { MoveAnimator } from '../hall/MoveAnimator'
import { HandTrackingInput } from '../input/HandTrackingInput'
import { PieceGrab } from '../input/PieceGrab'
import type { IPointerPicker } from '../input/picking'
import { PointerDragInput } from '../input/PointerDragInput'
import { XRControllerInput } from '../input/XRControllerInput'

/** What a mounted hall needs from the page. */
export interface HallRuntimeOptions {
  session: IGameSession
  picker: IPointerPicker
  logger?: PerformanceLogger
}

/**
 * Composition root for this lane.
 *
 * One grab is shared by the pointer, the Touch Pro controllers, and the
 * hands, so two devices cannot submit two copies of the same move.
 * React mounts {@link ChessHall}; this class owns the behavior.
 */
export class HallRuntime {
  /** The room, board, and pieces. */
  readonly hall: ChessHall

  /** Visual slides. Does not submit moves. */
  readonly animator: MoveAnimator

  /** Quest Pro frame watchdog. */
  readonly budget: PerformanceBudget

  /** The single grab shared by every device. */
  readonly grab: PieceGrab

  /** Web pointer. */
  readonly pointer: PointerDragInput

  /** Meta Touch Pro. */
  readonly controllers: XRControllerInput

  /** Bare-hand pinch. */
  readonly hands: HandTrackingInput

  constructor(options: HallRuntimeOptions) {
    this.hall = new Hall({ pieces: options.session.getPieces() })
    this.animator = new MoveAnimator(this.hall.board, { now: () => Date.now() })
    this.budget = new PerformanceBudget({ logger: options.logger })
    this.grab = new PieceGrab({
      session: options.session,
      pieces: { get: (id) => this.hall.getPiece(id) },
      animator: this.animator,
      board: this.hall.board,
      source: 'pointer',
      clockTap: this.hall.clockTap,
    })
    this.pointer = new PointerDragInput(this.grab, options.picker)
    this.controllers = new XRControllerInput(this.grab)
    this.hands = new HandTrackingInput(this.grab)
  }

  /**
   * Advance slides and sample the frame budget.
   * Call once per rendered frame with the frame's timestamp.
   */
  frame(timestampMs: number): FrameReport {
    this.animator.update(timestampMs)
    return this.budget.sample(timestampMs)
  }

  /** Detach every device and release the hall. */
  dispose(): void {
    this.pointer.detach()
    this.controllers.detach()
    this.hands.detach()
    this.hall.dispose()
  }
}
