import { describe, expect, it, vi } from 'vitest'
import { ChessClockPort } from '../../../../fridae-clock/src/ChessClockPort'
import { ChessHall } from '../mad-scientist/hall/ChessHall'
import type { MoveAnimator } from '../mad-scientist/hall/MoveAnimator'
import type { IGameSession } from '../mad-scientist/contracts/IGameSession'
import type { PieceSnapshot } from '../mad-scientist/contracts/types'
import { FridaeReadModel } from './FridaeReadModel'
import { HallBoardSync } from './HallBoardSync'
import { PhysicalChessClock } from './PhysicalChessClock'

const pawn = (id: string, file: number, rank: number, kind: PieceSnapshot['kind'] = 'pawn'): PieceSnapshot => ({
  id,
  kind,
  color: 'white',
  square: { file, rank },
})

describe('FridaeReadModel branches', () => {
  it('reads zeros before a sample and flags after an online timeout', () => {
    const port = new ChessClockPort('online')
    const model = new FridaeReadModel(port)
    expect(model.whiteMs).toBe(0)
    expect(model.blackMs).toBe(0)
    expect(model.active).toBe('none')
    expect(model.provisionalExpired).toBe(false)
    expect(model.confirmedFlag).toBeNull()
    expect(model.offline).toBe(true)
    expect(model.fridae()).toBeNull()
    port.arm({ whiteMs: 1_000, blackMs: 9_000, incrementMs: 0 }, 'white', 0)
    model.refresh(2_000)
    expect(model.provisionalExpired).toBe(true)
    expect(model.whiteMs).toBe(0)
    expect(model.active).toBe('white')
    expect(model.offline).toBe(false)
    port.finish('outoftime', 'black')
    model.refresh(2_000)
    expect(model.confirmedFlag).toBe('white')
    expect(model.provisionalExpired).toBe(false)
    const next = new ChessClockPort('offline')
    model.bind(next)
    expect(model.clockPort).toBe(next)
    expect(model.fridae()).toBeNull()
  })
})

describe('HallBoardSync', () => {
  it('adds, holds, slides, and removes pieces', () => {
    const hall = new ChessHall()
    let pieces = [pawn('white-pawn-5', 4, 6)]
    const session = { getPieces: () => pieces } as unknown as IGameSession
    const animating = new Set<string>()
    const animator = {
      isAnimating: (id?: string) => (id ? animating.has(id) : animating.size > 0),
      animate: vi.fn((model: { id: string }) => animating.add(model.id)),
    } as unknown as MoveAnimator
    const sync = new HallBoardSync(hall, session, animator)
    sync.reconcile()
    expect(hall.getPiece('white-pawn-5')).toBeTruthy()
    sync.hold('white-pawn-5', { file: 4, rank: 4 })
    pieces = [pawn('white-pawn-5', 4, 4)]
    sync.reconcile()
    pieces = [pawn('white-pawn-5', 4, 3)]
    animating.add('white-pawn-5')
    sync.reconcile()
    animating.delete('white-pawn-5')
    hall.getPiece('white-pawn-5')?.applyFinish('idle')
    sync.reconcile()
    expect(animator.animate).toHaveBeenCalled()
    pieces = [pawn('white-pawn-5', 4, 3, 'queen')]
    sync.reconcile()
    pieces = []
    animating.add('white-pawn-5')
    sync.reconcile()
    animating.clear()
    sync.releaseHolds()
    sync.retarget(session)
    sync.reconcile()
    expect(hall.getPiece('white-pawn-5')).toBeUndefined()
  })
})

describe('PhysicalChessClock', () => {
  it('reuses one texture when the label changes and skips a repeat', () => {
    const context = {
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: () => undefined,
      fillText: () => undefined,
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    const clock = new PhysicalChessClock()
    const face = (label: string, expiry: 'running' | 'confirmed-flag', side: 'white' | 'black') => ({
      side,
      remainingMs: 60_000,
      label,
      isActive: true,
      expiry,
    })
    const snap = (black: string, expiry: 'running' | 'confirmed-flag') => ({
      white: face('10:00', 'running', 'white'),
      black: face(black, expiry, 'black'),
      active: 'white' as const,
      provisionalExpired: false,
      confirmedFlag: expiry === 'confirmed-flag' ? ('black' as const) : null,
      offline: false,
      kind: 'realtime' as const,
    })
    clock.apply(snap('10:00', 'running'))
    clock.apply(snap('10:00', 'running'))
    clock.apply(snap('9:59', 'confirmed-flag'))
    expect(context.fillStyle).toBe('#f3efe6')
    expect(context.font).toContain('Georgia')
    expect(clock.object.getObjectByName('clock-rim')).toBeTruthy()
    expect(clock.object.children.length).toBeGreaterThan(0)
    clock.dispose()
  })
})
