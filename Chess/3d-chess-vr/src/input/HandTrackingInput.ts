import * as THREE from 'three'
import type { GameSession } from '../domain/GameSession'
import type { ChessHall } from '../view/ChessHall'
import type { InputRouter } from './InputRouter'

interface HandPinch {
  pinching: boolean
  uid: number | null
}

/**
 * Bare-hand play for Quest hand-tracking. A pinch grabs a piece or taps the clock.
 * Joints are read from the WebXR hand input source, in meters.
 */
export class HandTrackingInput {
  private readonly hands = new Map<string, HandPinch>()
  private readonly thumb = new THREE.Vector3()
  private readonly index = new THREE.Vector3()
  private readonly mid = new THREE.Vector3()

  constructor(
    private readonly router: InputRouter,
    private readonly hall: ChessHall,
    private readonly session: GameSession,
  ) {}

  update(frame: XRFrame | undefined, renderer: THREE.WebGLRenderer): void {
    const session = renderer.xr.getSession()
    const space = renderer.xr.getReferenceSpace()
    if (!frame || !session || !space) {
      this.hands.clear()
      return
    }
    for (const source of session.inputSources) {
      if (!source.hand) continue
      const key = source.handedness || 'hand'
      const state = this.hands.get(key) ?? { pinching: false, uid: null }
      this.hands.set(key, state)
      const thumbJoint = HandTrackingInput.joint(source.hand, 'thumb-tip')
      const indexJoint = HandTrackingInput.joint(source.hand, 'index-finger-tip')
      if (!thumbJoint || !indexJoint) continue
      if (!HandTrackingInput.pose(frame, thumbJoint, space, this.thumb)) continue
      if (!HandTrackingInput.pose(frame, indexJoint, space, this.index)) continue
      const gap = this.thumb.distanceTo(this.index)
      const pinching = state.pinching ? gap < 0.03 : gap < 0.018
      this.mid.copy(this.thumb).add(this.index).multiplyScalar(0.5)
      if (pinching && !state.pinching) {
        const button = this.hall.nearestButton(this.mid, 0.055)
        if (button) {
          this.router.button(button, this.mid)
        } else {
          const uid = this.hall.nearestPiece(this.mid, 0.06)
          if (uid != null && this.session.beginHold(uid)) state.uid = uid
        }
      } else if (pinching && state.uid != null) {
        this.session.moveHold(this.mid.x, this.mid.y, this.mid.z)
      } else if (!pinching && state.pinching && state.uid != null) {
        this.session.endHold(this.hall.squareFromWorld(this.mid))
        state.uid = null
      }
      state.pinching = pinching
    }
  }

  private static joint(hand: XRHand, name: string): XRJointSpace | undefined {
    const map = hand as unknown as { get(joint: string): XRJointSpace | undefined }
    return map.get(name)
  }

  private static pose(frame: XRFrame, joint: XRJointSpace, space: XRReferenceSpace, target: THREE.Vector3): boolean {
    const pose = frame.getJointPose?.(joint, space)
    if (!pose) return false
    const position = pose.transform.position
    target.set(position.x, position.y, position.z)
    return true
  }
}
