import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-three/fiber', () => {
  const React = require('react') as typeof import('react')
  return {
    Canvas: (props: {
      children?: React.ReactNode
      onCreated?: (state: { gl: { domElement: object } }) => void
    }) => {
      props.onCreated?.({
        gl: {
          domElement: {
            addEventListener() {
              return undefined
            },
            removeEventListener() {
              return undefined
            },
            getBoundingClientRect() {
              return { left: 0, top: 0, width: 800, height: 600 }
            },
          },
        },
      })
      return React.createElement('div', { 'data-testid': 'hall-canvas' }, props.children)
    },
    useFrame: () => undefined,
  }
})

vi.mock('@react-three/xr', () => {
  const React = require('react') as typeof import('react')
  return {
    XR: (props: { children?: React.ReactNode }) => React.createElement('div', null, props.children),
    useXR: (selector?: (state: { inputSourceStates: readonly never[] }) => unknown) =>
      selector ? selector({ inputSourceStates: [] }) : { inputSourceStates: [] },
    createXRStore: () => ({
      enterVR: async () => undefined,
      enterAR: async () => undefined,
      getState: () => ({}),
      onSessionEnd: () => () => undefined,
    }),
  }
})

import { AppMount } from './AppMount'

describe('AppMount', () => {
  it('renders the seated hall, the clock, and the immersive switch', () => {
    render(<AppMount />)
    expect(screen.getByRole('heading', { name: 'Chess Hall' })).toBeTruthy()
    expect(screen.getByTestId('hall-canvas')).toBeTruthy()
    expect(screen.getByTestId('clock-white').textContent).toContain('White')
    expect(screen.getByRole('button', { name: '3D / Immersive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pass and play' })).toBeTruthy()
  })
})
