import { MeshStandardMaterial } from 'three'

import type { ClockFaceExpiry } from './ClockViewMirror'

/**
 * Untextured materials for the table clock.
 *
 * One material per face state so a provisional zero, a confirmed flag, an
 * offline flag, a running clock, and a missing clock are different objects.
 * No texture maps: the hall's Quest budget still counts sampled textures.
 */
export class ClockMaterials {
  readonly body = new MeshStandardMaterial({ color: 0x2a3038, roughness: 0.45, metalness: 0.25 })

  readonly running = new MeshStandardMaterial({ color: 0xe7e1d6, roughness: 0.55, metalness: 0.02 })

  readonly provisional = new MeshStandardMaterial({
    color: 0xe0b15a,
    emissive: 0xc9a227,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    metalness: 0.04,
  })

  readonly confirmed = new MeshStandardMaterial({
    color: 0x8e2d2d,
    emissive: 0x6e1212,
    emissiveIntensity: 0.45,
    roughness: 0.48,
    metalness: 0.05,
  })

  readonly offlineFlag = new MeshStandardMaterial({
    color: 0x5c3d8a,
    emissive: 0x3a2460,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    metalness: 0.04,
  })

  readonly noClock = new MeshStandardMaterial({ color: 0x8d939c, roughness: 0.7, metalness: 0.02 })

  /**
   * Material for a classified face.
   * @param expiry - Result of {@link ClockViewMirror.present}.
   */
  forExpiry(expiry: ClockFaceExpiry): MeshStandardMaterial {
    switch (expiry) {
      case 'running':
        return this.running
      case 'provisional-expired':
        return this.provisional
      case 'confirmed-flag':
        return this.confirmed
      case 'offline-local-flag':
        return this.offlineFlag
      case 'no-clock':
        return this.noClock
    }
  }

  /** Release every clock material. */
  dispose(): void {
    this.body.dispose()
    this.running.dispose()
    this.provisional.dispose()
    this.confirmed.dispose()
    this.offlineFlag.dispose()
    this.noClock.dispose()
  }
}
