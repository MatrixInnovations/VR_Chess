import type { IInputController } from '../contracts/IInputController'
import type { CancelReason, PieceSnapshot, Square, Vec3 } from '../contracts/types'
import { PINCH_ENGAGE_M, PINCH_RELEASE_M } from '../hall/metrics'
import type { PieceGrab } from './PieceGrab'

/** One hand-tracking sample. Joints are in meters. */
export interface HandJointSample {
  tracked: boolean
  thumbTip: Vec3 | null
  indexTip: Vec3 | null
  square: Square | null
  piece: PieceSnapshot | null
  clock: boolean
  world: Vec3 | null
}

/**
 * WebXR bare-hand input.
 *
 * A pinch (thumb to index) grabs the piece under the hand. Opening the pinch
 * places it. Losing either joint, or `tracked: false`, cancels the grab and
 * does not submit. The pinch thresholds use hysteresis so the pose can wobble.
 */
export class HandTrackingInput implements IInputController {
  /** @inheritdoc */
  readonly kind = 'hand' as const

  private attached = false

  private pinchHeld = false

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
    this.pinchHeld = false
  }

  /**
   * Apply one hand sample.
   * Pinch distance is measured in 3D, not on a single axis.
   */
  handle(sample: HandJointSample): void {
    if (!this.attached) return

    if (!sample.tracked || sample.thumbTip === null || sample.indexTip === null) {
      // Only a held piece cancels through the session. A clock pinch that
      // loses tracking is not a move and must not look like one.
      if (this.grab.isGrabbing()) this.grab.cancel('tracking-loss')
      this.pinchHeld = false
      return
    }

    const gap = distance(sample.thumbTip, sample.indexTip)
    // Hysteresis: engage at 2cm, release only after the fingers open past 4cm.
    const pinching = this.pinchHeld ? gap <= PINCH_RELEASE_M : gap <= PINCH_ENGAGE_M

    if (pinching && !this.pinchHeld) {
      this.pinchHeld = true
      if (sample.piece) {
        this.grab.setSource(this.kind)
        this.grab.begin(sample.piece)
        if (sample.world) this.grab.preview(sample.world)
      } else if (sample.clock) {
        this.grab.tapClock()
      }
      return
    }

    if (pinching && this.pinchHeld) {
      if (sample.world && this.grab.isGrabbing()) this.grab.preview(sample.world)
      return
    }

    if (!pinching && this.pinchHeld) {
      this.pinchHeld = false
      if (this.grab.isGrabbing()) {
        this.grab.setSource(this.kind)
        this.grab.release(sample.square)
      }
    }
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
