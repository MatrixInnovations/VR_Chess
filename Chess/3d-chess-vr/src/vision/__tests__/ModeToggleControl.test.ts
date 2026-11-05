import { describe, expect, it } from 'vitest'

import { ModeToggleControl } from '../ModeToggleControl'
import type { IModeSwitchRequest } from '../ModeToggleControl'
import type { IChessClockReadModel } from '../ports/IChessClockReadModel'
import type { IGameSessionViewPort } from '../ports/IGameSessionViewPort'
import { ViewMode } from '../ViewMode'
import { ViewModeManager } from '../ViewModeManager'

class SessionStub implements IGameSessionViewPort {
  constructor(readonly id: string) {}
}

class ClockStub implements IChessClockReadModel {
  whiteMs = 60_000
  blackMs = 60_000
  active: IChessClockReadModel['active'] = 'white'
  provisionalExpired = false
  confirmedFlag: IChessClockReadModel['confirmedFlag'] = null
  offline = false
}

class XrProbe {
  constructor(private available: boolean) {}

  isXrAvailable(): boolean {
    return this.available
  }

  setAvailable(available: boolean): void {
    this.available = available
  }
}

describe('ModeToggleControl', () => {
  function setup(xrAvailable = true) {
    const session = new SessionStub('session-7')
    const clock = new ClockStub()
    const manager = new ViewModeManager(session, clock)
    const xr = new XrProbe(xrAvailable)
    const control = new ModeToggleControl(manager, xr)
    return { session, clock, manager, xr, control }
  }

  it('emits exactly one switch request per press and applies it', () => {
    const { control, manager, session, clock } = setup(true)
    const requests: IModeSwitchRequest[] = []
    control.subscribe({
      onModeSwitchRequested(request) {
        requests.push(request)
      },
    })

    control.press()

    expect(requests).toHaveLength(1)
    expect(requests[0].target.equals(ViewMode.immersive())).toBe(true)
    expect(manager.mode.name).toBe('immersive')
    expect(manager.session).toBe(session)
    expect(manager.clock).toBe(clock)

    control.press()

    expect(requests).toHaveLength(2)
    expect(requests[1].target.name).toBe('desktop3d')
    expect(manager.mode.name).toBe('desktop3d')
    expect(manager.session).toBe(session)
    expect(manager.clock.whiteMs).toBe(60_000)
  })

  it('does not emit when XR is unavailable', () => {
    const { control, manager } = setup(false)
    let calls = 0
    control.subscribe({
      onModeSwitchRequested() {
        calls += 1
      },
    })

    expect(control.disabled).toBe(true)
    control.press()
    control.press()

    expect(calls).toBe(0)
    expect(manager.mode.name).toBe('desktop3d')
  })

  it('follows XR availability as it changes', () => {
    const { control, xr, manager } = setup(true)
    let calls = 0
    control.subscribe({
      onModeSwitchRequested() {
        calls += 1
      },
    })

    xr.setAvailable(false)
    expect(control.disabled).toBe(true)
    control.press()
    expect(calls).toBe(0)
    expect(manager.mode.name).toBe('desktop3d')

    xr.setAvailable(true)
    expect(control.disabled).toBe(false)
    control.press()
    expect(calls).toBe(1)
    expect(manager.mode.name).toBe('immersive')
  })

  it('exposes a non-empty accessible name', () => {
    const { control, xr, manager } = setup(true)

    expect(control.accessibilityLabel).toBe('Switch to immersive view')
    const enabledAria = control.toAriaAttributes()
    expect(enabledAria.role).toBe('button')
    expect(enabledAria['aria-label']).toBe(control.accessibilityLabel)
    expect(enabledAria['aria-label'].length).toBeGreaterThan(0)
    expect(enabledAria['aria-disabled']).toBe(false)

    manager.switchTo(ViewMode.immersive())
    expect(control.accessibilityLabel).toBe('Switch to desktop 3D view')

    xr.setAvailable(false)
    expect(control.accessibilityLabel).toBe(
      'View mode toggle unavailable. Immersive XR is not available on this device.',
    )
    const disabledAria = control.toAriaAttributes()
    expect(disabledAria['aria-label']).toBe(control.accessibilityLabel)
    expect(disabledAria['aria-disabled']).toBe(true)
    expect(disabledAria['aria-label'].length).toBeGreaterThan(0)
  })

  it('stops notifying a listener after unsubscribe', () => {
    const { control } = setup(true)
    let calls = 0
    const unsubscribe = control.subscribe({
      onModeSwitchRequested() {
        calls += 1
      },
    })

    unsubscribe()
    control.press()

    expect(calls).toBe(0)
  })

  it('notifies every current subscriber once per press', () => {
    const { control } = setup(true)
    let first = 0
    let second = 0
    control.subscribe({
      onModeSwitchRequested() {
        first += 1
      },
    })
    const unsubscribeSecond = control.subscribe({
      onModeSwitchRequested() {
        second += 1
      },
    })

    control.press()
    expect(first).toBe(1)
    expect(second).toBe(1)

    unsubscribeSecond()
    control.press()
    expect(first).toBe(2)
    expect(second).toBe(1)
  })
})
