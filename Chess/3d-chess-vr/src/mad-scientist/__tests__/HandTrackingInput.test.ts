import { describe, expect, it } from 'vitest'

import type { IInputController } from '../contracts/IInputController'
import type { Vec3 } from '../contracts/types'
import { ClockTapTarget } from '../hall/ClockTapTarget'
import { PINCH_ENGAGE_M, PINCH_RELEASE_M } from '../hall/metrics'
import type { HandJointSample } from '../input/HandTrackingInput'
import { rig } from './helpers'

function sample(
  distance: number,
  extra: Partial<HandJointSample> = {},
): HandJointSample {
  const thumbTip: Vec3 = { x: 0, y: 1, z: 0 }
  const indexTip: Vec3 = { x: 0, y: 1, z: distance }
  return {
    tracked: true,
    thumbTip,
    indexTip,
    square: null,
    piece: null,
    clock: false,
    world: null,
    ...extra,
  }
}

describe('HandTrackingInput', () => {
  it('pinches to grab and places with a single intent', () => {
    const { hands, piece, submit, cancel, session, model, animator, boardMutator } = rig({
      source: 'hand',
    })
    const controller: IInputController = hands
    expect(controller.kind).toBe('hand')
    hands.attach()

    hands.handle(
      sample(PINCH_ENGAGE_M - 0.005, {
        piece,
        square: piece.square,
        world: { x: 0, y: 1, z: 0.05 },
      }),
    )
    expect(hands.isGrabbing()).toBe(true)
    expect(submit).not.toHaveBeenCalled()

    const between = (PINCH_ENGAGE_M + PINCH_RELEASE_M) / 2
    hands.handle(
      sample(between, {
        square: { file: 4, rank: 4 },
        world: { x: 0.05, y: 1, z: -0.02 },
      }),
    )
    expect(hands.isGrabbing()).toBe(true)
    expect(model.object.position.x).toBeCloseTo(0.05)
    expect(submit).not.toHaveBeenCalled()

    hands.handle(
      sample(PINCH_RELEASE_M + 0.01, {
        square: { file: 4, rank: 4 },
        world: { x: 0.05, y: 1, z: -0.02 },
      }),
    )

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toMatchObject({
      pieceId: piece.id,
      from: { file: 4, rank: 6 },
      to: { file: 4, rank: 4 },
      source: 'hand',
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(boardMutator.applyMove).not.toHaveBeenCalled()
    expect(boardMutator.setBoard).not.toHaveBeenCalled()
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 4 })
    animator.update(10_000)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(hands.isGrabbing()).toBe(false)
  })

  it('cancels the grab when tracking is lost and does not submit', () => {
    const { hands, piece, submit, cancel, model, board } = rig({ source: 'hand' })
    hands.attach()
    hands.handle(sample(0.01, { piece, square: piece.square, world: { x: 0.2, y: 1, z: 0 } }))
    hands.handle({
      tracked: false,
      thumbTip: null,
      indexTip: null,
      square: null,
      piece: null,
      clock: false,
      world: null,
    })

    expect(submit).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith('tracking-loss')
    expect(hands.isGrabbing()).toBe(false)
    const home = board.worldPosition(piece.square)
    expect(model.object.position.x).toBeCloseTo(home.x)
    expect(model.object.position.y).toBeCloseTo(home.y)
    expect(model.object.position.z).toBeCloseTo(home.z)
  })

  it('does not start a pinch between the engage and release distances', () => {
    const { hands, piece, submit } = rig({ source: 'hand' })
    hands.attach()
    const between = (PINCH_ENGAGE_M + PINCH_RELEASE_M) / 2
    hands.handle(sample(between, { piece, square: piece.square }))
    expect(hands.isGrabbing()).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })

  it('ignores an untracked idle hand and a lost clock pinch', () => {
    const clock = new ClockTapTarget({ x: 0.4, y: 0.8, z: 0 })
    let taps = 0
    clock.setOnTap(() => {
      taps += 1
    })
    const { hands, submit, cancel } = rig({ source: 'hand', clockTap: clock })
    hands.attach()
    hands.handle({
      tracked: false,
      thumbTip: null,
      indexTip: null,
      square: null,
      piece: null,
      clock: false,
      world: null,
    })
    expect(cancel).not.toHaveBeenCalled()

    hands.handle(sample(0.01, { clock: true }))
    expect(taps).toBe(1)
    expect(hands.isGrabbing()).toBe(false)
    hands.handle({
      tracked: false,
      thumbTip: { x: 0, y: 0, z: 0 },
      indexTip: null,
      square: null,
      piece: null,
      clock: false,
      world: null,
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()

    hands.handle(sample(PINCH_RELEASE_M + 0.02))
    expect(submit).not.toHaveBeenCalled()
  })

  it('rejects an illegal placement and ignores input while detached', () => {
    const { hands, piece, submit, cancel, session, model, board } = rig({ source: 'hand' })
    hands.handle(sample(0.01, { piece, square: piece.square }))
    expect(hands.isGrabbing()).toBe(false)

    hands.attach()
    hands.handle(sample(0.01, { piece, square: piece.square, world: { x: 0.3, y: 1, z: 0 } }))
    hands.handle(
      sample(PINCH_RELEASE_M + 0.01, {
        square: { file: 0, rank: 0 },
      }),
    )
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.results[0].value).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(session.getPieces()[0].square).toEqual(piece.square)
    const home = board.worldPosition(piece.square)
    expect(model.object.position.x).toBeCloseTo(home.x)

    hands.detach()
    hands.handle(sample(0.01, { piece, square: piece.square }))
    expect(hands.isGrabbing()).toBe(false)
  })

  it('opens over empty space without grabbing and cancels through the controller', () => {
    const { hands, piece, submit, cancel } = rig({ source: 'hand' })
    hands.attach()
    hands.handle(sample(0.05, { square: { file: 4, rank: 4 } }))
    expect(submit).not.toHaveBeenCalled()

    hands.handle(sample(0.01, { piece, square: piece.square }))
    hands.cancel('detached')
    expect(cancel).toHaveBeenCalledWith('detached')
    expect(submit).not.toHaveBeenCalled()
    expect(hands.isGrabbing()).toBe(false)
  })
})
