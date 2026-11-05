import { describe, expect, it } from 'vitest'

import type { IChessClockReadModel } from '../ports/IChessClockReadModel'
import type { IGameSessionViewPort } from '../ports/IGameSessionViewPort'
import { InvalidViewModeError, ViewMode } from '../ViewMode'
import { ViewModeManager } from '../ViewModeManager'

class SessionStub implements IGameSessionViewPort {
  constructor(readonly id: string) {}
}

class ClockStub implements IChessClockReadModel {
  constructor(
    public whiteMs: number,
    public blackMs: number,
    public active: IChessClockReadModel['active'],
    public provisionalExpired: boolean,
    public confirmedFlag: IChessClockReadModel['confirmedFlag'],
    public offline: boolean,
  ) {}
}

describe('ViewModeManager', () => {
  const session = new SessionStub('session-42')
  const clock = new ClockStub(90_000, 90_000, 'white', false, null, false)

  it('starts in desktop3d', () => {
    const manager = new ViewModeManager(session, clock)

    expect(manager.mode.equals(ViewMode.desktop3d())).toBe(true)
    expect(manager.mode.name).toBe('desktop3d')
  })

  it('switches to immersive and back while preserving session identity and clock state', () => {
    const manager = new ViewModeManager(session, clock)

    manager.switchTo('immersive')

    expect(manager.mode.name).toBe('immersive')
    expect(manager.session).toBe(session)
    expect(manager.clock).toBe(clock)

    clock.whiteMs = 81_000
    clock.active = 'black'
    clock.provisionalExpired = true

    manager.switchTo(ViewMode.desktop3d())

    expect(manager.mode.name).toBe('desktop3d')
    expect(manager.session).toBe(session)
    expect(manager.session.id).toBe('session-42')
    expect(manager.clock).toBe(clock)
    expect(manager.clock.whiteMs).toBe(81_000)
    expect(manager.clock.blackMs).toBe(90_000)
    expect(manager.clock.active).toBe('black')
    expect(manager.clock.provisionalExpired).toBe(true)
    expect(manager.clock.confirmedFlag).toBeNull()
    expect(manager.clock.offline).toBe(false)
  })

  it('toggles without replacing the session or resetting the clock read model', () => {
    const manager = new ViewModeManager(session, clock)
    const whiteBefore = clock.whiteMs

    manager.toggle()
    manager.toggle()

    expect(manager.mode.name).toBe('desktop3d')
    expect(manager.session).toBe(session)
    expect(manager.clock).toBe(clock)
    expect(manager.clock.whiteMs).toBe(whiteBefore)
  })

  it('rejects an illegal mode and leaves the current mode in place', () => {
    const manager = new ViewModeManager(session, clock, ViewMode.immersive())

    expect(manager.mode.name).toBe('immersive')
    expect(() => manager.switchTo('tabletop')).toThrow(InvalidViewModeError)
    expect(manager.mode.name).toBe('immersive')
    expect(manager.session).toBe(session)
    expect(manager.clock).toBe(clock)
    expect(() => manager.switchTo({} as unknown as ViewMode)).toThrow(
      InvalidViewModeError,
    )
    expect(manager.mode.name).toBe('immersive')
  })
})
