import { Canvas, useFrame, type RootState } from '@react-three/fiber'
import { PCFSoftShadowMap, type WebGLRenderer } from 'three'
import { configureHallStage } from '../mad-scientist/hall/HallStage'
import { XR, XROrigin, useXR } from '@react-three/xr'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement, type RefObject } from 'react'
import type { Group } from 'three'

import { ChessApplication, type PointerSurface } from '../app/ChessApplication'
import { readXrPoses, type LooseXrInput, type XrFrameLike } from '../app/XrInputPump'
import { WebXrHallSession } from '../app/WebXrHallSession'
import { ChessHallView } from '../mad-scientist/react/ChessHallView'
import { SEATED_EYE_Z_M } from '../mad-scientist/hall/metrics'
import { SiteCredit } from './SiteCredit'

/**
 * Props for {@link ChessHallPage}. Tests pass an application. The route boots one.
 */
export interface ChessHallPageProps {
  /** Application to mount. Omit to boot against the browser. */
  readonly app?: ChessApplication
}

/**
 * Seated hall page: the 3D room, the clock, the tour, and the Lichess menu.
 * Game rules stay on {@link ChessApplication}. This component only draws and forwards input.
 * @param props - Optional application. The home page omits it.
 * @returns The hall and its HUD.
 */
export function ChessHallPage({ app }: ChessHallPageProps = {}): ReactElement {
  const [model] = useState(() => app ?? ChessApplication.boot())
  const revision = useSyncExternalStore(
    (listener) => model.watch(listener),
    () => model.revision,
    () => 0,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const global = window as Window & { __CHESS_APP__?: ChessApplication }
    if (process.env.NODE_ENV !== 'production') global.__CHESS_APP__ = model
    void model.completeRedirectIfPresent(window.location.href)
    return () => {
      if (global.__CHESS_APP__ === model) delete global.__CHESS_APP__
    }
  }, [model])
  const store = model.xr instanceof WebXrHallSession ? model.xr.store : null
  const origin = useRef<Group>(null)
  const clock = model.clockView.present()
  const step = model.tour.current()
  const screen = model.shell.navigator.screen.name
  const signIn = model.shell.authPresenter.snapshot()
  const lobby = model.shell.lobbyPresenter.snapshot()
  const waiting = model.shell.waitingPresenter.snapshot()
  const over = model.shell.gameOverPresenter.snapshot()
  const error = model.shell.errorPresenter.snapshot()
  const snap = model.game.snapshot
  void revision
  return (
    <main className="hall-page">
      <h1>Chess Hall</h1>
      <p className="hall-lead">
        Seated at a marble board. Pass and play is ready. Lichess is in the menu.
      </p>
      <section className="hall-hud" aria-label="Clock and status" hidden={!model.hud.isPresented}>
        <p data-testid="clock-white" data-active={clock.white.isActive} data-expiry={clock.white.expiry} className={clockFaceClass(clock.white)}>
          White {formatMs(clock.white.remainingMs)}
          {clockNote(clock.white)}
        </p>
        <p data-testid="clock-black" data-active={clock.black.isActive} data-expiry={clock.black.expiry} className={clockFaceClass(clock.black)}>
          Black {formatMs(clock.black.remainingMs)}
          {clockNote(clock.black)}
        </p>
        <p data-testid="clock-active">{clock.white.isActive ? 'white' : clock.black.isActive ? 'black' : 'none'}</p>
        <p data-testid="session-id" className="hall-sr">{model.game.id}</p>
        <p data-testid="presentation">{model.presentation}</p>
        {model.message ? <p data-testid="status-line">{model.message}</p> : null}
      </section>
      {step ? (
        <section className="hall-tour" aria-label="Tour">
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          <button type="button" onClick={() => model.tourNext()}>
            Next
          </button>
          <button type="button" onClick={() => model.tourSkip()}>
            Skip tour
          </button>
        </section>
      ) : null}
      <div className="hall-actions">
        <button type="button" onClick={() => void model.toggleImmersive()}>
          {model.presentation === 'immersive' ? 'Back to 3D' : '3D / Immersive'}
        </button>
        <button type="button" onClick={() => void model.enterPassthrough()}>
          Table
        </button>
        <button type="button" onClick={() => model.toggleMenu()}>
          Menu
        </button>
        <button type="button" onClick={() => void model.listen()}>
          Listen
        </button>
        <button type="button" onClick={() => model.newPassAndPlay()}>
          Pass and play
        </button>
      </div>
      {model.menu.isOpen ? <MenuPanel model={model} /> : null}
      {model.promotion ? (
        <div className="hall-panel" role="dialog" aria-label="Promotion">
          <p>Promote the pawn.</p>
          {(['queen', 'rook', 'bishop', 'knight'] as const).map((piece) => (
            <button key={piece} type="button" onClick={() => model.choosePromotion(piece)}>
              {piece}
            </button>
          ))}
        </div>
      ) : null}
      {screen === 'sign-in' ? <SignInPanel model={model} phase={signIn.phase} url={signIn.authorizationUrl} message={signIn.message} username={signIn.username} /> : null}
      {screen === 'lobby' ? <LobbyPanel model={model} time={lobby.timeControl} message={lobby.message} /> : null}
      {screen === 'waiting' ? (
        <div className="hall-panel">
          <h2>{waiting.title}</h2>
          <p>{waiting.detail}</p>
          <button type="button" onClick={() => model.cancelWait()}>
            Cancel
          </button>
        </div>
      ) : null}
      {screen === 'game-over' ? (
        <div className="hall-panel" data-testid="game-over">
          <h2>{over.summary ?? 'Game over'}</h2>
          <button type="button" onClick={() => model.newPassAndPlay()}>
            Pass and play
          </button>
          <button type="button" onClick={() => model.backToLobby()}>
            Lobby
          </button>
        </div>
      ) : null}
      {screen === 'error' ? (
        <div className="hall-panel">
          <h2>Connection</h2>
          <p>{error.message ?? 'The stream needs another try.'}</p>
          <button type="button" onClick={() => model.retryConnection()}>
            Retry
          </button>
        </div>
      ) : null}
      <p className="hall-meta">
        {snap.mode === 'offline' ? 'Pass and play' : `Lichess ${snap.gameId ?? ''}`} ·{' '}
        <span className={snap.turn === 'black' ? 'hall-turn-black' : 'hall-turn'}>{snap.turn}</span> to move
        {snap.outcome ? ` · ${snap.outcome.status}` : ''}
      </p>
      <div className="hall-stage">
        <Canvas
          shadows="percentage"
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={model.runtime.hall.camera}
          onCreated={(state: RootState) => {
            const gl = state.gl as WebGLRenderer
            if (gl.shadowMap) {
              gl.shadowMap.autoUpdate = false
              gl.shadowMap.needsUpdate = true
              gl.shadowMap.type = PCFSoftShadowMap
            }
            const quest = typeof navigator !== 'undefined' && /Quest|Oculus/i.test(navigator.userAgent)
            const forceEffects = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('effects')
            const skipEffects = typeof navigator !== 'undefined' && navigator.webdriver && !forceEffects
            if (state.scene && typeof gl.render === 'function') {
              configureHallStage(gl, state.scene, state.camera, model.runtime.hall, quest, {
                effects: !quest && !skipEffects,
              })
            }
            model.attachPointer(state.gl.domElement as unknown as PointerSurface)
          }}
        >
          {store ? (
            <XR store={store}>
              <XROrigin ref={origin} position={[0, 0, SEATED_EYE_Z_M]} />
              <HallTicker model={model} />
              <XrReader model={model} origin={origin} />
              <ChessHallView hall={model.runtime.hall} />
            </XR>
          ) : (
            <>
              <HallTicker model={model} />
              <ChessHallView hall={model.runtime.hall} />
            </>
          )}
        </Canvas>
      </div>
      <SiteCredit />
    </main>
  )
}

/**
 * Advance the clock and the piece slides once per frame.
 * @param props - The application.
 * @returns Nothing visible.
 */
function HallTicker({ model }: { model: ChessApplication }): null {
  const wasAnimating = useRef(false)
  const wasGrabbing = useRef(false)
  const shadowGeneration = useRef(-1)
  useFrame((state) => {
    model.frame()
    const animating = model.runtime.animator.isAnimating()
    const grabbing = model.runtime.grab.isGrabbing()
    const generation = model.runtime.hall.shadowGeneration
    const dirty =
      animating ||
      grabbing ||
      wasAnimating.current ||
      wasGrabbing.current ||
      generation !== shadowGeneration.current
    wasAnimating.current = animating
    wasGrabbing.current = grabbing
    shadowGeneration.current = generation
    if (dirty && state.gl.shadowMap) state.gl.shadowMap.needsUpdate = true
    const orbit = model.runtime.hall.orbit
    if (orbit) {
      orbit.enabled = !grabbing
      orbit.update()
    }
    const grade = model.runtime.hall.grade
    if (grade) grade.render()
    else if (typeof state.gl.render === 'function') state.gl.render(state.scene, state.camera)
  }, 1)
  return null
}

/**
 * Sample Quest controllers and hands.
 * @param props - The application.
 * @returns Nothing visible.
 */
function XrReader({ model, origin }: { model: ChessApplication; origin: RefObject<Group | null> }): null {
  const inputs = useXR((state) => state.inputSourceStates)
  useFrame((state, _delta, frame) => {
    const space = state.gl.xr.getReferenceSpace()
    model.pushXr(
      readXrPoses(inputs as readonly LooseXrInput[], (frame ?? null) as XrFrameLike | null, space, origin.current),
    )
  })
  return null
}

/**
 * Menu actions that do not belong on the board.
 * @param props - The application.
 * @returns The menu panel.
 */
function MenuPanel({ model }: { model: ChessApplication }): ReactElement {
  return (
    <div className="hall-panel" role="dialog" aria-label="Menu">
      <button type="button" onClick={() => model.toggleMenu()}>
        Close
      </button>
      <button type="button" onClick={() => void model.resign()}>
        Resign
      </button>
      <button type="button" onClick={() => void model.offerDraw()}>
        Offer draw
      </button>
      <button type="button" onClick={() => void model.declineDraw()}>
        Decline draw
      </button>
      <button type="button" onClick={() => model.openSignIn()}>
        Lichess sign-in
      </button>
      <button type="button" onClick={() => model.openLobby()}>
        Lobby
      </button>
      <button
        type="button"
        onClick={() => {
          model.replayTour()
        }}
      >
        Replay tour
      </button>
    </div>
  )
}

/**
 * PKCE sign-in. The token is not rendered.
 * @param props - Presenter fields and the application.
 * @returns The sign-in panel.
 */
function SignInPanel(props: {
  model: ChessApplication
  phase: string
  url: string | null
  message: string | null
  username: string | null
}): ReactElement {
  return (
    <div className="hall-panel" aria-label="Lichess sign-in">
      <h2>Lichess</h2>
      {props.username ? <p>Signed in as {props.username}</p> : <p>Sign in to play people on Lichess.</p>}
      {props.message ? <p>{props.message}</p> : null}
      {props.url ? (
        <p>
          <a href={props.url}>Continue to Lichess</a>
        </p>
      ) : null}
      <button type="button" onClick={() => void props.model.beginSignIn()}>
        Sign in
      </button>
      <button type="button" onClick={() => props.model.backToBoard()}>
        Back to the board
      </button>
      <p data-testid="sign-in-phase">{props.phase}</p>
    </div>
  )
}

/**
 * Seek and challenge. Blitz is only offered as a direct challenge.
 * @param props - Lobby fields.
 * @returns The lobby panel.
 */
function LobbyPanel(props: { model: ChessApplication; time: string; message: string | null }): ReactElement {
  const [opponent, setOpponent] = useState('')
  return (
    <div className="hall-panel" aria-label="Lobby">
      <h2>Find a game</h2>
      <p>Time control {props.time}. Seeks are rapid or classical.</p>
      {props.message ? <p>{props.message}</p> : null}
      <button type="button" onClick={() => void props.model.seekFromLobby()}>
        Seek {props.time}
      </button>
      <label>
        Opponent
        <input value={opponent} onChange={(event) => {
          setOpponent(event.target.value)
          props.model.shell.lobbyPresenter.setOpponent(event.target.value)
        }} />
      </label>
      <button type="button" onClick={() => void props.model.challengeFromLobby()}>
        Challenge
      </button>
      <button type="button" onClick={() => props.model.passAndPlayFromLobby()}>
        Pass and play
      </button>
      <button type="button" onClick={() => props.model.backToBoard()}>
        Back to the board
      </button>
    </div>
  )
}

/**
 * Format a published millisecond value. This does not sample a clock.
 * @param ms - Remaining time from the read model.
 * @returns `m:ss`.
 */
function clockFaceClass(face: { isActive: boolean; expiry: string; remainingMs: number }): string {
  const names = ['hall-clock']
  if (face.isActive) names.push('hall-clock-active')
  if (face.expiry === 'provisional-expired') names.push('hall-clock-provisional')
  if (face.expiry === 'confirmed-flag' || face.expiry === 'offline-local-flag') names.push('hall-clock-flag')
  if (face.expiry === 'running' && face.isActive && face.remainingMs <= 30_000) names.push('hall-clock-low')
  return names.join(' ')
}

function clockNote(face: { isActive: boolean; expiry: string; remainingMs: number }): string {
  if (face.expiry === 'provisional-expired') return ' · provisional'
  if (face.expiry === 'confirmed-flag' || face.expiry === 'offline-local-flag') return ' · flag'
  if (face.expiry === 'running' && face.isActive && face.remainingMs <= 30_000) return ' · low'
  return ''
}

function formatMs(ms: number): string {
  const whole = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
