import { useEffect, useState } from 'react'
import { Side } from '../domain/Color'
import { ChessClock } from '../domain/ChessClock'
import type { AppShell } from './AppShell'
import { useObservable } from './useObservable'

export function Hud({ shell }: { shell: AppShell }) {
  const session = shell.session
  const guide = session.guide
  useObservable(shell)
  useObservable(session)
  useObservable(shell.viewMode)
  useObservable(guide)
  const [now, setNow] = useState(0)
  const [minutes, setMinutes] = useState(10)
  const [increment, setIncrement] = useState(0)
  const [opponent, setOpponent] = useState('')
  const [color, setColor] = useState<'white' | 'black' | 'random'>('random')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 200)
    return () => window.clearInterval(timer)
  }, [])

  const immersive = shell.viewMode.immersive
  const playing = session.phase === 'playing' || session.phase === 'over'

  return (
    <>
      <header className="topbar">
        <div>
          <p className="mark">The Hall</p>
          <p className="sub">Over the board</p>
        </div>
        <div className="top-actions">
          <button
            className="mode-switch"
            role="switch"
            aria-checked={immersive}
            onClick={() => void shell.viewMode.toggle()}
          >
            <span className={immersive ? '' : 'is-on'}>3D</span>
            <span className="knob" data-on={immersive ? 'yes' : 'no'} />
            <span className={immersive ? 'is-on' : ''}>Immersive</span>
          </button>
          <button className="text-button" onClick={() => void shell.viewMode.enterAr()}>
            Table
          </button>
        </div>
      </header>

      {shell.viewMode.message ? <p className="banner">{shell.viewMode.message}</p> : null}
      {!shell.piecesReady && shell.loadLabel ? <p className="banner">{shell.loadLabel}</p> : null}

      <section className="status">
        <p>{session.status}</p>
        {session.clock.enabled && playing ? (
          <p className="times">
            <ClockReadout
              label="White"
              ms={session.clock.remaining('white', now)}
              active={session.clock.active === 'white'}
            />
            <ClockReadout
              label="Black"
              ms={session.clock.remaining('black', now)}
              active={session.clock.active === 'black'}
            />
          </p>
        ) : null}
      </section>

      {session.phase === 'lobby' || session.phase === 'seeking' ? (
        <aside className="panel">
          <h1>Sit at the board</h1>
          <p className="lede">
            A wooden hall, a clock, and a seat. Pass and play here, or take a real Lichess opponent.
            Legal squares are shown. Nothing suggests a move.
          </p>
          <div className="row">
            <label>
              Minutes
              <input
                type="number"
                min={1}
                max={180}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </label>
            <label>
              Increment
              <input
                type="number"
                min={0}
                max={60}
                value={increment}
                onChange={(event) => setIncrement(Number(event.target.value))}
              />
            </label>
          </div>
          <button className="primary" onClick={() => session.startOffline(minutes, increment)}>
            Pass and play
          </button>
          <button className="text-button wide" onClick={() => session.startOffline(null, 0)}>
            Untimed
          </button>

          <h2>Lichess</h2>
          {session.accountName ? (
            <p className="lede">Signed in as {session.accountName}.</p>
          ) : (
            <p className="lede">
              Your browser talks to Lichess directly. The login token stays in this tab and is never
              written into the app.
            </p>
          )}
          {session.accountName ? (
            <button className="text-button wide" onClick={() => session.logout()}>
              Log out
            </button>
          ) : (
            <button className="primary" onClick={() => session.login()}>
              Log in with Lichess
            </button>
          )}
          <label>
            Color
            <select value={color} onChange={(event) => setColor(event.target.value as typeof color)}>
              <option value="random">Either</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={!session.accountName || session.phase === 'seeking'}
            onClick={() => session.seek(minutes, increment, color)}
          >
            {session.phase === 'seeking' ? 'Seeking…' : 'Seek a game'}
          </button>
          {session.phase === 'seeking' ? (
            <button className="text-button wide" onClick={() => session.cancelSeek()}>
              Cancel seek
            </button>
          ) : null}
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault()
              session.challenge(opponent, minutes, increment, color)
            }}
          >
            <label>
              Challenge a username
              <input
                value={opponent}
                placeholder="username"
                onChange={(event) => setOpponent(event.target.value)}
              />
            </label>
            <button className="text-button wide" type="submit" disabled={!session.accountName}>
              Send challenge
            </button>
          </form>
        </aside>
      ) : null}

      {session.incoming ? (
        <div className="card">
          <h2>{session.incoming.challenger} challenged you</h2>
          <div className="row">
            <button className="primary" onClick={() => session.acceptChallenge()}>
              Accept
            </button>
            <button className="text-button" onClick={() => session.declineChallenge()}>
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {session.pending ? (
        <div className="card">
          <h2>Promote the pawn</h2>
          <div className="row">
            {(['queen', 'rook', 'bishop', 'knight'] as const).map((type) => (
              <button key={type} className="primary" onClick={() => session.choosePromotion(type)}>
                {type}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {session.drawOffer === 'incoming' ? (
        <div className="card">
          <h2>Draw offer</h2>
          <div className="row">
            <button className="primary" onClick={() => session.offerDraw()}>
              Accept
            </button>
            <button className="text-button" onClick={() => session.declineDraw()}>
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {session.gameOver ? (
        <div className="card">
          <h2>{session.gameOver.title}</h2>
          <p>{session.gameOver.detail}</p>
          <button className="primary" onClick={() => session.returnToLobby()}>
            Back to the hall
          </button>
        </div>
      ) : null}

      {playing && !session.gameOver ? (
        <div className="dock">
          <button className="text-button" onClick={() => session.toggleFreeLook()}>
            {session.freeLook ? 'Sit down' : 'Free look'}
          </button>
          <button className="text-button" onClick={() => session.offerDraw()}>
            {session.drawOffer === 'outgoing' ? 'Draw offered' : 'Offer draw'}
          </button>
          <button className="text-button" onClick={() => session.resign()}>
            Resign
          </button>
          <button className="text-button" onClick={() => session.returnToLobby()}>
            Leave
          </button>
          <button className="text-button" onClick={() => guide.reopen()}>
            ?
          </button>
        </div>
      ) : (
        <button className="help" onClick={() => guide.reopen()}>
          ?
        </button>
      )}

      {guide.open ? (
        <div className="guide">
          <p className="eyebrow">
            {guide.index + 1} / {guide.steps.length}
          </p>
          <h2>{guide.current.title}</h2>
          <p>{guide.current.body}</p>
          <div className="row">
            <button className="text-button" onClick={() => guide.back()} disabled={guide.index === 0}>
              Back
            </button>
            <button className="primary" onClick={() => guide.next()}>
              {guide.index === guide.steps.length - 1 ? 'Done' : 'Next'}
            </button>
            <button className="text-button" onClick={() => guide.dismiss()}>
              Skip
            </button>
          </div>
        </div>
      ) : null}

      <p className="seat">
        {playing
          ? `${Side.label(session.turn)} to move · you sit as ${Side.label(session.seat)}`
          : 'F free look · V immersive'}
      </p>
    </>
  )
}

function ClockReadout({ label, ms, active }: { label: string; ms: number; active: boolean }) {
  return (
    <span className={active ? 'time active' : 'time'}>
      {label} {ChessClock.format(ms)}
    </span>
  )
}
