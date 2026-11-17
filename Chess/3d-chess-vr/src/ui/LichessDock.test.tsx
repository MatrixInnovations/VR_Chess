import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LichessDock, opponentProfileUrl } from './LichessDock'

describe('LichessDock', () => {
  afterEach(() => cleanup())

  it('offers sign-in until a session exists', () => {
    const onSignIn = vi.fn()
    render(
      <LichessDock username={null} signedIn={false} opponent={null} onSignIn={onSignIn} onPlay={vi.fn()} onSignOut={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Lichess' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Play online' })).toBeNull()
  })

  it('shows the account, a  play control, and sign-out', () => {
    const onPlay = vi.fn()
    const onSignOut = vi.fn()
    render(
      <LichessDock
        username="Ada"
        signedIn
        opponent={null}
        onSignIn={vi.fn()}
        onPlay={onPlay}
        onSignOut={onSignOut}
      />,
    )
    expect(screen.getByText('Signed in as Ada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play online' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onPlay).toHaveBeenCalledOnce()
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('links a human opponent and labels an engine without a link', () => {
    const human = { id: 'salma', username: 'Salma Smith', title: 'FM', rating: 2100, ai: false, ourColor: 'white' as const }
    const ai = { id: 'stockfish', username: 'Stockfish level 6', title: null, rating: null, ai: true, aiLevel: 6, ourColor: 'black' as const }
    expect(opponentProfileUrl(human)).toBe('https://lichess.org/@/salma')
    expect(opponentProfileUrl(ai)).toBeNull()
    const { rerender } = render(
      <LichessDock username="Ada" signedIn opponent={human} onSignIn={vi.fn()} onPlay={vi.fn()} onSignOut={vi.fn()} />,
    )
    const link = screen.getByRole('link', { name: 'Salma Smith' })
    expect(link.getAttribute('href')).toBe('https://lichess.org/@/salma')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByText(/FM/)).toBeTruthy()
    expect(screen.getByText(/2100/)).toBeTruthy()
    expect(screen.getByText('You are playing White')).toBeTruthy()
    rerender(
      <LichessDock username="Ada" signedIn opponent={ai} onSignIn={vi.fn()} onPlay={vi.fn()} onSignOut={vi.fn()} />,
    )
    expect(screen.getByTestId('opponent-ai').textContent).toBe('Stockfish level 6')
    expect(screen.queryByRole('link', { name: 'Stockfish level 6' })).toBeNull()
    expect(screen.getByText('You are playing Black')).toBeTruthy()
  })

  it('shows a redirect and keeps play from firing twice while a seek is pending', () => {
    const onPlay = vi.fn()
    render(
      <LichessDock
        username={null}
        signedIn={false}
        redirecting
        notice="Lichess sign-in was cancelled. You can try again anytime."
        opponent={null}
        onSignIn={vi.fn()}
        onPlay={onPlay}
        onSignOut={vi.fn()}
      />,
    )
    expect(screen.getByText('Lichess sign-in was cancelled. You can try again anytime.')).toBeTruthy()
    expect(screen.getByText('Redirecting to Lichess…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in with Lichess' })).toHaveProperty('disabled', true)
  })

  it('disables play online while a seek is in flight', () => {
    const onPlay = vi.fn()
    const view = render(
      <LichessDock
        username="Ada"
        signedIn
        busy
        notice="Could not start a seek"
        opponent={null}
        onSignIn={vi.fn()}
        onPlay={onPlay}
        onSignOut={vi.fn()}
      />,
    )
    const play = view.getByRole('button', { name: 'Play online' })
    expect(play).toHaveProperty('disabled', true)
    expect(screen.getByText('Could not start a seek')).toBeTruthy()
  })
})
