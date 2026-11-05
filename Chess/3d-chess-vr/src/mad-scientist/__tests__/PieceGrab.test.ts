import { describe, expect, it, vi } from 'vitest'

import type { MoveIntent } from '../contracts/types'
import { ClockTapTarget } from '../hall/ClockTapTarget'
import { IntentIdSequence } from '../input/IntentIdSequence'
import { PieceGrab } from '../input/PieceGrab'
import { rig, whitePawn } from './helpers'

describe('IntentIdSequence', () => {
  it('issues increasing ids', () => {
    const ids = new IntentIdSequence()
    expect(ids.next()).toBe('ms-intent-1')
    expect(ids.next()).toBe('ms-intent-2')
  })
})

describe('PieceGrab', () => {
  it('submits one accepted intent and lets the animator move the mesh', () => {
    const { grab, model, board, submit, cancel, animator, session, piece, boardMutator } = rig()
    expect(grab.begin(piece)).toBe(true)
    expect(grab.begin(piece)).toBe(false)
    expect(board.isHighlighted({ file: 4, rank: 4 })).toBe(true)

    grab.preview({ x: 0.2, y: 1, z: 0 })
    expect(model.object.position.x).toBeCloseTo(0.2)
    expect(model.getSquare()).toEqual(piece.square)

    expect(grab.release({ file: 4, rank: 4 })).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toMatchObject({
      intentId: 'ms-intent-1',
      pieceId: piece.id,
      from: { file: 4, rank: 6 },
      to: { file: 4, rank: 4 },
      source: 'pointer',
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(boardMutator.applyMove).not.toHaveBeenCalled()
    expect(boardMutator.setBoard).not.toHaveBeenCalled()
    expect(boardMutator.commitMove).not.toHaveBeenCalled()
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 4 })
    expect(animator.isAnimating(piece.id)).toBe(true)
    expect(board.isHighlighted({ file: 4, rank: 4 })).toBe(false)
    expect(grab.isGrabbing()).toBe(false)

    animator.update(10_000)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('rejects an illegal square through GameSession and restores the mesh', () => {
    const { grab, model, board, submit, cancel, piece, session } = rig()
    const home = board.worldPosition(piece.square)
    grab.begin(piece)
    grab.preview({ x: 1, y: 1, z: 1 })
    expect(grab.release({ file: 4, rank: 5 })).toBe(false)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.results[0].value).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(session.getPieces()[0].square).toEqual(piece.square)
    expect(model.getSquare()).toEqual(piece.square)
    expect(model.object.position.x).toBeCloseTo(home.x)
    expect(model.object.position.y).toBeCloseTo(home.y)
    expect(model.object.position.z).toBeCloseTo(home.z)
    expect(model.currentMaterial().transparent).toBe(false)
  })

  it('cancels an origin drop, a null target, and an off-board target without submitting', () => {
    const cases: Array<{ file: number; rank: number } | null> = [
      { file: 4, rank: 6 },
      null,
      { file: 8, rank: 0 },
    ]
    for (const target of cases) {
      const { grab, submit, cancel, piece } = rig()
      grab.begin(piece)
      expect(grab.release(target)).toBe(false)
      expect(submit).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith('released-origin')
    }
  })

  it('does not file a second intent when release re-enters, and ignores cancel after submit', () => {
    const { grab, submit, cancel, piece } = rig()
    submit.mockImplementation((move: MoveIntent) => {
      grab.release({ file: 0, rank: 0 })
      grab.cancel('pointer-cancel')
      return GameSessionResult(move)
    })

    function GameSessionResult(move: MoveIntent): boolean {
      return move.to.file === 4 && move.to.rank === 4
    }

    grab.begin(piece)
    expect(grab.release({ file: 4, rank: 4 })).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels a grab, ignores empty gestures, and taps the clock', () => {
    const clock = new ClockTapTarget({ x: 0.4, y: 0.8, z: 0 })
    let taps = 0
    clock.setOnTap(() => {
      taps += 1
    })
    const { grab, submit, cancel, piece, model, board } = rig({ clockTap: clock })
    expect(grab.begin(whitePawn({ square: { file: -1, rank: 0 } }))).toBe(false)
    grab.preview({ x: 0, y: 0, z: 0 })
    expect(grab.release({ file: 4, rank: 4 })).toBe(false)
    expect(grab.cancel('pointer-cancel')).toBeUndefined()
    expect(cancel).not.toHaveBeenCalled()

    grab.begin(piece)
    grab.cancel('tracking-loss')
    expect(cancel).toHaveBeenCalledWith('tracking-loss')
    expect(submit).not.toHaveBeenCalled()
    expect(grab.isGrabbing()).toBe(false)
    const home = board.worldPosition(piece.square)
    expect(model.object.position.x).toBeCloseTo(home.x)
    expect(model.object.position.y).toBeCloseTo(home.y)

    grab.tapClock()
    expect(taps).toBe(1)
    expect(submit).not.toHaveBeenCalled()

    const quiet = rig()
    expect(() => quiet.grab.tapClock()).not.toThrow()
  })

  it('uses an injected id source and the active device', () => {
    const ids = { next: vi.fn(() => 'custom-1') }
    const { grab, piece, submit } = rig({ source: 'hand' })
    grab.setSource('xr-controller')
    const custom = rig()
    const grabbed = new PieceGrab({
      session: custom.session,
      pieces: { get: () => custom.model },
      animator: custom.animator,
      board: custom.board,
      source: 'hand',
      ids,
    })
    grabbed.begin(piece)
    grabbed.release({ file: 4, rank: 4 })
    expect(ids.next).toHaveBeenCalledTimes(1)
    expect(custom.submit.mock.calls[0][0].intentId).toBe('custom-1')
    expect(custom.submit.mock.calls[0][0].source).toBe('hand')

    grab.begin(piece)
    grab.release({ file: 4, rank: 4 })
    expect(submit.mock.calls[0][0].source).toBe('xr-controller')
  })

  it('still accepts the intent when the mesh is missing', () => {
    const { session, animator, board, piece } = rig()
    const grab = new PieceGrab({
      session,
      pieces: { get: () => undefined },
      animator,
      board,
      source: 'pointer',
    })
    expect(grab.begin(piece)).toBe(true)
    expect(grab.preview({ x: 0, y: 1, z: 0 })).toBeUndefined()
    expect(grab.release({ file: 4, rank: 4 })).toBe(true)
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 4 })
    grab.begin(whitePawn({ id: 'other', square: { file: 0, rank: 0 } }))
    grab.cancel('detached')
  })
})
