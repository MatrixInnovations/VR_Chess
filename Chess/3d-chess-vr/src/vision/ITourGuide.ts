/**
 * One first-run step. Steps are informational and must not forbid a legal move.
 */
export interface ITourStep {
  /** Stable id, unique within a tour. */
  readonly id: string
  /** Short heading shown for the step. */
  readonly title: string
  /** Explanatory body. Must not tell the client to reject moves. */
  readonly body: string
}

/**
 * First-run tour. Implementations show steps in order, allow skip and resume,
 * and never gate a legal chess move.
 */
export interface ITourGuide {
  /** Begin or restart the tour at the first step. */
  start(): void

  /** Advance to the next step. Completes the tour after the last step. */
  next(): void

  /**
   * Leave the tour without completing it.
   * The current step is kept so {@link ITourGuide.resume} continues in order.
   */
  skip(): void

  /** Continue from the step that was current when {@link ITourGuide.skip} was called. */
  resume(): void

  /**
   * The step on screen, or `null` when the tour is not showing a step.
   */
  current(): ITourStep | null

  /** Whether a step is currently on screen. */
  isActive(): boolean

  /**
   * Whether the first run is still unfinished.
   * Skip does not finish the tour. Only walking off the last step does.
   */
  isFirstRunPending(): boolean

  /**
   * Whether a legal chess move may be played right now.
   * Always `true`. The tour must not gate input.
   */
  allowsLegalMove(): boolean

  /**
   * Record that the player played a legal move.
   * Must not advance, skip, or close the tour.
   */
  acknowledgeLegalMove(): void
}
