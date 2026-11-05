import type { IInputController } from '../contracts/IInputController'
import type { CancelReason, PieceSnapshot, Square, Vec3 } from '../contracts/types'
import type { PieceGrab } from './PieceGrab'

/** A Meta Touch Pro select, release, or tracking-loss sample. */
export interface XRSample {
  type: 'selectstart' | 'selectend' | 'trackinglost'
  hand: 'left' | 'right'
  square: Square | null
  piece: PieceSnapshot | null
  clock: boolean
  world: Vec3 | null
}

/**
 * Meta Touch Pro controller input.
 *
 * `selectstart` on a piece grabs it. `selectend` submits one intent.
 * Tracking loss on the selecting hand cancels. The other hand is ignored
 * while a grab is active, so two controllers cannot file two moves.
 */
export class XRControllerInput implements IInputController {
  /** @inheritdoc */
  readonly kind = 'xr-controller' as const

  private attached = false

  private selectingHand: 'left' | 'right' | null = null

  constructor(private readonly grab: PieceGrab) {}

  /** @inheritdoc */
  attach(): void {
    this.attached = true
  }

  /** @inheritdoc */
  detach(): void {
    this.cancel('detached')
    this.attached = false
  }

  /** @inheritdoc */
  isGrabbing(): boolean {
    return this.grab.isGrabbing()
  }

  /** @inheritdoc */
  cancel(reason: CancelReason): void {
    this.grab.cancel(reason)
    this.selectingHand = null
  }

  /**
   * Apply one controller sample.
   * A repeated `selectend` does not submit a second intent.
   */
  handle(sample: XRSample): void {
    if (!this.attached) return

    if (sample.type === 'trackinglost') {
      if (this.selectingHand === sample.hand) {
        if (this.grab.isGrabbing()) this.grab.cancel('tracking-loss')
        this.selectingHand = null
      }
      return
    }

    if (sample.type === 'selectstart') {
      if (this.selectingHand !== null && this.selectingHand !== sample.hand) return
      if (this.selectingHand === sample.hand) {
        if (sample.world && this.grab.isGrabbing()) this.grab.preview(sample.world)
        return
      }
      if (sample.clock && !sample.piece) {
        this.grab.tapClock()
        return
      }
      if (!sample.piece) return
      this.grab.setSource(this.kind)
      this.grab.begin(sample.piece)
      this.selectingHand = sample.hand
      if (sample.world) this.grab.preview(sample.world)
      return
    }

    if (this.selectingHand !== sample.hand) return
    this.grab.setSource(this.kind)
    this.grab.release(sample.square)
    this.selectingHand = null
  }
}
