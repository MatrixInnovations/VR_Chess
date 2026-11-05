import type { ITourGuide, ITourStep } from './ITourGuide'

/** Where a {@link TourGuide} is in the first-run flow. */
type TourPhase = 'idle' | 'active' | 'skipped' | 'completed'

/**
 * Raised when a tour is constructed with no steps or with a repeated step id.
 */
export class InvalidTourError extends Error {
  /**
   * @param message - Why the step list was rejected.
   */
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTourError'
  }
}

/**
 * First-run guide. Steps play in constructor order.
 *
 * Skip hides the tour and remembers the step. Resume shows that same step
 * rather than starting over. A legal move is always allowed, including while
 * a step is on screen; reporting the move does not change the step.
 */
export class TourGuide implements ITourGuide {
  private readonly steps: readonly ITourStep[]
  private index = 0
  private phase: TourPhase = 'idle'

  /**
   * @param steps - First-run steps in display order. Copied so later edits to
   * the caller's array cannot reorder the tour.
   * @throws {InvalidTourError} When `steps` is empty or contains a duplicate id.
   */
  constructor(steps: readonly ITourStep[]) {
    if (steps.length === 0) {
      throw new InvalidTourError('TourGuide requires at least one step')
    }
    const seen = new Set<string>()
    for (const step of steps) {
      if (seen.has(step.id)) {
        throw new InvalidTourError(`Duplicate tour step id: ${step.id}`)
      }
      seen.add(step.id)
    }
    this.steps = steps.slice()
  }

  /** Begin or restart the tour at the first step. */
  start(): void {
    this.index = 0
    this.phase = 'active'
  }

  /**
   * Advance to the next step.
   * No-op unless the tour is active. The step after the last one completes the tour.
   */
  next(): void {
    if (this.phase !== 'active') return
    if (this.index >= this.steps.length - 1) {
      this.phase = 'completed'
      return
    }
    this.index += 1
  }

  /**
   * Hide the tour without finishing it.
   * The index stays put so {@link TourGuide.resume} shows this same step.
   * No-op unless the tour is active.
   */
  skip(): void {
    if (this.phase !== 'active') return
    this.phase = 'skipped'
  }

  /**
   * Show the step that was current at {@link TourGuide.skip}.
   * No-op unless the tour is skipped.
   */
  resume(): void {
    if (this.phase !== 'skipped') return
    this.phase = 'active'
  }

  /**
   * The step on screen, or `null` when idle, skipped, or completed.
   */
  current(): ITourStep | null {
    if (this.phase !== 'active') return null
    return this.steps[this.index]
  }

  /** Whether a step is currently on screen. */
  isActive(): boolean {
    return this.phase === 'active'
  }

  /**
   * Whether the first run is still unfinished.
   * `false` only after the player advances past the last step.
   */
  isFirstRunPending(): boolean {
    return this.phase !== 'completed'
  }

  /**
   * Whether a legal move may be played.
   * Always `true` in every phase. The tour is a hint layer, not an input lock.
   */
  allowsLegalMove(): boolean {
    return true
  }

  /**
   * Accept a report that a legal move was played.
   * The phase and step index stay as they are, so the move is not consumed
   * by the tour and is not blocked by it.
   */
  acknowledgeLegalMove(): void {
    // Intentional no-op: a legal move must not advance, skip, or close the tour.
    return
  }
}
