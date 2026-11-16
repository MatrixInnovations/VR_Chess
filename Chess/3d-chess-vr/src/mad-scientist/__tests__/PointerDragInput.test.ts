import { describe, expect, it } from 'vitest'

import type { IInputController } from '../contracts/IInputController'
import { ClockTapTarget } from '../hall/ClockTapTarget'
import type { BoardPick } from '../input/picking'
import { rig, whitePawn } from './helpers'

const empty: BoardPick = { square: null, piece: null, clock: false, world: null }

describe('PointerDragInput', () => {
  it('starts a drag and submits exactly one intent on drop', () => {
    const { pointer, picker, piece, submit, cancel, model, board, animator, boardMutator, session } =
      rig()
    const controller: IInputController = pointer
    expect(controller.kind).toBe('pointer')
    pointer.attach()

    picker.pick.mockReturnValue({
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 0.9, z: 0.1 },
    })
    pointer.handle({ type: 'down', x: 10, y: 10, pointerId: 1 })
    expect(pointer.isGrabbing()).toBe(true)
    expect(submit).not.toHaveBeenCalled()
    expect(board.isHighlighted({ file: 4, rank: 4 })).toBe(true)

    picker.pick.mockReturnValue({
      square: piece.square,
      piece: null,
      clock: false,
      world: { x: 0.15, y: 0.9, z: 0 },
    })
    pointer.handle({ type: 'move', x: 20, y: 20, pointerId: 1 })
    expect(model.object.position.x).toBeCloseTo(0.15)
    expect(session.getPieces()[0].square).toEqual(piece.square)

    picker.pick.mockReturnValue({
      square: { file: 4, rank: 4 },
      piece: null,
      clock: false,
      world: { x: 0, y: 0.8, z: -0.1 },
    })
    pointer.handle({ type: 'up', x: 30, y: 40, pointerId: 1 })
    pointer.handle({ type: 'up', x: 30, y: 40, pointerId: 1 })

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.results[0].value).toBe(true)
    expect(submit.mock.calls[0][0]).toMatchObject({
      pieceId: piece.id,
      from: { file: 4, rank: 6 },
      to: { file: 4, rank: 4 },
      source: 'pointer',
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(boardMutator.applyMove).not.toHaveBeenCalled()
    expect(boardMutator.setBoard).not.toHaveBeenCalled()
    expect(boardMutator.commitMove).not.toHaveBeenCalled()
    expect(typeof (board as { applyMove?: unknown }).applyMove).toBe('undefined')
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 4 })

    animator.update(10_000)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(pointer.isGrabbing()).toBe(false)
  })

  it('rejects an illegal square through the GameSession spy and restores the piece', () => {
    const { pointer, picker, piece, submit, cancel, model, board, session, boardMutator } = rig()
    pointer.attach()
    const home = board.worldPosition(piece.square)
    picker.pick.mockReturnValue({
      square: piece.square,
      piece,
      clock: false,
      world: home,
    })
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    picker.pick.mockReturnValue({
      square: { file: 4, rank: 5 },
      piece: null,
      clock: false,
      world: { x: 1, y: 1, z: 1 },
    })
    pointer.handle({ type: 'up', x: 2, y: 2, pointerId: 1 })

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.results[0].value).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(boardMutator.applyMove).not.toHaveBeenCalled()
    expect(session.getPieces()[0].square).toEqual(piece.square)
    expect(model.getSquare()).toEqual(piece.square)
    expect(model.object.position.x).toBeCloseTo(home.x)
    expect(model.object.position.y).toBeCloseTo(home.y)
    expect(model.object.position.z).toBeCloseTo(home.z)
  })

  it('cancels on pointercancel without submitting', () => {
    const { pointer, picker, piece, submit, cancel, model, board } = rig()
    pointer.attach()
    picker.pick.mockReturnValue({
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 4 })
    pointer.handle({ type: 'move', x: 2, y: 2, pointerId: 9 })
    pointer.handle({ type: 'cancel', x: 2, y: 2, pointerId: 4 })

    expect(submit).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith('pointer-cancel')
    expect(pointer.isGrabbing()).toBe(false)
    const home = board.worldPosition(piece.square)
    expect(model.object.position.x).toBeCloseTo(home.x)
    expect(model.object.position.y).toBeCloseTo(home.y)
  })

  it('drops on the origin square or off the board without submitting', () => {
    const origin = rig()
    origin.pointer.attach()
    origin.picker.pick.mockReturnValue({
      square: origin.piece.square,
      piece: origin.piece,
      clock: false,
      world: null,
    })
    origin.pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    origin.picker.pick.mockReturnValue({
      square: origin.piece.square,
      piece: null,
      clock: false,
      world: null,
    })
    origin.pointer.handle({ type: 'up', x: 1, y: 1, pointerId: 1 })
    expect(origin.submit).not.toHaveBeenCalled()
    expect(origin.cancel).toHaveBeenCalledWith('released-origin')

    const off = rig()
    off.pointer.attach()
    off.picker.pick.mockReturnValue({
      square: off.piece.square,
      piece: off.piece,
      clock: false,
      world: null,
    })
    off.pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    off.picker.pick.mockReturnValue({ ...empty, square: { file: 9, rank: 0 } })
    off.pointer.handle({ type: 'up', x: 1, y: 1, pointerId: 1 })
    expect(off.submit).not.toHaveBeenCalled()
    expect(off.cancel).toHaveBeenCalledWith('released-origin')
  })

  it('taps the clock without submitting a move', () => {
    const clock = new ClockTapTarget({ x: 0.42, y: 0.8, z: 0 })
    let taps = 0
    clock.setOnTap(() => {
      taps += 1
    })
    const { pointer, picker, submit } = rig({ clockTap: clock })
    pointer.attach()
    picker.pick.mockReturnValue({ square: null, piece: null, clock: true, world: null })
    pointer.handle({ type: 'down', x: 4, y: 4, pointerId: 1 })
    expect(taps).toBe(1)
    expect(submit).not.toHaveBeenCalled()
    expect(pointer.isGrabbing()).toBe(false)
  })

  it('ignores events until attach, after detach, and from a second pointer', () => {
    const { pointer, picker, piece, submit, cancel } = rig()
    picker.pick.mockReturnValue({
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    expect(pointer.isGrabbing()).toBe(false)

    pointer.attach()
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 2 })
    pointer.handle({ type: 'up', x: 1, y: 1, pointerId: 2 })
    expect(submit).not.toHaveBeenCalled()
    expect(pointer.isGrabbing()).toBe(true)

    picker.pick.mockReturnValue({
      square: { file: 4, rank: 4 },
      piece: null,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    pointer.handle({ type: 'up', x: 8, y: 8, pointerId: 1 })
    expect(submit).toHaveBeenCalledTimes(1)

    picker.pick.mockReturnValue({
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    pointer.detach()
    expect(cancel).toHaveBeenCalledWith('detached')
    expect(pointer.isGrabbing()).toBe(false)
    submit.mockClear()
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    expect(pointer.isGrabbing()).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })

  it('does nothing when the press misses every piece', () => {
    const { pointer, picker, submit } = rig()
    pointer.attach()
    picker.pick.mockReturnValue(empty)
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    pointer.handle({ type: 'up', x: 1, y: 1, pointerId: 1 })
    expect(pointer.isGrabbing()).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })

  it('cancel() on the controller drops the grab', () => {
    const { pointer, picker, piece, submit, cancel } = rig()
    pointer.attach()
    picker.pick.mockReturnValue({
      square: piece.square,
      piece: whitePawn(),
      clock: false,
      world: null,
    })
    pointer.handle({ type: 'down', x: 1, y: 1, pointerId: 1 })
    pointer.cancel('detached')
    expect(cancel).toHaveBeenCalledWith('detached')
    expect(submit).not.toHaveBeenCalled()
    expect(pointer.isGrabbing()).toBe(false)
  })
})
