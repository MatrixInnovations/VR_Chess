import type { Color } from './Color'

export abstract class Player {
  readonly color: Color
  name: string

  constructor(color: Color, name: string) {
    this.color = color
    this.name = name
  }

  abstract readonly kind: 'local' | 'lichess'

  /** Every player in this hall is a person. The board never asks an engine to move. */
  isHuman(): boolean {
    return true
  }
}

export class LocalPlayer extends Player {
  readonly kind = 'local' as const
}

export class LichessPlayer extends Player {
  readonly kind = 'lichess' as const
  rating: number | null
  title: string | null

  constructor(color: Color, name: string, rating: number | null, title: string | null) {
    super(color, name)
    this.rating = rating
    this.title = title
  }
}
