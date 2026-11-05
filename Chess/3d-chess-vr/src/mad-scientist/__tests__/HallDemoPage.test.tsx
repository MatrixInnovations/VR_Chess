import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const captured = vi.hoisted(() => ({
  onCreated: null as null | ((state: { gl: { domElement: unknown } }) => void),
}))

vi.mock('@react-three/fiber', () => {
  const { createElement: h } = require('react')
  return {
    Canvas: (props: {
      children?: unknown
      camera?: unknown
      onCreated?: (state: { gl: { domElement: unknown } }) => void
    }) => {
      captured.onCreated = props.onCreated ?? null
      return h('div', { 'data-camera': props.camera ? 'seated' : 'missing' }, props.children)
    },
  }
})

import { HallDemoPage } from '../react/HallDemoPage'

describe('HallDemoPage', () => {
  it('renders the hall view inside the fiber canvas', () => {
    const markup = renderToStaticMarkup(createElement(HallDemoPage))
    expect(markup).toContain('data-camera="seated"')
    expect(markup).toContain('primitive')

    const surface = {
      listeners: new Map<string, (event: unknown) => void>(),
      addEventListener(type: string, listener: (event: unknown) => void) {
        this.listeners.set(type, listener)
      },
      removeEventListener(type: string) {
        this.listeners.delete(type)
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 32, height: 32 }
      },
    }
    captured.onCreated?.({ gl: { domElement: surface } })
    expect(surface.listeners.has('pointerdown')).toBe(true)
  })
})
