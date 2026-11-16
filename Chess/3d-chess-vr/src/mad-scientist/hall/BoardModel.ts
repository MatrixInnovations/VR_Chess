import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { isOnBoard, squareKey } from '../contracts/squares'
import type { Square } from '../contracts/types'
import { BOARD_SURFACE_Y, FRAME_WIDTH_M, INLAY_WIDTH_M, SQUARE_SIZE_M, SQUARE_THICKNESS_M } from './metrics'
import { PieceMaterialSet } from './PieceMaterialSet'

/**
 * World position of a square's top-center, in meters.
 * File increases toward +X (white's right). Rank increases toward +Z,
 * which is the seated player's near side.
 */
export function squareCenter(square: Square): { x: number; y: number; z: number } {
  return {
    x: (square.file - 3.5) * SQUARE_SIZE_M,
    y: BOARD_SURFACE_Y,
    z: (square.rank - 3.5) * SQUARE_SIZE_M,
  }
}

/**
 * The physical board: 64 squares plus a frame.
 * Light and dark squares share two materials from {@link PieceMaterialSet}
 * (felt and walnut). Highlights are a material swap, not a new shader.
 * This class has no method that changes whose piece sits on a square.
 */
export class BoardModel {
  /** Root group. Parent it under the hall table. */
  readonly object = new Group()

  private readonly squares = new Map<string, Mesh>()

  private readonly baseMaterials = new Map<string, MeshStandardMaterial>()

  private readonly highlightMaterial: MeshStandardMaterial

  private readonly highlighted = new Set<string>()

  private readonly geometries: { dispose: () => void }[] = []

  private readonly materials: PieceMaterialSet

  private readonly ownsMaterials: boolean

  /**
   * Creates the instance.
   */
  constructor(materials?: PieceMaterialSet) {
    this.object.name = 'board'
    this.ownsMaterials = materials === undefined
    this.materials = materials ?? new PieceMaterialSet()
    this.highlightMaterial = this.materials.highlightMaterial()
    this.buildFrame()
    this.buildSquares()
  }

  /**
   * Show `squares` as legal destinations. Replaces any previous highlight.
   * Squares off the board are ignored.
   */
  highlight(squares: readonly Square[]): void {
    this.clearHighlights()
    for (const square of squares) {
      if (!isOnBoard(square)) continue
      const key = squareKey(square)
      const mesh = this.squares.get(key) as Mesh
      mesh.material = this.highlightMaterial
      mesh.visible = true
      this.highlighted.add(key)
    }
  }

  /** Restore every highlighted square to its wood or maple material. */
  clearHighlights(): void {
    for (const key of this.highlighted) {
      const mesh = this.squares.get(key) as Mesh
      mesh.material = this.baseMaterials.get(key) as MeshStandardMaterial
      mesh.visible = false
    }
    this.highlighted.clear()
  }

  /** Whether `square` is currently drawn as a legal destination. */
  isHighlighted(square: Square): boolean {
    return this.highlighted.has(squareKey(square))
  }

  /** Copies of the squares currently highlighted, in insertion order. */
  highlightedSquares(): Square[] {
    return [...this.highlighted].map((key) => {
      const [file, rank] = key.split(':').map((part) => Number(part))
      return { file, rank }
    })
  }

  /** Top-center of `square`. The returned vector is a copy. */
  worldPosition(square: Square): Vector3 {
    const center = squareCenter(square)
    return new Vector3(center.x, center.y, center.z)
  }

  /**
   * Square under a world point on the board plane.
   * Returns null when the point misses the 8x8.
   */
  squareFromWorld(point: { x: number; z: number }): Square | null {
    const file = Math.round(point.x / SQUARE_SIZE_M + 3.5)
    const rank = Math.round(point.z / SQUARE_SIZE_M + 3.5)
    const square = { file, rank }
    if (!isOnBoard(square)) return null
    return square
  }

  /** The mesh for `square`, or undefined when the square is off the board. */
  squareMesh(square: Square): Mesh | undefined {
    return this.squares.get(squareKey(square))
  }

  /**
   * Release square geometries.
   * Shared materials are disposed only when this board created the set.
   */
  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    if (this.ownsMaterials) this.materials.dispose()
    this.object.clear()
    this.squares.clear()
    this.highlighted.clear()
  }

  private buildFrame(): void {
    const span = SQUARE_SIZE_M * 8 + FRAME_WIDTH_M * 2
    const thickness = 0.018
    const top = BOARD_SURFACE_Y - 0.001
    const geometry = new BoxGeometry(span, thickness, span)
    const frame = new Mesh(geometry, this.materials.boardFrame())
    frame.name = 'board-frame'
    frame.position.y = top - thickness / 2
    frame.receiveShadow = true
    this.object.add(frame)
    this.geometries.push(geometry)
    this.buildInlay(span)
    this.buildCoordinates(span, top)
  }

  /** 2 mm grid, heavier inner rectangle, and the outer gold lip. One draw. */
  private buildInlay(span: number): void {
    const parts: BoxGeometry[] = []
    const play = SQUARE_SIZE_M * 8
    const y = BOARD_SURFACE_Y - 0.00015 - 0.0006
    for (let index = 1; index <= 7; index += 1) {
      const at = (index - 4) * SQUARE_SIZE_M
      parts.push(bar(play, INLAY_WIDTH_M, at, y, 0, true))
      parts.push(bar(play, INLAY_WIDTH_M, 0, y, at, false))
    }
    const inner = 0.0028
    parts.push(bar(play + inner, inner, 0, y, play / 2, false))
    parts.push(bar(play + inner, inner, 0, y, -play / 2, false))
    parts.push(bar(play + inner, inner, play / 2, y, 0, true))
    parts.push(bar(play + inner, inner, -play / 2, y, 0, true))
    const lip = 0.004
    const lipY = BOARD_SURFACE_Y - 0.0016
    const outer = span / 2 - lip / 2
    parts.push(bar(span, lip, 0, lipY, outer, false))
    parts.push(bar(span, lip, 0, lipY, -outer, false))
    parts.push(bar(span, lip, outer, lipY, 0, true))
    parts.push(bar(span, lip, -outer, lipY, 0, true))
    const geometry = mergeBufferGeometries(parts)
    for (const part of parts) part.dispose()
    if (!geometry) throw new Error('gold board merge failed')
    const mesh = new Mesh(geometry, this.materials.gold())
    mesh.name = 'board-inlay'
    mesh.receiveShadow = true
    mesh.castShadow = false
    mesh.raycast = () => undefined
    this.object.add(mesh)
    this.geometries.push(geometry)
  }

  private buildSquares(): void {
    const tileSize = SQUARE_SIZE_M * 0.96
    const proxyGeometry = new BoxGeometry(tileSize, SQUARE_THICKNESS_M, tileSize)
    this.geometries.push(proxyGeometry)
    const lightParts: BoxGeometry[] = []
    const darkParts: BoxGeometry[] = []
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const square = { file, rank }
        const light = (file + rank) % 2 === 0
        const material = this.materials.boardSquare(light ? 'light' : 'dark')
        const proxy = new Mesh(proxyGeometry, material)
        const center = squareCenter(square)
        proxy.position.set(center.x, center.y - SQUARE_THICKNESS_M / 2, center.z)
        proxy.name = `square-${file}-${rank}`
        proxy.visible = false
        proxy.userData.msRole = 'square'
        proxy.userData.msSquare = { file, rank }
        this.object.add(proxy)
        const key = squareKey(square)
        this.squares.set(key, proxy)
        this.baseMaterials.set(key, material)
        const tile = new BoxGeometry(tileSize, SQUARE_THICKNESS_M, tileSize)
        mapSquareUv(tile, file, rank)
        tile.translate(center.x, center.y - SQUARE_THICKNESS_M / 2, center.z)
        ;(light ? lightParts : darkParts).push(tile)
      }
    }
    this.addMerged('board-light', lightParts, this.materials.boardSquare('light'))
    this.addMerged('board-dark', darkParts, this.materials.boardSquare('dark'))
  }

  private addMerged(name: string, parts: BoxGeometry[], material: MeshStandardMaterial): void {
    const geometry = mergeBufferGeometries(parts)
    for (const part of parts) part.dispose()
    if (!geometry) throw new Error(`${name} merge failed`)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.receiveShadow = true
    mesh.castShadow = false
    mesh.raycast = () => undefined
    this.object.add(mesh)
    this.geometries.push(geometry)
  }

  /**
   * a–h and 1–8 in the frame band.
   * a is -X. Rank 1 is on white's near edge (+Z).
   */
  private buildCoordinates(span: number, frameTop: number): void {
    const geometry = new PlaneGeometry(span, span)
    const plane = new Mesh(geometry, this.materials.coords())
    plane.name = 'board-coordinates'
    plane.rotation.x = -Math.PI / 2
    plane.position.y = frameTop + 0.0002
    plane.raycast = () => undefined
    this.object.add(plane)
    this.geometries.push(geometry)
  }
}

/** Puts one square into its cell of the 8×8 baked marble atlas. */
function mapSquareUv(geometry: BoxGeometry, file: number, rank: number): void {
  const uv = geometry.getAttribute('uv')
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, (file + uv.getX(index)) / 8, (rank + uv.getY(index)) / 8)
  }
}

function bar(length: number, width: number, x: number, y: number, z: number, alongZ: boolean): BoxGeometry {
  const geometry = alongZ ? new BoxGeometry(width, 0.0012, length) : new BoxGeometry(length, 0.0012, width)
  geometry.translate(x, y, z)
  return geometry
}
