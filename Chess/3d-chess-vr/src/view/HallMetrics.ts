import { Position } from '../domain/Position'

export class HallMetrics {
  static readonly square = 0.055
  static readonly boardSurface = 0.775
  static readonly tableSurface = 0.74
  static readonly eye = { x: 0.02, y: 1.22, z: 0.98 }
  static readonly look = { x: 0, y: 0.98, z: -0.35 }
  static readonly fov = 50

  static fileRank(position: Position): { x: number; z: number } {
    return {
      x: (position.x - 3.5) * HallMetrics.square,
      z: (position.y - 3.5) * HallMetrics.square,
    }
  }
}
