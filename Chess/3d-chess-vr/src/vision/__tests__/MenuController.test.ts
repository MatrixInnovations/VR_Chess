import { describe, expect, it } from 'vitest'

import { MenuController } from '../MenuController'
import type { IGameSessionViewPort } from '../ports/IGameSessionViewPort'

class SpyGameSession implements IGameSessionViewPort {
  applyMoveCalls = 0

  constructor(readonly id: string, readonly moves: string[]) {}

  applyMove(move: string): void {
    this.applyMoveCalls += 1
    this.moves.push(move)
  }
}

describe('MenuController', () => {
  it('opens main, pause, and settings, then closes', () => {
    const session = new SpyGameSession('game-1', ['e2e4'])
    const menu = new MenuController(session)

    expect(menu.screen).toBeNull()
    expect(menu.isOpen).toBe(false)
    expect(menu.sessionId).toBe('game-1')
    expect(menu.session).toBe(session)

    menu.openMain()
    expect(menu.screen).toBe('main')
    expect(menu.isOpen).toBe(true)

    menu.openPause()
    expect(menu.screen).toBe('pause')

    menu.openSettings()
    expect(menu.screen).toBe('settings')

    menu.close()
    expect(menu.screen).toBeNull()
    expect(menu.isOpen).toBe(false)
  })

  it('shows pause UI without mutating the game session moves', () => {
    const moves = ['e2e4', 'e7e5']
    const session = new SpyGameSession('game-9', moves)
    const menu = new MenuController(session)

    menu.openPause()
    menu.openSettings()
    menu.openMain()
    menu.close()
    menu.openPause()

    expect(menu.screen).toBe('pause')
    expect(session.moves).toBe(moves)
    expect(session.moves).toEqual(['e2e4', 'e7e5'])
    expect(session.applyMoveCalls).toBe(0)
    expect(menu.session).toBe(session)
    expect(menu.sessionId).toBe('game-9')
  })
})
