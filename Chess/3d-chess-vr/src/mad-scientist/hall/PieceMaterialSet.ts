import { Mesh, MeshStandardMaterial } from 'three'

import type { PieceColor, PieceFinish } from '../contracts/types'

/** Something that can wear a shared piece material. */
export interface MaterialHost {
  meshes(): readonly Mesh[]
}

/**
 * Shared materials for white and black pieces.
 * Materials live here, not on each piece, so a swap does not allocate
 * and so disposing a piece does not dispose a material another piece uses.
 */
export class PieceMaterialSet {
  private readonly table = new Map<string, MeshStandardMaterial>()

  constructor() {
    this.table.set('white:idle', this.make(0xf4f0e6, 0x000000, 0, 1))
    this.table.set('black:idle', this.make(0x1b1b1b, 0x000000, 0, 1))
    this.table.set('white:selected', this.make(0xf4f0e6, 0xc9a227, 0.55, 1))
    this.table.set('black:selected', this.make(0x1b1b1b, 0xc9a227, 0.7, 1))
    this.table.set('white:dragging', this.make(0xf4f0e6, 0x000000, 0, 0.65))
    this.table.set('black:dragging', this.make(0x1b1b1b, 0x000000, 0, 0.65))
  }

  /** The shared material for `color` and `finish`. */
  get(color: PieceColor, finish: PieceFinish): MeshStandardMaterial {
    return this.table.get(`${color}:${finish}`) as MeshStandardMaterial
  }

  /** Point every mesh on `host` at the shared material. */
  apply(host: MaterialHost, color: PieceColor, finish: PieceFinish): void {
    const material = this.get(color, finish)
    for (const mesh of host.meshes()) mesh.material = material
  }

  /** Dispose the shared materials. Call once, when the hall is torn down. */
  dispose(): void {
    for (const material of this.table.values()) material.dispose()
    this.table.clear()
  }

  private make(
    color: number,
    emissive: number,
    emissiveIntensity: number,
    opacity: number,
  ): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity,
      roughness: 0.35,
      metalness: 0.2,
      transparent: opacity < 1,
      opacity,
    })
  }
}
