import { LichessTimeControl, type LichessSpeed } from "./LichessTimeControl.ts"
import type { MonotonicTimeSource } from "./MonotonicTimeSource.ts"

/** Side of the board. Matches the Lichess `white` / `black` strings. */
export type Color = "white" | "black"

/**
 * Physical clock button. Mad Scientist passes this to {@link ChessClock.acceptTap}.
 * The tap does not change the online turn and does not submit a move.
 */
export interface ClockTapTarget {
  readonly color: Color
}

/**
 * `status` strings from the Lichess GameStatusName schema.
 * `timeout` means the opponent left. `outoftime` is the clock flag.
 * `noStart` is the first-move abort, not a Fischer flag.
 */
export const LICHESS_GAME_STATUSES = [
  "created",
  "started",
  "aborted",
  "mate",
  "resign",
  "stalemate",
  "timeout",
  "draw",
  "outoftime",
  "cheat",
  "noStart",
  "unknownFinish",
  "insufficientMaterialClaim",
  "variantEnd",
] as const

/** One documented Lichess game status name. */
export type LichessGameStatus = (typeof LICHESS_GAME_STATUSES)[number]

const TERMINAL_STATUSES: ReadonlySet<string> = new Set<LichessGameStatus>([
  "aborted",
  "mate",
  "resign",
  "stalemate",
  "timeout",
  "draw",
  "outoftime",
  "cheat",
  "noStart",
  "unknownFinish",
  "insufficientMaterialClaim",
  "variantEnd",
])

/**
 * @param value - Untrusted status string from a stream adapter.
 * @returns Whether `value` is one of the documented names.
 */
export function isLichessGameStatus(value: string): value is LichessGameStatus {
  return TERMINAL_STATUSES.has(value) || value === "created" || value === "started"
}

/** First-move abort timer carried on `gameState.expiration`. It is not the chess clock. */
export interface ClockExpiration {
  /** Milliseconds since the last move, or since the game started when no move has been played. */
  readonly idleMillis: number
  /** Budget for the first move before Lichess may abort the game. */
  readonly millisToMove: number
}

/**
 * Server clock reading after the synchronizer has parsed a Board API event.
 * `wtime` / `btime` are remaining milliseconds at send time and already include
 * any Fischer increment for the moves in that event. Applying this snapshot
 * replaces the local estimate. It must not add the increment again.
 */
export interface AuthoritativeClockSnapshot {
  /** Stream generation. A smaller generation is a stale socket, not a rewind. */
  readonly generation: number
  /** Half-move count represented by this snapshot. */
  readonly ply: number
  readonly whiteMs: number
  readonly blackMs: number
  readonly whiteIncrementMs: number
  readonly blackIncrementMs: number
  readonly sideToMove: Color
  readonly status: string
  readonly winner: Color | null
  readonly kind: "realtime" | "correspondence" | "unlimited"
  readonly speed: LichessSpeed | null
  readonly daysPerTurn: number | null
  readonly expiration: ClockExpiration | null
}

/** Immutable display value. Vision renders these fields and does no time math. */
export interface ClockViewSnapshot {
  readonly kind: "absent" | "realtime" | "correspondence" | "unlimited"
  readonly mode: "online" | "offline"
  readonly phase: "absent" | "armed" | "running" | "paused" | "frozen"
  readonly activeColor: Color | null
  readonly whiteDisplayMs: number | null
  readonly blackDisplayMs: number | null
  readonly whiteIncrementMs: number
  readonly blackIncrementMs: number
  readonly provisionalFlagColor: Color | null
  readonly confirmedFlag: { readonly color: Color; readonly source: "server" | "local" } | null
  readonly lichessStatus: LichessGameStatus | null
  readonly terminal: boolean
  readonly speed: LichessSpeed | null
  readonly daysPerTurn: number | null
  readonly ply: number
  readonly expiration: ClockExpiration | null
  readonly opponentGone: { readonly gone: boolean; readonly claimWinInSeconds: number | null } | null
  readonly sampledAtMs: number
}

/**
 * A move decision from GameSession.
 * Online, `accepted: true` means Lichess accepted the move. The clock does not
 * submit moves, and a rejected decision must not change the turn or the increment.
 */
export interface AcceptedClockMove {
  /** Stable id. The same id never increments twice. */
  readonly revision: string
  /** Ply after this move. */
  readonly ply: number
  /** Side that moved. */
  readonly mover: Color
  readonly accepted: boolean
}

/** Why an accepted-move call did not change the Fischer clock. */
export type MoveIgnoreReason =
  | "rejected"
  | "absent"
  | "nonFischerTimeControl"
  | "duplicateRevision"
  | "duplicatePly"
  | "terminal"
  | "localFlag"
  | "alreadyReconciled"
  | "notRunning"
  | "notSideToMove"

/** Discrete clock events. The clock does not emit once per frame. */
export type ClockEvent =
  | {
      readonly type: "moveApplied"
      readonly revision: string
      readonly ply: number
      readonly mover: Color
      readonly incrementMs: number
    }
  | { readonly type: "moveIgnored"; readonly revision: string; readonly reason: MoveIgnoreReason }
  | {
      readonly type: "authoritativeApplied"
      readonly generation: number
      readonly ply: number
      readonly status: LichessGameStatus
    }
  | {
      readonly type: "authoritativeIgnored"
      readonly generation: number
      readonly ply: number
      readonly reason: "staleGeneration" | "duplicate" | "invalid"
    }
  | { readonly type: "provisionalFlag"; readonly color: Color }
  | { readonly type: "provisionalFlagCleared"; readonly color: Color }
  | { readonly type: "confirmedFlag"; readonly color: Color; readonly source: "server" | "local" }
  | { readonly type: "paused" }
  | { readonly type: "resumed" }
  | { readonly type: "frozen"; readonly lichessStatus: LichessGameStatus | null }
  | {
      readonly type: "pauseRejected"
      readonly reason: "onlineClockIsAuthoritative" | "terminal" | "notRunning"
    }
  | {
      readonly type: "resumeRejected"
      readonly reason: "onlineClockIsAuthoritative" | "terminal" | "notPaused"
    }
  | { readonly type: "tapIgnored"; readonly color: Color }
  | { readonly type: "opponentGoneNoted" }
  | { readonly type: "disposed" }

/** The clock was used after {@link ChessClock.dispose}. */
export class ClockDisposedError extends Error {
  /**
   * @param message - Which use happened after dispose.
   */
  constructor(message: string) {
    super(message)
    this.name = "ClockDisposedError"
  }
}

/** A call does not belong on this online or offline clock. */
export class ClockModeError extends Error {
  /**
   * @param message - The mode constraint that failed.
   */
  constructor(message: string) {
    super(message)
    this.name = "ClockModeError"
  }
}

/**
 * Chess clock for one game.
 *
 * Online, Lichess is authoritative. Hitting zero locally is provisional: this
 * class does not declare a result, submit a move, or treat the flag as final
 * until a server `outoftime` status arrives. Offline, the same class may flag
 * locally and may pause. In both modes the turn and the Fischer increment come
 * from an accepted GameSession move, exactly once per revision. A clock tap
 * never switches the turn. The instance is independent of the 3D/XR view:
 * unsubscribing a listener does not reset the banks.
 *
 * Remaining time is `bank - (now - anchor)` from the injected monotonic source.
 * Sampling again without advancing that source does not change the value.
 */
export class ChessClock {
  private readonly time: MonotonicTimeSource
  private readonly mode: "online" | "offline"
  private readonly listeners = new Set<(event: ClockEvent) => void>()
  private readonly appliedRevisions = new Set<string>()
  private readonly incrementedPlies = new Set<number>()

  private whiteMs = 0
  private blackMs = 0
  private whiteIncrementMs = 0
  private blackIncrementMs = 0
  private active: Color = "white"
  private kind: ClockViewSnapshot["kind"] = "absent"
  private phase: ClockViewSnapshot["phase"] = "absent"
  private running = false
  private anchorMs = 0
  private provisionalFlagColor: Color | null = null
  private confirmedFlag: { color: Color; source: "server" | "local" } | null = null
  private lichessStatus: LichessGameStatus | null = null
  private terminal = false
  private speed: LichessSpeed | null = null
  private daysPerTurn: number | null = null
  private ply = 0
  private expiration: ClockExpiration | null = null
  private expirationKey = ""
  private opponentGone: ClockViewSnapshot["opponentGone"] = null
  private generation = -1
  private lastSignature: string | null = null
  private reconciledThroughPly = -1
  private held = false
  private disposed = false

  private constructor(time: MonotonicTimeSource, mode: "online" | "offline") {
    this.time = time
    this.mode = mode
  }

  /**
   * Online clock with no game yet. The first authoritative snapshot arms it.
   * @param time - Monotonic source. Tests pass a manual clock.
   */
  static createOnline(time: MonotonicTimeSource): ChessClock {
    return new ChessClock(time, "online")
  }

  /**
   * Offline two-player Fischer clock. It starts running for `sideToMove`.
   * Correspondence and unlimited controls are stream states, not a local clock.
   * @param time - Monotonic source.
   * @param control - Documented realtime control.
   * @param sideToMove - Side whose clock runs first. Defaults to white.
   */
  static createOffline(
    time: MonotonicTimeSource,
    control: LichessTimeControl,
    sideToMove: Color = "white",
  ): ChessClock {
    if (control.kind !== "realtime") {
      throw new ClockModeError("An offline clock requires a realtime Fischer time control.")
    }
    // A realtime control always has a bank and an increment. Correspondence and unlimited already returned above.
    const bank = control.initialBankMs() as number
    const incrementSeconds = control.incrementSeconds as number
    const clock = new ChessClock(time, "offline")
    clock.kind = "realtime"
    clock.whiteMs = bank
    clock.blackMs = bank
    clock.whiteIncrementMs = incrementSeconds * 1000
    clock.blackIncrementMs = incrementSeconds * 1000
    clock.active = sideToMove
    clock.speed = control.speed
    clock.phase = "running"
    clock.running = true
    clock.anchorMs = time.now()
    return clock
  }

  /**
   * Realtime clock with explicit millisecond banks.
   * Used by {@link ChessClockPort}. This does not re-check challenge-API limits,
   * because a mid-game server bank is not a new seek.
   * @param time - Monotonic source.
   * @param options - Banks, one increment for both sides, and whether it is already running.
   */
  static createArmed(
    time: MonotonicTimeSource,
    options: {
      readonly mode: "online" | "offline"
      readonly whiteMs: number
      readonly blackMs: number
      readonly incrementMs: number
      readonly sideToMove: Color
    },
  ): ChessClock {
    const clock = new ChessClock(time, options.mode)
    clock.kind = "realtime"
    clock.whiteMs = options.whiteMs
    clock.blackMs = options.blackMs
    clock.whiteIncrementMs = options.incrementMs
    clock.blackIncrementMs = options.incrementMs
    clock.active = options.sideToMove
    clock.running = false
    clock.phase = "armed"
    clock.anchorMs = time.now()
    return clock
  }

  /**
   * Allocate one frozen view snapshot.
   * Call at most once per frame. Prefer {@link ChessClock.displayMillis} when only one number is needed.
   */
  snapshot(): ClockViewSnapshot {
    this.assertLive()
    this.observeThreshold()
    const banked = this.kind === "realtime" || this.kind === "correspondence"
    const snap: ClockViewSnapshot = {
      kind: this.kind,
      mode: this.mode,
      phase: this.phase,
      activeColor: this.kind === "absent" ? null : this.active,
      whiteDisplayMs: banked ? this.readBankMillis("white") : null,
      blackDisplayMs: banked ? this.readBankMillis("black") : null,
      whiteIncrementMs: this.whiteIncrementMs,
      blackIncrementMs: this.blackIncrementMs,
      provisionalFlagColor: this.provisionalFlagColor,
      confirmedFlag: this.confirmedFlag,
      lichessStatus: this.lichessStatus,
      terminal: this.terminal,
      speed: this.speed,
      daysPerTurn: this.daysPerTurn,
      ply: this.ply,
      expiration: this.expiration,
      opponentGone: this.opponentGone,
      sampledAtMs: this.time.now(),
    }
    if (snap.expiration) Object.freeze(snap.expiration)
    if (snap.opponentGone) Object.freeze(snap.opponentGone)
    if (snap.confirmedFlag) Object.freeze(snap.confirmedFlag)
    return Object.freeze(snap)
  }

  /**
   * Remaining milliseconds for `color`, or null when there is no countdown.
   * This returns a number and does not allocate a snapshot.
   * @param color - White or black.
   */
  displayMillis(color: Color): number | null {
    this.assertLive()
    if (this.kind !== "realtime" && this.kind !== "correspondence") return null
    this.observeThreshold()
    return this.readBankMillis(color)
  }

  /**
   * Subscribe to discrete clock events.
   * @param listener - Called synchronously for each event. A thrown listener does not stop the others.
   * @returns Unsubscribe. Removing the last listener does not reset the clock.
   */
  subscribe(listener: (event: ClockEvent) => void): () => void {
    this.assertLive()
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Apply or ignore a GameSession move decision.
   * A realtime increment is added once for a new accepted revision, unless a
   * server snapshot at that ply already included it.
   * @param move - Accepted or rejected decision. Rejected moves are ignored.
   */
  applyAcceptedMove(move: AcceptedClockMove): void {
    this.assertLive()
    if (!move.accepted) {
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "rejected" })
      return
    }
    if (this.kind === "absent") {
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "absent" })
      return
    }
    if (this.kind !== "realtime") {
      this.appliedRevisions.add(move.revision)
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "nonFischerTimeControl" })
      return
    }
    if (this.appliedRevisions.has(move.revision)) {
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "duplicateRevision" })
      return
    }
    if (this.terminal) {
      this.emit({
        type: "moveIgnored",
        revision: move.revision,
        reason: this.confirmedFlag?.source === "local" ? "localFlag" : "terminal",
      })
      return
    }
    if (move.ply <= this.reconciledThroughPly) {
      this.appliedRevisions.add(move.revision)
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "alreadyReconciled" })
      return
    }
    if (this.incrementedPlies.has(move.ply)) {
      this.appliedRevisions.add(move.revision)
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "duplicatePly" })
      return
    }
    if (!this.running) {
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "notRunning" })
      return
    }
    if (move.mover !== this.active) {
      this.emit({ type: "moveIgnored", revision: move.revision, reason: "notSideToMove" })
      return
    }
    if (this.mode === "offline") {
      this.observeThreshold()
      if (this.terminal) {
        this.emit({ type: "moveIgnored", revision: move.revision, reason: "localFlag" })
        return
      }
    }

    const elapsed = this.time.now() - this.anchorMs
    const bank = move.mover === "white" ? this.whiteMs : this.blackMs
    const remaining = bank - elapsed
    const increment = move.mover === "white" ? this.whiteIncrementMs : this.blackIncrementMs
    // Online acceptance means the server still had time, even if our estimate already hit zero.
    const next = remaining > 0 ? remaining + increment : increment
    if (move.mover === "white") this.whiteMs = next
    else this.blackMs = next
    this.active = move.mover === "white" ? "black" : "white"
    this.anchorMs = this.time.now()
    this.ply = move.ply
    this.appliedRevisions.add(move.revision)
    this.incrementedPlies.add(move.ply)
    this.clearProvisional()
    this.emit({
      type: "moveApplied",
      revision: move.revision,
      ply: move.ply,
      mover: move.mover,
      incrementMs: increment,
    })
  }

  /**
   * Replace the local estimate with a server reading.
   * A lower stream generation is ignored. An identical reading does not refund
   * elapsed time. A higher remaining time is applied; elapsed time is not a
   * staleness test. A shorter ply on the same generation is a rewind.
   * @param snapshot - Parsed Board API clock reading.
   */
  applyAuthoritativeSnapshot(snapshot: AuthoritativeClockSnapshot): void {
    this.assertLive()
    if (this.mode !== "online") {
      throw new ClockModeError("An offline clock does not accept server snapshots.")
    }
    if (!this.isValidSnapshot(snapshot)) {
      this.emit({
        type: "authoritativeIgnored",
        generation: snapshot.generation,
        ply: snapshot.ply,
        reason: "invalid",
      })
      return
    }
    if (snapshot.generation < this.generation) {
      this.emit({
        type: "authoritativeIgnored",
        generation: snapshot.generation,
        ply: snapshot.ply,
        reason: "staleGeneration",
      })
      return
    }
    const signature = this.signature(snapshot)
    if (snapshot.generation === this.generation && signature === this.lastSignature) {
      const nextKey = ChessClock.expirationKey(snapshot.expiration)
      const changed = nextKey !== this.expirationKey
      this.expiration = ChessClock.copyExpiration(snapshot.expiration)
      this.expirationKey = nextKey
      if (!changed) {
        this.emit({
          type: "authoritativeIgnored",
          generation: snapshot.generation,
          ply: snapshot.ply,
          reason: "duplicate",
        })
      }
      return
    }
    this.installSnapshot(snapshot, signature)
  }

  /**
   * Fold the active offline bank and stop the countdown.
   * Online clocks keep running because Lichess does not pause.
   * @returns Whether the clock is now paused.
   */
  pause(): boolean {
    this.assertLive()
    if (this.mode !== "offline") {
      this.emit({ type: "pauseRejected", reason: "onlineClockIsAuthoritative" })
      return false
    }
    if (this.terminal) {
      this.emit({ type: "pauseRejected", reason: "terminal" })
      return false
    }
    if (!this.running) {
      this.emit({ type: "pauseRejected", reason: "notRunning" })
      return false
    }
    const left = this.readBankMillis(this.active)
    if (this.active === "white") this.whiteMs = left
    else this.blackMs = left
    this.running = false
    this.phase = "paused"
    this.emit({ type: "paused" })
    return true
  }

  /**
   * Continue an offline clock that {@link ChessClock.pause} stopped.
   * @returns Whether the clock is running again.
   */
  resume(): boolean {
    this.assertLive()
    if (this.mode !== "offline") {
      this.emit({ type: "resumeRejected", reason: "onlineClockIsAuthoritative" })
      return false
    }
    if (this.terminal) {
      this.emit({ type: "resumeRejected", reason: "terminal" })
      return false
    }
    if (this.phase !== "paused") {
      this.emit({ type: "resumeRejected", reason: "notPaused" })
      return false
    }
    this.running = true
    this.phase = "running"
    this.anchorMs = this.time.now()
    this.emit({ type: "resumed" })
    return true
  }

  /**
   * Record a physical or hand-tracked clock tap.
   * The tap does not switch turns, add increment, or submit a move. Lichess
   * does not require a clock press; the accepted move is the clock press.
   * @param color - Button that was tapped.
   */
  notifyTapped(color: Color): void {
    this.assertLive()
    this.emit({ type: "tapIgnored", color })
  }

  /**
   * Physical {@link ClockTapTarget}. Same as {@link ChessClock.notifyTapped}.
   * Online and offline taps leave the side to move unchanged.
   * @param target - Button the table model reported.
   */
  acceptTap(target: ClockTapTarget): void {
    this.notifyTapped(target.color)
  }

  /**
   * Replace both banks from a server or give-time snapshot.
   * Does not add increment and does not resume a clock that {@link ChessClock.hold} stopped.
   * A terminal clock, including an offline local flag, ignores the replacement.
   * @param whiteMs - White remaining milliseconds.
   * @param blackMs - Black remaining milliseconds.
   * @param sideToMove - Runner to adopt when the caller knows it. Omitted keeps the current side.
   */
  replaceRemaining(whiteMs: number, blackMs: number, sideToMove?: Color): void {
    this.assertLive()
    const samples = [whiteMs, blackMs]
    for (const sample of samples) {
      if (!Number.isSafeInteger(sample) || sample < 0) return
    }
    if (this.terminal) return
    this.kind = "realtime"
    this.whiteMs = whiteMs
    this.blackMs = blackMs
    if (sideToMove === "white" || sideToMove === "black") this.active = sideToMove
    if (this.held) return
    this.running = true
    this.phase = "running"
    this.anchorMs = this.time.now()
    this.clearProvisional()
    this.observeThreshold()
  }

  /**
   * Fold the active bank and stop the countdown.
   * The instance stays usable. A later server replacement may change the banks
   * but does not start them again until {@link ChessClock.rearm}.
   */
  hold(): void {
    this.assertLive()
    if (this.terminal) return
    if (this.running) {
      const left = this.readBankMillis(this.active)
      if (this.active === "white") this.whiteMs = left
      else this.blackMs = left
    }
    this.running = false
    this.held = true
    this.phase = "armed"
  }

  /**
   * Start or restart a realtime countdown from explicit banks.
   * @param options - Banks, shared increment, and side to move.
   */
  rearm(options: {
    readonly whiteMs: number
    readonly blackMs: number
    readonly incrementMs: number
    readonly sideToMove: Color
  }): void {
    this.assertLive()
    this.kind = "realtime"
    this.whiteMs = options.whiteMs
    this.blackMs = options.blackMs
    this.whiteIncrementMs = options.incrementMs
    this.blackIncrementMs = options.incrementMs
    this.active = options.sideToMove
    this.running = true
    this.held = false
    this.phase = "running"
    this.terminal = false
    this.confirmedFlag = null
    this.provisionalFlagColor = null
    this.anchorMs = this.time.now()
    this.appliedRevisions.clear()
    this.incrementedPlies.clear()
    this.reconciledThroughPly = -1
    this.ply = 0
    this.lichessStatus = null
  }

  /**
   * Store an `opponentGone` notice for the view.
   * `claimWinInSeconds` is a disconnect claim timer, not chess-clock time.
   * @param note - Whether the opponent is gone, and the claim delay when Lichess sent one.
   */
  noteOpponentGone(note: { gone: boolean; claimWinInSeconds: number | null }): void {
    this.assertLive()
    this.opponentGone = {
      gone: note.gone,
      claimWinInSeconds: note.claimWinInSeconds,
    }
    this.emit({ type: "opponentGoneNoted" })
  }

  /**
   * Stop listeners and reject later use.
   * The monotonic source is not owned by the clock and is left untouched.
   */
  dispose(): void {
    this.assertLive()
    this.disposed = true
    this.running = false
    this.emit({ type: "disposed" })
    this.listeners.clear()
  }

  private assertLive(): void {
    if (this.disposed) throw new ClockDisposedError("ChessClock is disposed.")
  }

  private readBankMillis(color: Color): number {
    const bank = color === "white" ? this.whiteMs : this.blackMs
    if (this.running && color === this.active) {
      const left = bank - (this.time.now() - this.anchorMs)
      return left > 0 ? left : 0
    }
    return bank > 0 ? bank : 0
  }

  private observeThreshold(): void {
    if (this.terminal || !this.running) return
    const left = this.readBankMillis(this.active)
    if (left > 0) return
    if (this.mode === "offline") {
      this.freezeLocal(this.active)
      return
    }
    if (this.provisionalFlagColor === this.active) return
    this.provisionalFlagColor = this.active
    this.emit({ type: "provisionalFlag", color: this.active })
  }

  private freezeLocal(color: Color): void {
    if (color === "white") this.whiteMs = 0
    else this.blackMs = 0
    this.running = false
    this.phase = "frozen"
    this.terminal = true
    this.clearProvisional()
    this.confirmedFlag = { color, source: "local" }
    this.emit({ type: "confirmedFlag", color, source: "local" })
    this.emit({ type: "frozen", lichessStatus: null })
  }

  private clearProvisional(): void {
    if (this.provisionalFlagColor === null) return
    const color = this.provisionalFlagColor
    this.provisionalFlagColor = null
    this.emit({ type: "provisionalFlagCleared", color })
  }

  private isValidSnapshot(snapshot: AuthoritativeClockSnapshot): boolean {
    if (!isLichessGameStatus(snapshot.status)) return false
    const samples = [snapshot.whiteMs, snapshot.blackMs, snapshot.whiteIncrementMs, snapshot.blackIncrementMs]
    for (const sample of samples) {
      if (!Number.isSafeInteger(sample) || sample < 0) return false
    }
    return true
  }

  private signature(snapshot: AuthoritativeClockSnapshot): string {
    return [
      snapshot.generation,
      snapshot.kind,
      snapshot.ply,
      snapshot.whiteMs,
      snapshot.blackMs,
      snapshot.whiteIncrementMs,
      snapshot.blackIncrementMs,
      snapshot.sideToMove,
      snapshot.status,
      snapshot.winner ?? "",
      snapshot.daysPerTurn ?? "",
      snapshot.speed ?? "",
    ].join("|")
  }

  private installSnapshot(snapshot: AuthoritativeClockSnapshot, signature: string): void {
    const status = snapshot.status as LichessGameStatus
    this.clearProvisional()
    this.generation = snapshot.generation
    this.lastSignature = signature
    this.kind = snapshot.kind
    this.whiteMs = snapshot.whiteMs
    this.blackMs = snapshot.blackMs
    this.whiteIncrementMs = snapshot.whiteIncrementMs
    this.blackIncrementMs = snapshot.blackIncrementMs
    this.active = snapshot.sideToMove
    this.lichessStatus = status
    this.speed = snapshot.speed
    this.daysPerTurn = snapshot.daysPerTurn
    this.expiration = ChessClock.copyExpiration(snapshot.expiration)
    this.expirationKey = ChessClock.expirationKey(snapshot.expiration)
    this.ply = snapshot.ply
    this.reconciledThroughPly = snapshot.ply
    for (const ply of [...this.incrementedPlies]) {
      if (ply > snapshot.ply) this.incrementedPlies.delete(ply)
    }
    this.running = false
    this.terminal = false
    this.confirmedFlag = null

    if (status === "outoftime") {
      this.terminal = true
      this.phase = "frozen"
      const color = this.flagColor(snapshot)
      if (color) {
        this.confirmedFlag = { color, source: "server" }
        this.emit({ type: "confirmedFlag", color, source: "server" })
      }
      this.emit({ type: "frozen", lichessStatus: status })
    } else if (TERMINAL_STATUSES.has(status)) {
      this.terminal = true
      this.phase = "frozen"
      this.emit({ type: "frozen", lichessStatus: status })
    } else if (status === "started" && snapshot.kind !== "unlimited") {
      this.phase = "running"
      this.running = true
      this.anchorMs = this.time.now()
      this.observeThreshold()
    } else {
      this.phase = "armed"
    }
    this.emit({
      type: "authoritativeApplied",
      generation: snapshot.generation,
      ply: snapshot.ply,
      status,
    })
  }

  private flagColor(snapshot: AuthoritativeClockSnapshot): Color | null {
    if (snapshot.winner === "white") return "black"
    if (snapshot.winner === "black") return "white"
    const whiteOut = snapshot.whiteMs <= 0
    const blackOut = snapshot.blackMs <= 0
    if (whiteOut && !blackOut) return "white"
    if (blackOut && !whiteOut) return "black"
    return null
  }

  private emit(event: ClockEvent): void {
    const frozen = Object.freeze(event)
    for (const listener of [...this.listeners]) {
      try {
        listener(frozen)
      } catch {
        // One view listener must not block the clock or the other listeners.
      }
    }
  }

  private static expirationKey(expiration: ClockExpiration | null): string {
    if (expiration === null) return ""
    return `${expiration.idleMillis}:${expiration.millisToMove}`
  }

  private static copyExpiration(expiration: ClockExpiration | null): ClockExpiration | null {
    if (expiration === null) return null
    return { idleMillis: expiration.idleMillis, millisToMove: expiration.millisToMove }
  }
}
