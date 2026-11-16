import {
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  MixOperation,
  Texture,
} from 'three'

import type { BakedMarbleMaps } from './MarbleVeins'
import { bakeMarble, contactFalloffTexture, coordinateBorderTexture, marbleBakeSize } from './MarbleTexture'

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

/** Stone and cloth stay cheap. Metals keep a reflection map. */
export type HallMaterial = MeshStandardMaterial | MeshLambertMaterial | MeshBasicMaterial

/**
 * Shared materials for the metal set and the black-marble hall.
 *
 * Chrome, copper, marble, and gold are one material per look.
 * Reflections live on the metal envMaps only, so the room does not sample the PMREM.
 */
export class PieceMaterialSet {
  private readonly table = new Map<string, HallMaterial>()

  private readonly textures: Texture[] = []

  private contactMaterial: MeshBasicMaterial | null = null

  private bakeTargets: { dispose(): void }[] = []

  private reflection: Texture | null = null

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
    const glyphs = this.keep(coordinateBorderTexture())

    this.put('white:idle', this.metal(0xd4d7dc, 0.08, 0, 0, 1, 0, 0.04, 1.6))
    this.put('black:idle', this.metal(0xc06a38, 0.08, 0, 0, 1, 0, 0.05, 2))
    this.put('white:selected', this.metal(0xd4d7dc, 0.08, 0xc9a44c, 0.12, 1, 0, 0.04, 1.6))
    this.put('black:selected', this.metal(0xc06a38, 0.08, 0xc9a44c, 0.12, 1, 0, 0.05, 2))
    this.put('white:dragging', this.metal(0xd4d7dc, 0.08, 0, 0, 0.7, 0, 0.04, 1.6))
    this.put('black:dragging', this.metal(0xc06a38, 0.08, 0, 0, 0.7, 0, 0.05, 2))
    for (const finish of ['idle', 'selected', 'dragging'] as const) {
      const black = this.get('black', finish)
      if (black instanceof MeshStandardMaterial) black.metalness = 0.8
    }

    this.put('board:light', this.marble(lightAtlas, 0.16, 0.95, 0.08, 0.4, true))
    this.put('board:dark', this.marble(darkAtlas, 0.12, 1, 0.06, 0.15, true))
    this.put('board:frame', this.marble(floorTile, 0.08, 0.85, 0.08, 0.28, true))
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
        color: 0xffffff,
        map: glyphs,
        roughness: 0.4,
        metalness: 0,
        clearcoat: 0,
        envMapIntensity: 0.2,
        transparent: true,
        alphaTest: 0.35,
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

    this.put('room:floor', this.marble(floorTile, 0.5, 0, 0.22, 0.35, true))
    this.put('room:table', this.marble(floorTile, 0.45, 0, 0.22, 0.12, true))
    this.put('room:wall', this.marble(wallTile, 0.62, 0, 0.3, 0.45, true))
    this.put('room:plaster', this.marble(wallTile, 0.62, 0, 0.3, 0.45, true))
    this.put('room:ceiling', this.make({ color: 0x0c0b0a, roughness: 0.7, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.6, envMapIntensity: 0.4, unlit: true }))
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
  get(color: PieceColor, finish: PieceFinish): HallMaterial {
    return this.table.get(`${color}:${finish}`) as HallMaterial
  }

  /**
   * Cream or black marble.
   * The same instance is reused for every square of that tone.
   */
  boardSquare(tone: BoardTone): HallMaterial {
    return this.table.get(`board:${tone}`) as MeshStandardMaterial
  }

  /** Black marble lip around the 8x8. Also used for the table top. */
  boardFrame(): HallMaterial {
    return this.table.get('board:frame') as MeshStandardMaterial
  }

  /** Legal-move highlight. One material, swapped onto a square and swapped back. */
  highlightMaterial(): MeshStandardMaterial {
    return this.table.get('board:highlight') as MeshStandardMaterial
  }

  /** Champagne file and rank glyphs. */
  coords(): HallMaterial {
    return this.table.get('board:coords') as MeshStandardMaterial
  }

  /** Dark felt under a piece base. */
  felt(): HallMaterial {
    return this.table.get('piece:felt') as MeshStandardMaterial
  }

  /** Black marble table top. Separate from the board so the table stays dimmer. */
  tableTop(): HallMaterial {
    return this.table.get('room:table') as MeshStandardMaterial
  }

  /** Black marble floor. */
  floorWood(): HallMaterial {
    return this.table.get('room:floor') as MeshStandardMaterial
  }

  /** Black marble walls. Large veins, almost no clearcoat. */
  wall(): HallMaterial {
    return this.table.get('room:wall') as MeshStandardMaterial
  }

  /** Dark stone walls. */
  plaster(): HallMaterial {
    return this.table.get('room:plaster') as MeshStandardMaterial
  }

  /** Near-black ceiling. */
  ceiling(): HallMaterial {
    return this.table.get('room:ceiling') as MeshStandardMaterial
  }

  /** Hidden rug material. The mesh itself is not shown. */
  rugFelt(): HallMaterial {
    return this.table.get('room:rug') as MeshStandardMaterial
  }

  /** Both chairs. */
  seatCloth(): HallMaterial {
    return this.table.get('room:seat') as MeshStandardMaterial
  }

  /** Table legs. */
  leg(): HallMaterial {
    return this.table.get('room:leg') as MeshStandardMaterial
  }

  /** Warm practical pane. */
  windowPane(): HallMaterial {
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

  /**
   * Give the polished metals a shared reflection map.
   * Marble and the room stay unlit by the PMREM so the hall does not sample it per pixel.
   */
  bindReflections(texture: Texture): void {
    if (this.reflection && this.reflection !== texture) this.reflection.dispose()
    this.reflection = texture
    for (const key of METAL_KEYS) {
      const material = this.table.get(key) as MeshStandardMaterial
      material.envMap = texture
      material.needsUpdate = true
    }
  }

  /** Swap the placeholder marble maps for the GPU bake. Old targets are released first. */
  installBakedMarble(baked: BakedMarbleMaps): void {
    const stale: Texture[] = []
    const assign = (key: string, texture: Texture) => {
      const material = this.table.get(key) as MeshStandardMaterial
      if (material.map && material.map !== texture) stale.push(material.map)
      material.map = texture
      material.needsUpdate = true
    }
    assign('board:light', baked.light)
    assign('board:dark', baked.dark)
    assign('board:frame', baked.frame)
    assign('room:floor', baked.floor)
    assign('room:table', baked.floor)
    assign('room:wall', baked.wall)
    assign('room:plaster', baked.wall)
    for (const target of this.bakeTargets) target.dispose()
    this.bakeTargets = baked.targets
    for (const texture of stale) {
      const index = this.textures.indexOf(texture)
      if (index < 0) continue
      texture.dispose()
      this.textures.splice(index, 1)
    }
  }

  /**
   * Squares stay opaque until a mirror asks for a blend.
   * Metals use a constant roughness so the fragment shader skips scratch maps.
   */
  setTier(_tier: 'desktop' | 'quest'): void {
    this.setMirrorBlend(false)
  }

  /**
   * Counts shared materials and sampled textures.
   * Desktop and Quest share this set; {@link setTier} keeps the squares opaque.
   */
  gpuBudget(): MaterialGpuBudget {
    let textureCount = 0
    for (const material of this.table.values()) {
      for (const slot of TEXTURE_SLOTS) {
        const value = (material as unknown as Record<string, Texture | null | undefined>)[slot]
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
    this.reflection?.dispose()
    this.reflection = null
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
  ): HallMaterial {
    if (emissiveIntensity <= 0) {
      return new MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        reflectivity: 0.3,
        combine: MixOperation,
      })
    }
    return this.make({
      color,
      roughness,
      metalness: 1,
      clearcoat,
      clearcoatRoughness,
      emissive,
      emissiveIntensity,
      opacity,
      envMapIntensity,
    })
  }

  private marble(
    map: Texture,
    roughness: number,
    clearcoat: number,
    clearcoatRoughness: number,
    envMapIntensity: number,
    unlit = false,
  ): HallMaterial {
    return this.make({
      color: 0xffffff,
      map,
      roughness,
      metalness: 0,
      clearcoat,
      clearcoatRoughness,
      envMapIntensity,
      ior: 1.5,
      unlit,
    })
  }

  private put(key: string, material: HallMaterial): void {
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
    alphaTest?: number
    unlit?: boolean
  }): HallMaterial {
    const opacity = args.opacity ?? 1
    const shared = {
      color: args.color,
      map: args.map ?? null,
      emissive: args.emissive ?? 0x000000,
      emissiveIntensity: args.emissiveIntensity ?? 0,
      transparent: args.transparent ?? opacity < 1,
      opacity,
      depthWrite: opacity >= 1 && !args.transparent,
      polygonOffset: args.polygonOffset ?? false,
      polygonOffsetFactor: args.polygonOffset ? -2 : 0,
      polygonOffsetUnits: args.polygonOffset ? -2 : 0,
    }
    if (args.unlit) {
      const basic = new MeshBasicMaterial({
        color: args.color,
        map: args.map ?? null,
        transparent: shared.transparent,
        opacity,
        depthWrite: shared.depthWrite,
        polygonOffset: shared.polygonOffset,
        polygonOffsetFactor: shared.polygonOffsetFactor,
        polygonOffsetUnits: shared.polygonOffsetUnits,
      })
      if (args.alphaTest !== undefined) basic.alphaTest = args.alphaTest
      return basic
    }
    const material = args.metalness >= 0.2
      ? new MeshStandardMaterial({
        ...shared,
        roughness: args.roughness,
        metalness: args.metalness,
        envMapIntensity: args.envMapIntensity ?? 1,
      })
      : new MeshLambertMaterial(shared)
    if (args.alphaTest !== undefined) material.alphaTest = args.alphaTest
    return material
  }
}
