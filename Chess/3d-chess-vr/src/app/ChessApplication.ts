import { MeshStandardMaterial } from 'three'

import { ChessClockPort } from '../../../../fridae-clock/src/ChessClockPort'
import { ChessPhraseParser } from '../input/voice/ChessPhraseParser'
import { VoiceCommandInput } from '../input/voice/VoiceCommandInput'
import { WebSpeechRecognitionAdapter } from '../input/voice/WebSpeechRecognitionAdapter'
import type { BoardPick } from '../mad-scientist/input/picking'
import type { IPointerPicker } from '../mad-scientist/input/picking'
import { RaycastPicker } from '../mad-scientist/input/RaycastPicker'
import { HallRuntime } from '../mad-scientist/runtime/HallRuntime'
import { ClockViewMirror } from '../mad-scientist/hall/ClockViewMirror'
import { FetchHttpTransport } from './FetchHttpTransport'
import { FridaeReadModel } from './FridaeReadModel'
import { HallBoardSync } from './HallBoardSync'
import { LichessTable } from './LichessTable'
import { PhysicalChessClock } from './PhysicalChessClock'
import { tourSteps } from './TourScript'
import { VoiceSessionPort } from './VoiceSessionPort'
import { XrInputPump, type XrPoseSource } from './XrInputPump'
import type { XrSessionPort } from './XrSessionPort'
import { MemoryKeyValueStore } from '../ultron/auth/MemoryKeyValueStore'
import { WebStorageKeyValueStore } from '../ultron/auth/WebStorageKeyValueStore'
import type { IHttpTransport } from '../ultron/contracts/http'
import type { IKeyValueStore } from '../ultron/contracts/ports'
import { Squares } from '../ultron/contracts/squares'
import type { PromotionPiece } from '../ultron/contracts/types'
import { LichessPlayer } from '../ultron/players/LichessPlayer'
import { LocalPlayer } from '../ultron/players/LocalPlayer'
import { ChessJsRules } from '../ultron/rules/ChessJsRules'
import { GameSession, GameSessionHost } from '../ultron/session/GameSession'
import { SequentialIds } from '../ultron/session/SequentialIds'
import { ChessClockView } from '../vision/ChessClockView'
import { HudOverlay } from '../vision/HudOverlay'
import { MenuController } from '../vision/MenuController'
import { ModeToggleControl } from '../vision/ModeToggleControl'
import { TourGuide } from '../vision/TourGuide'
import { ViewModeManager } from '../vision/ViewModeManager'
import { GameResult } from '../vision/screens/gameover/GameResult'
import { VisionShell } from '../vision/screens/shell/VisionShell'
import { ViewModeHostAdapter } from '../vision/screens/ViewModeHostAdapter'
import { WebXrHallSession } from './WebXrHallSession'

/** A DOM surface the pointer listens on. */
export interface PointerSurface {
  addEventListener(type: string, listener: (event: PointerSurfaceEvent) => void): void
  removeEventListener(type: string, listener: (event: PointerSurfaceEvent) => void): void
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
}

/** Fields read off a pointer event. */
export interface PointerSurfaceEvent {
  clientX: number
  clientY: number
  pointerId: number
}

/** Options for {@link ChessApplication}. */
export interface ChessApplicationOptions {
  readonly now?: () => number
  readonly whiteMs?: number
  readonly blackMs?: number
  readonly incrementMs?: number
  readonly xr?: XrSessionPort
  readonly transport?: IHttpTransport
  readonly storage?: IKeyValueStore
  readonly clientId?: string
  readonly redirectUri?: string
  readonly speech?: WebSpeechRecognitionAdapter
}

/**
 * Forwards picks once the hall exists.
 * The runtime needs a picker in its constructor, and the raycaster needs the hall.
 */
class PickerBridge implements IPointerPicker {
  /** Raycaster installed after the hall exists. */
  inner: RaycastPicker | null = null

  /**
   * @param x - Pixel x.
   * @param y - Pixel y.
   */
  pick(x: number, y: number): BoardPick {
    if (!this.inner) return { square: null, piece: null, clock: false, world: null }
    return this.inner.pick(x, y)
  }
}

/**
 * The seated hall: one game, one clock, and the controls around them.
 *
 * Pass-and-play is the game you get on load. Lichess replaces that session
 * only when the player seeks or accepts a challenge. The 3D / immersive
 * switch calls {@link GameSession.noteViewMode} on the same session and does
 * not build another clock.
 */
export class ChessApplication {
  /** Hall, grab, and device input. */
  readonly runtime: HallRuntime
  /** Fridae clock read by Vision and by the table clock. */
  readonly readModel: FridaeReadModel
  /** Digit view of the clock. It does not advance time. */
  readonly clockView: ChessClockView
  /** Table clock meshes. */
  readonly physicalClock: PhysicalChessClock
  /** HUD suppression rules. */
  readonly hud: HudOverlay
  /** Menu screens. Replaced when a new game changes the session id. */
  menu: MenuController
  /** First-run prompts. */
  readonly tour: TourGuide
  /** Mode button model. Rebuilt when a new game replaces the manager. */
  toggle: ModeToggleControl
  /** Sign-in, lobby, and game-over controllers. */
  readonly shell: VisionShell
  /** Lichess auth and lobby. The token stays in the OAuth client. */
  readonly table: LichessTable
  /** WebXR or a test double. */
  readonly xr: XrSessionPort
  /** Status line for voice, draw, and XR failures. */
  message = ''
  /** Set when a pawn move needs a promotion choice. */
  promotion: { from: string; to: string } | null = null

  private session: GameSession
  private host: GameSessionHost
  private modes: ViewModeManager
  private viewPort: ReturnType<GameSession['asViewPort']>
  private readonly sync: HallBoardSync
  private readonly xrPump: XrInputPump
  private readonly voicePort: VoiceSessionPort
  private readonly voice: VoiceCommandInput
  private readonly mirror = new ClockViewMirror()
  private readonly now: () => number
  private readonly ids = new SequentialIds('hall')
  private readonly bridge = new PickerBridge()
  private readonly picker: RaycastPicker
  private revisionValue = 0
  private paintedWhite = -1
  private paintedBlack = -1
  private paintedSide = ''
  private reconciledVersion = -1
  private xrBusy = false
  private readonly watchers = new Set<() => void>()
  private unlisten: (() => void) | null = null
  private surface: PointerSurface | null = null
  private readonly offlineClock: { whiteMs: number; blackMs: number; incrementMs: number }

  /**
   * @param options - Clock, XR, and Lichess ports. Defaults play a 10+0 game offline.
   */
  constructor(options: ChessApplicationOptions = {}) {
    this.now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()))
    this.offlineClock = {
      whiteMs: options.whiteMs ?? 10 * 60 * 1000,
      blackMs: options.blackMs ?? 10 * 60 * 1000,
      incrementMs: options.incrementMs ?? 0,
    }
    this.xr = options.xr ?? new WebXrHallSession()
    this.xr.onSessionEnd(() => {
      this.runtime.grab.cancel('detached')
      this.runtime.controllers.cancel('detached')
      this.runtime.hands.cancel('detached')
      this.xrPump.reset()
      if (!this.modes.mode.isImmersive()) return
      this.modes.switchTo('desktop3d')
      this.runtime.hall.setSceneryVisible(true)
      this.hud.setViewMode('desktop3d')
      this.host.setView('seated')
      this.message = ''
      this.bump()
    })
    const transport = options.transport ?? new FetchHttpTransport()
    const storage = options.storage ?? ChessApplication.browserStore()
    this.table = new LichessTable(
      {
        openOnline: () => this.openOnline(),
        cancelSeek: () => this.cancelSeek(),
        retry: () => this.retryOnline(),
      },
      transport,
      storage,
      options.clientId ?? process.env.NEXT_PUBLIC_LICHESS_CLIENT_ID ?? '',
      options.redirectUri ?? ChessApplication.redirectUri(),
    )
    const clock = this.armOfflineClock()
    this.session = this.offlineSession(clock)
    this.readModel = new FridaeReadModel(clock)
    this.readModel.refresh(this.now())
    this.clockView = new ChessClockView(this.readModel)
    this.host = new GameSessionHost()
    this.host.attach(this.session)
    this.viewPort = this.session.asViewPort()
    this.modes = new ViewModeManager(this.viewPort, this.readModel)
    this.hud = new HudOverlay(this.modes.mode)
    this.hud.open()
    this.menu = new MenuController(this.viewPort)
    this.tour = new TourGuide(tourSteps())
    this.tour.start()
    this.toggle = new ModeToggleControl(this.modes, { isXrAvailable: () => true })
    this.shell = new VisionShell({
      auth: this.table,
      lobby: this.table,
      connection: this.table,
      seekIds: this.table.waits,
      viewHost: new ViewModeHostAdapter(this.modes),
      bindSession: () => this.viewPort,
      onOnline: (_session, color) => {
        this.shell.board.mountLive(this.viewPort, color, false)
        this.bump()
      },
      onOffline: () => {
        this.newPassAndPlay()
      },
      wasOffline: () => this.session.snapshot.mode === 'offline',
    })
    this.shell.navigator.showBoard(this.viewPort)
    this.shell.navigator.subscribe(() => this.bump())
    this.shell.board.mountLive(this.viewPort, null, true)
    this.runtime = new HallRuntime({
      session: this.session,
      picker: this.bridge,
      now: () => this.now(),
      onAccepted: (pieceId, to) => this.sync.hold(pieceId, to),
    })
    this.picker = new RaycastPicker(this.runtime.hall.camera, this.runtime.hall, { width: 1, height: 1 })
    this.bridge.inner = this.picker
    this.sync = new HallBoardSync(this.runtime.hall, this.session, this.runtime.animator)
    this.xrPump = new XrInputPump(this.picker, this.runtime.controllers, this.runtime.hands)
    this.physicalClock = new PhysicalChessClock()
    this.physicalClock.object.position.copy(this.runtime.hall.clockTap.object.position)
    this.runtime.hall.root.add(this.physicalClock.object)
    this.fadeTapPlaceholder()
    this.voicePort = new VoiceSessionPort(this.session, (text) => {
      this.message = text
      this.bump()
    })
    this.voice = new VoiceCommandInput(
      options.speech ?? new WebSpeechRecognitionAdapter(),
      new ChessPhraseParser(),
      this.voicePort,
    )
    this.listenTo(this.session)
    this.frame(this.now())
  }

  /**
   * Browser boot: session storage for the OAuth token, fetch for Lichess.
   * @returns An application ready to mount.
   */
  static boot(): ChessApplication {
    return new ChessApplication()
  }

  /** Current session. A view toggle does not replace this object. */
  get game(): GameSession {
    return this.session
  }

  /**
   * Read-only view of the current session.
   * The same object the navigator and the view-mode host share.
   */
  get view(): ReturnType<GameSession['asViewPort']> {
    return this.viewPort
  }

  /** Active view mode name. */
  get presentation(): 'desktop3d' | 'immersive' {
    return this.modes.mode.name
  }

  /** Monotonic counter for React. It changes when the hall publishes something. */
  get revision(): number {
    return this.revisionValue
  }

  /**
   * Hear publishes.
   * @param listener - Called after a move, a menu change, or a clock frame that bumped.
   * @returns Unsubscribe.
   */
  watch(listener: () => void): () => void {
    this.watchers.add(listener)
    return () => {
      this.watchers.delete(listener)
    }
  }

  /**
   * Advance the offline clock, slides, and the table-clock paint.
   * @param atMs - Timestamp. Tests pass the same clock as `now`.
   */
  frame(atMs?: number): void {
    const at = atMs ?? this.now()
    this.session.tick(at)
    this.readModel.refresh(at)
    this.runtime.frame(at)
    const fridae = this.readModel.fridae()
    if (fridae) this.physicalClock.apply(this.mirror.present(fridae))
    const version = this.session.snapshot.positionVersion
    if (version !== this.reconciledVersion) {
      this.sync.reconcile()
      this.reconciledVersion = version
    }
    const white = Math.floor(this.readModel.whiteMs / 1000)
    const black = Math.floor(this.readModel.blackMs / 1000)
    const side = this.readModel.active
    if (white !== this.paintedWhite || black !== this.paintedBlack || side !== this.paintedSide) {
      this.paintedWhite = white
      this.paintedBlack = black
      this.paintedSide = side
      this.bump()
    }
  }

  /**
   * Highlight `pieceId` and its legal squares.
   * @param pieceId - Id from the session.
   * @returns False when the piece is not on the board.
   */
  selectPiece(pieceId: string): boolean {
    const piece = this.session.getPieces().find((item) => item.id === pieceId)
    if (!piece) return false
    this.runtime.grab.cancel('detached')
    return this.runtime.grab.begin(piece)
  }

  /**
   * Play an algebraic move through the session.
   * @param from - Origin such as `e2`.
   * @param to - Destination such as `e4`.
   * @param promotion - Required when the move promotes.
   * @returns False when the session rejects it.
   */
  playAlgebraic(from: string, to: string, promotion?: PromotionPiece): boolean {
    const origin = Squares.fromAlgebraic(from)
    const target = Squares.fromAlgebraic(to)
    if (!origin || !target) return false
    const piece = this.session
      .getPieces()
      .find((item) => item.square.file === origin.file && item.square.rank === origin.rank)
    if (!piece) return false
    const accepted = this.session.submitMoveIntent({
      intentId: this.ids.next(),
      pieceId: piece.id,
      from: origin,
      to: target,
      source: 'pointer',
      promotion,
    })
    if (accepted && this.session.snapshot.mode === 'online') this.sync.hold(piece.id, target)
    this.sync.reconcile()
    this.bump()
    return accepted
  }

  /**
   * Finish a promotion the session asked for.
   * @param piece - Queen, rook, bishop, or knight. Never assumed.
   */
  choosePromotion(piece: PromotionPiece): boolean {
    if (!this.promotion) return false
    const { from, to } = this.promotion
    this.promotion = null
    return this.playAlgebraic(from, to, piece)
  }

  /** Start a fresh pass-and-play game. The previous session is disposed. */
  newPassAndPlay(): void {
    const clock = this.armOfflineClock()
    const session = this.offlineSession(clock)
    this.install(session, clock, true)
  }

  /**
   * Resign the side to move.
   * Online, Lichess confirms the result on the stream.
   */
  async resign(): Promise<void> {
    const seat = this.session.snapshot.turn
    await this.session.submit({ kind: 'resign', id: this.ids.next(), source: 'pointer', seat })
    this.bump()
  }

  /** Offer a draw, or accept one already on the table. */
  async offerDraw(): Promise<void> {
    const snap = this.session.snapshot
    if (snap.mode === 'offline') {
      const agreed = this.session.offerOfflineDraw(snap.turn)
      this.message = agreed ? 'Draw agreed.' : `${snap.turn} offers a draw.`
      this.bump()
      return
    }
    if (!snap.gameId) return
    await this.table.offerOrAcceptDraw(snap.gameId)
    this.message = 'Draw offer sent to Lichess.'
    this.bump()
  }

  /** Decline an online draw offer. */
  async declineDraw(): Promise<void> {
    const gameId = this.session.snapshot.gameId
    if (!gameId) return
    await this.table.declineDraw(gameId)
    this.message = 'Draw declined.'
    this.bump()
  }

  /**
   * Enter or leave immersive VR.
   * A failed headset request leaves the session and the clock where they were
   * and puts the presentation back on the desktop.
   */
  async toggleImmersive(): Promise<void> {
    if (this.xrBusy) return
    this.xrBusy = true
    try {
      await this.switchImmersive()
    } finally {
      this.xrBusy = false
    }
  }

  /** Flip the headset presentation. A second press waits until this one settles. */
  private async switchImmersive(): Promise<void> {
    this.toggle.press()
    if (this.modes.mode.isImmersive()) {
      const ok = await this.xr.enterVR()
      if (!ok) {
        this.modes.switchTo('desktop3d')
        this.host.setView('seated')
        this.hud.setViewMode('desktop3d')
        this.message = this.xr.lastError
        this.bump()
        return
      }
      this.host.setView('immersive')
      this.hud.setViewMode('immersive')
      this.shell.navigator.switchInGameView('immersive')
      this.message = ''
    } else {
      await this.xr.exit()
      this.runtime.hall.setSceneryVisible(true)
      this.host.setView('seated')
      this.hud.setViewMode('desktop3d')
      this.shell.navigator.switchInGameView('desktop3d')
      this.message = ''
    }
    this.bump()
  }

  /**
   * Ask for passthrough and hide the virtual room when it starts.
   * The board, pieces, and clock stay.
   */
  async enterPassthrough(): Promise<void> {
    const ok = await this.xr.enterAR()
    if (!ok) {
      this.message = this.xr.lastError
      this.bump()
      return
    }
    this.runtime.hall.setSceneryVisible(false)
    this.modes.switchTo('immersive')
    this.host.setView('immersive')
    this.hud.setViewMode('immersive')
    this.shell.navigator.switchInGameView('immersive')
    this.message = 'Passthrough. The table stays; the room is hidden.'
    this.bump()
  }

  /** Open or close the menu. Does not change the position. */
  toggleMenu(): void {
    if (this.menu.isOpen) this.menu.close()
    else this.menu.openMain()
    this.bump()
  }

  /** Advance the tour. A legal move is still allowed. */
  tourNext(): void {
    this.tour.next()
    this.bump()
  }

  /** Hide the tour and keep the step for resume. */
  tourSkip(): void {
    this.tour.skip()
    this.bump()
  }

  /** Start the microphone. Denial is a status message, not an exception. */
  async listen(): Promise<void> {
    await this.voice.start()
    const clarifying = this.message.startsWith('Confirm') || this.message.startsWith('Which') || this.message.startsWith("Didn't")
    if (!clarifying) {
      const status = this.voice.speechStatus()
      if (status === 'denied') {
        this.message = 'Allow microphone access in the browser site settings. Spoken moves need desktop Chrome or Edge.'
      } else if (!this.voice.isActive()) {
        this.message = 'Voice is not supported in this browser. Spoken moves need desktop Chrome or Edge, not Quest.'
      } else {
        this.message = 'Listening on desktop Chrome or Edge. Voice is not available in Quest Browser. Try “move pawn to e4”.'
      }
    }
    this.bump()
  }

  /** Open the Lichess sign-in screen and redraw. */
  openSignIn(): void {
    this.shell.navigator.showSignIn()
    this.bump()
  }

  /** Start PKCE and redraw when the authorize URL is ready. */
  async beginSignIn(): Promise<void> {
    await this.shell.signIn.begin()
    this.bump()
  }

  /** Open the lobby from a stored session and redraw. Signed-out players see sign-in. */
  openLobby(): void {
    this.shell.signIn.continueWithSession()
    if (this.shell.authPresenter.snapshot().phase === 'denied') this.shell.navigator.showSignIn()
    this.bump()
  }

  /** Seek from the lobby and redraw after the request settles. */
  async seekFromLobby(): Promise<void> {
    await this.shell.lobby.seek()
    this.bump()
  }

  /** Challenge from the lobby and redraw after the request settles. */
  async challengeFromLobby(): Promise<void> {
    await this.shell.lobby.challenge()
    this.bump()
  }

  /** Pass and play from the lobby and redraw. */
  passAndPlayFromLobby(): void {
    this.shell.lobby.startOfflineDemo()
    this.bump()
  }

  /** Leave a screen for the board and redraw. */
  backToBoard(): void {
    this.shell.navigator.showBoard(this.viewPort)
    this.bump()
  }

  /** Open the lobby screen and redraw. */
  backToLobby(): void {
    this.shell.navigator.showLobby()
    this.bump()
  }

  /** Cancel a seek or challenge and redraw after the request settles. */
  async cancelWait(): Promise<void> {
    await this.shell.waiting.cancel()
    this.bump()
  }

  /** Ask the error screen to try the stream again and redraw after it settles. */
  async retryConnection(): Promise<void> {
    await this.shell.errors.retry()
    this.bump()
  }

  /** Restart the tour and redraw. */
  replayTour(): void {
    this.tour.start()
    this.bump()
  }

  /** Stop the microphone. */
  async stopListening(): Promise<void> {
    await this.voice.stop()
    this.bump()
  }

  /**
   * Finish a Lichess redirect when the URL contains a code.
   * @param href - The page URL.
   */
  async completeRedirectIfPresent(href: string): Promise<void> {
    let url: URL
    try {
      url = new URL(href)
    } catch {
      return
    }
    if (!url.searchParams.has('code') || !url.searchParams.has('state')) return
    await this.shell.signIn.complete(href)
    if (typeof history !== 'undefined') history.replaceState(null, '', `${url.pathname}${url.hash}`)
    this.bump()
  }

  /**
   * Listen for mouse and touch drags on `surface`.
   * @param surface - The WebGL canvas.
   */
  attachPointer(surface: PointerSurface): void {
    this.detachPointer()
    this.surface = surface
    const rect = surface.getBoundingClientRect()
    this.picker.setViewport({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    surface.addEventListener('pointerdown', this.onDown)
    surface.addEventListener('pointermove', this.onMove)
    surface.addEventListener('pointerup', this.onUp)
    surface.addEventListener('pointercancel', this.onCancel)
    this.runtime.pointer.attach()
    this.runtime.controllers.attach()
    this.runtime.hands.attach()
  }

  /** Remove pointer listeners. */
  detachPointer(): void {
    const surface = this.surface
    if (!surface) return
    surface.removeEventListener('pointerdown', this.onDown)
    surface.removeEventListener('pointermove', this.onMove)
    surface.removeEventListener('pointerup', this.onUp)
    surface.removeEventListener('pointercancel', this.onCancel)
    this.runtime.pointer.detach()
    this.surface = null
  }

  /**
   * Feed one frame of WebXR poses.
   * @param sources - Controllers and hands.
   */
  pushXr(sources: readonly XrPoseSource[]): void {
    this.xrPump.push(sources)
    const hands = sources.some((source) => source.kind === 'hand' && source.tracked)
    this.hud.setHandsActive(hands)
  }

  private readonly onDown = (event: PointerSurfaceEvent): void => {
    this.dispatch('down', event)
  }

  private readonly onMove = (event: PointerSurfaceEvent): void => {
    this.dispatch('move', event)
  }

  private readonly onUp = (event: PointerSurfaceEvent): void => {
    this.dispatch('up', event)
  }

  private readonly onCancel = (event: PointerSurfaceEvent): void => {
    this.dispatch('cancel', event)
  }

  private dispatch(type: 'down' | 'move' | 'up' | 'cancel', event: PointerSurfaceEvent): void {
    const surface = this.surface
    if (!surface) return
    const rect = surface.getBoundingClientRect()
    this.picker.setViewport({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    this.runtime.pointer.handle({
      type,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pointerId: event.pointerId,
    })
    this.bump()
  }

  private openOnline(): GameSession {
    const tokens = this.table.tokenSource()
    if (!tokens?.getAccessToken()) throw new Error('Not signed in')
    const player = new LichessPlayer(this.table.client, tokens)
    const clock = new ChessClockPort('online')
    clock.arm({ whiteMs: 0, blackMs: 0, incrementMs: 0 }, 'white', this.now())
    const session = GameSession.online({
      rules: new ChessJsRules(),
      ids: new SequentialIds('online'),
      now: this.now,
      sessionId: this.ids.next(),
      clock,
      player,
      etiquette: this.table,
    })
    this.install(session, clock, false)
    return session
  }

  private cancelSeek(): void {
    void this.session.submit({ kind: 'cancel', id: this.ids.next(), source: 'pointer' })
  }

  private async retryOnline(): Promise<void> {
    this.table.noteOnline()
    this.message = 'Reconnecting depends on the Lichess stream. Start the seek again if the game did not resume.'
    this.bump()
  }

  private install(session: GameSession, clock: ChessClockPort, offline: boolean): void {
    this.unlisten?.()
    this.host.dispose()
    this.session = session
    this.readModel.bind(clock)
    this.readModel.refresh(this.now())
    this.host = new GameSessionHost()
    this.host.attach(session)
    this.viewPort = session.asViewPort()
    this.modes = new ViewModeManager(this.viewPort, this.readModel, this.modes.mode)
    this.host.setView(this.modes.mode.isImmersive() ? 'immersive' : 'seated')
    this.toggle = new ModeToggleControl(this.modes, {
      isXrAvailable: () => {
        const probe = this.xr as { isSupported?: () => boolean }
        return probe.isSupported ? probe.isSupported() : true
      },
    })
    this.hud.setViewMode(this.modes.mode)
    this.shell.bindViewHost(new ViewModeHostAdapter(this.modes))
    const color = session.snapshot.ourColor === 'white' || session.snapshot.ourColor === 'black' ? session.snapshot.ourColor : null
    this.shell.board.mountLive(this.viewPort, offline ? null : color, offline)
    this.shell.navigator.showBoard(this.viewPort)
    this.menu = new MenuController(this.viewPort)
    this.runtime.grab.retarget(session)
    this.sync.retarget(session)
    this.voicePort.retarget(session)
    this.voice.reset()
    this.listenTo(session)
    this.sync.reconcile()
    this.bump()
  }

  private listenTo(session: GameSession): void {
    this.unlisten?.()
    this.unlisten = session.subscribe((event) => {
      if (event.type === 'move-rejected') this.sync.releaseHolds()
      if (event.type === 'promotion-required') this.promotion = { from: event.from, to: event.to }
      if (event.type === 'move-confirmed') {
        this.promotion = null
        this.tour.acknowledgeLegalMove()
      }
      if (event.type === 'origin-required') this.message = 'Name the piece’s square as well.'
      if (event.type === 'stream-fault') {
        this.table.noteFault(event.code, event.message)
        this.shell.errors.sync()
      }
      if (event.type === 'game-finished' && this.shell.navigator.session) {
        this.shell.gameOver.show(ChessApplication.resultFor(event.status, event.winner))
      }
      this.sync.reconcile()
      this.bump()
    })
  }

  private offlineSession(clock: ChessClockPort): GameSession {
    return GameSession.offline({
      rules: new ChessJsRules(),
      ids: new SequentialIds('offline'),
      now: this.now,
      sessionId: this.ids.next(),
      clock,
      white: new LocalPlayer('white', 'White'),
      black: new LocalPlayer('black', 'Black'),
    })
  }

  private armOfflineClock(): ChessClockPort {
    const clock = new ChessClockPort('offline')
    clock.arm(
      {
        whiteMs: this.offlineClock.whiteMs,
        blackMs: this.offlineClock.blackMs,
        incrementMs: this.offlineClock.incrementMs,
      },
      'white',
      this.now(),
    )
    return clock
  }

  private fadeTapPlaceholder(): void {
    const material = this.runtime.hall.clockTap.object.material
    if (material instanceof MeshStandardMaterial) {
      material.transparent = true
      material.opacity = 0
      material.depthWrite = false
    }
  }

  private bump(): void {
    this.revisionValue += 1
    for (const listener of this.watchers) listener()
  }

  private static resultFor(status: string, winner: 'white' | 'black' | null): GameResult {
    if (status === 'mate' && winner) return GameResult.checkmate(winner)
    if (status === 'resign' && winner) return GameResult.resign(winner)
    if ((status === 'outoftime' || status === 'timeout') && winner) return GameResult.timeout(winner)
    if (status === 'stalemate') return GameResult.stalemate()
    if (status === 'aborted' || status === 'noStart') return GameResult.abort()
    return GameResult.draw()
  }

  private static browserStore(): IKeyValueStore {
    if (typeof sessionStorage === 'undefined') return new MemoryKeyValueStore()
    return new WebStorageKeyValueStore(sessionStorage)
  }

  private static redirectUri(): string {
    if (typeof window === 'undefined') return 'http://localhost:3000/'
    return `${window.location.origin}/`
  }
}
