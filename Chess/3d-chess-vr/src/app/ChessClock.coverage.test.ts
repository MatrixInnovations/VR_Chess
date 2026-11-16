import { describe, expect, it } from 'vitest'
import { ChessClock, ClockModeError } from '../../../../fridae-clock/src/ChessClock'
import { LichessTimeControl } from '../../../../fridae-clock/src/LichessTimeControl'
import { ManualMonotonicTimeSource } from '../../../../fridae-clock/src/MonotonicTimeSource'

function auth(partial: Record<string, unknown> = {}) {
  return {
    generation: 1,
    ply: 0,
    whiteMs: 60_000,
    blackMs: 60_000,
    whiteIncrementMs: 1_000,
    blackIncrementMs: 1_000,
    sideToMove: 'white' as const,
    status: 'started',
    winner: null,
    kind: 'realtime' as const,
    speed: 'blitz' as const,
    daysPerTurn: null,
    expiration: null,
    ...partial,
  }
}

describe('ChessClock', () => {
  it('runs, pauses, rearms, and confirms a flag', () => {
    const time = new ManualMonotonicTimeSource(1_000)
    const online = ChessClock.createOnline(time)
    expect(online.snapshot().kind).toBe('absent')
    expect(online.displayMillis('white')).toBeNull()
    const stop = online.subscribe(() => undefined)
    online.applyAuthoritativeSnapshot(auth({ status: 'created' }))
    expect(online.snapshot().phase).toBe('armed')
    online.applyAuthoritativeSnapshot(auth())
    time.advance(1_000)
    expect(online.displayMillis('white')).toBe(59_000)
    online.applyAcceptedMove({ accepted: false, mover: 'white', ply: 1, revision: 'no' })
    online.applyAcceptedMove({ accepted: true, mover: 'white', ply: 1, revision: 'm1' })
    online.applyAcceptedMove({ accepted: true, mover: 'white', ply: 1, revision: 'm1' })
    online.pause()
    online.pause()
    online.resume()
    online.hold()
    online.standDown()
    online.rearm({ whiteMs: 5_000, blackMs: 5_000, incrementMs: 0, sideToMove: 'black' })
    online.replaceRemaining(1_000, 5_000, 'white')
    time.advance(2_000)
    online.applyAuthoritativeSnapshot(auth({ status: 'outoftime', winner: 'black', whiteMs: 0, generation: 3 }))
    expect(online.snapshot().terminal).toBe(true)
    online.notifyTapped('white')
    online.noteOpponentGone({ gone: true, claimWinInSeconds: 30 })
    online.dispose()
    stop()
    expect(() => online.snapshot()).toThrow()
  })

  it('refuses a correspondence control for an offline clock', () => {
    const time = new ManualMonotonicTimeSource(0)
    expect(() => ChessClock.createOffline(time, LichessTimeControl.correspondence(1))).toThrow(ClockModeError)
    const clock = ChessClock.createArmed(time, {
      mode: 'offline',
      whiteMs: 10_000,
      blackMs: 10_000,
      incrementMs: 0,
      sideToMove: 'white',
    })
    time.advance(500)
    expect(clock.snapshot().mode).toBe('offline')
    clock.acceptTap({ color: 'white' })
    clock.dispose()
  })
})
