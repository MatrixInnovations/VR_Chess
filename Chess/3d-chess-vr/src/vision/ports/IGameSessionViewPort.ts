/**
 * Read-only identity of an Ultron game session.
 *
 * Local stub until the Ultron lane publishes the real session port.
 * The only member is identity, so a view cannot apply, undo, or reorder moves
 * through this type.
 */
export interface IGameSessionViewPort {
  /**
   * Opaque session id. Callers also use object identity of the port itself
   * to prove a mode toggle did not replace the session.
   */
  readonly id: string
}
