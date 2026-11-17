import type { IClockPort } from '../contracts/IClockPort';
import type { IChessRules } from '../contracts/IChessRules';
import type { IGameSessionViewPort } from '../contracts/IGameSessionViewPort';
import type { ILichessInbox, IOnlinePlayer } from '../contracts/IOnlinePlayer';
import type { IGameSession } from '../contracts/IGameSession';
import type { IGameCommandSink } from '../contracts/IInputController';
import type { IIdSource } from '../contracts/ports';
import type { GameSnapshot } from '../contracts/GameSnapshot';
import { GameSnapshot as Snapshot } from '../contracts/GameSnapshot';
import type { SessionEvent, SubmitResult } from '../contracts/SessionEvent';
import type { SessionIntent } from '../contracts/SessionIntent';
import type { BoardGameEvent, ChallengeRequest, IncomingEvent, SeekRequest, StreamFault } from '../lichess/apiTypes';
import { GameStatuses } from '../lichess/BoardEventParser';
import { BoardTimeControl } from '../lichess/BoardTimeControl';
import { LocalPlayer } from '../players/LocalPlayer';
import type { CancelReason, Color, GameStatusName, LegalMove, MoveIntent, Square, VariantKey, ViewMode } from '../contracts/types';
import { Squares } from '../contracts/squares';
import { CommandLedger } from './CommandLedger';
import { MoveArbiter } from './MoveArbiter';
import { PieceTable, promotionLetter } from './PieceTable';

/**
 * Declines a Lichess takeback once.
 * The board does not rewind. Online sessions call this when a gameState raises
 * `wtakeback` or `btakeback`. Offline sessions never construct one.
 */
export interface ITakebackEtiquette {
  /**
   * @param gameId - Lichess game id.
   */
  declineTakeback(gameId: string): void;
}

/** Shared construction fields. */
export interface SessionDependencies {
  readonly rules: IChessRules;
  readonly ids: IIdSource;
  readonly now: () => number;
  readonly sessionId: string;
  readonly clock?: IClockPort;
  /** Optional. Offline games omit it. */
  readonly etiquette?: ITakebackEtiquette;
}

/** Two humans, one device, no engine and no network. */
export interface OfflineSessionOptions extends SessionDependencies {
  readonly white: LocalPlayer;
  readonly black: LocalPlayer;
}

/** One authenticated human versus a Lichess opponent. */
export interface OnlineSessionOptions extends SessionDependencies {
  readonly player: IOnlinePlayer;
}

/**
 * The only object that validates and submits moves.
 * A view toggle calls {@link GameSession.noteViewMode} and keeps this instance.
 * Online, the board changes when the Lichess stream says so, not when HTTP accepts a post.
 */
export class GameSession implements IGameCommandSink, IGameSession, ILichessInbox {
  readonly id: string;
  private readonly rules: IChessRules;
  private readonly ids: IIdSource;
  private readonly now: () => number;
  private readonly clock: IClockPort | null;
  private readonly etiquette: ITakebackEtiquette | null;
  private readonly mode: 'offline' | 'online';
  private readonly player: IOnlinePlayer | null;
  private readonly listeners = new Set<(event: SessionEvent) => void>();
  private readonly ledger = new CommandLedger();
  private readonly pieces = new PieceTable();
  private readonly arbiter: MoveArbiter;
  private snapshotValue: GameSnapshot;
  private positionVersion = 0;
  private phase: GameSnapshot['phase'] = 'idle';
  private viewMode: ViewMode | null = null;
  private ourColor: Color | 'both' | null = null;
  private gameId: string | null = null;
  private variant: VariantKey = 'standard';
  private variantSupported = true;
  private boardCompatible = true;
  private initialFen = 'startpos';
  private clocks: GameSnapshot['clocks'] = null;
  private clockProvisional = false;
  private outcome: GameSnapshot['outcome'] = null;
  private whiteOfferingDraw = false;
  private blackOfferingDraw = false;
  private lastSignature = '';
  private pendingUci: string | null = null;
  /** Index in the move list where the in-flight move must appear. */
  private pendingPly = 0;
  /** When set, a `gameStart` for any other id is someone else's ongoing game. */
  private expectedGameId: string | null = null;
  /** One Board API socket for this session. finish() uses a later generation. */
  private readonly clockGeneration = 1;
  /** Move list we have already estimated a clock for. A shorter stream prefix must not rewind it. */
  private optimisticMoves: readonly string[] = [];
  private lastTakebackKey = '';
  private unauthorized = false;
  private disposed = false;
  private seekAbort: AbortController | null = null;
  private moveAbort: AbortController | null = null;
  private lastCancel: CancelReason | null = null;

  private constructor(options: SessionDependencies, mode: 'offline' | 'online', player: IOnlinePlayer | null) {
    this.id = options.sessionId;
    this.rules = options.rules;
    this.ids = options.ids;
    this.now = options.now;
    this.clock = options.clock ?? null;
    this.etiquette = options.etiquette ?? null;
    this.mode = mode;
    this.player = player;
    this.arbiter = new MoveArbiter(this.rules);
    this.ids.next();
    if (mode === 'offline') {
      this.phase = 'playing';
      this.ourColor = 'both';
    }
    this.snapshotValue = this.capture();
  }

  /**
   * @param options - Two local humans and a rules engine.
   * @returns A session that never touches the network.
   */
  static offline(options: OfflineSessionOptions): GameSession {
    if (options.white.color !== 'white' || options.black.color !== 'black') {
      throw new Error('Offline session needs one white local player and one black local player');
    }
    return new GameSession(options, 'offline', null);
  }

  /**
   * @param options - Rules plus the Lichess player.
   * @returns A session whose position follows the Board API stream.
   */
  static online(options: OnlineSessionOptions): GameSession {
    const session = new GameSession(options, 'online', options.player);
    options.player.bindInbox(session);
    return session;
  }

  /** @returns The latest immutable snapshot. */
  get snapshot(): GameSnapshot {
    return this.snapshotValue;
  }

  /**
   * @param listener - Observer. It cannot submit.
   * @returns Unsubscribe.
   */
  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** @returns Legal moves for voice and highlight code. */
  legalMoveCandidates(): readonly LegalMove[] {
    return this.rules.legalMoves();
  }

  /**
   * @param square - Origin square.
   * @returns Legal moves from that square.
   */
  legalMovesFrom(square: string): readonly LegalMove[] {
    return this.legalMoveCandidates().filter((move) => move.from === square);
  }

  /**
   * @param square - Destination square.
   * @returns Legal moves to that square. More than one means the user must name the origin.
   */
  legalMovesTo(square: string): readonly LegalMove[] {
    return this.legalMoveCandidates().filter((move) => move.to === square);
  }

  /**
   * Read-only facade for Vision. The returned object has no submit method.
   * @returns A view port bound to this same session.
   */
  asViewPort(): IGameSessionViewPort {
    return {
      id: this.id,
      getSnapshot: () => this.snapshot,
      legalMoveCandidates: () => this.legalMoveCandidates(),
      subscribe: (listener) => this.subscribe(listener),
    };
  }

  /**
   * Record a seated/immersive toggle without resetting the game.
   * @param mode - View mode chosen by Vision's toggle.
   */
  noteViewMode(mode: ViewMode): void {
    if (this.disposed) return;
    this.viewMode = mode;
    this.snapshotValue = this.capture();
    this.emit({ type: 'view-mode', mode });
  }

  /**
   * @param atMs - Current time. Offline only; a flagged clock can end the game.
   */
  tick(atMs: number): void {
    if (!this.clock || this.mode !== 'offline' || this.phase !== 'playing' || this.disposed) return;
    const reading = this.clock.read(atMs);
    if (!reading.flagged) return;
    if (this.rules.opponentHasMatingMaterial(reading.flagged)) {
      const winner: Color = reading.flagged === 'white' ? 'black' : 'white';
      this.finish('outoftime', winner);
      return;
    }
    this.finish('draw', null);
  }

  /**
   * Validate and maybe submit one intent.
   * @param intent - Move, cancel, resign, or abort.
   */
  async submit(intent: SessionIntent): Promise<SubmitResult> {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    if (!intent.id.trim()) return { ok: false, reason: 'invalid-command' };
    if (intent.kind === 'cancel') return this.cancel(intent.id);
    if (intent.kind === 'resign') return this.resign(intent.id, intent.seat);
    if (intent.kind === 'abort') return this.abort(intent.id);
    return this.submitMove(intent);
  }

  /**
   * Legal hall squares for one piece.
   * @param pieceId - Id from {@link GameSession.getPieces}.
   */
  getLegalDestinations(pieceId: string): readonly Square[] {
    return this.pieces.destinations(pieceId, this.legalMoveCandidates());
  }

  /**
   * Accept one grab or voice intent. False means nothing was submitted.
   * @param intent - Shared move intent. `source` may be `voice`.
   */
  submitMoveIntent(intent: MoveIntent): boolean {
    if (this.disposed || this.outcome || this.unauthorized) return false;
    if (!Squares.isOnBoard(intent.from) || !Squares.isOnBoard(intent.to)) return false;
    const piece = this.pieces.find(intent.pieceId);
    if (!piece || !Squares.equal(piece.square, intent.from)) return false;
    const from = Squares.toAlgebraic(intent.from);
    const to = Squares.toAlgebraic(intent.to);
    if (!from || !to) return false;
    if (this.ledger.has(intent.intentId)) return false;
    const decision = this.arbiter.decide({
      intent: {
        kind: 'move',
        id: intent.intentId,
        source: intent.source,
        from,
        to,
        promotion: promotionLetter(intent.promotion),
        seat: this.mode === 'offline' ? piece.color : undefined,
      },
      mode: this.mode,
      ourColor: this.ourColor,
      terminal: this.outcome !== null,
      phase: this.phase,
      variantSupported: this.variantSupported,
      boardCompatible: this.boardCompatible,
      duplicateCommand: false,
    });
    if (!decision.ok) {
      if (decision.reason === 'promotion-required') {
        this.emit({ type: 'promotion-required', intentId: intent.intentId, from, to });
      }
      return false;
    }
    if (this.ledger.blocked(decision.uci)) return false;
    if (this.mode === 'offline') {
      const played = this.playLocal(intent.intentId, decision);
      return played.ok && played.kind === 'move';
    }
    void this.playOnline(intent.intentId, decision.uci);
    return true;
  }

  /**
   * Drop a grab. Piece placement stays where the last accepted move left it.
   * @param reason - Why the gesture stopped.
   */
  cancelPendingMove(reason: CancelReason): void {
    this.lastCancel = reason;
  }

  /** @returns Copies of the pieces currently on the board. */
  getPieces(): readonly import('../contracts/types').PieceSnapshot[] {
    return this.pieces.getPieces();
  }

  /** @returns The last cancel reason, if any. */
  getLastCancelReason(): CancelReason | null {
    return this.lastCancel;
  }

  /**
   * @param request - Rapid, classical, or correspondence seek. Blitz is refused locally.
   */
  async seek(request: SeekRequest): Promise<SubmitResult> {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    if (!this.player) return { ok: false, reason: 'offline-only' };
    const issue = BoardTimeControl.validateSeek(request);
    if (issue) return { ok: false, reason: 'invalid-time-control' };
    const commandId = this.ids.next();
    const controller = new AbortController();
    this.seekAbort = controller;
    this.phase = 'seeking';
    this.snapshotValue = this.capture();
    const result = await this.player.seek(request, controller.signal);
    if (controller.signal.aborted || result.code === 'cancelled') {
      return { ok: true, kind: 'cancelled', commandId };
    }
    if (!result.ok) {
      if (result.code === 'unauthorized') this.unauthorized = true;
      return { ok: false, reason: result.code === 'unauthorized' ? 'unauthorized' : 'rejected-by-lichess' };
    }
    this.emit({ type: 'seek', action: 'opened' });
    return { ok: true, kind: 'seek-opened', commandId };
  }

  /**
   * Challenge one Lichess account. Offline sessions refuse this.
   * @param username - Opponent username.
   * @param request - Clock in seconds, or correspondence days.
   */
  async challenge(username: string, request: ChallengeRequest): Promise<SubmitResult> {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    if (!this.player) return { ok: false, reason: 'offline-only' };
    if (BoardTimeControl.validateChallenge(request)) return { ok: false, reason: 'invalid-time-control' };
    const commandId = this.ids.next();
    this.phase = 'challenging';
    this.snapshotValue = this.capture();
    const result = await this.player.challenge(username, request, new AbortController().signal);
    if (!result.ok) {
      return { ok: false, reason: result.code === 'unauthorized' ? 'unauthorized' : 'rejected-by-lichess' };
    }
    return { ok: true, kind: 'challenge-sent', commandId };
  }

  /**
   * Accept an inbound challenge. The game itself arrives on the event stream.
   * @param challengeId - Challenge id the player already has.
   */
  async acceptChallenge(challengeId: string): Promise<SubmitResult> {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    if (!this.player) return { ok: false, reason: 'offline-only' };
    const commandId = this.ids.next();
    const result = await this.player.acceptChallenge(challengeId, new AbortController().signal);
    if (!result.ok) return { ok: false, reason: 'rejected-by-lichess' };
    return { ok: true, kind: 'challenge-accepted', commandId };
  }

  /**
   * @param username - Account username.
   * @param id - Account id.
   */
  onAccount(username: string, id: string): void {
    this.accountId = id;
    this.accountName = username;
  }

  /**
   * @param event - Board stream event. This is the online source of truth.
   */
  onBoardEvent(event: BoardGameEvent): void {
    if (event.type === 'opponentGone') return;
    if (event.type === 'gameFull') {
      this.gameId = event.id;
      this.initialFen = event.initialFen;
      this.variant = event.variant;
      this.variantSupported = event.variant === 'standard' || event.variant === 'fromPosition';
      this.assignColor(event.whiteId, event.blackId);
      this.whiteSeat = event.white ?? null;
      this.blackSeat = event.black ?? null;
      this.applyAuthoritative(event.state, true);
      return;
    }
    this.applyAuthoritative(event.state, false);
  }

  /**
   * The only game this session should adopt from the event stream.
   * Lichess sends `gameStart` for every ongoing game when the stream opens.
   * @param gameId - Id from the seek, challenge, or the first new game after those.
   */
  expectGame(gameId: string): void {
    this.expectedGameId = gameId;
  }

  /**
   * @param event - Incoming event stream.
   */
  onIncoming(event: IncomingEvent): void {
    if (event.type === 'gameStart') {
      if (this.expectedGameId && event.gameId !== this.expectedGameId) return;
      if (!this.expectedGameId && this.gameId && this.gameId !== event.gameId) return;
      this.expectedGameId = event.gameId;
      this.gameId = event.gameId;
      this.ourColor = event.color;
      this.boardCompatible = event.compatBoard !== false;
      this.phase = 'playing';
      this.snapshotValue = this.capture();
      this.emit({ type: 'game-started', gameId: event.gameId });
      return;
    }
    if (event.type === 'challenge') this.emit({ type: 'challenge', challengeId: event.challengeId, action: 'received' });
    if (event.type === 'challengeCanceled') this.emit({ type: 'challenge', challengeId: event.challengeId, action: 'canceled' });
    if (event.type === 'challengeDeclined') this.emit({ type: 'challenge', challengeId: event.challengeId, action: 'declined' });
  }

  /**
   * @param fault - Stream fault. 401 latches until a new session is used.
   */
  onStreamFault(fault: StreamFault): void {
    if (fault.code === 'unauthorized') this.unauthorized = true;
    this.emit({ type: 'stream-fault', code: fault.code, message: fault.message });
  }

  /**
   * Record an offline draw offer from `seat`.
   * The game ends only after both seats have offered. Online games use the Board API instead.
   * @param seat - Side making the offer.
   * @returns True when the offer completed the game as a draw.
   */
  offerOfflineDraw(seat: Color): boolean {
    if (this.disposed || this.mode !== 'offline' || this.outcome || this.phase !== 'playing') return false;
    if (seat === 'white') this.whiteOfferingDraw = true;
    else this.blackOfferingDraw = true;
    if (this.whiteOfferingDraw && this.blackOfferingDraw) {
      this.finish('draw', null);
      return true;
    }
    this.snapshotValue = this.capture();
    return false;
  }

  /** Abort streams and timers. Does not post a move. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.moveAbort?.abort();
    this.seekAbort?.abort();
    this.player?.cancelSeek();
    this.player?.dispose();
    this.clock?.dispose();
    this.emit({ type: 'disposed' });
  }

  private accountId = '';
  private accountName = '';

  private whiteSeat: import('../lichess/apiTypes').SeatFace | null = null;

  private blackSeat: import('../lichess/apiTypes').SeatFace | null = null;

  /**
   * The other seat in a live game.
   * AI opponents are labeled and have no profile link. Null until a gameFull arrives.
   */
  opponentCard(): {
    id: string;
    username: string;
    title: string | null;
    rating: number | null;
    ai: boolean;
    aiLevel: number | null;
    ourColor: 'white' | 'black';
  } | null {
    if (this.ourColor !== 'white' && this.ourColor !== 'black') return null;
    const seat = this.ourColor === 'white' ? this.blackSeat : this.whiteSeat;
    if (!seat) return null;
    if (seat.id && seat.id === this.accountId) return null;
    return {
      id: seat.id,
      username: seat.name,
      title: seat.title,
      rating: seat.rating,
      ai: seat.ai,
      aiLevel: seat.aiLevel ?? null,
      ourColor: this.ourColor,
    };
  }

  private async submitMove(intent: Extract<SessionIntent, { kind: 'move' }>): Promise<SubmitResult> {
    if (this.unauthorized) return { ok: false, reason: 'unauthorized' };
    if (this.ledger.has(intent.id)) return { ok: false, reason: 'duplicate-command' };
    const decision = this.arbiter.decide({
      intent,
      mode: this.mode,
      ourColor: this.ourColor,
      terminal: this.outcome !== null,
      phase: this.phase,
      variantSupported: this.variantSupported,
      boardCompatible: this.boardCompatible,
      duplicateCommand: false,
    });
    if (!decision.ok) {
      if (decision.reason === 'origin-required') {
        this.emit({ type: 'origin-required', intentId: intent.id, to: intent.to, candidates: decision.candidates ?? [] });
      }
      if (decision.reason === 'promotion-required' && decision.from) {
        this.emit({ type: 'promotion-required', intentId: intent.id, from: decision.from, to: intent.to });
      }
      this.emit({ type: 'move-rejected', intentId: intent.id, reason: decision.reason });
      return { ok: false, reason: decision.reason, candidates: decision.candidates };
    }
    if (this.ledger.blocked(decision.uci)) return { ok: false, reason: 'duplicate-move' };
    if (this.mode === 'offline') return this.playLocal(intent.id, decision);
    return this.playOnline(intent.id, decision.uci);
  }

  private playLocal(id: string, decision: Extract<import('./MoveArbiter').ArbiterDecision, { ok: true }>): SubmitResult {
    const played = this.rules.play({ from: decision.from, to: decision.to, promotion: decision.promotion });
    if (!played) return { ok: false, reason: 'illegal' };
    this.ledger.begin(id, played.uci, 'confirmed');
    this.lastMoves = [...this.lastMoves, played.uci];
    this.pieces.applyUci(played.uci);
    this.clock?.onMovePlayed(this.oppositeTurnAfterMove(), this.now());
    if (this.rules.isCheckmate()) {
      const winner: Color = this.rules.turn() === 'white' ? 'black' : 'white';
      this.finish('mate', winner);
    } else if (this.rules.isStalemate() || this.rules.isDraw()) {
      this.finish(this.rules.isStalemate() ? 'stalemate' : 'draw', null);
    } else {
      this.positionVersion += 1;
      this.snapshotValue = this.capture();
    }
    this.emit({ type: 'move-confirmed', uci: played.uci });
    return { ok: true, kind: 'move', commandId: id, uci: played.uci, authority: 'local' };
  }

  private oppositeTurnAfterMove(): Color {
    return this.rules.turn() === 'white' ? 'black' : 'white';
  }

  private async playOnline(id: string, uci: string): Promise<SubmitResult> {
    if (!this.player || !this.gameId) return { ok: false, reason: 'no-active-game' };
    const controller = new AbortController();
    this.moveAbort = controller;
    this.ledger.begin(id, uci, 'pending');
    this.pendingPly = this.lastMoves.length;
    this.pendingUci = uci;
    const result = await this.player.playMove(this.gameId, uci, controller.signal);
    if (this.disposed || controller.signal.aborted || result.code === 'cancelled') {
      return { ok: false, reason: 'cancelled' };
    }
    if (result.ok) {
      if (this.pendingUci === uci) {
        const mover = this.rules.turn();
        this.optimisticMoves = [...this.lastMoves, uci];
        this.clock?.onMovePlayed(mover, this.now());
      }
      return { ok: true, kind: 'move', commandId: id, uci, authority: 'lichess-accepted' };
    }
    if (result.code === 'network') {
      this.emit({ type: 'move-unconfirmed', intentId: id, uci });
      return { ok: true, kind: 'move', commandId: id, uci, authority: 'lichess-unconfirmed' };
    }
    if (result.code === 'unauthorized') {
      this.unauthorized = true;
      this.ledger.release(uci);
      this.pendingUci = null;
      this.emit({ type: 'move-rejected', intentId: id, reason: 'unauthorized' });
      return { ok: false, reason: 'unauthorized' };
    }
    this.ledger.release(uci);
    this.pendingUci = null;
    this.emit({ type: 'move-rejected', intentId: id, reason: 'rejected-by-lichess' });
    return { ok: false, reason: 'rejected-by-lichess' };
  }

  private cancel(id: string): SubmitResult {
    this.moveAbort?.abort();
    this.seekAbort?.abort();
    this.player?.cancelSeek();
    this.emit({ type: 'seek', action: 'closed' });
    return { ok: true, kind: 'cancelled', commandId: id };
  }

  private async resign(id: string, seat: Color | undefined): Promise<SubmitResult> {
    if (this.outcome) return { ok: false, reason: 'terminal' };
    if (this.mode === 'offline') {
      if (!seat) return { ok: false, reason: 'seat-required' };
      this.finish('resign', seat === 'white' ? 'black' : 'white');
      return { ok: true, kind: 'resign-sent', commandId: id };
    }
    if (!this.player || !this.gameId) return { ok: false, reason: 'no-active-game' };
    const result = await this.player.resign(this.gameId, new AbortController().signal);
    if (!result.ok) return { ok: false, reason: 'rejected-by-lichess' };
    return { ok: true, kind: 'resign-sent', commandId: id };
  }

  private async abort(id: string): Promise<SubmitResult> {
    if (this.outcome || this.mode === 'offline') return { ok: false, reason: this.outcome ? 'terminal' : 'online-only' };
    if (!this.player || !this.gameId) return { ok: false, reason: 'no-active-game' };
    const result = await this.player.abortGame(this.gameId, new AbortController().signal);
    if (!result.ok) return { ok: false, reason: 'rejected-by-lichess' };
    return { ok: true, kind: 'abort-sent', commandId: id };
  }

  private applyAuthoritative(state: BoardGameEvent extends never ? never : import('../lichess/apiTypes').GameStatePayload, full: boolean): void {
    const signature = [
      this.gameId,
      state.moves.join(' '),
      state.wtime,
      state.btime,
      state.winc,
      state.binc,
      state.status,
      state.winner,
      state.wdraw,
      state.bdraw,
      state.wtakeback === true,
      state.btakeback === true,
      this.variant,
    ].join('|');
    if (signature === this.lastSignature) return;
    const previousMoves = this.lastMoves.join(' ');
    const replayed = this.rules.replay(this.initialFen, state.moves);
    if (!replayed) {
      this.emit({ type: 'reconciliation-error', message: 'Lichess move list could not be replayed' });
      return;
    }
    this.lastMoves = [...state.moves];
    if (this.initialFen === 'startpos') this.pieces.replay(state.moves);
    this.lastSignature = signature;
    if (this.pendingUci) {
      if (state.moves[this.pendingPly] === this.pendingUci) {
        this.ledger.confirm(this.pendingUci);
        this.emit({ type: 'move-confirmed', uci: this.pendingUci });
        this.pendingUci = null;
      } else if (full || state.moves.join(' ') !== previousMoves) {
        // A full snapshot, or a move list that moved on without us, is authoritative.
        // A clock-only gameState is not, because it can arrive before our post lands.
        this.ledger.release(this.pendingUci);
        this.pendingUci = null;
      }
    }
    const terminal = GameStatuses.isTerminal(state.status);
    this.noteTakeback(state);
    const staleClock = this.clockTimesAreStale(state.moves);
    if (!staleClock) {
      this.clocks = { whiteMs: state.wtime, blackMs: state.btime, whiteIncMs: state.winc, blackIncMs: state.binc };
      this.whiteOfferingDraw = state.wdraw;
      this.blackOfferingDraw = state.bdraw;
      if (!this.pushClockStream(full, state)) {
        this.clock?.sync(
          { whiteMs: state.wtime, blackMs: state.btime, sideToMove: this.rules.turn() },
          this.now(),
        );
      }
      this.optimisticMoves = [...state.moves];
      this.clockProvisional = state.wtime === 0 || state.btime === 0;
    }
    if (terminal) {
      this.finish(state.status, state.winner);
      return;
    }
    this.phase = 'playing';
    this.outcome = null;
    this.positionVersion += 1;
    this.snapshotValue = this.capture();
    this.emit({ type: 'position' });
    if (this.clockProvisional) {
      this.emit({ type: 'clock-provisional', color: state.wtime === 0 ? 'white' : 'black' });
    }
  }

  /**
   * True when `incoming` is a strict prefix of the moves whose clock was already estimated.
   * Applying that event's `wtime` / `btime` would put the clock back on the side that just moved.
   * @param incoming - Move list on the stream event.
   */
  /**
   * Hand the stream line to the clock port when it understands generations.
   * @returns True when the port accepted the line, so `sync` must not also run.
   */
  private pushClockStream(full: boolean, state: import('../lichess/apiTypes').GameStatePayload): boolean {
    const receiver = this.clock as { receive?: (generation: number, event: object) => void } | null;
    if (!receiver?.receive) return false;
    const moves = state.moves.join(' ');
    const fields = {
      moves,
      wtime: state.wtime,
      btime: state.btime,
      winc: state.winc,
      binc: state.binc,
      status: state.status,
      winner: state.winner,
    };
    if (full) {
      receiver.receive(this.clockGeneration, {
        type: 'gameFull',
        initialFen: this.initialFen,
        clock: { initial: Math.max(state.wtime, state.btime), increment: state.winc },
        state: fields,
      });
      return true;
    }
    receiver.receive(this.clockGeneration, { type: 'gameState', ...fields });
    return true;
  }

  private clockTimesAreStale(incoming: readonly string[]): boolean {
    const optimistic = this.optimisticMoves;
    if (incoming.length >= optimistic.length) return false;
    for (let index = 0; index < incoming.length; index += 1) {
      if (incoming[index] !== optimistic[index]) return false;
    }
    return true;
  }

  /**
   * Decline a takeback once per flag. The piece table is not rewound.
   * @param state - Authoritative game state.
   */
  private noteTakeback(state: import('../lichess/apiTypes').GameStatePayload): void {
    if (!this.etiquette || !this.gameId) return;
    if (state.wtakeback !== true && state.btakeback !== true) return;
    const key = `${this.gameId}:${state.wtakeback === true}:${state.btakeback === true}`;
    if (this.lastTakebackKey === key) return;
    this.lastTakebackKey = key;
    this.etiquette.declineTakeback(this.gameId);
  }

  private assignColor(whiteId: string, blackId: string): void {
    if (this.ourColor === 'white' || this.ourColor === 'black') return;
    if (this.accountId && this.accountId === whiteId) this.ourColor = 'white';
    if (this.accountId && this.accountId === blackId) this.ourColor = 'black';
  }

  private finish(status: GameStatusName, winner: Color | null): void {
    if (this.outcome) {
      this.snapshotValue = this.capture();
      return;
    }
    this.phase = 'finished';
    this.outcome = { status, winner };
    this.clockProvisional = false;
    this.clock?.finish?.(status, winner);
    this.clock?.stop();
    this.positionVersion += 1;
    this.snapshotValue = this.capture();
    this.emit({ type: 'game-finished', status, winner });
  }

  private capture(): GameSnapshot {
    return Snapshot.of({
      sessionId: this.id,
      mode: this.mode,
      phase: this.phase,
      fen: this.rules.fen(),
      moves: this.lastMoves,
      turn: this.rules.turn(),
      ourColor: this.ourColor,
      legalMoves: this.phase === 'playing' ? this.rules.legalMoves() : [],
      clocks: this.clocks,
      clockProvisional: this.clockProvisional,
      outcome: this.outcome,
      gameId: this.gameId,
      positionVersion: this.positionVersion,
      viewMode: this.viewMode,
      whiteOfferingDraw: this.whiteOfferingDraw,
      blackOfferingDraw: this.blackOfferingDraw,
      variant: this.variant,
    });
  }

  private lastMoves: readonly string[] = [];

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/**
 * Holds the single session a view toggle is allowed to see.
 * Attaching a different session is rejected so immersive mode cannot reset the game.
 */
export class GameSessionHost {
  private session: GameSession | null = null;

  /**
   * @param session - The session that must survive the toggle.
   */
  attach(session: GameSession): void {
    if (this.session && this.session !== session) {
      throw new Error('A view toggle must reuse the existing GameSession');
    }
    this.session = session;
  }

  /** @returns The attached session, if any. */
  get current(): GameSession | null {
    return this.session;
  }

  /**
   * @param mode - Next view mode.
   */
  setView(mode: ViewMode): void {
    if (!this.session) throw new Error('No GameSession is attached');
    this.session.noteViewMode(mode);
  }

  /** Dispose the session and drop the reference. */
  dispose(): void {
    this.session?.dispose();
    this.session = null;
  }
}
