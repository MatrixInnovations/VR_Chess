import { describe, expect, it } from 'vitest'

import { HudOverlay } from '../HudOverlay'
import { InvalidViewModeError, ViewMode } from '../ViewMode'

describe('HudOverlay', () => {
  it('opens and closes', () => {
    const hud = new HudOverlay()

    expect(hud.isOpen).toBe(false)
    expect(hud.isPresented).toBe(false)

    hud.open()
    expect(hud.isOpen).toBe(true)
    expect(hud.isPresented).toBe(true)

    hud.close()
    expect(hud.isOpen).toBe(false)
    expect(hud.isPresented).toBe(false)
  })

  it('hides an open HUD in immersive mode when hands are active', () => {
    const hud = new HudOverlay()
    hud.open()
    hud.setViewMode(ViewMode.immersive())

    expect(hud.isPresented).toBe(true)

    hud.setHandsActive(true)

    expect(hud.viewMode.name).toBe('immersive')
    expect(hud.handsAreActive).toBe(true)
    expect(hud.isOpen).toBe(true)
    expect(hud.isPresented).toBe(false)
  })

  it('shows the HUD again when hands release or the player leaves immersive mode', () => {
    const hud = new HudOverlay(ViewMode.immersive())
    hud.open()
    hud.setHandsActive(true)
    expect(hud.isPresented).toBe(false)

    hud.setHandsActive(false)
    expect(hud.isPresented).toBe(true)

    hud.setHandsActive(true)
    expect(hud.isPresented).toBe(false)

    hud.setViewMode('desktop3d')
    expect(hud.isPresented).toBe(true)
    expect(hud.handsAreActive).toBe(true)
  })

  it('does not suppress the desktop HUD when hands are active', () => {
    const hud = new HudOverlay()
    hud.open()
    hud.setHandsActive(true)

    expect(hud.viewMode.isDesktop3d()).toBe(true)
    expect(hud.isPresented).toBe(true)
  })

  it('keeps a closed HUD hidden in every environment', () => {
    const hud = new HudOverlay()
    hud.setViewMode(ViewMode.immersive())
    hud.setHandsActive(false)

    expect(hud.isPresented).toBe(false)

    hud.setHandsActive(true)
    expect(hud.isOpen).toBe(false)
    expect(hud.isPresented).toBe(false)
  })

  it('rejects an illegal view mode without changing the current one', () => {
    const hud = new HudOverlay()
    hud.setViewMode(ViewMode.immersive())

    expect(() => hud.setViewMode('cave')).toThrow(InvalidViewModeError)
    expect(hud.viewMode.name).toBe('immersive')
  })
})
