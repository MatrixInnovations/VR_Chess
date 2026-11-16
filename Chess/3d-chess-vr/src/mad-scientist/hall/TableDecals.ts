import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'

import type { PieceKind } from '../contracts/types'
import { BOARD_SURFACE_Y } from './metrics'
import type { PieceMaterialSet } from './PieceMaterialSet'
import type { PieceModel } from './PieceModel'

const DIAMETER: Record<PieceKind, number> = {
  king: 0.03,
  queen: 0.028,
  bishop: 0.026,
  knight: 0.026,
  rook: 0.026,
  pawn: 0.022,
}

/**
 * One felt disc and one contact quad for every piece.
 * Both are instanced, so the table pays two draws instead of 64.
 * Matrices are written into scratch objects. Nothing is allocated per frame.
 */
export class TableDecals {
  readonly felt: InstancedMesh

  readonly contact: InstancedMesh

  private readonly matrix = new Matrix4()

  private readonly position = new Vector3()

  private readonly scale = new Vector3()

  private readonly flat: Quaternion

  /**
   * Creates the instance.
   */
  constructor(parent: Object3D, materials: PieceMaterialSet) {
    const layFlat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
    this.flat = layFlat
    const feltGeometry = new PlaneGeometry(1, 1)
    const contactGeometry = new PlaneGeometry(1, 1)
    this.felt = new InstancedMesh(feltGeometry, materials.felt(), 32)
    this.contact = new InstancedMesh(contactGeometry, materials.contact(), 32)
    this.felt.name = 'piece-felt'
    this.contact.name = 'contact-shadows'
    this.felt.frustumCulled = false
    this.contact.frustumCulled = false
    this.felt.castShadow = false
    this.contact.castShadow = false
    this.felt.raycast = () => undefined
    this.contact.raycast = () => undefined
    this.felt.instanceMatrix.setUsage(DynamicDrawUsage)
    this.contact.instanceMatrix.setUsage(DynamicDrawUsage)
    parent.add(this.felt, this.contact)
  }

  /** Quest skips the contact pass. The felt discs stay. */
  setContactEnabled(enabled: boolean): void {
    this.contact.visible = enabled
  }

  /** Plant a disc under each piece. A lifted piece shrinks its shadow away. */
  sync(pieces: readonly PieceModel[]): void {
    const count = Math.min(32, pieces.length)
    this.felt.count = count
    this.contact.count = count
    for (let index = 0; index < count; index += 1) {
      const piece = pieces[index]
      const lift = Math.max(0, piece.object.position.y - BOARD_SURFACE_Y)
      const fade = Math.max(0, 1 - lift / 0.03)
      const diameter = (DIAMETER[piece.kind] ?? 0.024) * fade
      this.position.set(piece.object.position.x, BOARD_SURFACE_Y + 0.0002, piece.object.position.z)
      this.scale.set(diameter, diameter, 1)
      this.matrix.compose(this.position, this.flat, this.scale)
      this.felt.setMatrixAt(index, this.matrix)
      this.position.y = BOARD_SURFACE_Y + 0.0001
      this.scale.set(diameter * 1.35, diameter * 1.35, 1)
      this.matrix.compose(this.position, this.flat, this.scale)
      this.contact.setMatrixAt(index, this.matrix)
    }
    this.felt.instanceMatrix.needsUpdate = true
    this.contact.instanceMatrix.needsUpdate = true
  }

  /** Release the instanced geometries. Materials belong to the shared set. */
  dispose(): void {
    this.felt.geometry.dispose()
    this.contact.geometry.dispose()
    this.felt.removeFromParent()
    this.contact.removeFromParent()
  }
}
