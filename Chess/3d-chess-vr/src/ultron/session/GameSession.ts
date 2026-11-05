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
import type { BoardGameEvent, IncomingEvent, SeekRequest, StreamFault } from '../lichess/apiTypes';
import { GameStatuses } from '../lichess/BoardEventParser';
import { BoardTimeControl } from '../lichess/BoardTimeControl';
import { LocalPlayer } from '../players/LocalPlayer';
import type { CancelReason, Color, GameStatusName, LegalMove, MoveIntent, Square, VariantKey, ViewMode } from '../contracts/types';
import { Squares } from '../contracts/squares';
import { CommandLedger } from './CommandLedger';
import { MoveArbiter } from './MoveArbiter';
import { PieceTable, promotionLetter } from './PieceTable';

/** Shared construction fields. */
export interface SessionDependencies {
  readonly rules: IChessRules;
  readonly ids: IIdSource;
  readonly now: () => number;
  readonly sessionId: string;
  readonly clock?: IClockPort;
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
    if (!decision.ok || this.ledger.blocked(decision.uci)) return false;
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
    this.moveAbort?.abort();
    this.seekAbort?.abort();
    this.player?.cancelSeek();
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
      this.applyAuthoritative(event.state, true);
      return;
    }
    this.applyAuthoritative(event.state, false);
  }

  /**
   * @param event - Incoming event stream.
   */
  onIncoming(event: IncomingEvent): void {
    if (event.type === 'gameStart') {
      this.gameId = event.gameId;
      this.ourColor = event.color;
      this.boardCompatible = event.compatBoard !== false;
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
    this.pendingUci = uci;
    const result = await this.player.playMove(this.gameId, uci, controller.signal);
    if (this.disposed || controller.signal.aborted || result.code === 'cancelled') {
      return { ok: false, reason: 'cancelled' };
    }
    if (result.ok) {
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
      return { ok: false, reason: 'unauthorized' };
    }
    this.ledger.release(uci);
    this.pendingUci = null;
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

  private abort(id: string): SubmitResult {
    if (this.outcome || this.mode === 'offline') return { ok: false, reason: this.outcome ? 'terminal' : 'online-only' };
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
      if (state.moves.includes(this.pendingUci)) {
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
    this.clocks = { whiteMs: state.wtime, blackMs: state.btime, whiteIncMs: state.winc, blackIncMs: state.binc };
    this.whiteOfferingDraw = state.wdraw;
    this.blackOfferingDraw = state.bdraw;
    this.clock?.sync({ whiteMs: state.wtime, blackMs: state.btime }, this.now());
    if (terminal) {
      this.finish(state.status, state.winner);
      return;
    }
    this.phase = 'playing';
    this.outcome = null;
    this.clockProvisional = state.wtime === 0 || state.btime === 0;
    this.positionVersion += 1;
    this.snapshotValue = this.capture();
    if (this.clockProvisional) {
      this.emit({ type: 'clock-provisional', color: state.wtime === 0 ? 'white' : 'black' });
    }
  }

  private assignColor(whiteId: string, blackId: string): void {
    if (this.ourColor === 'white' || this.ourColor === 'black') return;
    if (this.accountId && this.accountId === whiteId) this.ourColor = 'white';
    if (this.accountId && this.accountId === blackId) this.ourColor = 'black';
  }

  private finish(status: GameStatusName, winner: Color | null): void {
    this.phase = 'finished';
    this.outcome = { status, winner };
    this.clockProvisional = false;
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
