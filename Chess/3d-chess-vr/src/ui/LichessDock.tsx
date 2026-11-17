import type { ReactElement } from 'react'

/** The other seat during a live Lichess game. */
export interface LichessOpponent {
  readonly username: string
  readonly title: string | null
  readonly rating: number | null
  readonly ai: boolean
  readonly ourColor: 'white' | 'black'
}

/** What the main-screen Lichess controls need. */
export interface LichessDockProps {
  readonly username: string | null
  readonly signedIn: boolean
  readonly opponent: LichessOpponent | null
  readonly onSignIn: () => void
  readonly onPlay: () => void
  readonly onSignOut: () => void
}

/**
 * Profile URL for a human opponent.
 * AI seats have no Lichess profile link.
 * @param opponent - The other seat.
 * @returns The profile URL, or null for an engine.
 */
export function opponentProfileUrl(opponent: LichessOpponent): string | null {
  if (opponent.ai) return null
  return `https://lichess.org/@/${encodeURIComponent(opponent.username)}`
}

/**
 * Lichess controls on the main screen.
 * Signed-out players see one gold button. A live game adds the opponent card.
 * @param props - Session and the current opponent, if any.
 * @returns The dock.
 */
export function LichessDock(props: LichessDockProps): ReactElement {
  const profile = props.opponent ? opponentProfileUrl(props.opponent) : null
  return (
    <section className="hall-lichess" aria-label="Lichess">
      {props.signedIn && props.username ? <p>Signed in as {props.username}</p> : null}
      {props.opponent ? (
        <div className="hall-opponent" data-testid="opponent-card">
          <p>
            {props.opponent.title ? `${props.opponent.title} ` : null}
            {profile ? (
              <a href={profile} target="_blank" rel="noopener noreferrer">
                {props.opponent.username}
              </a>
            ) : (
              props.opponent.username
            )}
            {props.opponent.rating != null ? ` (${props.opponent.rating})` : null}
          </p>
          <p>You are playing {props.opponent.ourColor === 'white' ? 'White' : 'Black'}</p>
        </div>
      ) : null}
      {props.signedIn ? (
        <>
          {props.opponent ? null : (
            <button type="button" onClick={props.onPlay}>
              Play online
            </button>
          )}
          <button type="button" onClick={props.onSignOut}>
            Sign out
          </button>
        </>
      ) : (
        <button type="button" className="hall-lichess-signin" onClick={props.onSignIn}>
          Sign in with Lichess
        </button>
      )}
    </section>
  )
}
