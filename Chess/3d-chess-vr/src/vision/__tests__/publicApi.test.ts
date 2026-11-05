import { describe, expect, it } from 'vitest'

import { ChessClockView, HudOverlay, MenuController, ModeToggleControl, TourGuide, ViewMode, ViewModeManager } from '../index'
import type { IChessClockReadModel } from '../ports/IChessClockReadModel'
import type { IGameSessionViewPort } from '../ports/IGameSessionViewPort'

class SessionStub implements IGameSessionViewPort {
  constructor(readonly id: string) {}
}

class ClockStub implements IChessClockReadModel {
  whiteMs = 1
  blackMs = 2
  active: IChessClockReadModel['active'] = 'none'
  provisionalExpired = false
  confirmedFlag: IChessClockReadModel['confirmedFlag'] = null
  offline = true
}

describe('vision public API', () => {
  it('exports the view classes used by the lane', () => {
    const session = new SessionStub('s')
    const clock = new ClockStub()
    const manager = new ViewModeManager(session, clock)
    const control = new ModeToggleControl(manager, {
      isXrAvailable: () => false,
    })
    const hud = new HudOverlay()
    const menu = new MenuController(session)
    const tour = new TourGuide([{ id: 'one', title: 'One', body: 'First run' }])
    const clockView = new ChessClockView(clock)

    expect(ViewMode.desktop3d().name).toBe('desktop3d')
    expect(manager.mode.name).toBe('desktop3d')
    expect(control.disabled).toBe(true)
    expect(hud.isOpen).toBe(false)
    expect(menu.screen).toBeNull()
    expect(tour.allowsLegalMove()).toBe(true)
    expect(clockView.present().white.remainingMs).toBe(1)
  })
})
