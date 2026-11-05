import { describe, expect, it, vi } from 'vitest'

import { BoardModel } from '../hall/BoardModel'
import { MOVE_ARC_LIFT_M } from '../hall/metrics'
import { MoveAnimator } from '../hall/MoveAnimator'
import { PieceMaterialSet } from '../hall/PieceMaterialSet'
import { PieceModel } from '../hall/PieceModel'
import { GameSession } from '../session/GameSession'
import { manualClock, whitePawn } from './helpers'

function stage() {
  const board = new BoardModel()
  const model = new PieceModel(whitePawn(), new PieceMaterialSet(), board)
  const clock = manualClock(0)
  const animator = new MoveAnimator(board, clock)
  const session = new GameSession({
    pieces: [whitePawn()],
    legalDestinations: { 'white-pawn-1': [{ file: 4, rank: 4 }] },
  })
  const submit = vi.spyOn(session, 'submitMoveIntent')
  return { board, model, clock, animator, submit }
}

describe('MoveAnimator', () => {
  it('plays a legal path and lands exactly on the destination once', () => {
    const { model, clock, animator, submit, board } = stage()
    const from = model.object.position.clone()
    let completed = 0
    animator.animate(model, { file: 4, rank: 4 }, 1000, () => {
      completed += 1
    })

    clock.t = 500
    animator.update()
    expect(animator.isAnimating(model.id)).toBe(true)
    expect(animator.isAnimating()).toBe(true)
    expect(model.object.userData.msAnimating).toBe(true)
    expect(model.object.position.y).toBeGreaterThan(from.y + MOVE_ARC_LIFT_M * 0.5)
    expect(model.object.position.z).toBeLessThan(from.z)
    expect(model.getSquare()).toEqual({ file: 4, rank: 6 })

    clock.t = 1000
    animator.update()
    const dest = board.worldPosition({ file: 4, rank: 4 })
    expect(animator.isAnimating()).toBe(false)
    expect(model.object.userData.msAnimating).toBe(false)
    expect(model.object.position.x).toBeCloseTo(dest.x)
    expect(model.object.position.y).toBeCloseTo(dest.y)
    expect(model.object.position.z).toBeCloseTo(dest.z)
    expect(model.getSquare()).toEqual({ file: 4, rank: 4 })
    expect(completed).toBe(1)

    clock.t = 5000
    animator.update()
    expect(completed).toBe(1)
    expect(submit).not.toHaveBeenCalled()
  })

  it('cancel mid-move leaves no stuck piece', () => {
    const { model, clock, animator } = stage()
    const from = model.object.position.clone()
    let completed = 0
    animator.animate(model, { file: 4, rank: 4 }, 1000, () => {
      completed += 1
    })
    clock.t = 400
    animator.update()
    expect(model.object.position.y).toBeGreaterThan(from.y)

    animator.cancel(model.id)
    expect(animator.isAnimating(model.id)).toBe(false)
    expect(model.object.userData.msAnimating).toBe(false)
    expect(model.object.position.x).toBeCloseTo(from.x)
    expect(model.object.position.y).toBeCloseTo(from.y)
    expect(model.object.position.z).toBeCloseTo(from.z)
    expect(model.getSquare()).toEqual({ file: 4, rank: 6 })

    clock.t = 99999
    animator.update()
    expect(model.object.position.y).toBeCloseTo(from.y)
    expect(completed).toBe(0)
    expect(model.object.parent).toBeNull()
  })

  it('supersedes an in-flight move, completes a zero-length move, and ignores unknown cancels', () => {
    const { model, clock, animator } = stage()
    let first = 0
    let second = 0
    animator.animate(model, { file: 4, rank: 5 }, 1000, () => {
      first += 1
    })
    animator.animate(model, { file: 4, rank: 4 }, 1000, () => {
      second += 1
    })
    clock.t = 1000
    animator.update()
    expect(first).toBe(0)
    expect(second).toBe(1)
    expect(model.getSquare()).toEqual({ file: 4, rank: 4 })

    let done = false
    animator.animate(model, { file: 0, rank: 0 }, 0, () => {
      done = true
    })
    animator.update(5)
    expect(done).toBe(true)
    expect(animator.isAnimating()).toBe(false)

    animator.cancel('missing')
    animator.cancel()
    expect(animator.isAnimating()).toBe(false)
  })
})
