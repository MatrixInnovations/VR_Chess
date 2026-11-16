import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-three/fiber', () => {
  const React = require('react') as typeof import('react')
  return {
    Canvas: (props: { children?: React.ReactNode; onCreated?: (state: unknown) => void }) => {
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
          shadowMap: { autoUpdate: true, needsUpdate: false },
          xr: { getReferenceSpace: () => null },
        },
      })
      return React.createElement('div', null, props.children)
    },
    useFrame: () => undefined,
  }
})

vi.mock('@react-three/xr', () => {
  const React = require('react') as typeof import('react')
  return {
    XR: (props: { children?: React.ReactNode }) => React.createElement('div', null, props.children),
    XROrigin: (props: { children?: React.ReactNode }) => React.createElement('div', null, props.children),
    useXR: () => [],
    createXRStore: () => ({
      enterVR: async () => null,
      enterAR: async () => null,
      getState: () => ({ session: null }),
      onSessionEnd: () => undefined,
    }),
  }
})

vi.mock('../mad-scientist/react/ChessHallView', () => ({
  ChessHallView: () => null,
}))

import { ChessHallPage } from './ChessHallPage'
import { ChessApplication } from '../app/ChessApplication'
import { MemoryKeyValueStore } from '../ultron/auth/MemoryKeyValueStore'
import type { IHttpTransport } from '../ultron/contracts/http'

class DeadTransport implements IHttpTransport {
  async send(): Promise<never> {
    throw new Error('offline')
  }
}

describe('ChessHallPage controls', () => {
  it('opens the menu, the sign-in screen, and the lobby buttons', async () => {
    const app = new ChessApplication({
      whiteMs: 60_000,
      blackMs: 60_000,
      incrementMs: 0,
      transport: new DeadTransport(),
      storage: new MemoryKeyValueStore(),
    })
    render(<ChessHallPage app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Offer draw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decline draw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replay tour' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lichess sign-in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the board' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lobby' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to the board' })[0]!)
    await act(async () => {
      app.backToLobby()
    })
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'opponent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Challenge' }))
    await act(async () => {
      app.backToLobby()
    })
    fireEvent.click(screen.getByRole('button', { name: /Seek/ }))
    const pass = screen.getAllByRole('button', { name: 'Pass and play' })
    fireEvent.click(pass[pass.length - 1]!)
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pass and play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    fireEvent.click(screen.getByRole('button', { name: '3D / Immersive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(app.revision).toBeGreaterThan(0)
  })
})
