import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChessClockView } from '../ChessClockView'
import type { IChessClockReadModel } from '../ports/IChessClockReadModel'

class MutableClock implements IChessClockReadModel {
  whiteMs: number
  blackMs: number
  active: IChessClockReadModel['active']
  provisionalExpired: boolean
  confirmedFlag: IChessClockReadModel['confirmedFlag']
  offline: boolean

  constructor(initial: IChessClockReadModel) {
    this.whiteMs = initial.whiteMs
    this.blackMs = initial.blackMs
    this.active = initial.active
    this.provisionalExpired = initial.provisionalExpired
    this.confirmedFlag = initial.confirmedFlag
    this.offline = initial.offline
  }

  /**
   * Stand-in for a Fridae tick. The view must only observe the result.
   */
  applyExternalTick(next: Partial<IChessClockReadModel>): void {
    Object.assign(this, next)
  }
}

function clock(overrides: Partial<IChessClockReadModel> = {}): MutableClock {
  return new MutableClock({
    whiteMs: 60_000,
    blackMs: 60_000,
    active: 'white',
    provisionalExpired: false,
    confirmedFlag: null,
    offline: false,
    ...overrides,
  })
}

describe('ChessClockView', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mirrors read-model ticks without owning a countdown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const model = clock({ whiteMs: 60_000, blackMs: 55_000, active: 'white' })
    const view = new ChessClockView(model)

    expect(view.source).toBe(model)

    const first = view.present()
    expect(first.white.remainingMs).toBe(60_000)
    expect(first.black.remainingMs).toBe(55_000)
    expect(first.white.isActive).toBe(true)
    expect(first.black.isActive).toBe(false)
    expect(first.active).toBe('white')
    expect(first.provisionalExpired).toBe(false)
    expect(first.confirmedFlag).toBeNull()
    expect(first.offline).toBe(false)

    vi.advanceTimersByTime(5_000)
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))

    expect(view.present().white.remainingMs).toBe(60_000)
    expect(view.present().black.remainingMs).toBe(55_000)

    model.applyExternalTick({ whiteMs: 54_000, blackMs: 55_000, active: 'black' })
    const ticked = view.present()
    expect(ticked.white.remainingMs).toBe(54_000)
    expect(ticked.black.remainingMs).toBe(55_000)
    expect(ticked.active).toBe('black')
    expect(ticked.white.isActive).toBe(false)
    expect(ticked.black.isActive).toBe(true)

    model.applyExternalTick({ whiteMs: 54_500 })
    expect(view.present().white.remainingMs).toBe(54_500)
    expect(model.whiteMs).toBe(54_500)
  })

  it('does not write the read model when presenting', () => {
    let writes = 0
    const model: IChessClockReadModel = {
      get whiteMs() {
        return 12_000
      },
      set whiteMs(_value: number) {
        writes += 1
      },
      get blackMs() {
        return 8_000
      },
      set blackMs(_value: number) {
        writes += 1
      },
      active: 'none',
      provisionalExpired: false,
      confirmedFlag: null,
      offline: true,
    }
    const view = new ChessClockView(model)
    const snap = view.present()

    expect(writes).toBe(0)
    expect(snap.white.remainingMs).toBe(12_000)
    expect(snap.black.remainingMs).toBe(8_000)
    expect(snap.active).toBe('none')
    expect(snap.white.isActive).toBe(false)
    expect(snap.black.isActive).toBe(false)
    expect(snap.offline).toBe(true)
  })

  it('shows online provisional expiry as distinct from a confirmed flag', () => {
    const model = clock({
      whiteMs: 0,
      blackMs: 22_000,
      active: 'white',
      provisionalExpired: true,
      confirmedFlag: null,
      offline: false,
    })
    const view = new ChessClockView(model)
    const provisional = view.present()

    expect(provisional.provisionalExpired).toBe(true)
    expect(provisional.confirmedFlag).toBeNull()
    expect(provisional.white.expiry).toBe('provisional-expired')
    expect(provisional.black.expiry).toBe('running')
    expect(provisional.white.remainingMs).toBe(0)

    model.applyExternalTick({ confirmedFlag: 'white', active: 'none' })
    const confirmed = view.present()

    expect(confirmed.confirmedFlag).toBe('white')
    expect(confirmed.white.expiry).toBe('confirmed-flag')
    expect(confirmed.white.expiry).not.toBe(provisional.white.expiry)
    expect(confirmed.black.expiry).toBe('running')
    expect(confirmed.provisionalExpired).toBe(true)
  })

  it('does not treat a zero reading as expiry unless the read model says so', () => {
    const view = new ChessClockView(
      clock({
        whiteMs: 0,
        blackMs: -20,
        provisionalExpired: false,
        confirmedFlag: null,
        offline: false,
        active: 'black',
      }),
    )
    const snap = view.present()

    expect(snap.white.remainingMs).toBe(0)
    expect(snap.black.remainingMs).toBe(-20)
    expect(snap.white.expiry).toBe('running')
    expect(snap.black.expiry).toBe('running')
    expect(snap.black.isActive).toBe(true)
  })

  it('shows an offline locally adjudicated flag and ignores provisional styling', () => {
    const view = new ChessClockView(
      clock({
        whiteMs: 10_000,
        blackMs: 0,
        active: 'none',
        provisionalExpired: true,
        confirmedFlag: 'black',
        offline: true,
      }),
    )
    const snap = view.present()

    expect(snap.offline).toBe(true)
    expect(snap.black.expiry).toBe('offline-local-flag')
    expect(snap.white.expiry).toBe('running')
    expect(snap.black.expiry).not.toBe('provisional-expired')
    expect(snap.black.expiry).not.toBe('confirmed-flag')
  })

  it('does not show provisional expiry offline when no flag is confirmed', () => {
    const view = new ChessClockView(
      clock({
        whiteMs: 0,
        blackMs: 40_000,
        active: 'white',
        provisionalExpired: true,
        confirmedFlag: null,
        offline: true,
      }),
    )
    const snap = view.present()

    expect(snap.white.expiry).toBe('running')
    expect(snap.provisionalExpired).toBe(true)
    expect(snap.offline).toBe(true)
  })

  it('keeps provisional styling off when time remains', () => {
    const view = new ChessClockView(
      clock({
        whiteMs: 1500,
        provisionalExpired: true,
        confirmedFlag: null,
        offline: false,
      }),
    )

    expect(view.present().white.expiry).toBe('running')
  })

  it('rebinds to a new read model without copying time into local state', () => {
    const first = clock({ whiteMs: 1000 })
    const view = new ChessClockView(first)
    const next = clock({ whiteMs: 42, blackMs: 43, active: 'none', offline: true })

    view.bind(next)

    expect(view.source).toBe(next)
    expect(view.present().white.remainingMs).toBe(42)
    expect(view.present().black.remainingMs).toBe(43)
    expect(first.whiteMs).toBe(1000)
  })
})
