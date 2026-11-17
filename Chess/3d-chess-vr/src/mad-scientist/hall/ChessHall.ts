import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Object3D,
  PerspectiveCamera,
  TorusGeometry,
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
import { PieceMaterialSet, type HallMaterial } from './PieceMaterialSet'
import { disposePieceGeometries } from './PieceGeometryCache'
import { PieceModel } from './PieceModel'
import { TableDecals } from './TableDecals'

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

  private shadowGenerationValue = 0

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

  /** Desktop post pass. Null on Quest and in tests without WebGL. */
  grade: { render: () => void } | null = null

  /** Desktop orbit. Null until the page attaches one. */
  orbit: { update: () => void; enabled: boolean } | null = null

  /** Desktop planar mirror. Null on Quest and in tests without WebGL. */
  reflector: { visible: boolean } | null = null

  private decals: TableDecals | null = null

  private readonly pieceList: PieceModel[] = []

  private readonly pieceById = new Map<string, PieceModel>()

  private readonly geometries: BufferGeometry[] = []

  private readonly ownsMaterials: boolean

  /**
   * Creates the instance.
   */
  constructor(options: ChessHallOptions = {}) {
    this.root.name = 'chess-hall'
    this.ownsMaterials = options.materials === undefined
    this.materials = options.materials ?? new PieceMaterialSet()
    this.board = new BoardModel(this.materials)
    this.lighting = new HallLighting()
    this.clockTap = new ClockTapTarget({ x: 0.33, y: TABLE_TOP_Y + 0.03, z: 0.32 })
    this.camera = new PerspectiveCamera(50, 1, 0.05, 20)
    // Sit behind the near table edge and look slightly down at the board.
    this.camera.position.set(0, SEATED_EYE_HEIGHT_M, SEATED_EYE_Z_M)
    this.camera.lookAt(0, BOARD_SURFACE_Y, 0)

    this.buildRoom()
    this.root.add(this.board.object)
    this.root.add(this.lighting.object)
    this.root.add(this.clockTap.object)
    this.decals = new TableDecals(this.root, this.materials)
    this.placePieces(options.pieces ?? [])
    this.syncDecals()
  }

  /** Hero framing for the desktop shot. XR keeps the seated eye. */
  frameDesktop(): void {
    this.camera.fov = 40
    this.camera.position.set(0, 1.1, 0.6)
    this.camera.lookAt(0, 0.78, -0.04)
    this.camera.updateProjectionMatrix()
  }

  /** Wider documentation shot. The page uses {@link frameDesktop}. */
  frameDocumentation(): void {
    this.camera.fov = 40
    this.camera.position.set(0.12, 1.32, 1.1)
    this.camera.lookAt(0, 0.8, 0)
    this.camera.updateProjectionMatrix()
  }

  /** Desktop reflector and scratches, or the Quest cuts. */
  setTier(tier: 'desktop' | 'quest'): void {
    this.lighting.setTier(tier)
    this.materials.setTier(tier)
    this.decals?.setContactEnabled(tier === 'desktop')
    if (tier === 'quest' && this.reflector) this.reflector.visible = false
  }

  /** Move felt and contact discs. Reuses scratch matrices. */
  syncDecals(): void {
    this.decals?.sync(this.pieceList)
  }

  /** Eye position in meters. A copy, so callers cannot shove the camera. */
  getSeatedEyePosition(): Vector3 {
    return this.camera.position.clone()
  }

  /** The piece mesh for `id`, if the hall was given that piece. */
  getPiece(id: string): PieceModel | undefined {
    return this.pieceById.get(id)
  }

  /**
   * Add or replace the mesh for `snapshot`.
   * Shared materials stay with the hall. The new mesh stands on the snapshot square.
   * @param snapshot - Piece identity from the session.
   * @returns The mesh now parented under the hall.
   */
  upsertPiece(snapshot: PieceSnapshot): PieceModel {
    this.removePiece(snapshot.id)
    const model = new PieceModel(snapshot, this.materials, this.board)
    this.piecesGroup().add(model.object)
    this.pieceList.push(model)
    this.pieceById.set(model.id, model)
    this.shadowGenerationValue += 1
    this.syncDecals()
    return model
  }

  /**
   * Drop the mesh for `id`. Unknown ids are ignored.
   * @param id - Piece id.
   */
  removePiece(id: string): void {
    const model = this.pieceById.get(id)
    if (!model) return
    model.dispose()
    this.pieceById.delete(id)
    const index = this.pieceList.indexOf(model)
    if (index >= 0) this.pieceList.splice(index, 1)
    this.shadowGenerationValue += 1
    this.syncDecals()
  }

  /**
   * Show or hide the room shell. The table, board, and pieces stay.
   * Passthrough uses this so the virtual walls do not cover the real room.
   * @param visible - False hides the floor, walls, and window.
   */
  setSceneryVisible(visible: boolean): void {
    const room = this.root.getObjectByName('room')
    if (room) room.visible = visible
    this.shadowGenerationValue += 1
  }

  /** Bumps when a mesh is added, removed, or the room is shown or hidden. */
  get shadowGeneration(): number {
    return this.shadowGenerationValue
  }

  private piecesGroup(): Group {
    const found = this.root.getObjectByName('pieces')
    if (found instanceof Group) return found
    const group = new Group()
    group.name = 'pieces'
    this.root.add(group)
    return group
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
    this.decals?.dispose()
    if (this.ownsMaterials) this.materials.dispose()
    disposePieceGeometries()
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
      this.materials.ceiling(),
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
      this.addBox(wall.name, wall.size, wall.position, this.materials.wall(), room, false)
    }

    const tableTop = TABLE_TOP_Y
    this.addBox(
      'table',
      { x: 1.3, y: 0.04, z: 0.9 },
      { x: 0, y: tableTop - 0.02, z: 0 },
      this.materials.tableTop(),
      room,
      true,
      false,
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
        this.materials.leg(),
        room,
        false,
      )
    })
    this.buildDetail(room)
    this.buildSetDressing(room)
    this.root.add(room)
  }

  /**
   * Gold floor arcs and four gold-ringed columns.
   * None of these cast shadows. The key light remains the only shadow caster.
   */
  private buildSetDressing(room: Group): void {
    const gold = this.materials.gold()
    const stone = this.materials.boardFrame()
    for (const radius of [1.15, 1.85, 2.45]) {
      const ringGeometry = new TorusGeometry(radius, 0.006, 8, 72)
      this.geometries.push(ringGeometry)
      const ring = new Mesh(ringGeometry, gold)
      ring.name = `floor-ring-${radius}`
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.061
      ring.raycast = () => undefined
      room.add(ring)
    }
    const columns = [
      { x: -1.55, z: -1.15 },
      { x: 1.55, z: -1.15 },
      { x: -1.55, z: 1.15 },
      { x: 1.55, z: 1.15 },
    ]
    columns.forEach((at, index) => {
      const group = new Group()
      group.name = `column-${index}`
      const shaftGeometry = new CylinderGeometry(0.08, 0.08, 2.6, 12)
      this.geometries.push(shaftGeometry)
      const shaft = new Mesh(shaftGeometry, stone)
      shaft.position.y = 1.3
      shaft.castShadow = false
      group.add(shaft)
      for (const height of [0.22, 1.15, 2.45]) {
        const bandGeometry = new TorusGeometry(0.135, 0.018, 8, 20)
        this.geometries.push(bandGeometry)
        const band = new Mesh(bandGeometry, gold)
        band.position.y = height
        band.raycast = () => undefined
        group.add(band)
      }
      group.position.set(at.x, 0, at.z)
      room.add(group)
    })
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
    const rug = room.getObjectByName('rug')
    if (rug) rug.visible = false
    const baseboards: Array<{ name: string; size: Vec3; position: Vec3 }> = [
      { name: 'baseboard-north', size: { x: 5.7, y: 0.1, z: 0.04 }, position: { x: 0, y: 0.09, z: -2.88 } },
      { name: 'baseboard-south', size: { x: 5.7, y: 0.1, z: 0.04 }, position: { x: 0, y: 0.09, z: 2.88 } },
      { name: 'baseboard-east', size: { x: 0.04, y: 0.1, z: 5.7 }, position: { x: 2.88, y: 0.09, z: 0 } },
      { name: 'baseboard-west', size: { x: 0.04, y: 0.1, z: 5.7 }, position: { x: -2.88, y: 0.09, z: 0 } },
    ]
    for (const board of baseboards) {
      this.addBox(board.name, board.size, board.position, this.materials.gold(), room, false)
      const mesh = room.getObjectByName(board.name)
      if (mesh) mesh.visible = false
    }

    const windowFrame = new Group()
    windowFrame.name = 'window-frame'
    windowFrame.visible = false
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
    material: HallMaterial,
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
