import type { IInputController } from '../contracts/IInputController'
import type { CancelReason } from '../contracts/types'
import type { PieceGrab } from './PieceGrab'
import type { IPointerPicker } from './picking'

/** One pointer sample already translated into pixel coordinates. */
export interface PointerSample {
  type: 'down' | 'move' | 'up' | 'cancel'
  x: number
  y: number
  pointerId: number
}

/**
 * Mouse and touch drag for the flat web view.
 *
 * Pointer down on a piece starts a grab. Pointer up submits one intent.
 * `pointercancel` and {@link detach} put the piece back and do not submit.
 */
export class PointerDragInput implements IInputController {
  /** @inheritdoc */
  readonly kind = 'pointer' as const

  private attached = false

  private pointerId: number | null = null

  constructor(private readonly grab: PieceGrab, private readonly picker: IPointerPicker) {}

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
    this.pointerId = null
  }

  /**
   * Apply one pointer sample.
   * Samples are ignored until {@link attach}. A second pointer cannot steal the grab.
   */
  handle(sample: PointerSample): void {
    if (!this.attached) return

    if (sample.type === 'cancel') {
      if (this.pointerId === null || this.pointerId === sample.pointerId) {
        this.cancel('pointer-cancel')
      }
      return
    }

    if (sample.type === 'down') {
      if (this.pointerId !== null) return
      const hit = this.picker.pick(sample.x, sample.y)
      if (hit.clock && !hit.piece) {
        this.grab.tapClock()
        return
      }
      if (!hit.piece) return
      this.grab.setSource(this.kind)
      this.grab.begin(hit.piece)
      this.pointerId = sample.pointerId
      if (hit.world) this.grab.preview(hit.world)
      return
    }

    if (sample.type === 'move') {
      if (this.pointerId !== sample.pointerId) return
      const hit = this.picker.pick(sample.x, sample.y)
      if (hit.world) this.grab.preview(hit.world)
      return
    }

    if (this.pointerId !== sample.pointerId) return
    const hit = this.picker.pick(sample.x, sample.y)
    this.grab.setSource(this.kind)
    this.grab.release(hit.square)
    this.pointerId = null
  }
}
