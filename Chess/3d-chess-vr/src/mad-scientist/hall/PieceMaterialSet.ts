import { Mesh, MeshStandardMaterial, Texture } from 'three'

import type { PieceColor, PieceFinish } from '../contracts/types'

/** Something that can wear a shared piece material. */
export interface MaterialHost {
  meshes(): readonly Mesh[]
}

/** Light squares are felted maple. Dark squares are walnut. */
export type BoardTone = 'light' | 'dark'

/** How heavy the shared material set is on a Quest Pro GPU. */
export interface MaterialGpuBudget {
  /** One material per look. Not one per square or per piece. */
  readonly materialCount: number
  /** Texture maps. Zero is the budget: sampled maps blow the 72fps floor. */
  readonly textureCount: number
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'lightMap',
  'envMap',
] as const

/**
 * Shared materials for pieces and the hall.
 *
 * White is matte boxwood. Black is denser ebony, not a recolor of the same
 * shader. The board is felt and walnut with no texture maps. Every look is
 * one {@link MeshStandardMaterial} so the Quest Pro shadow pass stays inside
 * the 72fps floor. Do not raise {@link PerformanceBudget} to hide a map.
 */
export class PieceMaterialSet {
  private readonly table = new Map<string, MeshStandardMaterial>()

  constructor() {
    this.put('white:idle', this.make({ color: 0xf2e6d0, roughness: 0.62, metalness: 0.04 }))
    this.put('black:idle', this.make({ color: 0x1a120e, roughness: 0.34, metalness: 0.08 }))
    this.put(
      'white:selected',
      this.make({
        color: 0xf2e6d0,
        emissive: 0xc9a227,
        emissiveIntensity: 0.55,
        roughness: 0.62,
        metalness: 0.04,
      }),
    )
    this.put(
      'black:selected',
      this.make({
        color: 0x1a120e,
        emissive: 0xc9a227,
        emissiveIntensity: 0.7,
        roughness: 0.34,
        metalness: 0.08,
      }),
    )
    this.put(
      'white:dragging',
      this.make({ color: 0xf2e6d0, roughness: 0.62, metalness: 0.04, opacity: 0.65 }),
    )
    this.put(
      'black:dragging',
      this.make({ color: 0x1a120e, roughness: 0.34, metalness: 0.08, opacity: 0.65 }),
    )
    this.put('board:light', this.make({ color: 0xd9c7a2, roughness: 0.92, metalness: 0 }))
    this.put('board:dark', this.make({ color: 0x5c3b24, roughness: 0.58, metalness: 0.03 }))
    this.put('board:frame', this.make({ color: 0x3a2415, roughness: 0.55, metalness: 0.04 }))
    this.put(
      'board:highlight',
      this.make({
        color: 0xc9a227,
        emissive: 0xc9a227,
        emissiveIntensity: 0.45,
        roughness: 0.45,
        metalness: 0.06,
      }),
    )
    this.put('room:floor', this.make({ color: 0x6a503c, roughness: 0.78, metalness: 0.02 }))
    this.put('room:plaster', this.make({ color: 0xe4ddd2, roughness: 0.9, metalness: 0 }))
    this.put('room:rug', this.make({ color: 0x6e2f3a, roughness: 0.96, metalness: 0 }))
    this.put('room:seat', this.make({ color: 0x3e342c, roughness: 0.84, metalness: 0.02 }))
    this.put('room:window', this.make({ color: 0x9eb4c2, roughness: 0.22, metalness: 0.04 }))
    this.put('room:trim', this.make({ color: 0x4a3424, roughness: 0.6, metalness: 0.03 }))
  }

  /** The shared material for `color` and `finish`. */
  get(color: PieceColor, finish: PieceFinish): MeshStandardMaterial {
    return this.table.get(`${color}:${finish}`) as MeshStandardMaterial
  }

  /**
   * Light felted maple or dark walnut.
   * The same instance is reused for every square of that tone.
   */
  boardSquare(tone: BoardTone): MeshStandardMaterial {
    return this.table.get(`board:${tone}`) as MeshStandardMaterial
  }

  /** Walnut lip around the 8x8. Also used for the table top. */
  boardFrame(): MeshStandardMaterial {
    return this.table.get('board:frame') as MeshStandardMaterial
  }

  /** Legal-move highlight. One material, swapped onto a square and swapped back. */
  highlightMaterial(): MeshStandardMaterial {
    return this.table.get('board:highlight') as MeshStandardMaterial
  }

  /** Plank floor. */
  floorWood(): MeshStandardMaterial {
    return this.table.get('room:floor') as MeshStandardMaterial
  }

  /** Walls and ceiling. Flat color, no paint texture. */
  plaster(): MeshStandardMaterial {
    return this.table.get('room:plaster') as MeshStandardMaterial
  }

  /** Rug under the table. High roughness reads as cloth without a normal map. */
  rugFelt(): MeshStandardMaterial {
    return this.table.get('room:rug') as MeshStandardMaterial
  }

  /** Both chairs. */
  seatCloth(): MeshStandardMaterial {
    return this.table.get('room:seat') as MeshStandardMaterial
  }

  /** Opaque pane. A transparent shader would be an extra pass on Quest. */
  windowPane(): MeshStandardMaterial {
    return this.table.get('room:window') as MeshStandardMaterial
  }

  /** Baseboards, table legs, and the window trim. */
  trimWood(): MeshStandardMaterial {
    return this.table.get('room:trim') as MeshStandardMaterial
  }

  /**
   * Counts shared materials and sampled textures.
   * A non-zero texture count means this set is no longer honest about 72fps.
   */
  gpuBudget(): MaterialGpuBudget {
    let textureCount = 0
    for (const material of this.table.values()) {
      for (const slot of TEXTURE_SLOTS) {
        const value = material[slot] as Texture | null
        if (value) textureCount += 1
      }
    }
    return { materialCount: this.table.size, textureCount }
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

  private put(key: string, material: MeshStandardMaterial): void {
    this.table.set(key, material)
  }

  private make(args: {
    color: number
    emissive?: number
    emissiveIntensity?: number
    opacity?: number
    roughness: number
    metalness: number
  }): MeshStandardMaterial {
    const opacity = args.opacity ?? 1
    return new MeshStandardMaterial({
      color: args.color,
      emissive: args.emissive ?? 0x000000,
      emissiveIntensity: args.emissiveIntensity ?? 0,
      roughness: args.roughness,
      metalness: args.metalness,
      transparent: opacity < 1,
      opacity,
    })
  }
}
