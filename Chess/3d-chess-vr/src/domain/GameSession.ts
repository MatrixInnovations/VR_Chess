import type { Color } from './Color'
import { Side } from './Color'
import { Board } from './Board'
import { ChessClock } from './ChessClock'
import { FirstRunGuide } from './FirstRunGuide'
import type { Move } from './Move'
import { Observable } from './Observable'
import type { PieceType } from './Piece'
import { LocalPlayer, LichessPlayer, Player } from './Player'
import { Position } from './Position'
import { Uci } from './Uci'
import { LichessClient, type SeekColor } from '../lichess/LichessClient'
import type { ClockSnapshot, GameFullEvent, IncomingChallenge } from '../lichess/LichessModels'

export type Phase = 'lobby' | 'seeking' | 'playing' | 'over'
export type PlayKind = 'offline' | 'lichess'
export type DrawOffer = 'none' | 'incoming' | 'outgoing'

export class GameResult {
  title: string
  detail: string

  constructor(title: string, detail: string) {
    this.title = title
    this.detail = detail
  }
}

export class HeldPoint {
  x: number
  y: number
  z: number

  constructor(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
  }
}

export class GameSession extends Observable {
  board = Board.initial()
  clock = ChessClock.untimed()
  phase: Phase = 'lobby'
  playKind: PlayKind = 'offline'
  turn: Color = 'white'
  seat: Color = 'white'
  white: Player = new LocalPlayer('white', 'You')
  black: Player = new LocalPlayer('black', 'Guest')
  selectedUid: number | null = null
  legal: Move[] = []
  heldUid: number | null = null
  heldPoint: HeldPoint | null = null
  pending: Move | null = null
  gameOver: GameResult | null = null
  status = 'The hall is set.'
  accountName: string | null = null
  incoming: IncomingChallenge | null = null
  seeking: string | null = null
  drawOffer: DrawOffer = 'none'
  gameId: string | null = null
  freeLook = false
  snap = true
  clockTap = 0
  clockTapSide: Color | null = null
  history: string[] = []
  private takebackDeclined = false

  constructor(
    private readonly lichess: LichessClient,
    readonly guide: FirstRunGuide,
  ) {
    super()
    this.lichess.setListener({
      onAccount: (username) => this.onAccount(username),
      onSeeking: (message) => this.onSeeking(message),
      onGameStart: (gameId, color) => this.onGameStart(gameId, color),
      onGameFull: (event) => this.onGameFull(event),
      onGameState: (state) => this.onGameState(state),
      onIncoming: (challenge) => this.onIncoming(challenge),
      onNotice: (message) => this.onNotice(message),
      onError: (message) => this.onNotice(message),
    })
  }

  async boot(): Promise<void> {
    await this.lichess.resume()
  }

  login(): void {
    void this.lichess.login()
  }

  logout(): void {
    void this.lichess.logout()
  }

  startOffline(minutes: number | null, increment: number): void {
    this.lichess.stopGame()
    this.lichess.cancelSeek()
    this.gameId = null
    this.playKind = 'offline'
    this.board = Board.initial()
    this.turn = 'white'
    this.seat = 'white'
    this.white = new LocalPlayer('white', 'You')
    this.black = new LocalPlayer('black', 'Guest')
    this.clock = minutes == null ? ChessClock.untimed() : ChessClock.local(minutes, increment)
    if (this.clock.enabled) this.clock.start('white')
    this.resetControls()
    this.phase = 'playing'
    this.gameOver = null
    this.drawOffer = 'none'
    this.snap = true
    this.history = []
    this.status = 'White to move. Pass and play from this seat.'
    this.guide.presentIfNew()
    this.notify()
  }

  returnToLobby(): void {
    this.lichess.stopGame()
    this.lichess.cancelSeek()
    this.gameId = null
    this.phase = 'lobby'
    this.seeking = null
    this.gameOver = null
    this.board = Board.initial()
    this.turn = 'white'
    this.history = []
    this.clock = ChessClock.untimed()
    this.resetControls()
    this.snap = true
    this.status = 'The hall is set.'
    this.notify()
  }

  seek(minutes: number, increment: number, color: SeekColor): void {
    if (!this.accountName) {
      this.status = 'Log in with Lichess to sit down with a real opponent.'
      this.notify()
      return
    }
    this.phase = 'seeking'
    this.seeking = `${minutes}+${increment}`
    this.status = `Seeking a ${minutes}+${increment} game…`
    this.notify()
    void this.lichess.seek(minutes, increment, color).catch((error: Error) => {
      this.phase = 'lobby'
      this.seeking = null
      this.onNotice(error.message)
    })
  }

  cancelSeek(): void {
    this.lichess.cancelSeek()
    this.phase = 'lobby'
    this.seeking = null
    this.status = 'Seek cancelled.'
    this.notify()
  }

  challenge(username: string, minutes: number, increment: number, color: SeekColor): void {
    const name = username.trim()
    if (!name) return
    void this.lichess.challenge(name, minutes, increment, color).catch((error: Error) => {
      this.onNotice(error.message)
    })
  }

  acceptChallenge(): void {
    if (!this.incoming) return
    void this.lichess.acceptChallenge(this.incoming.id).catch((error: Error) => {
      this.onNotice(error.message)
    })
  }

  declineChallenge(): void {
    if (!this.incoming) return
    void this.lichess.declineChallenge(this.incoming.id).catch((error: Error) => {
      this.onNotice(error.message)
    })
  }

  toggleFreeLook(): void {
    this.freeLook = !this.freeLook
    this.notify()
  }

  clearSelection(): void {
    this.resetControls()
    this.notify()
  }

  selectSquare(square: Position): void {
    if (this.phase !== 'playing' || this.pending) return
    if (this.selectedUid != null) {
      const chosen = this.legal.find((move) => move.to.equals(square))
      if (chosen) {
        this.commit(chosen)
        return
      }
    }
    const piece = this.board.at(square)
    if (piece && this.canMove(piece.color)) {
      this.selectedUid = piece.uid
      this.legal = this.board.legalMovesFor(piece)
    } else {
      this.selectedUid = null
      this.legal = []
    }
    this.notify()
  }

  beginHold(uid: number): boolean {
    const piece = this.board.pieceByUid(uid)
    if (!piece || !this.canMove(piece.color) || this.pending || this.phase !== 'playing') {
      return false
    }
    this.selectedUid = uid
    this.legal = this.board.legalMovesFor(piece)
    this.heldUid = uid
    this.notify()
    return true
  }

  moveHold(x: number, y: number, z: number): void {
    if (this.heldUid == null) return
    this.heldPoint = new HeldPoint(x, y, z)
  }

  endHold(square: Position | null): void {
    const uid = this.heldUid
    this.heldUid = null
    this.heldPoint = null
    if (uid == null) return
    const piece = this.board.pieceByUid(uid)
    const chosen = piece && square ? this.legal.find((move) => move.to.equals(square)) : undefined
    if (chosen) this.commit(chosen)
    else this.notify()
  }

  tapClock(side: Color): void {
    this.clockTap += 1
    this.clockTapSide = side
    this.notify()
  }

  choosePromotion(type: PieceType): void {
    if (!this.pending) return
    this.commit(this.pending.withPromotion(type))
  }

  resign(): void {
    if (this.phase !== 'playing') return
    const loser = this.playKind === 'lichess' ? this.seat : this.turn
    if (this.playKind === 'lichess' && this.gameId) {
      void this.lichess.resign(this.gameId).catch((error: Error) => this.onNotice(error.message))
    }
    this.finish('Resign', `${Side.label(Side.opposite(loser))} wins`)
  }

  offerDraw(): void {
    if (this.phase !== 'playing') return
    if (this.playKind === 'offline') {
      this.finish('Draw', 'Agreed draw')
      return
    }
    if (!this.gameId) return
    const accept = this.drawOffer === 'incoming'
    void this.lichess.draw(this.gameId, true).catch((error: Error) => this.onNotice(error.message))
    this.drawOffer = accept ? 'none' : 'outgoing'
    this.status = accept ? 'Draw accepted.' : 'Draw offered.'
    this.notify()
  }

  declineDraw(): void {
    if (!this.gameId || this.drawOffer !== 'incoming') return
    void this.lichess.draw(this.gameId, false).catch((error: Error) => this.onNotice(error.message))
    this.drawOffer = 'none'
    this.status = 'Draw declined.'
    this.notify()
  }

  tick(now: number): void {
    if (this.phase !== 'playing') return
    const flagged = this.clock.flag(now)
    if (!flagged) return
    this.finish('Time', `${Side.label(Side.opposite(flagged))} wins on time`)
  }

  opponent(): Player {
    return this.seat === 'white' ? this.black : this.white
  }

  private onAccount(username: string | null): void {
    this.accountName = username
    if (this.phase === 'lobby') {
      this.status = username ? `Logged in as ${username}.` : 'The hall is set.'
    }
    this.notify()
  }

  private onSeeking(message: string | null): void {
    this.seeking = message
    if (!message && this.phase === 'seeking') {
      this.phase = 'lobby'
      this.status = 'No game was found.'
    }
    this.notify()
  }

  private onGameStart(gameId: string, color: Color): void {
    this.lichess.cancelSeek()
    this.gameId = gameId
    this.seat = color
    this.playKind = 'lichess'
    this.phase = 'playing'
    this.incoming = null
    this.seeking = null
    this.status = 'Sitting down…'
    this.takebackDeclined = false
    this.notify()
    this.lichess.watchGame(gameId)
  }

  private onGameFull(event: GameFullEvent): void {
    if (event.variant !== 'standard') {
      this.finish('Unsupported', 'This hall plays standard chess only.')
      return
    }
    const standard = event.initialFen === 'startpos' || event.initialFen.startsWith('rnbqkbnr/pppppppp')
    if (!standard) {
      this.finish('Unsupported', 'Custom positions are not loaded in this hall.')
      return
    }
    this.playKind = 'lichess'
    this.gameId = event.id || this.gameId
    const me = (this.accountName || '').toLowerCase()
    if (event.white.name.toLowerCase() === me) this.seat = 'white'
    else if (event.black.name.toLowerCase() === me) this.seat = 'black'
    this.white = this.playerFor('white', event.white.name, event.white.rating, event.white.title)
    this.black = this.playerFor('black', event.black.name, event.black.rating, event.black.title)
    this.board = Board.initial()
    this.turn = 'white'
    this.history = []
    this.snap = true
    this.resetControls()
    if (event.state.moves.trim()) {
      for (const uci of event.state.moves.trim().split(/\s+/)) this.applyUci(uci, false)
    }
    const timed = event.state.whiteMs > 0 || event.state.blackMs > 0
    this.clock = timed ? new ChessClock(event.state.whiteMs, 0, true) : ChessClock.untimed()
    this.clock.whiteMs = event.state.whiteMs
    this.clock.blackMs = event.state.blackMs
    this.clock.sync(event.state.whiteMs, event.state.blackMs, event.state.live ? this.turn : null)
    this.gameOver = null
    this.drawOffer = 'none'
    if (!event.state.live) {
      this.finishFromState(event.state)
      return
    }
    this.phase = 'playing'
    this.status = `${event.white.name} vs ${event.black.name}. ${Side.label(this.turn)} to move.`
    this.guide.presentIfNew()
    this.notify()
  }

  private onGameState(state: ClockSnapshot): void {
    if (this.playKind !== 'lichess') return
    const remote = state.moves.trim()
    const local = this.history.join(' ')
    if (local && remote !== local && local.startsWith(remote)) {
      return
    }
    if (remote && remote !== local) {
      if (!local || remote.startsWith(local)) {
        const extra = remote.slice(local.length).trim()
        if (extra) {
          for (const uci of extra.split(/\s+/)) this.applyUci(uci, true)
        }
      } else if (!local.startsWith(remote)) {
        this.rebuild(remote)
      }
    }
    if (state.whiteMs || state.blackMs || this.clock.enabled) {
      if (!this.clock.enabled && (state.whiteMs > 0 || state.blackMs > 0)) {
        this.clock = new ChessClock(state.whiteMs, 0, true)
      }
      this.clock.sync(state.whiteMs, state.blackMs, state.live ? this.turn : null)
    }
    this.readOffers(state)
    if (!state.live) {
      this.finishFromState(state)
      return
    }
    this.notify()
  }

  private onIncoming(challenge: IncomingChallenge | null): void {
    this.incoming = challenge
    if (challenge) this.status = `${challenge.challenger} challenged you.`
    this.notify()
  }

  private onNotice(message: string): void {
    this.status = message
    this.notify()
  }

  private readOffers(state: ClockSnapshot): void {
    const incoming = this.seat === 'white' ? state.blackDraw : state.whiteDraw
    if (incoming) this.drawOffer = 'incoming'
    else if (this.drawOffer === 'incoming') this.drawOffer = 'none'
    const takeback = this.seat === 'white' ? state.blackTakeback : state.whiteTakeback
    if (takeback && this.gameId && !this.takebackDeclined) {
      this.takebackDeclined = true
      void this.lichess.declineTakeback(this.gameId)
      this.status = 'Takebacks stay on the board.'
    }
  }

  private rebuild(moves: string): void {
    this.board = Board.initial()
    this.turn = 'white'
    this.history = []
    this.snap = true
    for (const uci of moves.split(/\s+/)) {
      if (uci) this.applyUci(uci, false)
    }
  }

  private commit(move: Move): void {
    const piece = this.board.at(move.from)
    if (piece?.type === 'pawn' && (move.to.y === 0 || move.to.y === 7) && !move.promotion) {
      this.pending = move
      this.heldUid = null
      this.heldPoint = null
      this.status = 'Choose a piece.'
      this.notify()
      return
    }
    const color = move.piece.color
    const uci = Uci.fromMove(move)
    this.board.commit(move)
    this.turn = Side.opposite(color)
    this.history.push(uci)
    this.resetControls()
    if (this.clock.enabled) this.clock.punch(color)
    if (this.playKind === 'lichess' && color === this.seat && this.gameId) {
      void this.lichess.move(this.gameId, uci).catch((error: Error) => this.onNotice(error.message))
    }
    this.afterMove()
  }

  private applyUci(uci: string, animate: boolean): boolean {
    const parsed = Uci.parse(uci)
    const piece = this.board.at(parsed.from)
    if (!piece || piece.color !== this.turn) return false
    let move = this.board.legalMovesFor(piece).find((item) => item.to.equals(parsed.to)) ?? null
    if (!move) return false
    if (parsed.promotion) move = move.withPromotion(parsed.promotion)
    else if (piece.type === 'pawn' && (parsed.to.y === 0 || parsed.to.y === 7)) {
      move = move.withPromotion('queen')
    }
    this.board.commit(move)
    this.turn = Side.opposite(piece.color)
    this.history.push(Uci.fromMove(move))
    this.resetControls()
    if (!animate) this.snap = true
    return true
  }

  private afterMove(): void {
    const outcome = this.board.outcome(this.turn)
    if (outcome === 'checkmate') {
      this.finish('Checkmate', `${Side.label(Side.opposite(this.turn))} wins`)
      return
    }
    if (outcome === 'stalemate') {
      this.finish('Stalemate', 'Drawn game')
      return
    }
    if (outcome === 'insufficient') {
      this.finish('Draw', 'Insufficient material')
      return
    }
    this.status = `${Side.label(this.turn)} to move`
    this.notify()
  }

  private finishFromState(state: ClockSnapshot): void {
    const winner = state.winner ? Side.label(state.winner) : null
    if (state.status === 'mate') this.finish('Checkmate', winner ? `${winner} wins` : 'Checkmate')
    else if (state.status === 'resign') this.finish('Resign', winner ? `${winner} wins` : 'Resign')
    else if (state.status === 'timeout' || state.status === 'outoftime') {
      this.finish('Time', winner ? `${winner} wins on time` : 'Time')
    } else if (state.status === 'stalemate') this.finish('Stalemate', 'Drawn game')
    else if (state.status === 'draw' || state.status === 'insufficientMaterialClaim') {
      this.finish('Draw', 'Drawn game')
    } else if (state.status === 'aborted' || state.status === 'noStart') {
      this.finish('Aborted', 'The game did not start.')
    } else this.finish('Game over', winner ? `${winner} wins` : 'The game has ended.')
  }

  private finish(title: string, detail: string): void {
    if (this.phase === 'over') return
    this.phase = 'over'
    this.gameOver = new GameResult(title, detail)
    this.clock.stop()
    this.resetControls()
    this.status = `${title}. ${detail}`
    this.notify()
  }

  private playerFor(color: Color, name: string, rating: number | null, title: string | null): Player {
    if (color === this.seat) return new LocalPlayer(color, name)
    return new LichessPlayer(color, name, rating, title)
  }

  private canMove(color: Color): boolean {
    if (this.phase !== 'playing' || color !== this.turn) return false
    if (this.playKind === 'offline') return true
    return color === this.seat
  }

  private resetControls(): void {
    this.selectedUid = null
    this.legal = []
    this.heldUid = null
    this.heldPoint = null
    this.pending = null
  }
}
