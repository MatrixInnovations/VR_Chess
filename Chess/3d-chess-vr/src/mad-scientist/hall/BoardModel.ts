import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'

import { isOnBoard, squareKey } from '../contracts/squares'
import type { Square } from '../contracts/types'
import { BOARD_SURFACE_Y, SQUARE_SIZE_M, SQUARE_THICKNESS_M } from './metrics'

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
 * Highlights are a material swap. They are not a move, and this class
 * has no method that changes whose piece sits on a square.
 */
export class BoardModel {
  /** Root group. Parent it under the hall table. */
  readonly object = new Group()

  private readonly squares = new Map<string, Mesh>()

  private readonly baseMaterials = new Map<string, MeshStandardMaterial>()

  private readonly highlightMaterial: MeshStandardMaterial

  private readonly highlighted = new Set<string>()

  private readonly geometries: BoxGeometry[] = []

  private readonly ownedMaterials: MeshStandardMaterial[] = []

  constructor() {
    this.object.name = 'board'
    this.highlightMaterial = new MeshStandardMaterial({
      color: 0xc9a227,
      emissive: 0xc9a227,
      emissiveIntensity: 0.45,
      roughness: 0.45,
      metalness: 0.1,
    })
    this.ownedMaterials.push(this.highlightMaterial)
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
      this.highlighted.add(key)
    }
  }

  /** Restore every highlighted square to its wood or maple material. */
  clearHighlights(): void {
    for (const key of this.highlighted) {
      const mesh = this.squares.get(key) as Mesh
      mesh.material = this.baseMaterials.get(key) as MeshStandardMaterial
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

  /** Release geometries and materials owned by the board. */
  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.ownedMaterials) material.dispose()
    for (const material of this.baseMaterials.values()) material.dispose()
    this.object.clear()
    this.squares.clear()
    this.highlighted.clear()
  }

  private buildFrame(): void {
    const geometry = new BoxGeometry(
      SQUARE_SIZE_M * 8 + 0.02,
      0.008,
      SQUARE_SIZE_M * 8 + 0.02,
    )
    const material = new MeshStandardMaterial({
      color: 0x3a2415,
      roughness: 0.6,
      metalness: 0.05,
    })
    const frame = new Mesh(geometry, material)
    frame.name = 'board-frame'
    frame.position.y = BOARD_SURFACE_Y - SQUARE_THICKNESS_M - 0.004
    frame.receiveShadow = true
    this.object.add(frame)
    this.geometries.push(geometry)
    this.ownedMaterials.push(material)
  }

  private buildSquares(): void {
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const square = { file, rank }
        // a8 (file 0, rank 0 in this board's index) is a light square, matching the existing board.
        const light = (file + rank) % 2 === 0
        const material = new MeshStandardMaterial({
          color: light ? 0xe8d7b0 : 0x6b4a2f,
          roughness: 0.55,
          metalness: 0.04,
        })
        const geometry = new BoxGeometry(
          SQUARE_SIZE_M * 0.96,
          SQUARE_THICKNESS_M,
          SQUARE_SIZE_M * 0.96,
        )
        const mesh = new Mesh(geometry, material)
        const center = squareCenter(square)
        mesh.position.set(center.x, center.y - SQUARE_THICKNESS_M / 2, center.z)
        mesh.name = `square-${file}-${rank}`
        mesh.receiveShadow = true
        mesh.userData.msRole = 'square'
        mesh.userData.msSquare = { file, rank }
        this.object.add(mesh)
        const key = squareKey(square)
        this.squares.set(key, mesh)
        this.baseMaterials.set(key, material)
        this.geometries.push(geometry)
      }
    }
  }
}
