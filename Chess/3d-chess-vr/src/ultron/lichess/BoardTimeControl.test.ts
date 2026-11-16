import { describe, expect, it } from 'vitest';

import { BoardTimeControl } from './BoardTimeControl';

describe('BoardTimeControl', () => {
  it('classifies clocks with the published estimated-duration formula', () => {
    expect(BoardTimeControl.category(15, 0)).toBe('ultrabullet');
    expect(BoardTimeControl.category(60, 0)).toBe('bullet');
    expect(BoardTimeControl.category(180, 0)).toBe('blitz');
    expect(BoardTimeControl.category(300, 0)).toBe('blitz');
    expect(BoardTimeControl.category(480, 0)).toBe('rapid');
    expect(BoardTimeControl.category(600, 0)).toBe('rapid');
    expect(BoardTimeControl.category(900, 10)).toBe('rapid');
    expect(BoardTimeControl.category(1500, 0)).toBe('classical');
  });

  it('allows rapid and classical seeks and refuses blitz seeks', () => {
    expect(BoardTimeControl.validateSeek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 0 })).toBeNull();
    expect(BoardTimeControl.validateSeek({ kind: 'realtime', timeMinutes: 8, incrementSeconds: 0 })).toBeNull();
    expect(BoardTimeControl.validateSeek({ kind: 'realtime', timeMinutes: 25, incrementSeconds: 0 })).toBeNull();
    expect(BoardTimeControl.validateSeek({ kind: 'realtime', timeMinutes: 5, incrementSeconds: 0 })).toMatch(/blitz|rapid/i);
    expect(BoardTimeControl.validateSeek({ kind: 'realtime', timeMinutes: 1, incrementSeconds: 0 })).toMatch(/bullet|blitz|rapid/i);
  });

  it('allows blitz challenges and refuses bullet challenges', () => {
    expect(
      BoardTimeControl.validateChallenge({ kind: 'realtime', limitSeconds: 300, incrementSeconds: 0 }),
    ).toBeNull();
    expect(
      BoardTimeControl.validateChallenge({ kind: 'realtime', limitSeconds: 180, incrementSeconds: 0 }),
    ).toBeNull();
    expect(
      BoardTimeControl.validateChallenge({ kind: 'realtime', limitSeconds: 60, incrementSeconds: 0 }),
    ).toMatch(/bullet|blitz/i);
  });

  it('accepts only the published correspondence day values', () => {
    expect(BoardTimeControl.validateSeek({ kind: 'correspondence', days: 3 })).toBeNull();
    expect(BoardTimeControl.validateChallenge({ kind: 'correspondence', days: 14 })).toBeNull();
    expect(BoardTimeControl.validateSeek({ kind: 'correspondence', days: 4 as never })).toMatch(/days/i);
  });

  it('rejects challenge limits outside the published clock.limit set', () => {
    expect(
      BoardTimeControl.validateChallenge({ kind: 'realtime', limitSeconds: 61, incrementSeconds: 0 }),
    ).toMatch(/limit/i);
    expect(
      BoardTimeControl.validateChallenge({ kind: 'realtime', limitSeconds: 600, incrementSeconds: 61 }),
    ).toMatch(/increment/i);
    expect(
      BoardTimeControl.validateSeek({ kind: 'realtime', timeMinutes: 10, incrementSeconds: 181 }),
    ).toMatch(/increment/i);
    expect(
      BoardTimeControl.validateSeek({ kind: 'realtime', timeMinutes: 181, incrementSeconds: 0 }),
    ).toMatch(/time/i);
  });
});
