import { describe, expect, it } from 'vitest';

import { BoardEventParser } from './BoardEventParser';

const parser = new BoardEventParser();

describe('BoardEventParser', () => {
  it('parses a gameFull event and splits the UCI move list', () => {
    const parsed = parser.parse({
      type: 'gameFull',
      id: 'qP8XaFtN',
      variant: { key: 'standard', name: 'Standard' },
      initialFen: 'startpos',
      white: { id: 'ada', name: 'Ada' },
      black: { id: 'salma', name: 'Salma' },
      state: {
        type: 'gameState',
        moves: 'e2e4 e7e5',
        wtime: 300000,
        btime: 300000,
        winc: 0,
        binc: 0,
        status: 'started',
      },
    });
    expect(parsed.kind).toBe('board');
    if (parsed.kind !== 'board' || parsed.event.type !== 'gameFull') throw new Error('expected gameFull');
    expect(parsed.event.state.moves).toEqual(['e2e4', 'e7e5']);
    expect(parsed.event.whiteId).toBe('ada');
    expect(parsed.event.white?.name).toBe('Ada');
    expect(parsed.event.variant).toBe('standard');
    const ai = parser.parse({
      type: 'gameFull',
      id: 'aiGame',
      variant: { key: 'standard' },
      white: { id: 'ada', name: 'Ada', rating: 1800, title: 'FM' },
      black: { id: 'stockfish', aiLevel: 6 },
      state: {
        type: 'gameState',
        moves: '',
        wtime: 1,
        btime: 1,
        winc: 0,
        binc: 0,
        status: 'started',
      },
    });
    if (ai.kind !== 'board' || ai.event.type !== 'gameFull') throw new Error('expected ai game');
    expect(ai.event.white?.title).toBe('FM');
    expect(ai.event.white?.rating).toBe(1800);
    expect(ai.event.black?.ai).toBe(true);
    expect(ai.event.black?.name).toBe('Stockfish level 6');
    expect(ai.event.black?.aiLevel).toBe(6);
  });

  it('parses gameState, gameStart, and challenge events', () => {
    const state = parser.parse({
      type: 'gameState',
      moves: '',
      wtime: 1,
      btime: 2,
      winc: 3,
      binc: 4,
      status: 'mate',
      winner: 'white',
      wdraw: true,
    });
    expect(state.kind).toBe('board');
    if (state.kind !== 'board' || state.event.type !== 'gameState') throw new Error('state');
    expect(state.event.state.winner).toBe('white');
    expect(state.event.state.wdraw).toBe(true);
    expect(state.event.state.moves).toEqual([]);

    const start = parser.parse({
      type: 'gameStart',
      game: { gameId: 'abc', color: 'black', compat: { board: true } },
    });
    expect(start.kind).toBe('incoming');
    if (start.kind !== 'incoming' || start.event.type !== 'gameStart') throw new Error('start');
    expect(start.event.color).toBe('black');
    expect(start.event.compatBoard).toBe(true);

    const challenge = parser.parse({ type: 'challenge', challenge: { id: 'ch1' } });
    expect(challenge.kind).toBe('incoming');
  });

  it('ignores chat and reports invalid board payloads', () => {
    expect(parser.parse({ type: 'chatLine', username: 'a', text: 'hi', room: 'player' }).kind).toBe('ignore');
    expect(parser.parse({ type: 'gameState', moves: 'e2e4' }).kind).toBe('invalid');
    expect(parser.parse('nope').kind).toBe('invalid');
    expect(parser.parse({ type: 'opponentGone', gone: true, claimWinInSeconds: 30 }).kind).toBe('board');
  });
});
