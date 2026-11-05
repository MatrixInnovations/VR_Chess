import type { Color } from './Color'
import { Side } from './Color'

export class ChessClock {
  whiteMs: number
  blackMs: number
  readonly incrementMs: number
  readonly enabled: boolean
  active: Color | null = null
  running = false
  authoritative = false
  private updatedAt = 0

  constructor(initialMs: number, incrementMs: number, enabled: boolean) {
    this.whiteMs = initialMs
    this.blackMs = initialMs
    this.incrementMs = incrementMs
    this.enabled = enabled
  }

  static untimed(): ChessClock {
    return new ChessClock(0, 0, false)
  }

  static local(minutes: number, incrementSeconds: number): ChessClock {
    return new ChessClock(minutes * 60 * 1000, incrementSeconds * 1000, true)
  }

  start(color: Color, now = ChessClock.now()): void {
    if (!this.enabled) return
    this.active = color
    this.running = true
    this.updatedAt = now
  }

  remaining(color: Color, now = ChessClock.now()): number {
    if (!this.enabled) return 0
    const base = color === 'white' ? this.whiteMs : this.blackMs
    if (!this.running || this.active !== color) return Math.max(0, base)
    return Math.max(0, base - (now - this.updatedAt))
  }

  punch(color: Color, now = ChessClock.now()): void {
    if (!this.enabled) return
    this.catchUp(now)
    if (!this.authoritative) {
      if (color === 'white') this.whiteMs += this.incrementMs
      else this.blackMs += this.incrementMs
    }
    this.active = Side.opposite(color)
    this.running = true
    this.updatedAt = now
  }

  sync(whiteMs: number, blackMs: number, active: Color | null, now = ChessClock.now()): void {
    this.whiteMs = whiteMs
    this.blackMs = blackMs
    this.active = active
    this.running = active !== null && this.enabled
    this.updatedAt = now
    this.authoritative = true
  }

  stop(now = ChessClock.now()): void {
    this.catchUp(now)
    this.running = false
    this.active = null
  }

  flag(now = ChessClock.now()): Color | null {
    if (!this.enabled || !this.running || !this.active || this.authoritative) return null
    if (this.remaining(this.active, now) <= 0) return this.active
    return null
  }

  static format(ms: number): string {
    const totalSeconds = Math.max(0, ms) / 1000
    if (totalSeconds < 20) {
      const tenths = Math.floor(totalSeconds * 10) / 10
      return tenths.toFixed(1)
    }
    const whole = Math.ceil(totalSeconds)
    const minutes = Math.floor(whole / 60)
    const seconds = whole % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  private catchUp(now: number): void {
    if (!this.running || !this.active) {
      this.updatedAt = now
      return
    }
    const elapsed = now - this.updatedAt
    if (this.active === 'white') this.whiteMs = Math.max(0, this.whiteMs - elapsed)
    else this.blackMs = Math.max(0, this.blackMs - elapsed)
    this.updatedAt = now
  }

  private static now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }
}
