import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three'

import type { Vec3 } from '../contracts/types'

/**
 * A tappable volume where Fridae and Vision's clock will sit.
 *
 * This lane does not run a clock. It only reports that a human tapped the
 * volume, via {@link setOnTap}. The callback must not submit a chess move.
 */
export class ClockTapTarget {
  /** Mesh placed on the table, off the 8x8. */
  readonly object: Mesh

  private onTap: (() => void) | null = null

  private readonly geometry: BoxGeometry

  private readonly material: MeshStandardMaterial

  constructor(position: Vec3) {
    this.geometry = new BoxGeometry(0.08, 0.05, 0.04)
    this.material = new MeshStandardMaterial({
      color: 0x20242b,
      roughness: 0.4,
      metalness: 0.3,
    })
    this.object = new Mesh(this.geometry, this.material)
    this.object.name = 'clock-tap-target'
    this.object.position.set(position.x, position.y, position.z)
    this.object.userData.msRole = 'clock'
    this.object.castShadow = true
  }

  /** Replace the tap handler. Pass null to clear it. */
  setOnTap(handler: (() => void) | null): void {
    this.onTap = handler
  }

  /** Fire the handler when one is registered. */
  tap(): void {
    if (this.onTap) this.onTap()
  }

  /**
   * Whether `point` lies in the clock volume.
   * `slop` grows the box in meters so a near-miss finger still counts.
   */
  containsWorldPoint(point: Vec3, slop = 0): boolean {
    this.object.updateMatrixWorld(true)
    const box = new Box3().setFromObject(this.object)
    if (slop > 0) box.expandByScalar(slop)
    return box.containsPoint(new Vector3(point.x, point.y, point.z))
  }

  /** Release the clock mesh. */
  dispose(): void {
    this.object.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
