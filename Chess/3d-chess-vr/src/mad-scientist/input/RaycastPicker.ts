import { Camera, Object3D, Raycaster, Vector2 } from 'three'

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
    this.hall.root.updateMatrixWorld(true)
    const hits = this.raycaster.intersectObject(this.hall.root, true)
    for (const hit of hits) {
      const role = readRole(hit.object)
      if (!role) continue
      const world: Vec3 = { x: hit.point.x, y: hit.point.y, z: hit.point.z }
      if (role.role === 'piece' && role.pieceId) {
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
