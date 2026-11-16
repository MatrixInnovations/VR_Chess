import { describe, expect, it } from 'vitest'

import { MockVisionPorts } from '../testing/MockVisionPorts'
import { ViewModeManager } from '../../ViewModeManager'
import type { IChessClockReadModel } from '../../ports/IChessClockReadModel'
import { ViewModeHostAdapter } from '../ViewModeHostAdapter'

class Clock implements IChessClockReadModel {
  whiteMs = 1000
  blackMs = 1000
  active: 'white' | 'black' | 'none' = 'white'
  provisionalExpired = false
  confirmedFlag: 'white' | 'black' | null = null
  offline = true
}

describe('VisionShell', () => {
  it('signs in, seeks, and keeps the session object when the view flips', async () => {
    const clock = new Clock()
    const session = { id: 'fixtureGame1' }
    const manager = new ViewModeManager(session, clock)
    const ports = new MockVisionPorts({ autoPair: true, viewHost: new ViewModeHostAdapter(manager) })
    await ports.shell.signIn.begin()
    expect(ports.shell.authPresenter.snapshot().authorizationUrl).toContain('lichess.org')
    await ports.shell.signIn.complete('https://example.test/?code=abc&state=ok')
    expect(ports.shell.navigator.screen.name).toBe('lobby')
    ports.shell.lobbyPresenter.setTimeControl('10+0')
    await ports.shell.lobby.seek()
    expect(ports.shell.navigator.screen.name).toBe('board')
    expect(ports.shell.navigator.session).toBe(session)
    ports.shell.navigator.switchInGameView('immersive')
    expect(manager.mode.name).toBe('immersive')
    expect(ports.shell.navigator.session).toBe(session)
    expect(manager.clock).toBe(clock)
  })

  it('starts pass-and-play without calling the lobby port', () => {
    const ports = new MockVisionPorts()
    ports.shell.lobby.startOfflineDemo()
    expect(ports.shell.navigator.screen.name).toBe('board')
    expect(ports.shell.board.snapshot().offlineDemo).toBe(true)
    expect(ports.lobby.calls).toHaveLength(0)
  })
})
