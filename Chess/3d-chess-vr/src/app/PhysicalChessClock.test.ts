import { afterEach, describe, expect, it, vi } from 'vitest'

import type { IClockFaceSnapshot, IClockSideFace } from '../mad-scientist/hall/ClockViewMirror'
import { PhysicalChessClock } from './PhysicalChessClock'

interface Draw {
  style: string
  kind: 'rect' | 'text'
  text?: string
  y?: number
  height?: number
}

function recordingContext(): { context: CanvasRenderingContext2D; draws: Draw[] } {
  const draws: Draw[] = []
  let fillStyle = ''
  const context = {
    font: '',
    textAlign: '',
    textBaseline: '',
    strokeStyle: '',
    lineWidth: 1,
    set fillStyle(value: string) {
      fillStyle = value
    },
    get fillStyle() {
      return fillStyle
    },
    fillRect(x: number, y: number, width: number, height: number) {
      draws.push({ style: fillStyle, kind: 'rect', y, height, text: `${x},${width}` })
    },
    fillText(text: string) {
      draws.push({ style: fillStyle, kind: 'text', text })
    },
    strokeRect() {
      draws.push({ style: String((context as { strokeStyle: string }).strokeStyle), kind: 'rect', text: 'rim' })
    },
  }
  return { context: context as unknown as CanvasRenderingContext2D, draws }
}

function face(overrides: Partial<IClockSideFace> = {}): IClockSideFace {
  return {
    side: 'white',
    remainingMs: 60_000,
    label: '1:00',
    isActive: true,
    expiry: 'running',
    ...overrides,
  }
}

function snap(white: IClockSideFace, black: IClockSideFace = face({ side: 'black', isActive: false })): IClockFaceSnapshot {
  return {
    white,
    black,
    active: white.isActive ? 'white' : 'black',
    provisionalExpired: false,
    confirmedFlag: null,
    offline: false,
    kind: 'realtime',
  }
}

describe('PhysicalChessClock low time', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks 30 seconds and zero as low, and never the inactive side', () => {
    const { context, draws } = recordingContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const clock = new PhysicalChessClock()

    clock.apply(snap(face({ remainingMs: 30_000, label: '0:30' })))
    expect(draws.some((draw) => draw.kind === 'text' && draw.style === '#ffd8b0')).toBe(true)
    expect(draws.some((draw) => draw.kind === 'rect' && draw.style === '#ffc9a0')).toBe(true)

    draws.length = 0
    clock.apply(snap(face({ remainingMs: 30_001, label: '0:30' })))
    expect(draws.some((draw) => draw.kind === 'text' && draw.style === '#ffd8b0')).toBe(false)
    expect(draws.some((draw) => draw.kind === 'rect' && draw.style === '#ffc9a0')).toBe(false)
    expect(draws.some((draw) => draw.kind === 'text' && draw.style === '#f3efe6')).toBe(true)

    draws.length = 0
    clock.apply(snap(face({ remainingMs: 0, label: '0:00' })))
    expect(draws.some((draw) => draw.kind === 'text' && draw.style === '#ffd8b0')).toBe(true)
    expect(draws.some((draw) => draw.style === '#ffc9a0')).toBe(true)

    draws.length = 0
    clock.apply(snap(face({ remainingMs: 0, label: '0:00', isActive: false })))
    expect(draws.some((draw) => draw.style === '#ffd8b0' || draw.style === '#ffc9a0')).toBe(false)
    clock.dispose()
  })

  it('changes the digit color and the copper bar when a repaint crosses 30 seconds', () => {
    const { context, draws } = recordingContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const clock = new PhysicalChessClock()
    clock.apply(snap(face({ remainingMs: 30_001, label: '0:30' })))
    expect(draws.some((draw) => draw.style === '#ffc9a0')).toBe(false)
    draws.length = 0
    clock.apply(snap(face({ remainingMs: 29_000, label: '0:29' })))
    expect(draws.some((draw) => draw.kind === 'text' && draw.style === '#ffd8b0' && draw.text === '0:29')).toBe(true)
    expect(draws.some((draw) => draw.kind === 'rect' && draw.style === '#ffc9a0' && (draw.height ?? 0) >= 8)).toBe(true)
    clock.dispose()
  })

  it('draws a flag mark on a confirmed flag so it is not a running face', () => {
    const { context, draws } = recordingContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const clock = new PhysicalChessClock()
    clock.apply(snap(face({ expiry: 'confirmed-flag', remainingMs: 0, label: '0:00', isActive: false })))
    expect(draws.some((draw) => draw.kind === 'text' && draw.text === 'FLAG' && draw.style === '#ff4d4d')).toBe(true)
    expect(draws.some((draw) => draw.text === 'rim' && draw.style === '#ff4d4d')).toBe(true)
    expect(draws.some((draw) => draw.kind === 'text' && draw.style === '#ffd8b0')).toBe(false)
    clock.dispose()
  })
})
