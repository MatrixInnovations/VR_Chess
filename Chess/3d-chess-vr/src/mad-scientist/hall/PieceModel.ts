import { Group, Mesh, MeshStandardMaterial } from 'three'

import type { PieceColor, PieceFinish, PieceKind, PieceSnapshot, Square, Vec3 } from '../contracts/types'
import type { BoardModel } from './BoardModel'
import type { PieceMaterialSet } from './PieceMaterialSet'
import { pieceGeometry } from './PieceGeometryCache'

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

  /**
   * Creates the instance.
   */
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

  /**
   * Detach the piece. The geometry is shared, so this does not dispose it.
   */
  dispose(): void {
    this.object.removeFromParent()
    this.owned = []
    this.object.clear()
  }

  private build(kind: PieceKind): void {
    const geometry = pieceGeometry(kind)
    const mesh = new Mesh(geometry, this.materials.get(this.color, 'idle'))
    if (kind === 'knight') mesh.rotation.y = this.color === 'white' ? Math.PI / 2 : -Math.PI / 2
    if (kind === 'bishop') mesh.rotation.y = -Math.PI / 2 - 0.4
    mesh.castShadow = true
    mesh.userData.msRole = 'piece'
    mesh.userData.msPieceId = this.id
    this.object.add(mesh)
    this.owned.push(mesh)
  }
}
