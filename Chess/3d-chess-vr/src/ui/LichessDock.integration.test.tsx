import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ChessJsRules } from '../ultron/rules/ChessJsRules'
import { GameSession } from '../ultron/session/GameSession'
import { SequentialIds } from '../ultron/session/SequentialIds'
import { LichessAuthPresenter } from '../vision/screens/auth/LichessAuthPresenter'
import { LichessDock } from './LichessDock'

/**
 * A player that only records the inbox. The dock test never seeks.
 */
class QuietPlayer {
  inbox: { onAccount: (name: string, id: string) => void; onIncoming: (event: object) => void; onBoardEvent: (event: object) => void } | null = null
  bindInbox(inbox: QuietPlayer['inbox']): void {
    this.inbox = inbox
  }
  async start(): Promise<{ ok: true }> {
    return { ok: true }
  }
  async playMove(): Promise<{ ok: true }> {
    return { ok: true }
  }
  async seek(): Promise<{ ok: true }> {
    return { ok: true }
  }
  cancelSeek(): void {
    return undefined
  }
  async challenge(): Promise<{ ok: true }> {
    return { ok: true }
  }
  async acceptChallenge(): Promise<{ ok: true }> {
    return { ok: true }
  }
  async declineChallenge(): Promise<{ ok: true }> {
    return { ok: true }
  }
  async resign(): Promise<{ ok: true }> {
    return { ok: true }
  }
  async abortGame(): Promise<{ ok: true }> {
    return { ok: true }
  }
  dispose(): void {
    return undefined
  }
}

function seated(): GameSession {
  const player = new QuietPlayer()
  const session = GameSession.online({
    rules: new ChessJsRules(),
    ids: new SequentialIds('dock'),
    now: () => 0,
    sessionId: 'dock-session',
    player: player as never,
  })
  player.inbox?.onAccount('Ada', 'ada')
  player.inbox?.onIncoming({ type: 'gameStart', gameId: 'live', color: 'white', compatBoard: true })
  player.inbox?.onBoardEvent({
    type: 'gameFull',
    id: 'live',
    initialFen: 'startpos',
    variant: 'standard',
    whiteId: 'ada',
    blackId: 'salma',
    white: { id: 'ada', name: 'Ada', title: null, rating: 1500, ai: false },
    black: { id: 'salma', name: 'Salma', title: null, rating: 2200, ai: false },
    state: {
      moves: [],
      wtime: 600000,
      btime: 600000,
      winc: 0,
      binc: 0,
      status: 'started',
      winner: null,
      wdraw: false,
      bdraw: false,
    },
  })
  return session
}

describe('Lichess dock wiring', () => {
  afterEach(() => cleanup())

  it('shows the opponent from the session and not the signed-in player', () => {
    const session = seated()
    const presenter = new LichessAuthPresenter()
    presenter.showSignedIn({ username: 'Ada', expiresAt: null })
    const snap = presenter.snapshot()
    const opponent = session.opponentCard()
    expect(opponent).not.toBeNull()
    render(
      <LichessDock
        username={snap.username}
        signedIn={snap.phase === 'signed-in' && Boolean(snap.username)}
        opponent={opponent}
        onSignIn={() => undefined}
        onPlay={() => undefined}
        onSignOut={() => undefined}
      />,
    )
    expect(screen.getByTestId('opponent-card').textContent).toContain('Salma')
    expect(screen.getByTestId('opponent-card').textContent).not.toContain('Signed in as Salma')
    expect(screen.getByRole('link', { name: 'Salma' }).getAttribute('href')).toBe('https://lichess.org/@/salma')
    expect(screen.getByText('Signed in as Ada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in with Lichess' })).toBeNull()
  })

  it('stays signed out until a session exists', () => {
    const presenter = new LichessAuthPresenter()
    const snap = presenter.snapshot()
    render(
      <LichessDock
        username={snap.username}
        signedIn={snap.phase === 'signed-in' && Boolean(snap.username)}
        opponent={null}
        onSignIn={() => undefined}
        onPlay={() => undefined}
        onSignOut={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Sign in with Lichess' })).toBeTruthy()
    expect(screen.queryByText('Signed in as Ada')).toBeNull()
    expect(screen.queryByTestId('opponent-card')).toBeNull()
  })
})
