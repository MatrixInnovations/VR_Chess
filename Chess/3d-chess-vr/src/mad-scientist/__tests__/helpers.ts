import { vi } from 'vitest'

import type { MoveSource, PieceSnapshot, Square } from '../contracts/types'
import { BoardModel } from '../hall/BoardModel'
import { ClockTapTarget } from '../hall/ClockTapTarget'
import { MoveAnimator } from '../hall/MoveAnimator'
import { PieceMaterialSet } from '../hall/PieceMaterialSet'
import { PieceModel } from '../hall/PieceModel'
import { HandTrackingInput } from '../input/HandTrackingInput'
import { PieceGrab } from '../input/PieceGrab'
import type { IPointerPicker } from '../input/picking'
import { PointerDragInput } from '../input/PointerDragInput'
import { XRControllerInput } from '../input/XRControllerInput'
import { GameSession } from '../session/GameSession'

/** A white pawn on e2 using the repo's file/rank indexes (file 4, rank 6). */
export function whitePawn(overrides: Partial<PieceSnapshot> = {}): PieceSnapshot {
  return {
    id: 'white-pawn-1',
    kind: 'pawn',
    color: 'white',
    square: { file: 4, rank: 6 },
    ...overrides,
  }
}

export interface ManualClock {
  t: number
  now(): number
}

export function manualClock(t = 0): ManualClock {
  return {
    t,
    now() {
      return this.t
    },
  }
}

/**
 * Wires the lane the way a scene would: one session, one grab, three device adapters.
 * `boardMutator` is intentionally not passed to any class. Spies assert it stays idle.
 */
export function rig(options?: {
  piece?: PieceSnapshot
  legal?: Square[]
  source?: MoveSource
  clockTap?: ClockTapTarget | null
}) {
  const piece = options?.piece ?? whitePawn()
  const legal = options?.legal ?? [{ file: 4, rank: 4 }]
  const session = new GameSession({
    pieces: [piece],
    legalDestinations: { [piece.id]: legal },
  })
  const submit = vi.spyOn(session, 'submitMoveIntent')
  const cancel = vi.spyOn(session, 'cancelPendingMove')
  const board = new BoardModel()
  const materials = new PieceMaterialSet()
  const model = new PieceModel(piece, materials, board)
  const clock = manualClock(0)
  const animator = new MoveAnimator(board, clock)
  const boardMutator = {
    applyMove: vi.fn(),
    setBoard: vi.fn(),
    commitMove: vi.fn(),
  }
  const grab = new PieceGrab({
    session,
    pieces: { get: (id: string) => (id === model.id ? model : undefined) },
    animator,
    board,
    source: options?.source ?? 'pointer',
    clockTap: options?.clockTap,
  })
  const picker = { pick: vi.fn() } as IPointerPicker & {
    pick: ReturnType<typeof vi.fn>
  }
  const pointer = new PointerDragInput(grab, picker)
  const xr = new XRControllerInput(grab)
  const hands = new HandTrackingInput(grab)
  return {
    piece,
    legal,
    session,
    submit,
    cancel,
    board,
    materials,
    model,
    clock,
    animator,
    grab,
    picker,
    pointer,
    xr,
    hands,
    boardMutator,
  }
}
