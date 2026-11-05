import * as THREE from 'three'
import { HallMetrics } from './HallMetrics'

/** Puts the hall in front of the headset once, then leaves it on the floor. */
export class XrPlacement {
  private placed = false
  private readonly forward = new THREE.Vector3()
  private readonly board = new THREE.Vector3()

  placeOnce(hall: THREE.Object3D, camera: THREE.Camera): void {
    if (this.placed) return
    this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
    this.forward.y = 0
    if (this.forward.lengthSq() < 1e-4) this.forward.set(0, 0, -1)
    this.forward.normalize()
    const head = camera.position
    const boardHeight = Math.min(0.86, Math.max(0.7, head.y - 0.39))
    this.board.copy(head).addScaledVector(this.forward, 0.58)
    this.board.y = boardHeight
    hall.rotation.y = Math.atan2(-this.forward.x, -this.forward.z)
    hall.position.set(this.board.x, this.board.y - HallMetrics.boardSurface, this.board.z)
    this.placed = true
  }

  reset(hall: THREE.Object3D): void {
    if (!this.placed && hall.position.lengthSq() === 0) return
    this.placed = false
    hall.position.set(0, 0, 0)
    hall.rotation.set(0, 0, 0)
  }
}
