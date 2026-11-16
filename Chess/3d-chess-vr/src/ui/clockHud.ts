/** One HUD clock face. */
export interface ClockHudFace {
  isActive: boolean
  expiry: string
  remainingMs: number
  /** No countdown, or the lobby is still waiting. */
  blank?: boolean
}

/**
 * A running clock on the side to move is low at 30 seconds and at zero.
 * The other side never takes the cue, and a flag is not a low-time warning.
 * @param face - Active flag, expiry, and published remaining time.
 * @returns True when the low-time treatment should show.
 */
export function clockIsLow(face: {
  isActive: boolean
  expiry: string
  remainingMs: number | null
}): boolean {
  if (!face.isActive || face.expiry !== 'running') return false
  return (face.remainingMs ?? 0) <= 30_000
}

/** Classes for the side-to-move, low-time, provisional, and flag treatments. */
export function clockFaceClass(face: ClockHudFace): string {
  const names = ['hall-clock']
  if (face.blank || face.expiry === 'no-clock') return names.join(' ')
  if (face.isActive) names.push('hall-clock-active')
  if (face.expiry === 'provisional-expired') names.push('hall-clock-provisional')
  if (face.expiry === 'confirmed-flag' || face.expiry === 'offline-local-flag') names.push('hall-clock-flag')
  if (clockIsLow(face)) names.push('hall-clock-low')
  return names.join(' ')
}

/** Short status after the time. Provisional and flag are different phrases. */
export function clockNote(face: ClockHudFace): string {
  if (face.blank || face.expiry === 'no-clock') return ''
  if (face.expiry === 'provisional-expired') return ' · provisional'
  if (face.expiry === 'confirmed-flag' || face.expiry === 'offline-local-flag') return ' · flag'
  if (clockIsLow(face)) return ' · low'
  return ''
}

/**
 * Format a published millisecond value. This does not sample a clock.
 * A blank face is a dash, not `0:00`.
 * @param ms - Remaining time from the read model.
 * @param blank - True when there is no countdown or the game is still waiting.
 * @returns `m:ss`, or `—`.
 */
export function formatClockMs(ms: number, blank = false): string {
  if (blank) return '—'
  const whole = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
