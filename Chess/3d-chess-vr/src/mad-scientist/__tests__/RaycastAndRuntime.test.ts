import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { PerspectiveCamera } from 'three'

import { ChessHall } from '../hall/ChessHall'
import { HallRuntime } from '../runtime/HallRuntime'
import { ChessHallView } from '../react/ChessHallView'
import { RaycastPicker } from '../input/RaycastPicker'
import { GameSession } from '../session/GameSession'
import {
  ChessHall as ExportedHall,
  GameSession as ExportedSession,
  PointerDragInput,
  XRControllerInput,
  HandTrackingInput,
  MoveAnimator,
  PerformanceBudget,
  PieceGrab,
} from '../index'
import { whitePawn } from './helpers'

describe('RaycastPicker', () => {
  it('hits a piece, a square, the clock, and empty space', () => {
    const hall = new ChessHall({ pieces: [whitePawn({ square: { file: 0, rank: 0 } })] })
    const square = { file: 0, rank: 0 }
    const pos = hall.board.worldPosition(square)
    const camera = new PerspectiveCamera(45, 1, 0.01, 10)
    camera.position.set(pos.x, pos.y + 0.5, pos.z)
    camera.lookAt(pos.x, pos.y, pos.z)
    camera.updateMatrixWorld(true)

    const picker = new RaycastPicker(camera, hall, { width: 100, height: 100 })
    picker.setViewport({ width: 100, height: 100 })
    const pieceHit = picker.pick(50, 50)
    expect(pieceHit.piece?.id).toBe('white-pawn-1')
    expect(pieceHit.square).toEqual(square)
    expect(pieceHit.world).not.toBeNull()

    const emptyHall = new ChessHall()
    const a1 = emptyHall.board.worldPosition({ file: 3, rank: 3 })
    camera.position.set(a1.x, a1.y + 0.5, a1.z)
    camera.lookAt(a1.x, a1.y, a1.z)
    camera.updateMatrixWorld(true)
    const squares = new RaycastPicker(camera, emptyHall, { width: 80, height: 80 })
    const squareHit = squares.pick(40, 40)
    expect(squareHit.piece).toBeNull()
    expect(squareHit.square).toEqual({ file: 3, rank: 3 })
    expect(squareHit.clock).toBe(false)

    const clock = emptyHall.clockTap.object.position
    camera.position.set(clock.x, clock.y + 0.4, clock.z)
    camera.lookAt(clock.x, clock.y, clock.z)
    camera.updateMatrixWorld(true)
    const clockHit = squares.pick(40, 40)
    expect(clockHit.clock).toBe(true)
    expect(clockHit.piece).toBeNull()

    camera.position.set(0, 1.2, 0)
    camera.lookAt(0, 4, 0)
    camera.updateMatrixWorld(true)
    const miss = squares.pick(40, 40)
    expect(miss.square).toBeNull()
    expect(miss.piece).toBeNull()
    expect(miss.clock).toBe(false)
    expect(miss.world).toBeNull()
  })
})

describe('HallRuntime', () => {
  it('submits one pointer move, samples the frame budget, and detaches on dispose', () => {
    const piece = whitePawn()
    const session = new GameSession({
      pieces: [piece],
      legalDestinations: { [piece.id]: [{ file: 4, rank: 4 }] },
    })
    const picker = {
      pick: vi.fn(),
    }
    const logger = { warn: vi.fn() }
    const runtime = new HallRuntime({ session, picker, logger })
    expect(runtime.hall.getPiece(piece.id)).toBeTruthy()

    runtime.pointer.attach()
    picker.pick.mockReturnValue({
      square: piece.square,
      piece,
      clock: false,
      world: { x: 0, y: 1, z: 0 },
    })
    runtime.pointer.handle({ type: 'down', x: 0, y: 0, pointerId: 1 })
    picker.pick.mockReturnValue({
      square: { file: 4, rank: 4 },
      piece: null,
      clock: false,
      world: { x: 0, y: 1, z: -0.05 },
    })
    runtime.pointer.handle({ type: 'up', x: 1, y: 1, pointerId: 1 })
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 4 })

    const baseline = runtime.frame(0)
    expect(baseline.underFloor).toBe(false)
    const slow = runtime.frame(1000 / 50)
    expect(slow.warned).toBe(true)
    expect(logger.warn).toHaveBeenCalled()

    runtime.dispose()
    expect(runtime.hall.root.children).toHaveLength(0)
    runtime.pointer.handle({ type: 'down', x: 0, y: 0, pointerId: 1 })
    expect(runtime.pointer.isGrabbing()).toBe(false)
  })
})

describe('ChessHallView', () => {
  it('mounts the hall root and nothing else', () => {
    const hall = new ChessHall()
    const element = ChessHallView({ hall })
    expect(element).toEqual(createElement('primitive', { object: hall.root }))
  })
})

describe('lane exports', () => {
  it('re-exports the classes Ultron will rebase against', () => {
    expect(ExportedHall).toBeTypeOf('function')
    expect(ExportedSession).toBeTypeOf('function')
    expect(PointerDragInput).toBeTypeOf('function')
    expect(XRControllerInput).toBeTypeOf('function')
    expect(HandTrackingInput).toBeTypeOf('function')
    expect(MoveAnimator).toBeTypeOf('function')
    expect(PerformanceBudget).toBeTypeOf('function')
    expect(PieceGrab).toBeTypeOf('function')
  })
})
