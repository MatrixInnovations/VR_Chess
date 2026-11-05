/**
 * Seek id published beside {@link ILichessLobby}, not a second lobby port.
 *
 * Ultron's `seek` resolves to a `GameHandle` (`gameId`, `color`) and `cancelSeek`
 * still needs a seek id. The in-memory adapter writes that id here when a seek
 * starts. The waiting screen calls `cancelSeek` only when this returns a string.
 */
export interface ISeekIdSource {
  /** In-flight seek id, or `null` when no seek is open. */
  currentSeekId(): string | null
}
