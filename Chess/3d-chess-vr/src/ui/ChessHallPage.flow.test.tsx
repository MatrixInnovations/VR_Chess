import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
import type { IFridaeClockSnapshot } from '../mad-scientist/contracts/IFridaeClockPort'
import type { IHttpTransport } from '../ultron/contracts/http'

class DeadTransport implements IHttpTransport {
  async send(): Promise<never> {
    throw new Error('offline')
  }
}

describe('ChessHallPage controls', () => {
  afterEach(() => {
    cleanup()
  })

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
    // Resigning closes the menu so the game-over panel is not covered.
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Offer draw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decline draw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replay tour' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lichess sign-in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the board' }))
    // Opening sign-in closed the menu, so open it again for the lobby.
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
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

  it('shows 1:00 on a fresh 60 second game', () => {
    const app = new ChessApplication({
      whiteMs: 60_000,
      blackMs: 60_000,
      incrementMs: 0,
      now: () => 5_000,
      transport: new DeadTransport(),
      storage: new MemoryKeyValueStore(),
    })
    render(<ChessHallPage app={app} />)
    const white = screen.getByTestId('clock-white')
    expect(white.textContent).toContain('1:00')
    expect(white.textContent).not.toContain('—')
    expect(white.getAttribute('data-expiry')).toBe('running')
  })

  it('shows a dash and no cue when the clock is not a countdown', () => {
    const published = (kind: IFridaeClockSnapshot['kind'], white: number | null): IFridaeClockSnapshot => ({
      kind,
      mode: 'offline',
      activeColor: 'white',
      whiteDisplayMs: white,
      blackDisplayMs: white,
      whiteIncrementMs: 0,
      blackIncrementMs: 0,
      provisionalFlagColor: null,
      confirmedFlag: null,
    })
    const cases: Array<(app: ChessApplication) => void> = [
      (app) => app.shell.navigator.beginWait(),
      (app) => vi.spyOn(app.readModel, 'fridae').mockReturnValue(null),
      (app) => vi.spyOn(app.readModel, 'fridae').mockReturnValue(published('unlimited', 0)),
      (app) => vi.spyOn(app.readModel, 'fridae').mockReturnValue(published('correspondence', 0)),
      (app) => vi.spyOn(app.readModel, 'fridae').mockReturnValue(published('absent', null)),
      (app) => vi.spyOn(app.readModel, 'fridae').mockReturnValue(published('realtime', null)),
    ]
    for (const setup of cases) {
      const app = new ChessApplication({
        whiteMs: 60_000,
        blackMs: 60_000,
        incrementMs: 0,
        transport: new DeadTransport(),
        storage: new MemoryKeyValueStore(),
      })
      setup(app)
      const view = render(<ChessHallPage app={app} />)
      for (const id of ['clock-white', 'clock-black']) {
        const node = screen.getByTestId(id)
        expect(node.textContent).toContain('—')
        expect(node.getAttribute('data-expiry')).toBe('no-clock')
        expect(node.className).not.toMatch(/hall-clock-low|hall-clock-flag|hall-clock-provisional/)
        expect(node.textContent).not.toMatch(/low|flag|provisional/)
      }
      view.unmount()
    }
  })
})
