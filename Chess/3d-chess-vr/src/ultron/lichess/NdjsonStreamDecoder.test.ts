import { describe, expect, it } from 'vitest';

import { NdjsonStreamDecoder } from './NdjsonStreamDecoder';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('NdjsonStreamDecoder', () => {
  it('reassembles a JSON object split across chunks', () => {
    const decoder = new NdjsonStreamDecoder();
    const first = decoder.push(bytes('{"type":"ga'));
    expect(first.values).toEqual([]);
    const second = decoder.push(bytes('meState","moves":"e2e4"}\n'));
    expect(second.values).toEqual([{ type: 'gameState', moves: 'e2e4' }]);
    expect(second.errors).toEqual([]);
  });

  it('parses several lines from one chunk and ignores keepalive blanks', () => {
    const decoder = new NdjsonStreamDecoder();
    const batch = decoder.push(bytes('\n\n{"type":"gameStart","game":{"id":"a"}}\n\n{"ok":true}\n'));
    expect(batch.values).toHaveLength(2);
    expect(batch.errors).toEqual([]);
    expect(batch.values[0]).toEqual({ type: 'gameStart', game: { id: 'a' } });
  });

  it('decodes a multibyte character split across chunks', () => {
    const decoder = new NdjsonStreamDecoder();
    const payload = bytes('{"name":"é"}\n');
    const splitAt = payload.indexOf(0xc3);
    const head = decoder.push(payload.slice(0, splitAt + 1));
    const tail = decoder.push(payload.slice(splitAt + 1));
    expect(head.values).toEqual([]);
    expect(tail.values).toEqual([{ name: 'é' }]);
  });

  it('reports a complete malformed line and still returns the next value', () => {
    const decoder = new NdjsonStreamDecoder();
    const batch = decoder.push(bytes('not-json\n{"type":"gameState"}\n'));
    expect(batch.errors).toHaveLength(1);
    expect(batch.values).toEqual([{ type: 'gameState' }]);
  });

  it('holds a trailing partial line until end, then errors if it is not empty', () => {
    const decoder = new NdjsonStreamDecoder();
    expect(decoder.push(bytes('{"partial":')).values).toEqual([]);
    const ended = decoder.end();
    expect(ended.values).toEqual([]);
    expect(ended.errors).toHaveLength(1);
  });

  it('flushes a final line that arrived without a newline', () => {
    const decoder = new NdjsonStreamDecoder();
    decoder.push(bytes('{"ok":true}'));
    expect(decoder.end().values).toEqual([{ ok: true }]);
  });
});
