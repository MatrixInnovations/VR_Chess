import type { PieceSnapshot, Square, Vec3 } from '../contracts/types'

/**
 * What a ray or screen point landed on.
 * `piece` is set when the closest hit is a piece. `clock` is the table clock.
 */
export interface BoardPick {
  square: Square | null
  piece: PieceSnapshot | null
  clock: boolean
  world: Vec3 | null
}

/** Maps a screen point in pixels to a {@link BoardPick}. */
export interface IPointerPicker {
  pick(x: number, y: number): BoardPick
}
