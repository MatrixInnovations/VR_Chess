import type { PieceType } from '../domain/Piece'
import type { GameSession } from '../domain/GameSession'
import type { ViewModeManager } from '../view/ViewModeManager'
import type { ChessHall } from '../view/ChessHall'
import type { PickHit } from './PickHit'
import * as THREE from 'three'

export class InputRouter {
  constructor(
    private readonly session: GameSession,
    private readonly viewMode: ViewModeManager,
    private readonly hall: ChessHall,
  ) {}

  press(hit: PickHit | null, point: THREE.Vector3 | null = null): void {
    if (!hit) return
    if (hit.kind === 'button' && hit.id) {
      this.button(hit.id, point)
      return
    }
    if (hit.kind === 'piece' && hit.uid != null) {
      const piece = this.session.board.pieceByUid(hit.uid)
      if (piece) this.session.selectSquare(piece.position)
      return
    }
    if (hit.kind === 'square' && hit.square) this.session.selectSquare(hit.square)
  }

  button(id: string, point: THREE.Vector3 | null): void {
    if (id === 'toggle-view') {
      void this.viewMode.toggle()
      return
    }
    if (id === 'sit-down') {
      this.session.startOffline(10, 0)
      return
    }
    if (id === 'resign') {
      this.session.resign()
      return
    }
    if (id === 'draw') {
      this.session.offerDraw()
      return
    }
    if (id === 'clock-near' || id === 'clock-far') {
      if (this.session.heldUid != null && point) {
        this.session.endHold(this.hall.squareFromWorld(point))
      }
      this.session.tapClock(id === 'clock-near' ? this.session.seat : this.session.seat === 'white' ? 'black' : 'white')
      return
    }
    if (id.startsWith('promo-')) {
      const type = id.slice('promo-'.length) as PieceType
      this.session.choosePromotion(type)
    }
  }
}
