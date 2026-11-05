import { describe, expect, it } from 'vitest'

import type { IInputController } from '../contracts/IInputController'
import { ClockTapTarget } from '../hall/ClockTapTarget'
import { rig } from './helpers'

describe('XRControllerInput', () => {
  it('select and release submit a single intent', () => {
    const { xr, piece, submit, cancel, session, animator, boardMutator } = rig({
      source: 'xr-controller',
    })
    const controller: IInputController = xr
    expect(controller.kind).toBe('xr-controller')
    xr.attach()

    xr.handle({
      type: 'selectstart',
      hand: 'right',
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    xr.handle({
      type: 'selectstart',
      hand: 'left',
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    xr.handle({
      type: 'selectend',
      hand: 'left',
      square: { file: 0, rank: 0 },
      piece: null,
      clock: false,
      world: null,
    })
    expect(submit).not.toHaveBeenCalled()

    xr.handle({
      type: 'selectend',
      hand: 'right',
      square: { file: 4, rank: 4 },
      piece: null,
      clock: false,
      world: { x: 0, y: 0.8, z: -0.05 },
    })
    xr.handle({
      type: 'selectend',
      hand: 'right',
      square: { file: 4, rank: 4 },
      piece: null,
      clock: false,
      world: null,
    })

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toMatchObject({
      from: { file: 4, rank: 6 },
      to: { file: 4, rank: 4 },
      source: 'xr-controller',
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(boardMutator.applyMove).not.toHaveBeenCalled()
    expect(boardMutator.commitMove).not.toHaveBeenCalled()
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 4 })
    animator.update(10_000)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('does nothing on selectend without a grab and rejects an illegal square', () => {
    const idle = rig({ source: 'xr-controller' })
    idle.xr.attach()
    idle.xr.handle({
      type: 'selectend',
      hand: 'left',
      square: { file: 4, rank: 4 },
      piece: null,
      clock: false,
      world: null,
    })
    expect(idle.submit).not.toHaveBeenCalled()

    const { xr, piece, submit, cancel, session, model, board } = rig({ source: 'xr-controller' })
    xr.attach()
    xr.handle({
      type: 'selectstart',
      hand: 'left',
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    xr.handle({
      type: 'selectend',
      hand: 'left',
      square: { file: 7, rank: 7 },
      piece: null,
      clock: false,
      world: null,
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.results[0].value).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(session.getPieces()[0].square).toEqual(piece.square)
    const home = board.worldPosition(piece.square)
    expect(model.object.position.y).toBeCloseTo(home.y)
  })

  it('cancels on tracking loss for the selecting hand only', () => {
    const { xr, piece, submit, cancel } = rig({ source: 'xr-controller' })
    xr.attach()
    xr.handle({
      type: 'selectstart',
      hand: 'left',
      square: piece.square,
      piece,
      clock: false,
      world: null,
    })
    xr.handle({
      type: 'trackinglost',
      hand: 'right',
      square: null,
      piece: null,
      clock: false,
      world: null,
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(xr.isGrabbing()).toBe(true)

    xr.handle({
      type: 'trackinglost',
      hand: 'left',
      square: null,
      piece: null,
      clock: false,
      world: null,
    })
    expect(submit).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledWith('tracking-loss')
    expect(xr.isGrabbing()).toBe(false)
  })

  it('taps the clock, ignores a press on empty space, and detaches safely', () => {
    const clock = new ClockTapTarget({ x: 0.4, y: 0.8, z: 0 })
    let taps = 0
    clock.setOnTap(() => {
      taps += 1
    })
    const { xr, submit, piece } = rig({ source: 'xr-controller', clockTap: clock })
    xr.handle({
      type: 'selectstart',
      hand: 'right',
      square: piece.square,
      piece,
      clock: false,
      world: null,
    })
    expect(xr.isGrabbing()).toBe(false)

    xr.attach()
    xr.handle({
      type: 'selectstart',
      hand: 'right',
      square: null,
      piece: null,
      clock: true,
      world: null,
    })
    expect(taps).toBe(1)
    expect(submit).not.toHaveBeenCalled()

    xr.handle({
      type: 'selectstart',
      hand: 'right',
      square: null,
      piece: null,
      clock: false,
      world: null,
    })
    expect(xr.isGrabbing()).toBe(false)

    xr.handle({
      type: 'selectstart',
      hand: 'right',
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0.1, y: 1, z: 0 },
    })
    xr.handle({
      type: 'selectstart',
      hand: 'right',
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0.2, y: 1, z: 0.1 },
    })
    xr.detach()
    expect(xr.isGrabbing()).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })
})
