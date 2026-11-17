import type { ReactElement } from 'react'

/** The other seat during a live Lichess game. */
export interface LichessOpponent {
  readonly id: string
  readonly username: string
  readonly title: string | null
  readonly rating: number | null
  readonly ai: boolean
  readonly aiLevel?: number | null
  readonly ourColor: 'white' | 'black'
}

/** What the main-screen Lichess controls need. */
export interface LichessDockProps {
  readonly username: string | null
  readonly signedIn: boolean
  readonly redirecting?: boolean
  readonly busy?: boolean
  readonly notice?: string | null
  readonly opponent: LichessOpponent | null
  readonly onSignIn: () => void
  readonly onPlay: () => void
  readonly onSignOut: () => void
}

/**
 * Profile URL for a human opponent.
 * The path uses the Lichess id, not the display name. AI seats have no profile.
 * @param opponent - The other seat.
 * @returns The profile URL, or null for an engine.
 */
export function opponentProfileUrl(opponent: LichessOpponent): string | null {
  if (opponent.ai || !opponent.id) return null
  return `https://lichess.org/@/${encodeURIComponent(opponent.id)}`
}

/**
 * Lichess controls on the main screen.
 * Signed-out players see one gold button. A live game adds the opponent card.
 * @param props - Session and the current opponent, if any.
 * @returns The dock.
 */
export function LichessDock(props: LichessDockProps): ReactElement {
  const profile = props.opponent ? opponentProfileUrl(props.opponent) : null
  const engine = props.opponent?.ai
    ? props.opponent.aiLevel != null
      ? `Stockfish level ${props.opponent.aiLevel}`
      : props.opponent.username
    : null
  return (
    <section className="hall-lichess" aria-label="Lichess">
      {props.redirecting ? <p role="status">Redirecting to Lichess…</p> : null}
      {props.notice ? <p role="status">{props.notice}</p> : null}
      {props.signedIn && props.username ? <p>Signed in as {props.username}</p> : null}
      {props.opponent ? (
        <div className="hall-opponent" data-testid="opponent-card">
          <p>
            {engine ? (
              <span data-testid="opponent-ai">{engine}</span>
            ) : (
              <>
                {props.opponent.title ? `${props.opponent.title} ` : null}
                {profile ? (
                  <a href={profile} target="_blank" rel="noopener noreferrer">
                    {props.opponent.username}
                  </a>
                ) : (
                  props.opponent.username
                )}
                {props.opponent.rating != null ? ` (${props.opponent.rating})` : null}
              </>
            )}
          </p>
          <p>You are playing {props.opponent.ourColor === 'white' ? 'White' : 'Black'}</p>
        </div>
      ) : null}
      {props.signedIn ? (
        <>
          {props.opponent ? null : (
            <button type="button" onClick={props.onPlay} disabled={props.busy}>
              Play online
            </button>
          )}
          <button type="button" onClick={props.onSignOut}>
            Sign out
          </button>
        </>
      ) : (
        <button type="button" className="hall-lichess-signin" onClick={props.onSignIn} disabled={props.redirecting}>
          Sign in with Lichess
        </button>
      )}
    </section>
  )
}
