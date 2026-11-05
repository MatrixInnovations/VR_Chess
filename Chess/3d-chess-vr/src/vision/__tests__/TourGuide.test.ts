import { describe, expect, it } from 'vitest'

import type { ITourStep } from '../ITourGuide'
import { InvalidTourError, TourGuide } from '../TourGuide'

function step(id: string): ITourStep {
  return { id, title: `Title ${id}`, body: `Body ${id}` }
}

describe('TourGuide', () => {
  const ordered = [step('welcome'), step('board'), step('clock')]

  it('shows first-run steps in constructor order', () => {
    const steps = [step('z'), step('a'), step('m')]
    const guide = new TourGuide(steps)

    expect(guide.current()).toBeNull()
    expect(guide.isActive()).toBe(false)
    expect(guide.isFirstRunPending()).toBe(true)

    guide.start()
    expect(guide.current()).toBe(steps[0])
    guide.next()
    expect(guide.current()?.id).toBe('a')
    guide.next()
    expect(guide.current()?.id).toBe('m')
    guide.next()

    expect(guide.current()).toBeNull()
    expect(guide.isActive()).toBe(false)
    expect(guide.isFirstRunPending()).toBe(false)
  })

  it('skips and resumes at the same step', () => {
    const guide = new TourGuide(ordered)
    guide.start()
    guide.next()
    expect(guide.current()?.id).toBe('board')

    guide.skip()

    expect(guide.isActive()).toBe(false)
    expect(guide.current()).toBeNull()
    expect(guide.isFirstRunPending()).toBe(true)

    guide.resume()

    expect(guide.isActive()).toBe(true)
    expect(guide.current()?.id).toBe('board')
    guide.next()
    expect(guide.current()?.id).toBe('clock')
  })

  it('never blocks a legal move', () => {
    const guide = new TourGuide(ordered)

    expect(guide.allowsLegalMove()).toBe(true)

    guide.start()
    const during = guide.current()?.id
    expect(guide.allowsLegalMove()).toBe(true)
    guide.acknowledgeLegalMove()
    expect(guide.current()?.id).toBe(during)
    expect(guide.isActive()).toBe(true)

    guide.skip()
    expect(guide.allowsLegalMove()).toBe(true)
    guide.acknowledgeLegalMove()
    expect(guide.isActive()).toBe(false)
    expect(guide.current()).toBeNull()

    guide.resume()
    guide.next()
    guide.next()
    expect(guide.isFirstRunPending()).toBe(false)
    expect(guide.allowsLegalMove()).toBe(true)
    guide.acknowledgeLegalMove()
    expect(guide.isActive()).toBe(false)
  })

  it('ignores next, skip, and resume when they do not apply', () => {
    const guide = new TourGuide(ordered)

    guide.next()
    guide.skip()
    guide.resume()
    expect(guide.isActive()).toBe(false)
    expect(guide.current()).toBeNull()

    guide.start()
    guide.next()
    guide.next()
    guide.next()
    expect(guide.isFirstRunPending()).toBe(false)

    guide.skip()
    guide.resume()
    guide.next()
    expect(guide.isActive()).toBe(false)
    expect(guide.isFirstRunPending()).toBe(false)
  })

  it('restarts at the first step when start is called again', () => {
    const guide = new TourGuide(ordered)
    guide.start()
    guide.next()
    guide.start()

    expect(guide.current()?.id).toBe('welcome')
    expect(guide.isActive()).toBe(true)
  })

  it('keeps its own copy of the step list', () => {
    const steps = [step('welcome'), step('board')]
    const welcome = steps[0]
    const guide = new TourGuide(steps)
    steps.splice(0, steps.length)

    guide.start()
    expect(guide.current()).toBe(welcome)
  })

  it('rejects an empty tour or duplicate step ids', () => {
    expect(() => new TourGuide([])).toThrow(InvalidTourError)
    expect(() => new TourGuide([step('only'), step('only')])).toThrow(InvalidTourError)
  })
})
