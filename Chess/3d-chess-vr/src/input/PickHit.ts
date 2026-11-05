import type { Position } from '../domain/Position'

export class PickHit {
  kind: 'piece' | 'square' | 'button'
  uid: number | null
  square: Position | null
  id: string | null

  constructor(
    kind: 'piece' | 'square' | 'button',
    uid: number | null,
    square: Position | null,
    id: string | null,
  ) {
    this.kind = kind
    this.uid = uid
    this.square = square
    this.id = id
  }
}
