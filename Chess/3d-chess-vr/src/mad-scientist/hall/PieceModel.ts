import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'

import type { PieceColor, PieceFinish, PieceKind, PieceSnapshot, Square, Vec3 } from '../contracts/types'
import type { BoardModel } from './BoardModel'
import type { PieceMaterialSet } from './PieceMaterialSet'

/**
 * One piece on the hall board.
 *
 * The mesh can be previewed in the air while a hand holds it. `getSquare`
 * stays on the last snapped square until a session-accepted animation lands.
 * This class does not know about GameSession.
 */
export class PieceModel {
  /** Group whose origin sits on the square surface. */
  readonly object: Group

  /** Stable id from the session snapshot. */
  readonly id: string

  /** Piece type. Geometry is chosen from this and does not change on promotion visuals here. */
  readonly kind: PieceKind

  /** Side that owns the piece. Selects the material family. */
  readonly color: PieceColor

  private square: Square

  private owned: Mesh[] = []

  constructor(
    identity: PieceSnapshot,
    private readonly materials: PieceMaterialSet,
    private readonly board: BoardModel,
  ) {
    this.id = identity.id
    this.kind = identity.kind
    this.color = identity.color
    this.square = { file: identity.square.file, rank: identity.square.rank }
    this.object = new Group()
    this.object.name = `piece-${identity.kind}`
    this.object.userData.msRole = 'piece'
    this.object.userData.msPieceId = identity.id
    this.build(identity.kind)
    this.applyFinish('idle')
    this.snapToSquare(this.square)
  }

  /** Meshes that wear the shared material. */
  meshes(): readonly Mesh[] {
    return this.owned
  }

  /** Logical square. Unaffected by {@link setPreviewPosition}. */
  getSquare(): Square {
    return { file: this.square.file, rank: this.square.rank }
  }

  /** Material currently on the first mesh. */
  currentMaterial(): MeshStandardMaterial {
    return this.owned[0].material as MeshStandardMaterial
  }

  /** Swap every mesh onto the shared material for `finish`. */
  applyFinish(finish: PieceFinish): void {
    this.materials.apply(this, this.color, finish)
  }

  /**
   * Move the mesh for a drag preview.
   * Does not change {@link getSquare} and does not notify the session.
   */
  setPreviewPosition(world: Vec3): void {
    this.object.position.set(world.x, world.y, world.z)
  }

  /** Plant the piece on `square` and remember that square. */
  snapToSquare(square: Square): void {
    this.square = { file: square.file, rank: square.rank }
    this.object.position.copy(this.board.worldPosition(this.square))
  }

  /** Drop the piece's geometries. Shared materials stay with the set. */
  dispose(): void {
    this.object.removeFromParent()
    for (const mesh of this.owned) mesh.geometry.dispose()
    this.owned = []
    this.object.clear()
  }

  private build(kind: PieceKind): void {
    const builders: Partial<Record<PieceKind, () => void>> = {
      pawn: () => {
        this.add(new CylinderGeometry(0.009, 0.011, 0.02, 12), 0.01)
        this.add(new SphereGeometry(0.011, 12, 10), 0.026)
      },
      rook: () => {
        this.add(new CylinderGeometry(0.012, 0.013, 0.03, 8), 0.015)
        this.add(new BoxGeometry(0.02, 0.008, 0.02), 0.032)
      },
      knight: () => {
        this.add(new BoxGeometry(0.014, 0.02, 0.014), 0.01)
        this.add(new BoxGeometry(0.012, 0.016, 0.02), 0.026)
      },
      bishop: () => {
        this.add(new ConeGeometry(0.012, 0.034, 12), 0.017)
        this.add(new SphereGeometry(0.006, 10, 8), 0.036)
      },
      queen: () => {
        this.add(new ConeGeometry(0.013, 0.038, 12), 0.019)
        this.add(new SphereGeometry(0.008, 10, 8), 0.04)
      },
      king: () => {
        this.add(new CylinderGeometry(0.012, 0.014, 0.032, 12), 0.016)
        this.add(new BoxGeometry(0.004, 0.014, 0.004), 0.038)
        this.add(new BoxGeometry(0.012, 0.004, 0.004), 0.04)
      },
    }
    const build = builders[kind]
    if (!build) throw new Error(`Unsupported piece kind: ${kind}`)
    build()
  }

  private add(geometry: BufferGeometry, y: number): void {
    const mesh = new Mesh(geometry, this.materials.get(this.color, 'idle'))
    mesh.position.y = y
    mesh.castShadow = true
    mesh.userData.msRole = 'piece'
    mesh.userData.msPieceId = this.id
    this.object.add(mesh)
    this.owned.push(mesh)
  }
}
