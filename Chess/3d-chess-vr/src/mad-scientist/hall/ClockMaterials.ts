import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'

import type { ClockFaceExpiry } from './ClockViewMirror'

/**
 * Untextured materials for the table clock.
 *
 * One material per face state so a provisional zero, a confirmed flag, an
 * offline flag, a running clock, and a missing clock are different objects.
 * No texture maps: the hall's Quest budget still counts sampled textures.
 */
export class ClockMaterials {
  readonly body = new MeshPhysicalMaterial({
    color: 0xd5d8df,
    emissive: 0x6a707a,
    emissiveIntensity: 0.35,
    roughness: 0.22,
    metalness: 0.45,
    clearcoat: 0.2,
  })

  readonly running = new MeshPhysicalMaterial({ color: 0xe8e4dc, roughness: 0.45, metalness: 0.05, clearcoat: 0 })

  readonly provisional = new MeshPhysicalMaterial({
    color: 0xc9a44c,
    emissive: 0xc9a227,
    emissiveIntensity: 0.3,
    roughness: 0.4,
    metalness: 0.4,
    clearcoat: 0.1,
  })

  readonly confirmed = new MeshPhysicalMaterial({
    color: 0x8e2d2d,
    emissive: 0x6e1212,
    emissiveIntensity: 0.35,
    roughness: 0.48,
    metalness: 0.08,
    clearcoat: 0,
  })

  readonly offlineFlag = new MeshPhysicalMaterial({
    color: 0x8a4a2a,
    emissive: 0xc06a38,
    emissiveIntensity: 0.25,
    roughness: 0.45,
    metalness: 0.5,
    clearcoat: 0.08,
  })

  readonly noClock = new MeshPhysicalMaterial({ color: 0x6a6560, roughness: 0.7, metalness: 0.05, clearcoat: 0 })

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
