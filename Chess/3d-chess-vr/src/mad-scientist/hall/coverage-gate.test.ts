import { describe, expect, it, vi } from 'vitest'

import type { IFridaeClockSnapshot } from '../contracts/IFridaeClockPort'
import { BoundClockPort } from './BoundClockPort'
import { ClockMaterials } from './ClockMaterials'
import { ClockTapRouter, ReadOnlyClockTapPolicy } from './ClockTapRouter'
import { ClockTapTarget } from './ClockTapTarget'
import { ClockViewMirror, formatPublishedMs } from './ClockViewMirror'
import { SessionClockTapPolicy } from './SessionClockTapPolicy'

function snap(partial: Partial<IFridaeClockSnapshot> = {}): IFridaeClockSnapshot {
  return {
    kind: 'realtime',
    mode: 'online',
    activeColor: 'white',
    whiteDisplayMs: 60_000,
    blackDisplayMs: 60_000,
    whiteIncrementMs: 0,
    blackIncrementMs: 0,
    provisionalFlagColor: null,
    confirmedFlag: null,
    ...partial,
  }
}

describe('hall clock helpers', () => {
  it('publishes a bound clock and ignores a removed listener', () => {
    const port = new BoundClockPort(snap())
    expect(port.read()?.kind).toBe('realtime')
    const seen: Array<string | null> = []
    const stop = port.subscribe((next) => seen.push(next?.kind ?? null))
    port.publish(null)
    stop()
    port.publish(snap({ mode: 'offline' }))
    expect(seen).toEqual([null])
    expect(port.read()?.mode).toBe('offline')
  })

  it('routes a clock press and refuses one when the callback never runs', () => {
    const target = new ClockTapTarget({ x: 0, y: 0, z: 0 })
    const router = new ClockTapRouter(target, new ReadOnlyClockTapPolicy())
    router.attach()
    expect(router.lastDecision).toBeNull()
    expect(router.press('white')).toEqual({ accepted: false, reason: 'online-authoritative' })
    target.tap()
    target.setOnTap(null)
    expect(router.press('black')).toEqual({ accepted: false, reason: 'online-authoritative' })
    const policy = {
      consider: vi.fn(() => ({ accepted: true as const, mode: 'offline' as const })),
    }
    router.setPolicy(policy)
    expect(router.press('black')?.accepted).toBe(true)
    expect(policy.consider).toHaveBeenCalledWith({ side: 'black' })
  })

  it('classifies offline, online, missing, and refused clock presses', () => {
    let current: IFridaeClockSnapshot | null = null
    const offline = { acceptOfflineClockTap: vi.fn(() => true) }
    const policy = new SessionClockTapPolicy(() => current, offline)
    expect(policy.consider({ side: 'white' })).toEqual({ accepted: false, reason: 'no-clock' })
    current = snap({ kind: 'unlimited' })
    expect(policy.consider({ side: 'white' })).toEqual({ accepted: false, reason: 'no-clock' })
    current = snap({ mode: 'online' })
    expect(policy.consider({ side: 'white' })).toEqual({ accepted: false, reason: 'online-authoritative' })
    current = snap({ mode: 'offline' })
    expect(policy.consider({ side: 'black' })).toEqual({ accepted: true, mode: 'offline' })
    offline.acceptOfflineClockTap.mockReturnValue(false)
    expect(policy.consider({ side: 'black' })).toEqual({ accepted: false, reason: 'offline-refused' })
  })

  it('paints every clock face and formats an hour', () => {
    const materials = new ClockMaterials()
    for (const expiry of ['running', 'provisional-expired', 'confirmed-flag', 'offline-local-flag', 'no-clock'] as const) {
      expect(materials.forExpiry(expiry)).toBeTruthy()
    }
    materials.dispose()
    const mirror = new ClockViewMirror()
    expect(formatPublishedMs(-10)).toBe('0:00')
    expect(formatPublishedMs(3_600_000)).toBe('1:00:00')
    const running = mirror.present(snap())
    expect(running.white.expiry).toBe('running')
    expect(running.white.isActive).toBe(true)
    expect(running.black.isActive).toBe(false)
    const flagged = mirror.present(
      snap({
        mode: 'offline',
        confirmedFlag: { color: 'black', source: 'local' },
        activeColor: null,
        blackDisplayMs: 0,
      }),
    )
    expect(flagged.black.expiry).toBe('offline-local-flag')
    expect(flagged.active).toBe('none')
    expect(flagged.confirmedFlag).toBe('black')
    const onlineFlag = mirror.present(snap({ confirmedFlag: { color: 'white', source: 'server' }, whiteDisplayMs: 0 }))
    expect(onlineFlag.white.expiry).toBe('confirmed-flag')
    const provisional = mirror.present(snap({ provisionalFlagColor: 'white', whiteDisplayMs: 0, activeColor: 'black' }))
    expect(provisional.white.expiry).toBe('provisional-expired')
    expect(provisional.provisionalExpired).toBe(true)
    const absent = mirror.present(snap({ kind: 'absent', whiteDisplayMs: null, blackDisplayMs: null }))
    expect(absent.white.expiry).toBe('no-clock')
    expect(absent.white.label).toBe('—')
    const correspondence = mirror.present(snap({ kind: 'correspondence' }))
    expect(correspondence.black.label).toBe('—')
  })
})
