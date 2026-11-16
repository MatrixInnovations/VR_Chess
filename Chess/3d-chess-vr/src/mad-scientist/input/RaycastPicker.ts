import { Camera, Object3D, Raycaster, Vector2, Vector3 } from 'three'

import type { PieceSnapshot, Square, Vec3 } from '../contracts/types'
import type { ChessHall } from '../hall/ChessHall'
import type { BoardPick, IPointerPicker } from './picking'

/** Pixel size of the surface the pointer is on. */
export interface Viewport {
  width: number
  height: number
}

interface HitRole {
  role: string
  pieceId?: string
  square?: Square
}

/**
 * Turns a screen point into a board pick by raycasting the hall.
 * The closest tagged mesh wins, so a piece above a square is grabbed
 * instead of the square underneath it.
 */
export class RaycastPicker implements IPointerPicker {
  private readonly raycaster = new Raycaster()

  private readonly ndc = new Vector2()

  /**
   * Creates the instance.
   */
  constructor(
    private readonly camera: Camera,
    private readonly hall: ChessHall,
    private viewport: Viewport,
  ) {}

  /** Update the pixel size after a resize. */
  setViewport(viewport: Viewport): void {
    this.viewport = viewport
  }

  /** Cast from the camera through pixel `(x, y)`. */
  pick(x: number, y: number): BoardPick {
    this.ndc.set(
      (x / this.viewport.width) * 2 - 1,
      -(y / this.viewport.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.ndc, this.camera)
    return this.cast()
  }

  /**
   * Cast a world-space ray from a controller or a hand.
   * A zero direction misses the board.
   * @param origin - Ray origin in meters.
   * @param direction - Ray direction. It is normalized inside this method.
   */
  pickRay(origin: Vec3, direction: Vec3): BoardPick {
    const dir = new Vector3(direction.x, direction.y, direction.z)
    if (dir.lengthSq() === 0) return { square: null, piece: null, clock: false, world: null }
    dir.normalize()
    this.raycaster.set(new Vector3(origin.x, origin.y, origin.z), dir)
    return this.cast()
  }

  private cast(): BoardPick {
    this.hall.root.updateMatrixWorld(true)
    const hits = this.raycaster.intersectObject(this.hall.root, true)
    for (const hit of hits) {
      const role = readRole(hit.object)
      if (!role) continue
      const world: Vec3 = { x: hit.point.x, y: hit.point.y, z: hit.point.z }
      if (role.role === 'piece' && role.pieceId) {
        if (isHeld(hit.object)) continue
        const model = this.hall.getPiece(role.pieceId)
        if (!model) continue
        const piece: PieceSnapshot = {
          id: model.id,
          kind: model.kind,
          color: model.color,
          square: model.getSquare(),
        }
        return { square: piece.square, piece, clock: false, world }
      }
      if (role.role === 'square' && role.square) {
        return { square: { ...role.square }, piece: null, clock: false, world }
      }
      if (role.role === 'clock') {
        return { square: null, piece: null, clock: true, world }
      }
    }
    return { square: null, piece: null, clock: false, world: null }
  }
}

function isHeld(object: Object3D): boolean {
  let current: Object3D | null = object
  while (current) {
    if (current.userData.msHeld === true) return true
    current = current.parent
  }
  return false
}

function readRole(object: Object3D): HitRole | null {
  let current: Object3D | null = object
  while (current) {
    const role = current.userData.msRole
    if (typeof role === 'string') {
      const pieceId = current.userData.msPieceId
      const square = current.userData.msSquare as Square | undefined
      return {
        role,
        pieceId: typeof pieceId === 'string' ? pieceId : undefined,
        square,
      }
    }
    current = current.parent
  }
  return null
}
