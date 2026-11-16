/** One push or flush of an NDJSON stream. */
export interface NdjsonBatch {
  readonly values: readonly unknown[];
  readonly errors: readonly string[];
}

/**
 * Incremental NDJSON reader.
 * Lichess keep-alives are empty lines. Chunks may split a UTF-8 character or a JSON object.
 */
export class NdjsonStreamDecoder {
  private pending = '';
  private readonly decoder = new TextDecoder('utf-8', { fatal: false });

  /**
   * @param chunk - Next bytes from the socket.
   * @returns Complete values and any malformed lines.
   */
  push(chunk: Uint8Array): NdjsonBatch {
    this.pending += this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  /**
   * Flush the decoder at end of stream.
   * A trailing partial object becomes an error rather than a guessed value.
   * @returns Remaining values and errors.
   */
  end(): NdjsonBatch {
    this.pending += this.decoder.decode();
    return this.drain(true);
  }

  private drain(final: boolean): NdjsonBatch {
    const values: unknown[] = [];
    const errors: string[] = [];
    const lines = this.pending.split('\n');
    this.pending = final ? '' : lines.pop() ?? '';
    if (final && this.pending.length > 0) {
      lines.push(this.pending);
      this.pending = '';
    }
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        values.push(JSON.parse(trimmed) as unknown);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid json';
        errors.push(detail);
      }
    }
    return { values, errors };
  }
}
