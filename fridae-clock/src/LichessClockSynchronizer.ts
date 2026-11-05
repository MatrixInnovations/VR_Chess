import {
  ChessClock,
  isLichessGameStatus,
  type AcceptedClockMove,
  type AuthoritativeClockSnapshot,
  type Color,
  type LichessGameStatus,
} from "./ChessClock.ts"
import type { LichessSpeed } from "./LichessTimeControl.ts"

/**
 * Narrow Board API stream shapes owned by this lane until Ultron publishes
 * the shared GameSession and LichessClient contracts. These are not a second
 * HTTP client. Nothing here opens a socket or sends a move.
 *
 * Ordering that the Board API actually supplies:
 * - NDJSON on one connection is ordered. The first line is `gameFull`.
 * - `gameState` is sent for a move, a draw offer, or the end of the game.
 * - There is no per-event sequence number. The move list is the revision,
 *   and a later line on the same connection is not stale just because a
 *   remaining time went up (lag compensation and give-time both do that).
 * - A shorter move list on that same connection is a rewind, such as a takeback.
 * - Reconnect starts a new generation with `beginStream`. A late line from an
 *   older generation is stale. The new `gameFull` is the correction.
 *
 * `wtime` and `btime` are remaining milliseconds and already include Fischer
 * increment for moves present in `moves`. `winc` and `binc` are that increment
 * in milliseconds, the same unit as `clock.increment`. This lane does not
 * recompute lag compensation or berserk; both arrive already applied.
 */
export interface LichessBoardStreamEvent {
  readonly type: string
  readonly id?: string
  readonly initialFen?: string
  readonly clock?: { readonly initial: number; readonly increment: number } | null
  readonly daysPerTurn?: number
  readonly speed?: string
  readonly state?: LichessGameStateFields
  readonly moves?: string
  readonly wtime?: number
  readonly btime?: number
  readonly winc?: number
  readonly binc?: number
  readonly status?: string
  readonly winner?: string
  readonly expiration?: { readonly idleMillis: number; readonly millisToMove: number }
  readonly gone?: boolean
  readonly claimWinInSeconds?: number
  readonly text?: string
}

/** Fields shared by a nested `gameFull.state` and a top-level `gameState`. */
export interface LichessGameStateFields {
  readonly type?: string
  readonly moves?: unknown
  readonly wtime?: unknown
  readonly btime?: unknown
  readonly winc?: unknown
  readonly binc?: unknown
  readonly status?: unknown
  readonly winner?: unknown
  readonly expiration?: unknown
}

/** Protocol events for tests and for a future session adapter. Vision should subscribe to the clock, not to these. */
export type SyncEvent =
  | {
      readonly type: "ignored"
      readonly reason:
        | "staleGeneration"
        | "awaitingGameFull"
        | "invalidFen"
        | "invalidClock"
        | "chatLine"
        | "notAClockEvent"
        | "disposed"
    }
  | { readonly type: "opened"; readonly generation: number }
  | { readonly type: "applied"; readonly generation: number; readonly ply: number }
  | { readonly type: "opponentGone" }
  | { readonly type: "disposed" }

const SPEEDS: ReadonlySet<string> = new Set([
  "ultraBullet",
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "correspondence",
])

/**
 * Translates Board API stream lines and GameSession move decisions into
 * {@link ChessClock} calls. It does not own the clock's lifetime: disposing
 * the synchronizer leaves the clock running so a view switch or a new stream
 * can keep the same instance.
 */
export class LichessClockSynchronizer {
  private readonly clock: ChessClock
  private readonly listeners = new Set<(event: SyncEvent) => void>()
  private activeGeneration: number | null = null
  private awaitingFull = false
  private initialFen = "startpos"
  private kind: AuthoritativeClockSnapshot["kind"] = "unlimited"
  private speed: LichessSpeed | null = null
  private daysPerTurn: number | null = null
  private disposed = false

  /**
   * @param clock - Clock that receives parsed readings and accepted moves.
   */
  constructor(clock: ChessClock) {
    this.clock = clock
  }

  /**
   * Subscribe to protocol events.
   * @param listener - Called for ignored lines, applied snapshots, and dispose.
   * @returns Unsubscribe.
   */
  subscribe(listener: (event: SyncEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Open a stream generation. Call this before consuming a reconnected socket.
   * A generation older than the active one is ignored.
   * @param generation - Caller-supplied connection id. The Board API does not send one.
   */
  beginStream(generation: number): void {
    if (this.disposed) {
      this.emit({ type: "ignored", reason: "disposed" })
      return
    }
    if (this.activeGeneration !== null && generation < this.activeGeneration) {
      this.emit({ type: "ignored", reason: "staleGeneration" })
      return
    }
    this.activeGeneration = generation
    this.awaitingFull = true
    this.emit({ type: "opened", generation })
  }

  /**
   * Consume one NDJSON line.
   * @param generation - Generation of the socket that produced the line.
   * @param event - A Board API stream object, or an unknown `type` which is ignored.
   */
  receive(generation: number, event: LichessBoardStreamEvent): void {
    if (this.disposed) {
      this.emit({ type: "ignored", reason: "disposed" })
      return
    }
    if (this.activeGeneration === null) {
      if (event.type !== "gameFull") {
        this.emit({ type: "ignored", reason: "awaitingGameFull" })
        return
      }
      this.activeGeneration = generation
      this.awaitingFull = false
      this.applyFull(generation, event)
      return
    }
    if (generation !== this.activeGeneration) {
      this.emit({ type: "ignored", reason: "staleGeneration" })
      return
    }
    if (this.awaitingFull && event.type !== "gameFull") {
      this.emit({ type: "ignored", reason: "awaitingGameFull" })
      return
    }
    if (event.type === "gameFull") {
      this.awaitingFull = false
      this.applyFull(generation, event)
      return
    }
    if (event.type === "gameState") {
      this.applyState(generation, event)
      return
    }
    if (event.type === "chatLine") {
      this.emit({ type: "ignored", reason: "chatLine" })
      return
    }
    if (event.type === "opponentGone") {
      const claim = event.claimWinInSeconds
      this.clock.noteOpponentGone({
        gone: event.gone === true,
        claimWinInSeconds: typeof claim === "number" ? claim : null,
      })
      this.emit({ type: "opponentGone" })
      return
    }
    this.emit({ type: "ignored", reason: "notAClockEvent" })
  }

  /**
   * Forward a GameSession decision. Rejected and duplicate decisions do not increment twice.
   * @param move - Decision from the session. This method does not contact Lichess.
   */
  acceptedMove(move: AcceptedClockMove): void {
    if (this.disposed) {
      this.emit({ type: "ignored", reason: "disposed" })
      return
    }
    this.clock.applyAcceptedMove(move)
  }

  /**
   * Ignore later stream lines. The chess clock stays alive.
   */
  dispose(): void {
    this.disposed = true
    this.emit({ type: "disposed" })
    this.listeners.clear()
  }

  private applyFull(generation: number, event: LichessBoardStreamEvent): void {
    const fen = typeof event.initialFen === "string" ? event.initialFen : "startpos"
    const state = event.state
    const position = this.position(fen, state?.moves)
    if (position === null || state === undefined) {
      this.emit({ type: "ignored", reason: "invalidFen" })
      return
    }
    const kind = this.classify(event)
    const speed = this.speedFrom(event.speed)
    const days = kind === "correspondence" ? event.daysPerTurn ?? null : null
    const built = this.snapshotFrom(generation, state, position, kind, speed, days)
    if (built === null) {
      this.emit({ type: "ignored", reason: "invalidClock" })
      return
    }
    this.initialFen = fen
    this.kind = kind
    this.speed = speed
    this.daysPerTurn = days
    this.clock.applyAuthoritativeSnapshot(built)
    this.emit({ type: "applied", generation, ply: position.ply })
  }

  private applyState(generation: number, event: LichessBoardStreamEvent): void {
    const position = this.position(this.initialFen, event.moves)
    if (position === null) {
      this.emit({ type: "ignored", reason: "invalidFen" })
      return
    }
    const built = this.snapshotFrom(
      generation,
      event,
      position,
      this.kind,
      this.speed,
      this.daysPerTurn,
    )
    if (built === null) {
      this.emit({ type: "ignored", reason: "invalidClock" })
      return
    }
    this.clock.applyAuthoritativeSnapshot(built)
    this.emit({ type: "applied", generation, ply: position.ply })
  }

  private classify(event: LichessBoardStreamEvent): AuthoritativeClockSnapshot["kind"] {
    // A clock object wins over daysPerTurn. Unlimited is the absence of both,
    // even when `speed` says correspondence and `wtime` is Int.MaxValue.
    if (event.clock != null) return "realtime"
    const days = event.daysPerTurn
    if (typeof days === "number" && days > 0) return "correspondence"
    return "unlimited"
  }

  private snapshotFrom(
    generation: number,
    state: LichessGameStateFields,
    position: { side: Color; ply: number },
    kind: AuthoritativeClockSnapshot["kind"],
    speed: LichessSpeed | null,
    daysPerTurn: number | null,
  ): AuthoritativeClockSnapshot | null {
    if (!this.whole(state.wtime) || !this.whole(state.btime) || !this.whole(state.winc) || !this.whole(state.binc)) {
      return null
    }
    if (typeof state.status !== "string" || !isLichessGameStatus(state.status)) return null
    const expiration = this.expirationFrom(state.expiration)
    if (expiration === undefined) return null
    const status: LichessGameStatus = state.status
    return {
      generation,
      ply: position.ply,
      whiteMs: state.wtime,
      blackMs: state.btime,
      whiteIncrementMs: state.winc,
      blackIncrementMs: state.binc,
      sideToMove: position.side,
      status,
      winner: this.winnerFrom(state.winner),
      kind,
      speed,
      daysPerTurn,
      expiration,
    }
  }

  private position(fen: string, moves: unknown): { side: Color; ply: number } | null {
    if (typeof moves !== "string") return null
    const initial = this.colorFromFen(fen)
    if (initial === null) return null
    const trimmed = moves.trim()
    const ply = trimmed === "" ? 0 : trimmed.split(/\s+/).length
    const side = ply % 2 === 0 ? initial : initial === "white" ? "black" : "white"
    return { side, ply }
  }

  private colorFromFen(fen: string): Color | null {
    const trimmed = fen.trim()
    if (trimmed === "startpos") return "white"
    const color = trimmed.split(/\s+/)[1]
    if (color === "w") return "white"
    if (color === "b") return "black"
    return null
  }

  private speedFrom(value: unknown): LichessSpeed | null {
    if (typeof value !== "string") return null
    return SPEEDS.has(value) ? (value as LichessSpeed) : null
  }

  private winnerFrom(value: unknown): Color | null {
    if (value === "white" || value === "black") return value
    return null
  }

  private expirationFrom(
    value: unknown,
  ): { idleMillis: number; millisToMove: number } | null | undefined {
    if (value === undefined) return null
    const record = value as { idleMillis?: unknown; millisToMove?: unknown }
    if (!this.whole(record.idleMillis) || !this.whole(record.millisToMove)) return undefined
    return { idleMillis: record.idleMillis, millisToMove: record.millisToMove }
  }

  private whole(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  }

  private emit(event: SyncEvent): void {
    const frozen = Object.freeze(event)
    for (const listener of [...this.listeners]) listener(frozen)
  }
}
