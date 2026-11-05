import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { PointerSurface, PointerSurfaceEvent } from '../react/HallDemo'
import { HallDemo, demoLineup, hallDemoMount } from '../react/HallDemo'
import { ChessHallView } from '../react/ChessHallView'

class FakeSurface implements PointerSurface {
  readonly listeners = new Map<string, (event: PointerSurfaceEvent) => void>()

  rect = { left: 10, top: 20, width: 200, height: 100 }

  addEventListener(type: string, listener: (event: PointerSurfaceEvent) => void): void {
    this.listeners.set(type, listener)
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type)
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.rect
  }
}

describe('HallDemo', () => {
  it('mounts a seated hall with both kings and no legal-move search', () => {
    const lineup = demoLineup()
    expect(lineup.some((piece) => piece.id === 'white-king' && piece.color === 'white')).toBe(true)
    expect(lineup.some((piece) => piece.id === 'black-king' && piece.color === 'black')).toBe(true)

    const demo = new HallDemo()
    expect(demo.hall.getPiece('white-king')).toBeTruthy()
    expect(demo.hall.getPiece('black-king')).toBeTruthy()
    expect(demo.hall.camera.position.y).toBeGreaterThan(1)
    expect(demo.runtime.budget.floorFps).toBe(72)
    expect(demo.runtime.budget.targetFps).toBe(90)
    demo.dispose()
  })

  it('wires pointer samples from a surface and detaches cleanly', () => {
    const demo = new HallDemo()
    const surface = new FakeSurface()
    demo.attachPointer(surface)
    demo.attachPointer(surface)
    expect(surface.listeners.has('pointerdown')).toBe(true)

    const down = surface.listeners.get('pointerdown')
    expect(() =>
      down?.({ clientX: 40, clientY: 50, pointerId: 3 }),
    ).not.toThrow()
    expect(() =>
      surface.listeners.get('pointermove')?.({ clientX: 45, clientY: 55, pointerId: 3 }),
    ).not.toThrow()
    expect(() =>
      surface.listeners.get('pointerup')?.({ clientX: 48, clientY: 60, pointerId: 3 }),
    ).not.toThrow()
    expect(() =>
      surface.listeners.get('pointercancel')?.({ clientX: 48, clientY: 60, pointerId: 3 }),
    ).not.toThrow()

    demo.detach()
    expect(surface.listeners.size).toBe(0)
    demo.detach()
    demo.dispose()
  })

  it('tolerates a zero-size surface', () => {
    const demo = new HallDemo()
    const surface = new FakeSurface()
    surface.rect = { left: 0, top: 0, width: 0, height: 0 }
    demo.attachPointer(surface)
    expect(() =>
      surface.listeners.get('pointerdown')?.({ clientX: 0, clientY: 0, pointerId: 1 }),
    ).not.toThrow()
    demo.dispose()
    expect(surface.listeners.size).toBe(0)
  })
})

describe('hallDemoMount', () => {
  it('points Canvas at the hall root and attaches the pointer on create', () => {
    const demo = new HallDemo()
    const mount = hallDemoMount(demo)
    const element = createElement(ChessHallView, { hall: mount.hall })
    expect(mount.camera).toBe(demo.hall.camera)
    expect(mount.hall).toBe(demo.hall)
    expect(element.props.hall).toBe(demo.hall)

    const surface = new FakeSurface()
    mount.onCreated({ gl: { domElement: surface } })
    expect(surface.listeners.has('pointerdown')).toBe(true)
    demo.dispose()
  })
})
