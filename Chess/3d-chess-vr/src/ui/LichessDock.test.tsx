import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LichessDock, opponentProfileUrl } from './LichessDock'

describe('LichessDock', () => {
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
    const human = { username: 'Salma', title: 'FM', rating: 2100, ai: false, ourColor: 'white' as const }
    const ai = { username: 'Lichess AI', title: null, rating: null, ai: true, ourColor: 'black' as const }
    expect(opponentProfileUrl(human)).toBe('https://lichess.org/@/Salma')
    expect(opponentProfileUrl(ai)).toBeNull()
    const { rerender } = render(
      <LichessDock username="Ada" signedIn opponent={human} onSignIn={vi.fn()} onPlay={vi.fn()} onSignOut={vi.fn()} />,
    )
    const link = screen.getByRole('link', { name: 'Salma' })
    expect(link.getAttribute('href')).toBe('https://lichess.org/@/Salma')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByText(/FM/)).toBeTruthy()
    expect(screen.getByText(/2100/)).toBeTruthy()
    expect(screen.getByText('You are playing White')).toBeTruthy()
    rerender(
      <LichessDock username="Ada" signedIn opponent={ai} onSignIn={vi.fn()} onPlay={vi.fn()} onSignOut={vi.fn()} />,
    )
    expect(screen.getByText('Lichess AI')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Lichess AI' })).toBeNull()
    expect(screen.getByText('You are playing Black')).toBeTruthy()
  })
})
