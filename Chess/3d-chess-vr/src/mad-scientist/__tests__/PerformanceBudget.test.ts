import { describe, expect, it } from 'vitest'

import { PerformanceBudget } from '../hall/PerformanceBudget'

describe('PerformanceBudget', () => {
  it('stays quiet inside the Quest Pro 72-90 fps band', () => {
    const logger = { warnings: [] as string[], warn(message: string) { this.warnings.push(message) } }
    const budget = new PerformanceBudget({ logger })

    expect(budget.sample(0)).toMatchObject({ underFloor: false, warned: false })
    expect(budget.getLastFps()).toBe(PerformanceBudget.QUEST_PRO_TARGET_FPS)

    const at90 = budget.sample(1000 / 90)
    expect(at90.fps).toBeCloseTo(90, 4)
    expect(at90.underFloor).toBe(false)
    expect(at90.warned).toBe(false)

    const at80 = budget.sample(1000 / 90 + 12.5)
    expect(at80.fps).toBeCloseTo(80, 4)
    expect(at80.warned).toBe(false)

    const at72 = budget.sample(1000 / 90 + 12.5 + 1000 / 72)
    expect(at72.fps).toBeCloseTo(72, 4)
    expect(at72.underFloor).toBe(false)
    expect(at72.warned).toBe(false)
    expect(logger.warnings).toHaveLength(0)
  })

  it('warns when fps drops under the floor and again after recovery', () => {
    const logger = { warnings: [] as string[], warn(message: string) { this.warnings.push(message) } }
    const budget = new PerformanceBudget({ logger })
    budget.sample(0)

    const under = budget.sample(1000 / 60)
    expect(under.fps).toBeCloseTo(60, 4)
    expect(under.underFloor).toBe(true)
    expect(under.warned).toBe(true)
    expect(logger.warnings).toHaveLength(1)
    expect(logger.warnings[0]).toMatch(/Quest Pro/)
    expect(logger.warnings[0]).toMatch(/72/)
    expect(logger.warnings[0]).toMatch(/90/)

    const stillUnder = budget.sample(1000 / 60 + 1000 / 50)
    expect(stillUnder.warned).toBe(false)
    expect(budget.getWarnCount()).toBe(1)

    const recovered = budget.sample(1000 / 60 + 1000 / 50 + 1000 / 90)
    expect(recovered.underFloor).toBe(false)
    expect(recovered.warned).toBe(false)

    const dipped = budget.sample(1000 / 60 + 1000 / 50 + 1000 / 90 + 1000 / 71)
    expect(dipped.fps).toBeCloseTo(71, 4)
    expect(dipped.warned).toBe(true)
    expect(budget.getWarnCount()).toBe(2)
    expect(logger.warnings).toHaveLength(2)
  })

  it('ignores non-positive deltas and honors a custom floor without a logger', () => {
    const budget = new PerformanceBudget({ floorFps: 30, targetFps: 45 })
    budget.sample(100)
    const fine = budget.sample(100 + 1000 / 40)
    expect(fine.warned).toBe(false)
    expect(fine.fps).toBeCloseTo(40, 4)

    const held = budget.sample(100 + 1000 / 40)
    expect(held.warned).toBe(false)
    expect(budget.getLastFps()).toBeCloseTo(40, 4)

    const backwards = budget.sample(50)
    expect(backwards.warned).toBe(false)
    expect(budget.getLastFps()).toBeCloseTo(40, 4)

    const slow = budget.sample(50 + 1000 / 20)
    expect(slow.underFloor).toBe(true)
    expect(slow.warned).toBe(true)
    expect(budget.getWarnCount()).toBe(1)
  })
})
