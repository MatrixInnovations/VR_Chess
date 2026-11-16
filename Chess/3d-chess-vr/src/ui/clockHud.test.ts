import { describe, expect, it } from 'vitest'

import { clockFaceClass, clockNote, formatClockMs } from './clockHud'

const face = (overrides: Partial<Parameters<typeof clockFaceClass>[0]> = {}) => ({
  isActive: false,
  expiry: 'running',
  remainingMs: 600_000,
  ...overrides,
})

describe('clock HUD cues', () => {
  it('highlights the side to move and adds a low-time cue under 30 seconds', () => {
    expect(clockFaceClass(face({ isActive: true }))).toBe('hall-clock hall-clock-active')
    expect(clockNote(face({ isActive: true }))).toBe('')
    const low = face({ isActive: true, remainingMs: 30_000 })
    expect(clockFaceClass(low)).toContain('hall-clock-low')
    expect(clockNote(low)).toBe(' · low')
    expect(clockFaceClass(face({ isActive: true, remainingMs: 30_001 }))).not.toContain('hall-clock-low')
  })

  it('keeps a provisional zero distinct from a confirmed flag', () => {
    const provisional = face({ expiry: 'provisional-expired', remainingMs: 0, isActive: false })
    const flagged = face({ expiry: 'confirmed-flag', remainingMs: 0 })
    expect(clockFaceClass(provisional)).toBe('hall-clock hall-clock-provisional')
    expect(clockNote(provisional)).toBe(' · provisional')
    expect(clockFaceClass(flagged)).toBe('hall-clock hall-clock-flag')
    expect(clockNote(flagged)).toBe(' · flag')
    expect(clockNote(face({ expiry: 'offline-local-flag' }))).toBe(' · flag')
    expect(clockFaceClass(provisional)).not.toBe(clockFaceClass(flagged))
  })

  it('shows a dash when there is no clock or the game is waiting', () => {
    expect(formatClockMs(0, true)).toBe('—')
    expect(formatClockMs(0)).toBe('0:00')
    expect(formatClockMs(65_000)).toBe('1:05')
    expect(clockNote(face({ blank: true, expiry: 'no-clock', remainingMs: 0 }))).toBe('')
    expect(clockFaceClass(face({ blank: true, expiry: 'no-clock', isActive: true }))).toBe('hall-clock')
    expect(clockFaceClass(face({ expiry: 'no-clock' }))).toBe('hall-clock')
  })
})
