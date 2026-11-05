import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from 'three'

import type { PieceSnapshot, Vec3 } from '../contracts/types'
import { BoardModel } from './BoardModel'
import { ClockTapTarget } from './ClockTapTarget'
import { HallLighting } from './HallLighting'
import {
  BOARD_SURFACE_Y,
  SEATED_EYE_HEIGHT_M,
  SEATED_EYE_Z_M,
  TABLE_TOP_Y,
} from './metrics'
import { PieceMaterialSet } from './PieceMaterialSet'
import { PieceModel } from './PieceModel'

/** Optional pieces and a shared material set for {@link ChessHall}. */
export interface ChessHallOptions {
  pieces?: readonly PieceSnapshot[]
  materials?: PieceMaterialSet
}

/**
 * The room a person sits down in: floor, walls, ceiling, table, board, clock
 * tap target, and a perspective camera at seated eye height.
 *
 * The camera looks at the center of the board from white's side. It is not
 * the old overhead orthographic camera.
 */
export class ChessHall {
  /** Everything except the camera. Mount this in the R3F scene. */
  readonly root = new Group()

  /** Seated perspective camera. The renderer, not this group, should own it. */
  readonly camera: PerspectiveCamera

  /** The 8x8 on the table. */
  readonly board: BoardModel

  /** Quest-minded three-light rig. */
  readonly lighting: HallLighting

  /** Table clock volume. Wire {@link ClockTapTarget.setOnTap} from the clock lane. */
  readonly clockTap: ClockTapTarget

  /** Materials shared by every piece in the hall. */
  readonly materials: PieceMaterialSet

  private readonly pieceList: PieceModel[] = []

  private readonly pieceById = new Map<string, PieceModel>()

  private readonly geometries: BoxGeometry[] = []

  private readonly ownsMaterials: boolean

  constructor(options: ChessHallOptions = {}) {
    this.root.name = 'chess-hall'
    this.ownsMaterials = options.materials === undefined
    this.materials = options.materials ?? new PieceMaterialSet()
    this.board = new BoardModel(this.materials)
    this.lighting = new HallLighting()
    this.clockTap = new ClockTapTarget({ x: 0.42, y: TABLE_TOP_Y + 0.03, z: 0.05 })
    this.camera = new PerspectiveCamera(50, 1, 0.05, 20)
    // Sit behind the near table edge and look slightly down at the board.
    this.camera.position.set(0, SEATED_EYE_HEIGHT_M, SEATED_EYE_Z_M)
    this.camera.lookAt(0, BOARD_SURFACE_Y, 0)

    this.buildRoom()
    this.root.add(this.board.object)
    this.root.add(this.lighting.object)
    this.root.add(this.clockTap.object)
    this.placePieces(options.pieces ?? [])
  }

  /** Eye position in meters. A copy, so callers cannot shove the camera. */
  getSeatedEyePosition(): Vector3 {
    return this.camera.position.clone()
  }

  /** The piece mesh for `id`, if the hall was given that piece. */
  getPiece(id: string): PieceModel | undefined {
    return this.pieceById.get(id)
  }

  /** Pieces currently parented under the hall, in insertion order. */
  getPieces(): readonly PieceModel[] {
    return [...this.pieceList]
  }

  /** Release room, board, lights, pieces, and materials this hall created. */
  dispose(): void {
    for (const piece of this.pieceList) piece.dispose()
    this.pieceList.length = 0
    this.pieceById.clear()
    this.board.dispose()
    this.lighting.dispose()
    this.clockTap.dispose()
    if (this.ownsMaterials) this.materials.dispose()
    for (const geometry of this.geometries) geometry.dispose()
    this.root.clear()
  }

  private placePieces(pieces: readonly PieceSnapshot[]): void {
    const group = new Group()
    group.name = 'pieces'
    for (const snapshot of pieces) {
      const model = new PieceModel(snapshot, this.materials, this.board)
      group.add(model.object)
      this.pieceList.push(model)
      this.pieceById.set(model.id, model)
    }
    this.root.add(group)
  }

  private buildRoom(): void {
    const room = new Group()
    room.name = 'room'
    this.addBox(
      'floor',
      { x: 6, y: 0.04, z: 6 },
      { x: 0, y: 0.02, z: 0 },
      this.materials.floorWood(),
      room,
      true,
    )
    this.addBox(
      'ceiling',
      { x: 6, y: 0.08, z: 6 },
      { x: 0, y: 3, z: 0 },
      this.materials.plaster(),
      room,
      false,
    )
    const walls: Array<{ name: string; size: Vec3; position: Vec3 }> = [
      { name: 'wall-north', size: { x: 6, y: 3, z: 0.08 }, position: { x: 0, y: 1.5, z: -3 } },
      { name: 'wall-south', size: { x: 6, y: 3, z: 0.08 }, position: { x: 0, y: 1.5, z: 3 } },
      { name: 'wall-east', size: { x: 0.08, y: 3, z: 6 }, position: { x: 3, y: 1.5, z: 0 } },
      { name: 'wall-west', size: { x: 0.08, y: 3, z: 6 }, position: { x: -3, y: 1.5, z: 0 } },
    ]
    for (const wall of walls) {
      this.addBox(wall.name, wall.size, wall.position, this.materials.plaster(), room, false)
    }

    const tableTop = TABLE_TOP_Y
    this.addBox(
      'table',
      { x: 1.3, y: 0.04, z: 0.9 },
      { x: 0, y: tableTop - 0.02, z: 0 },
      this.materials.boardFrame(),
      room,
      true,
      true,
    )
    const underside = tableTop - 0.04
    const legHeight = underside - 0.04
    const legY = 0.04 + legHeight / 2
    const legs = [
      { x: -0.55, z: -0.35 },
      { x: 0.55, z: -0.35 },
      { x: -0.55, z: 0.35 },
      { x: 0.55, z: 0.35 },
    ]
    legs.forEach((leg, index) => {
      this.addBox(
        `table-leg-${index}`,
        { x: 0.06, y: legHeight, z: 0.06 },
        { x: leg.x, y: legY, z: leg.z },
        this.materials.trimWood(),
        room,
        false,
      )
    })
    this.buildDetail(room)
    this.root.add(room)
  }

  /**
   * Rug, baseboard, window, and two seats.
   * Boxes only, and none of them cast shadows. The key light is still the
   * only shadow caster, which is what keeps the hall in the 72–90fps band.
   */
  private buildDetail(room: Group): void {
    this.addBox(
      'rug',
      { x: 1.7, y: 0.01, z: 1.2 },
      { x: 0, y: 0.055, z: 0 },
      this.materials.rugFelt(),
      room,
      true,
    )
    const baseboards: Array<{ name: string; size: Vec3; position: Vec3 }> = [
      { name: 'baseboard-north', size: { x: 5.7, y: 0.1, z: 0.04 }, position: { x: 0, y: 0.09, z: -2.88 } },
      { name: 'baseboard-south', size: { x: 5.7, y: 0.1, z: 0.04 }, position: { x: 0, y: 0.09, z: 2.88 } },
      { name: 'baseboard-east', size: { x: 0.04, y: 0.1, z: 5.7 }, position: { x: 2.88, y: 0.09, z: 0 } },
      { name: 'baseboard-west', size: { x: 0.04, y: 0.1, z: 5.7 }, position: { x: -2.88, y: 0.09, z: 0 } },
    ]
    for (const board of baseboards) {
      this.addBox(board.name, board.size, board.position, this.materials.trimWood(), room, false)
    }

    const windowFrame = new Group()
    windowFrame.name = 'window-frame'
    room.add(windowFrame)
    this.addBox(
      'window-trim',
      { x: 1.4, y: 0.9, z: 0.04 },
      { x: 0, y: 1.7, z: -2.9 },
      this.materials.trimWood(),
      windowFrame,
      false,
    )
    this.addBox(
      'window-pane',
      { x: 1.05, y: 0.58, z: 0.02 },
      { x: 0, y: 1.7, z: -2.87 },
      this.materials.windowPane(),
      windowFrame,
      false,
    )
    this.addBox(
      'seat',
      { x: 0.48, y: 0.06, z: 0.4 },
      { x: 0, y: 0.48, z: 0.78 },
      this.materials.seatCloth(),
      room,
      false,
    )
    this.addBox(
      'opponent-seat',
      { x: 0.48, y: 0.06, z: 0.4 },
      { x: 0, y: 0.48, z: -0.78 },
      this.materials.seatCloth(),
      room,
      false,
    )
  }

  private addBox(
    name: string,
    size: Vec3,
    position: Vec3,
    material: MeshStandardMaterial,
    parent: Object3D,
    receiveShadow: boolean,
    castShadow = false,
  ): void {
    const geometry = new BoxGeometry(size.x, size.y, size.z)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.position.set(position.x, position.y, position.z)
    mesh.receiveShadow = receiveShadow
    mesh.castShadow = castShadow
    parent.add(mesh)
    this.geometries.push(geometry)
  }
}
