import type { ISeekIdSource } from '../ports/ISeekIdSource'

/**
 * In-memory note of the seek id the lobby adapter minted.
 *
 * This is not an Ultron port. `ILichessLobby.seek` cannot return the id because
 * `GameHandle` has only `gameId` and `color`. The waiting screen reads
 * {@link LobbyWaitLog.currentSeekId} and then calls `cancelSeek` on the real port.
 */
export class LobbyWaitLog implements ISeekIdSource {
  private seekId: string | null = null
  private challengeId: string | null = null

  /**
   * @param id - Seek id the adapter will honor in `cancelSeek`.
   */
  noteSeek(id: string): void {
    this.seekId = id
  }

  /**
   * @param id - Local challenge correlation. The Ultron port has no cancel-challenge method.
   */
  noteChallenge(id: string): void {
    this.challengeId = id
  }

  /** Drop the seek id after cancel or after the seek pairs. */
  clearSeek(): void {
    this.seekId = null
  }

  /** Drop seek and challenge notes together. */
  clear(): void {
    this.seekId = null
    this.challengeId = null
  }

  /** @inheritdoc */
  currentSeekId(): string | null {
    return this.seekId
  }

  /** Challenge note, or `null`. */
  currentChallengeId(): string | null {
    return this.challengeId
  }
}
