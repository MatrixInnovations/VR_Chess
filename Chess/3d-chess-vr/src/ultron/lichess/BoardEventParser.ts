import type { Color, GameStatusName, VariantKey } from '../contracts/types';
import type { BoardGameEvent, GameStatePayload, IncomingEvent } from './apiTypes';

const STATUSES = new Set<GameStatusName>([
  'created',
  'started',
  'aborted',
  'mate',
  'resign',
  'stalemate',
  'timeout',
  'draw',
  'outoftime',
  'cheat',
  'noStart',
  'unknownFinish',
  'insufficientMaterialClaim',
  'variantEnd',
]);

const VARIANTS = new Set<VariantKey>([
  'standard',
  'chess960',
  'crazyhouse',
  'antichess',
  'atomic',
  'horde',
  'kingOfTheHill',
  'racingKings',
  'threeCheck',
  'fromPosition',
]);

/** What a single NDJSON value meant. */
export type ParsedLine =
  | { readonly kind: 'board'; readonly event: BoardGameEvent }
  | { readonly kind: 'incoming'; readonly event: IncomingEvent }
  | { readonly kind: 'ignore' }
  | { readonly kind: 'invalid' };

/**
 * Turns official Board API objects into typed events.
 * Unknown chat lines are ignored so a chat message cannot desync the game.
 */
export class BoardEventParser {
  /**
   * @param value - One decoded JSON value.
   * @returns A typed event, an ignore, or invalid.
   */
  parse(value: unknown): ParsedLine {
    if (!value || typeof value !== 'object') return { kind: 'invalid' };
    const record = value as Record<string, unknown>;
    const type = record.type;
    if (type === 'chatLine') return { kind: 'ignore' };
    if (type === 'gameFull') return this.gameFull(record);
    if (type === 'gameState') return this.gameState(record);
    if (type === 'opponentGone') return this.opponentGone(record);
    if (type === 'gameStart') return this.gameStart(record);
    if (type === 'gameFinish') return this.gameFinish(record);
    if (type === 'challenge') return this.challenge(record, 'challenge');
    if (type === 'challengeCanceled') return this.challenge(record, 'challengeCanceled');
    if (type === 'challengeDeclined') return this.challenge(record, 'challengeDeclined');
    return { kind: 'invalid' };
  }

  private gameFull(record: Record<string, unknown>): ParsedLine {
    const id = this.stringField(record.id);
    const white = this.playerId(record.white);
    const black = this.playerId(record.black);
    const variant = this.variantOf(record.variant);
    const state = this.stateOf(record.state);
    if (!id || !white || !black || !variant || !state) return { kind: 'invalid' };
    const initialFen = this.stringField(record.initialFen) ?? 'startpos';
    return {
      kind: 'board',
      event: { type: 'gameFull', id, initialFen, variant, whiteId: white, blackId: black, state },
    };
  }

  private gameState(record: Record<string, unknown>): ParsedLine {
    const state = this.stateOf(record);
    if (!state) return { kind: 'invalid' };
    return { kind: 'board', event: { type: 'gameState', state } };
  }

  private opponentGone(record: Record<string, unknown>): ParsedLine {
    if (typeof record.gone !== 'boolean') return { kind: 'invalid' };
    const claim = record.claimWinInSeconds;
    return {
      kind: 'board',
      event: {
        type: 'opponentGone',
        gone: record.gone,
        claimWinInSeconds: typeof claim === 'number' ? claim : null,
      },
    };
  }

  private gameStart(record: Record<string, unknown>): ParsedLine {
    const game = record.game;
    if (!game || typeof game !== 'object') return { kind: 'invalid' };
    const body = game as Record<string, unknown>;
    const gameId = this.stringField(body.gameId) ?? this.stringField(body.id);
    const color = body.color === 'white' || body.color === 'black' ? body.color : null;
    if (!gameId || !color) return { kind: 'invalid' };
    let compatBoard: boolean | null = null;
    if (body.compat && typeof body.compat === 'object') {
      const compat = body.compat as Record<string, unknown>;
      if (typeof compat.board === 'boolean') compatBoard = compat.board;
    }
    return { kind: 'incoming', event: { type: 'gameStart', gameId, color, compatBoard } };
  }

  private gameFinish(record: Record<string, unknown>): ParsedLine {
    const game = record.game;
    if (!game || typeof game !== 'object') return { kind: 'invalid' };
    const gameId = this.stringField((game as Record<string, unknown>).gameId);
    if (!gameId) return { kind: 'invalid' };
    return { kind: 'incoming', event: { type: 'gameFinish', gameId } };
  }

  private challenge(record: Record<string, unknown>, type: 'challenge' | 'challengeCanceled' | 'challengeDeclined'): ParsedLine {
    const challenge = record.challenge;
    if (!challenge || typeof challenge !== 'object') return { kind: 'invalid' };
    const challengeId = this.stringField((challenge as Record<string, unknown>).id);
    if (!challengeId) return { kind: 'invalid' };
    return { kind: 'incoming', event: { type, challengeId } };
  }

  private stateOf(value: unknown): GameStatePayload | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (typeof record.moves !== 'string') return null;
    if (typeof record.wtime !== 'number' || typeof record.btime !== 'number') return null;
    if (typeof record.winc !== 'number' || typeof record.binc !== 'number') return null;
    if (typeof record.status !== 'string' || !STATUSES.has(record.status as GameStatusName)) return null;
    const winner = record.winner === 'white' || record.winner === 'black' ? record.winner : null;
    return {
      moves: record.moves.split(/\s+/).filter((move) => move.length > 0),
      wtime: record.wtime,
      btime: record.btime,
      winc: record.winc,
      binc: record.binc,
      status: record.status as GameStatusName,
      winner,
      wdraw: record.wdraw === true,
      bdraw: record.bdraw === true,
    };
  }

  private variantOf(value: unknown): VariantKey | null {
    if (!value || typeof value !== 'object') return null;
    const key = (value as Record<string, unknown>).key;
    if (typeof key !== 'string' || !VARIANTS.has(key as VariantKey)) return null;
    return key as VariantKey;
  }

  private playerId(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    return this.stringField((value as Record<string, unknown>).id);
  }

  private stringField(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}

/** Statuses after which Lichess closes the game stream and the client must not reconnect. */
export class GameStatuses {
  /**
   * @param status - Status field from a gameState.
   * @returns Whether the game is over.
   */
  static isTerminal(status: GameStatusName): boolean {
    return status !== 'created' && status !== 'started';
  }
}
