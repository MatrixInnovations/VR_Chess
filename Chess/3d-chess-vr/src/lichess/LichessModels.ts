import type { Color } from '../domain/Color'

export class SeatedPlayer {
  name: string
  rating: number | null
  title: string | null

  constructor(name: string, rating: number | null, title: string | null) {
    this.name = name
    this.rating = rating
    this.title = title
  }

  static fromJson(value: unknown): SeatedPlayer {
    const record = asRecord(value)
    return new SeatedPlayer(
      String(record.name ?? record.username ?? record.id ?? 'Opponent'),
      typeof record.rating === 'number' ? record.rating : null,
      typeof record.title === 'string' ? record.title : null,
    )
  }
}

export class ClockSnapshot {
  moves: string
  whiteMs: number
  blackMs: number
  status: string
  winner: Color | null
  whiteDraw: boolean
  blackDraw: boolean
  whiteTakeback: boolean
  blackTakeback: boolean

  constructor(input: {
    moves: string
    whiteMs: number
    blackMs: number
    status: string
    winner: Color | null
    whiteDraw: boolean
    blackDraw: boolean
    whiteTakeback: boolean
    blackTakeback: boolean
  }) {
    this.moves = input.moves
    this.whiteMs = input.whiteMs
    this.blackMs = input.blackMs
    this.status = input.status
    this.winner = input.winner
    this.whiteDraw = input.whiteDraw
    this.blackDraw = input.blackDraw
    this.whiteTakeback = input.whiteTakeback
    this.blackTakeback = input.blackTakeback
  }

  static fromJson(value: unknown): ClockSnapshot {
    const record = asRecord(value)
    const winner = record.winner === 'white' || record.winner === 'black' ? record.winner : null
    return new ClockSnapshot({
      moves: typeof record.moves === 'string' ? record.moves : '',
      whiteMs: numberOr(record.wtime, 0),
      blackMs: numberOr(record.btime, 0),
      status: typeof record.status === 'string' ? record.status : 'started',
      winner,
      whiteDraw: record.wdraw === true,
      blackDraw: record.bdraw === true,
      whiteTakeback: record.wtakeback === true,
      blackTakeback: record.btakeback === true,
    })
  }

  get live(): boolean {
    return this.status === 'started' || this.status === 'created'
  }
}

export class GameFullEvent {
  id: string
  variant: string
  initialFen: string
  white: SeatedPlayer
  black: SeatedPlayer
  state: ClockSnapshot

  constructor(
    id: string,
    variant: string,
    initialFen: string,
    white: SeatedPlayer,
    black: SeatedPlayer,
    state: ClockSnapshot,
  ) {
    this.id = id
    this.variant = variant
    this.initialFen = initialFen
    this.white = white
    this.black = black
    this.state = state
  }

  static fromJson(value: unknown): GameFullEvent {
    const record = asRecord(value)
    const variant = asRecord(record.variant)
    return new GameFullEvent(
      String(record.id ?? ''),
      String(variant.key ?? 'standard'),
      typeof record.initialFen === 'string' ? record.initialFen : 'startpos',
      SeatedPlayer.fromJson(record.white),
      SeatedPlayer.fromJson(record.black),
      ClockSnapshot.fromJson(record.state),
    )
  }
}

export class IncomingChallenge {
  id: string
  challenger: string

  constructor(id: string, challenger: string) {
    this.id = id
    this.challenger = challenger
  }

  static fromJson(value: unknown): IncomingChallenge | null {
    const record = asRecord(value)
    const challenge = asRecord(record.challenge ?? record)
    const id = typeof challenge.id === 'string' ? challenge.id : ''
    if (!id) return null
    const challenger = SeatedPlayer.fromJson(challenge.challenger)
    return new IncomingChallenge(id, challenger.name)
  }
}

export class LichessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LichessError'
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
