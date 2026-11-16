import { describe, expect, it } from 'vitest'

import { InvalidViewModeError, ViewMode } from '../ViewMode'

describe('ViewMode', () => {
  it('exposes desktop3d and immersive as the only named modes', () => {
    expect(ViewMode.desktop3d().name).toBe('desktop3d')
    expect(ViewMode.immersive().name).toBe('immersive')
    expect(ViewMode.desktop3d().isDesktop3d()).toBe(true)
    expect(ViewMode.desktop3d().isImmersive()).toBe(false)
    expect(ViewMode.immersive().isImmersive()).toBe(true)
    expect(ViewMode.immersive().isDesktop3d()).toBe(false)
  })

  it('parses the two legal names onto the canonical values', () => {
    expect(ViewMode.parse('desktop3d').equals(ViewMode.desktop3d())).toBe(true)
    expect(ViewMode.parse('immersive').equals(ViewMode.immersive())).toBe(true)
    expect(ViewMode.parse('desktop3d').name).toBe('desktop3d')
    expect(ViewMode.parse('immersive').name).toBe('immersive')
  })

  it('rejects an illegal mode string', () => {
    expect(() => ViewMode.parse('tabletop')).toThrow(InvalidViewModeError)
    try {
      ViewMode.parse('tabletop')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidViewModeError)
      expect((error as InvalidViewModeError).value).toBe('tabletop')
      expect((error as Error).message).toContain('tabletop')
    }
  })

  it('returns the opposite mode', () => {
    expect(ViewMode.desktop3d().opposite().equals(ViewMode.immersive())).toBe(true)
    expect(ViewMode.immersive().opposite().equals(ViewMode.desktop3d())).toBe(true)
  })

  it('compares by mode name', () => {
    expect(ViewMode.desktop3d().equals(ViewMode.parse('desktop3d'))).toBe(true)
    expect(ViewMode.desktop3d().equals(ViewMode.immersive())).toBe(false)
  })
})
