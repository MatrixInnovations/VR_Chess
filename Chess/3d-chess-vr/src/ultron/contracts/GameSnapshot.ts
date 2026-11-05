import type { Color, GameStatusName, LegalMove, VariantKey, ViewMode } from './types';

/** Clock figures copied from Lichess or from {@link IClockPort}. Milliseconds. */
export interface SnapshotClocks {
  readonly whiteMs: number;
  readonly blackMs: number;
  readonly whiteIncMs: number;
  readonly blackIncMs: number;
}

/** Terminal outcome. `winner` is null for draws and aborts. */
export interface SnapshotOutcome {
  readonly status: GameStatusName;
  readonly winner: Color | null;
}

/** Fields needed to build a snapshot. The class freezes them. */
export interface GameSnapshotProps {
  readonly sessionId: string;
  readonly mode: 'offline' | 'online';
  readonly phase: 'idle' | 'seeking' | 'challenging' | 'playing' | 'finished';
  readonly fen: string;
  readonly moves: readonly string[];
  readonly turn: Color;
  readonly ourColor: Color | 'both' | null;
  readonly legalMoves: readonly LegalMove[];
  readonly clocks: SnapshotClocks | null;
  readonly clockProvisional: boolean;
  readonly outcome: SnapshotOutcome | null;
  readonly gameId: string | null;
  readonly positionVersion: number;
  readonly viewMode: ViewMode | null;
  readonly whiteOfferingDraw: boolean;
  readonly blackOfferingDraw: boolean;
  readonly variant: VariantKey;
}

/**
 * Immutable picture of a session.
 * Replacing the snapshot is how the session publishes state. Callers must not mutate it.
 */
export class GameSnapshot {
  readonly sessionId: string;
  readonly mode: 'offline' | 'online';
  readonly phase: 'idle' | 'seeking' | 'challenging' | 'playing' | 'finished';
  readonly fen: string;
  readonly moves: readonly string[];
  readonly turn: Color;
  readonly ourColor: Color | 'both' | null;
  readonly legalMoves: readonly LegalMove[];
  readonly clocks: SnapshotClocks | null;
  readonly clockProvisional: boolean;
  readonly outcome: SnapshotOutcome | null;
  readonly gameId: string | null;
  readonly positionVersion: number;
  readonly viewMode: ViewMode | null;
  readonly whiteOfferingDraw: boolean;
  readonly blackOfferingDraw: boolean;
  readonly variant: VariantKey;

  private constructor(props: GameSnapshotProps) {
    this.sessionId = props.sessionId;
    this.mode = props.mode;
    this.phase = props.phase;
    this.fen = props.fen;
    this.moves = Object.freeze([...props.moves]);
    this.turn = props.turn;
    this.ourColor = props.ourColor;
    this.legalMoves = Object.freeze([...props.legalMoves]);
    this.clocks = props.clocks ? Object.freeze({ ...props.clocks }) : null;
    this.clockProvisional = props.clockProvisional;
    this.outcome = props.outcome ? Object.freeze({ ...props.outcome }) : null;
    this.gameId = props.gameId;
    this.positionVersion = props.positionVersion;
    this.viewMode = props.viewMode;
    this.whiteOfferingDraw = props.whiteOfferingDraw;
    this.blackOfferingDraw = props.blackOfferingDraw;
    this.variant = props.variant;
    Object.freeze(this);
  }

  /**
   * @param props - Snapshot fields.
   * @returns A frozen snapshot.
   */
  static of(props: GameSnapshotProps): GameSnapshot {
    return new GameSnapshot(props);
  }
}
