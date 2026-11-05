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

  it('capture, castling, and promotion hooks do not move pieces or submit', () => {
    const { model, animator, submit, board } = stage()
    const home = model.object.position.clone()
    const square = model.getSquare()

    animator.notifyCapture({
      attackerId: model.id,
      capturedId: 'black-pawn-1',
      square: { file: 4, rank: 4 },
    })
    animator.notifyCastling({
      kingId: 'white-king',
      rookId: 'white-rook-1',
      kingFrom: { file: 4, rank: 7 },
      kingTo: { file: 6, rank: 7 },
      rookFrom: { file: 7, rank: 7 },
      rookTo: { file: 5, rank: 7 },
    })
    animator.notifyPromotion({
      pieceId: model.id,
      square,
      promoteTo: 'queen',
    })

    expect(model.kind).toBe('pawn')
    expect(model.getSquare()).toEqual(square)
    expect(model.object.position.x).toBeCloseTo(home.x)
    expect(model.object.position.y).toBeCloseTo(home.y)
    expect(model.object.position.z).toBeCloseTo(home.z)
    expect(submit).not.toHaveBeenCalled()
    expect(board.squareMesh(square)?.position.x).toBeCloseTo(board.worldPosition(square).x)
  })

  it('forwards visual events once and does not cancel an in-flight slide', () => {
    const { model, clock, board } = stage()
    const visuals = {
      onCapture: vi.fn(),
      onCastling: vi.fn(),
      onPromotion: vi.fn(),
    }
    const animator = new MoveAnimator(board, clock, visuals)
    animator.animate(model, { file: 4, rank: 4 }, 1000)
    const capture = {
      attackerId: model.id,
      capturedId: 'black-knight-1',
      square: { file: 4, rank: 4 },
    }
    animator.notifyCapture(capture)
    expect(visuals.onCapture).toHaveBeenCalledTimes(1)
    expect(visuals.onCapture).toHaveBeenCalledWith(capture)
    expect(visuals.onCastling).not.toHaveBeenCalled()
    expect(animator.isAnimating(model.id)).toBe(true)

    const castling = {
      kingId: 'white-king',
      rookId: 'white-rook-1',
      kingFrom: { file: 4, rank: 7 },
      kingTo: { file: 2, rank: 7 },
      rookFrom: { file: 0, rank: 7 },
      rookTo: { file: 3, rank: 7 },
    }
    animator.notifyCastling(castling)
    expect(visuals.onCastling).toHaveBeenCalledTimes(1)
    expect(visuals.onCastling).toHaveBeenCalledWith(castling)

    const promotion = {
      pieceId: model.id,
      square: { file: 4, rank: 4 },
      promoteTo: 'rook' as const,
    }
    animator.notifyPromotion(promotion)
    expect(visuals.onPromotion).toHaveBeenCalledTimes(1)
    expect(visuals.onPromotion).toHaveBeenCalledWith(promotion)
    expect(model.kind).toBe('pawn')
    expect(animator.isAnimating(model.id)).toBe(true)
  })
})
