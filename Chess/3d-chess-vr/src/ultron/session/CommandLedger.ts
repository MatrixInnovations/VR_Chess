/** Lifecycle of one command id. */
export type CommandState = 'pending' | 'confirmed' | 'rejected' | 'unconfirmed';

/**
 * Dedupes command ids and UCI moves.
 * A move stays locked while it is pending or unconfirmed so a lost HTTP response
 * cannot be posted again until a gameFull snapshot shows it is absent.
 */
export class CommandLedger {
  private readonly commands = new Map<string, { uci: string; state: CommandState }>();
  private readonly uciState = new Map<string, 'pending' | 'confirmed'>();

  /**
   * @param id - Caller command id.
   * @returns Whether this id was already seen.
   */
  has(id: string): boolean {
    return this.commands.has(id);
  }

  /**
   * @param uci - UCI move.
   * @returns Whether that move is in flight or already confirmed.
   */
  blocked(uci: string): boolean {
    return this.uciState.has(uci);
  }

  /**
   * @param id - Command id.
   * @param uci - UCI move.
   * @param state - Initial state.
   */
  begin(id: string, uci: string, state: 'pending' | 'confirmed' | 'unconfirmed'): void {
    this.commands.set(id, { uci, state });
    this.uciState.set(uci, state === 'confirmed' ? 'confirmed' : 'pending');
  }

  /**
   * @param uci - Move the stream now contains.
   */
  confirm(uci: string): void {
    this.uciState.set(uci, 'confirmed');
    for (const command of this.commands.values()) {
      if (command.uci === uci) command.state = 'confirmed';
    }
  }

  /**
   * Drop a pending lock after Lichess shows the move never landed.
   * Confirmed moves stay locked.
   * @param uci - Move to release.
   */
  release(uci: string): void {
    if (this.uciState.get(uci) === 'confirmed') return;
    this.uciState.delete(uci);
    for (const command of this.commands.values()) {
      if (command.uci === uci && command.state !== 'confirmed') command.state = 'rejected';
    }
  }
}
