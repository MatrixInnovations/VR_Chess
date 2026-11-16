import {
  DataTexture,
  LinearEncoding,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RGBAFormat,
  Texture,
  Vector2,
} from 'three'

import { coordinateBorderTexture, scratchMaps } from './MarbleTexture'
import { applyMarbleVeins } from './MarbleVeins'

import type { PieceColor, PieceFinish } from '../contracts/types'

/** Something that can wear a shared piece material. */
export interface MaterialHost {
  meshes(): readonly Mesh[]
}

/** Light squares are cream marble. Dark squares are black marble. */
export type BoardTone = 'light' | 'dark'

/** How heavy the shared material set is on a Quest Pro GPU. */
export interface MaterialGpuBudget {
  /** One material per look. Not one per square or per piece. */
  readonly materialCount: number
  /** Sampled texture slots. The marble veins themselves are a shader, not 64 maps. */
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

const METAL_KEYS = [
  'white:idle',
  'black:idle',
  'white:selected',
  'black:selected',
  'white:dragging',
  'black:dragging',
  'board:gold',
  'room:trim',
] as const

/**
 * Shared physical materials for the metal set and the black-marble hall.
 *
 * Chrome, copper, marble, and gold are one material per look. Veins vary by
 * a per-square seed, so Quest does not pay for 64 marble materials.
 * `scene.environment` supplies the reflections. Materials do not own an envMap.
 */
export class PieceMaterialSet {
  private readonly table = new Map<string, MeshStandardMaterial>()

  private readonly textures: Texture[] = []

  private contactMaterial: MeshBasicMaterial | null = null

  private scratch!: { roughness: Texture; normal: Texture }

  /**
   * Creates the instance.
   */
  constructor() {
    const uv = this.keep(whiteUvTexture())
    const scratch = scratchMaps()
    scratch.roughness.encoding = LinearEncoding
    scratch.normal.encoding = LinearEncoding
    this.keep(scratch.roughness)
    this.keep(scratch.normal)
    this.scratch = scratch
    const glyphs = this.keep(coordinateBorderTexture())

    this.put('white:idle', this.metal(0xd4d7dc, 0.08, 0, 0, 1, 0.08, 0.06, 2.15))
    this.put('black:idle', this.metal(0xc06a38, 0.14, 0, 0, 1, 0.1, 0.08, 1.95))
    this.put('white:selected', this.metal(0xd4d7dc, 0.08, 0xc9a44c, 0.12, 1, 0.08, 0.06, 2.15))
    this.put('black:selected', this.metal(0xc06a38, 0.14, 0xc9a44c, 0.12, 1, 0.1, 0.08, 1.95))
    this.put('white:dragging', this.metal(0xd4d7dc, 0.08, 0, 0, 0.7, 0.08, 0.06, 2.15))
    this.put('black:dragging', this.metal(0xc06a38, 0.14, 0, 0, 0.7, 0.1, 0.08, 1.95))

    this.put('board:light', this.marble(0xf0ebe3, uv, 0.16, 0.95, 0.08, 1.15, new Vector2(0.04, 0.04), false))
    this.put('board:dark', this.marble(0x0b0b0c, uv, 0.12, 1, 0.06, 1.45, new Vector2(0.035, 0.035), true))
    this.put('board:frame', this.marble(0x0b0b0c, uv, 0.13, 1, 0.06, 1.35, new Vector2(0.035, 0.035), true))
    this.put(
      'board:highlight',
      this.make({
        color: 0xc9a227,
        emissive: 0xc9a227,
        emissiveIntensity: 0.22,
        roughness: 0.28,
        metalness: 0.35,
        clearcoat: 0.4,
        envMapIntensity: 1.1,
        polygonOffset: true,
      }),
    )
    this.put('board:gold', this.metal(0xc9a44c, 0.18, 0, 0, 1, 0.15, 0.12, 1.85))
    this.put(
      'board:coords',
      this.make({
        color: 0xe8d4b0,
        map: glyphs,
        roughness: 0.28,
        metalness: 0.55,
        clearcoat: 0.2,
        clearcoatRoughness: 0.25,
        envMapIntensity: 1.2,
        transparent: true,
      }),
    )
    this.put(
      'piece:felt',
      this.make({
        color: 0x1a231c,
        roughness: 0.95,
        metalness: 0,
        clearcoat: 0,
        envMapIntensity: 0.3,
        sheen: 0.45,
        sheenColor: 0x2a3a2e,
        sheenRoughness: 0.75,
      }),
    )

    this.put('room:floor', this.marble(0x0a0a0b, uv, 0.16, 0.85, 0.1, 1.2, new Vector2(0.035, 0.035), true))
    this.put('room:plaster', this.make({ color: 0x12100e, roughness: 0.55, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.6 }))
    this.put('room:ceiling', this.make({ color: 0x0c0b0a, roughness: 0.7, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.6, envMapIntensity: 0.4 }))
    this.put('room:rug', this.make({ color: 0x161412, roughness: 0.9, metalness: 0, clearcoat: 0, envMapIntensity: 0.2 }))
    this.put('room:seat', this.make({ color: 0x161412, roughness: 0.88, metalness: 0, clearcoat: 0, envMapIntensity: 0.35, sheen: 0.4, sheenColor: 0x2a2420 }))
    this.put('room:leg', this.make({ color: 0x141210, roughness: 0.35, metalness: 0.05, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 0.8 }))
    this.put(
      'room:window',
      this.make({
        color: 0xffd4a0,
        emissive: 0xffb56a,
        emissiveIntensity: 0.45,
        roughness: 0.15,
        metalness: 0,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.8,
      }),
    )
    this.put('room:trim', this.metal(0xc9a44c, 0.22, 0, 0, 1, 0.15, 0.15, 1.6))
  }

  /** The shared material for `color` and `finish`. */
  get(color: PieceColor, finish: PieceFinish): MeshStandardMaterial {
    return this.table.get(`${color}:${finish}`) as MeshStandardMaterial
  }

  /**
   * Cream or black marble.
   * The same instance is reused for every square of that tone.
   */
  boardSquare(tone: BoardTone): MeshStandardMaterial {
    return this.table.get(`board:${tone}`) as MeshStandardMaterial
  }

  /** Black marble lip around the 8x8. Also used for the table top. */
  boardFrame(): MeshStandardMaterial {
    return this.table.get('board:frame') as MeshStandardMaterial
  }

  /** Legal-move highlight. One material, swapped onto a square and swapped back. */
  highlightMaterial(): MeshStandardMaterial {
    return this.table.get('board:highlight') as MeshStandardMaterial
  }

  /** Champagne file and rank glyphs. */
  coords(): MeshStandardMaterial {
    return this.table.get('board:coords') as MeshStandardMaterial
  }

  /** Dark felt under a piece base. */
  felt(): MeshStandardMaterial {
    return this.table.get('piece:felt') as MeshStandardMaterial
  }

  /** Black marble floor. */
  floorWood(): MeshStandardMaterial {
    return this.table.get('room:floor') as MeshStandardMaterial
  }

  /** Dark stone walls. */
  plaster(): MeshStandardMaterial {
    return this.table.get('room:plaster') as MeshStandardMaterial
  }

  /** Near-black ceiling. */
  ceiling(): MeshStandardMaterial {
    return this.table.get('room:ceiling') as MeshStandardMaterial
  }

  /** Hidden rug material. The mesh itself is not shown. */
  rugFelt(): MeshStandardMaterial {
    return this.table.get('room:rug') as MeshStandardMaterial
  }

  /** Both chairs. */
  seatCloth(): MeshStandardMaterial {
    return this.table.get('room:seat') as MeshStandardMaterial
  }

  /** Table legs. */
  leg(): MeshStandardMaterial {
    return this.table.get('room:leg') as MeshStandardMaterial
  }

  /** Warm practical pane. */
  windowPane(): MeshStandardMaterial {
    return this.table.get('room:window') as MeshStandardMaterial
  }

  /** Soft disc under a piece. It does not cast a shadow of its own. */
  contact(): MeshBasicMaterial {
    if (!this.contactMaterial) {
      this.contactMaterial = new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    }
    return this.contactMaterial
  }

  /** Brass inlay and the gold lines between squares. */
  gold(): MeshStandardMaterial {
    return this.table.get('board:gold') as MeshStandardMaterial
  }

  /** Gold trim, window frame, and column rings. */
  trimWood(): MeshStandardMaterial {
    return this.table.get('room:trim') as MeshStandardMaterial
  }

  /**
   * Desktop lets the reflector show through the marble and keeps micro-scratches.
   * Quest uses opaque marble and constant metal roughness.
   */
  setTier(tier: 'desktop' | 'quest'): void {
    const desktop = tier === 'desktop'
    const light = this.boardSquare('light')
    const dark = this.boardSquare('dark')
    light.opacity = desktop ? 0.9 : 1
    dark.opacity = desktop ? 0.78 : 1
    light.transparent = desktop
    dark.transparent = desktop
    light.depthWrite = !desktop
    dark.depthWrite = !desktop
    for (const key of METAL_KEYS) {
      const material = this.table.get(key) as MeshPhysicalMaterial
      material.roughnessMap = desktop ? this.scratch.roughness : null
      material.normalMap = desktop ? this.scratch.normal : null
      material.needsUpdate = true
    }
  }

  /**
   * Counts shared materials and sampled textures.
   * Desktop and Quest share this set; {@link setTier} only toggles maps and opacity.
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

  /** Dispose the shared materials and the marble maps. Call once, when the hall is torn down. */
  dispose(): void {
    for (const material of this.table.values()) material.dispose()
    this.contactMaterial?.dispose()
    for (const texture of this.textures) texture.dispose()
    this.table.clear()
    this.textures.length = 0
  }

  private keep(texture: Texture): Texture {
    this.textures.push(texture)
    return texture
  }

  private metal(
    color: number,
    roughness: number,
    emissive = 0,
    emissiveIntensity = 0,
    opacity = 1,
    clearcoat = 0,
    clearcoatRoughness = 0.06,
    envMapIntensity = 1,
  ): MeshPhysicalMaterial {
    const material = this.make({
      color,
      roughness,
      roughnessMap: this.scratch.roughness,
      normalMap: this.scratch.normal,
      metalness: 1,
      clearcoat,
      clearcoatRoughness,
      emissive,
      emissiveIntensity,
      opacity,
      envMapIntensity,
    })
    material.normalScale.set(0.03, 0.03)
    return material
  }

  private marble(
    color: number,
    map: Texture,
    roughness: number,
    clearcoat: number,
    clearcoatRoughness: number,
    envMapIntensity: number,
    normalScale: Vector2,
    dark: boolean,
  ): MeshPhysicalMaterial {
    const material = this.make({
      color,
      map,
      roughness,
      metalness: 0,
      clearcoat,
      clearcoatRoughness,
      envMapIntensity,
      ior: 1.5,
      reflectivity: 0.5,
    })
    material.normalScale.copy(normalScale)
    applyMarbleVeins(material, dark)
    return material
  }

  private put(key: string, material: MeshStandardMaterial): void {
    this.table.set(key, material)
  }

  private make(args: {
    color: number
    map?: Texture
    emissive?: number
    emissiveIntensity?: number
    opacity?: number
    roughness: number
    roughnessMap?: Texture
    normalMap?: Texture
    metalness: number
    clearcoat?: number
    clearcoatRoughness?: number
    envMapIntensity?: number
    ior?: number
    reflectivity?: number
    sheen?: number
    sheenColor?: number
    sheenRoughness?: number
    transparent?: boolean
    polygonOffset?: boolean
  }): MeshPhysicalMaterial {
    const opacity = args.opacity ?? 1
    const material = new MeshPhysicalMaterial({
      color: args.color,
      map: args.map ?? null,
      roughnessMap: args.roughnessMap ?? null,
      normalMap: args.normalMap ?? null,
      emissive: args.emissive ?? 0x000000,
      emissiveIntensity: args.emissiveIntensity ?? 0,
      roughness: args.roughness,
      metalness: args.metalness,
      clearcoat: args.clearcoat ?? 0,
      clearcoatRoughness: args.clearcoatRoughness ?? 0,
      envMapIntensity: args.envMapIntensity ?? 1,
      transparent: args.transparent ?? opacity < 1,
      opacity,
      depthWrite: opacity >= 1 && !args.transparent,
      polygonOffset: args.polygonOffset ?? false,
      polygonOffsetFactor: args.polygonOffset ? -2 : 0,
      polygonOffsetUnits: args.polygonOffset ? -2 : 0,
    })
    if (args.ior !== undefined) material.ior = args.ior
    if (args.sheen !== undefined) material.sheen = args.sheen
    if (args.sheenColor !== undefined) material.sheenColor.setHex(args.sheenColor)
    if (args.sheenRoughness !== undefined) material.sheenRoughness = args.sheenRoughness
    return material
  }
}

function whiteUvTexture(): DataTexture {
  const data = new Uint8Array([255, 255, 255, 255])
  const texture = new DataTexture(data, 1, 1, RGBAFormat)
  texture.needsUpdate = true
  return texture
}
