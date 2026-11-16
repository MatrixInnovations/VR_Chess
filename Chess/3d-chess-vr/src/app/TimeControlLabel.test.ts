import { describe, expect, it } from 'vitest'
import { TimeControlLabel } from './TimeControlLabel'

describe('TimeControlLabel', () => {
  it('parses a minutes+increment label and refuses anything else', () => {
    expect(TimeControlLabel.parse('10 + 0')).toEqual({ minutes: 10, increment: 0 })
    expect(TimeControlLabel.parse('blitz')).toBeNull()
  })

  it('allows rapid seeks and blitz challenges, and names the refusal', () => {
    const seek = TimeControlLabel.seek('10+0', true, 'white')
    expect(seek.ok).toBe(true)
    expect(TimeControlLabel.seek('3+0', false, 'random').ok).toBe(false)
    expect(TimeControlLabel.seek('nope', false, 'black').ok).toBe(false)
    const challenge = TimeControlLabel.challenge('3+2', false, 'black')
    expect(challenge.ok).toBe(true)
    expect(TimeControlLabel.challenge('1+0', true, 'white').ok).toBe(false)
    expect(TimeControlLabel.challenge('later', false, 'random').ok).toBe(false)
  })
})
