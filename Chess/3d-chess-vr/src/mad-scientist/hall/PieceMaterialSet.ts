import {
  LinearEncoding,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three'

import type { BakedMarbleMaps } from './MarbleVeins'
import { bakeMarble, contactFalloffTexture, coordinateBorderTexture, marbleBakeSize, scratchMaps } from './MarbleTexture'

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

  private bakeTargets: { dispose(): void }[] = []

  private scratch!: { roughness: Texture; normal: Texture }

  /**
   * Creates the instance.
   */
  constructor() {
    const size = marbleBakeSize()
    const lightAtlas = this.keep(bakeMarble({ size, dark: false, veinMix: 1, cells: 8 }))
    const darkAtlas = this.keep(bakeMarble({ size, dark: true, veinMix: 0.85, cells: 8 }))
    const floorTile = this.keep(bakeMarble({
      size: Math.max(64, size / 2),
      dark: true,
      veinMix: 0.35,
      cells: 1,
      base: [10, 10, 11],
    }))
    floorTile.repeat.set(4, 4)
    const wallTile = this.keep(bakeMarble({
      size: Math.max(64, size / 2),
      dark: true,
      veinMix: 0.25,
      cells: 1,
      base: [12, 11, 10],
    }))
    wallTile.repeat.set(1.5, 1.5)
    const scratch = scratchMaps()
    scratch.roughness.encoding = LinearEncoding
    scratch.normal.encoding = LinearEncoding
    this.keep(scratch.roughness)
    this.keep(scratch.normal)
    this.scratch = scratch
    const glyphs = this.keep(coordinateBorderTexture())

    this.put('white:idle', this.metal(0xd4d7dc, 0.08, 0x8d929b, 0.22, 1, 0.08, 0.06, 1.5))
    this.put('black:idle', this.metal(0xc06a38, 0.12, 0, 0, 1, 0.06, 0.08, 1.15))
    this.put('white:selected', this.metal(0xd4d7dc, 0.08, 0xc9a44c, 0.12, 1, 0.08, 0.06, 1.5))
    this.put('black:selected', this.metal(0xc06a38, 0.12, 0xc9a44c, 0.12, 1, 0.06, 0.08, 1.15))
    this.put('white:dragging', this.metal(0xd4d7dc, 0.08, 0x8d929b, 0.22, 0.7, 0.08, 0.06, 1.5))
    this.put('black:dragging', this.metal(0xc06a38, 0.12, 0, 0, 0.7, 0.06, 0.08, 1.15))

    this.put('board:light', this.marble(lightAtlas, 0.16, 0.95, 0.08, 0.4))
    this.put('board:dark', this.marble(darkAtlas, 0.12, 1, 0.06, 0.15))
    this.put('board:frame', this.marble(floorTile, 0.13, 0.2, 0.18, 0.4))
    this.put(
      'board:highlight',
      this.make({
        color: 0xf3e2a4,
        emissive: 0xc9a44c,
        emissiveIntensity: 0.9,
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
        sheen: 0,
      }),
    )

    this.put('room:floor', this.marble(floorTile, 0.5, 0.15, 0.22, 0.35))
    this.put('room:table', this.marble(floorTile, 0.45, 0.2, 0.22, 0.12))
    this.put('room:wall', this.marble(wallTile, 0.62, 0.08, 0.3, 0.45))
    this.put('room:plaster', this.marble(wallTile, 0.62, 0.08, 0.3, 0.45))
    this.put('room:ceiling', this.make({ color: 0x0c0b0a, roughness: 0.7, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.6, envMapIntensity: 0.4 }))
    this.put('room:rug', this.make({ color: 0x161412, roughness: 0.9, metalness: 0, clearcoat: 0, envMapIntensity: 0.2 }))
    this.put('room:seat', this.make({ color: 0x161412, roughness: 0.88, metalness: 0, clearcoat: 0, envMapIntensity: 0.35 }))
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

  /** Black marble table top. Separate from the board so the table stays dimmer. */
  tableTop(): MeshStandardMaterial {
    return this.table.get('room:table') as MeshStandardMaterial
  }

  /** Black marble floor. */
  floorWood(): MeshStandardMaterial {
    return this.table.get('room:floor') as MeshStandardMaterial
  }

  /** Black marble walls. Large veins, almost no clearcoat. */
  wall(): MeshStandardMaterial {
    return this.table.get('room:wall') as MeshStandardMaterial
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
        map: this.keep(contactFalloffTexture()),
        transparent: true,
        opacity: 0.35,
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
   * A live mirror can show through the squares. Without one they stay opaque
   * so light and dark marble still separate in the default view.
   */
  setMirrorBlend(enabled: boolean): void {
    const light = this.boardSquare('light')
    const dark = this.boardSquare('dark')
    light.opacity = enabled ? 0.82 : 1
    dark.opacity = enabled ? 0.7 : 1
    light.transparent = enabled
    dark.transparent = enabled
    light.depthWrite = !enabled
    dark.depthWrite = !enabled
  }

  /** Swap the placeholder marble maps for the GPU bake. Shared slabs keep their repeat. */
  installBakedMarble(baked: BakedMarbleMaps): void {
    const previous = new Set<Texture>()
    const assign = (key: string, texture: Texture) => {
      const material = this.table.get(key) as MeshStandardMaterial
      if (material.map && material.map !== texture) previous.add(material.map)
      material.map = texture
      material.needsUpdate = true
    }
    assign('board:light', baked.light)
    assign('board:dark', baked.dark)
    assign('board:frame', baked.floor)
    assign('room:floor', baked.floor)
    assign('room:table', baked.floor)
    assign('room:wall', baked.wall)
    assign('room:plaster', baked.wall)
    for (const texture of previous) {
      texture.dispose()
      const index = this.textures.indexOf(texture)
      if (index >= 0) this.textures.splice(index, 1)
    }
    this.bakeTargets = baked.targets
  }

  /**
   * Desktop keeps micro-scratches. Quest uses constant metal roughness.
   * Squares stay opaque until a mirror asks for a blend.
   */
  setTier(tier: 'desktop' | 'quest'): void {
    const desktop = tier === 'desktop'
    this.setMirrorBlend(false)
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
    for (const target of this.bakeTargets) target.dispose()
    this.bakeTargets = []
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
    map: Texture,
    roughness: number,
    clearcoat: number,
    clearcoatRoughness: number,
    envMapIntensity: number,
  ): MeshPhysicalMaterial {
    return this.make({
      color: 0xffffff,
      map,
      roughness,
      metalness: 0,
      clearcoat,
      clearcoatRoughness,
      envMapIntensity,
      ior: 1.5,
    })
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
