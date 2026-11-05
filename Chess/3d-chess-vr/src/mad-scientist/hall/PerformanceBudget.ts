import { QUEST_PRO_FPS_FLOOR, QUEST_PRO_FPS_TARGET } from './metrics'

/** Sink for the under-floor warning. The hall passes `console` in production. */
export interface PerformanceLogger {
  warn(message: string): void
}

/** Result of one {@link PerformanceBudget.sample} call. */
export interface FrameReport {
  readonly fps: number
  readonly underFloor: boolean
  readonly warned: boolean
}

/** Options for {@link PerformanceBudget}. Defaults are the Quest Pro band. */
export interface PerformanceBudgetOptions {
  floorFps?: number
  targetFps?: number
  logger?: PerformanceLogger
}

/**
 * Watches frame timestamps against the Quest Pro floor of 72fps (target 90).
 *
 * A dip under the floor logs once. The warning arms again only after fps
 * climbs back to the floor, so a long thermal sag does not flood the log
 * and a later sag is still visible.
 */
export class PerformanceBudget {
  /** Quest Pro minimum refresh this hall is willing to call "fine". */
  static readonly QUEST_PRO_FLOOR_FPS = QUEST_PRO_FPS_FLOOR

  /** Quest Pro mode the lighting and shadow map were sized for. */
  static readonly QUEST_PRO_TARGET_FPS = QUEST_PRO_FPS_TARGET

  /** Active floor, in frames per second. */
  readonly floorFps: number

  /** Active target, included in the warning so a log line has both numbers. */
  readonly targetFps: number

  private readonly logger: PerformanceLogger | undefined

  private lastTimestamp: number | null = null

  private underLatch = false

  private warnCount = 0

  private lastFps: number

  constructor(options: PerformanceBudgetOptions = {}) {
    this.floorFps = options.floorFps ?? PerformanceBudget.QUEST_PRO_FLOOR_FPS
    this.targetFps = options.targetFps ?? PerformanceBudget.QUEST_PRO_TARGET_FPS
    this.logger = options.logger
    this.lastFps = this.targetFps
  }

  /**
   * Record a frame timestamp in milliseconds.
   * The first call only stores a baseline and never warns.
   * Non-positive deltas are ignored so a clock jump cannot divide by zero.
   */
  sample(timestampMs: number): FrameReport {
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestampMs
      return { fps: this.lastFps, underFloor: false, warned: false }
    }

    const delta = timestampMs - this.lastTimestamp
    this.lastTimestamp = timestampMs
    if (!(delta > 0)) {
      return { fps: this.lastFps, underFloor: this.lastFps < this.floorFps, warned: false }
    }

    const fps = 1000 / delta
    this.lastFps = fps
    const underFloor = fps < this.floorFps
    let warned = false
    if (underFloor && !this.underLatch) {
      // Latch until fps recovers so a multi-second dip logs a single line.
      this.underLatch = true
      this.warnCount += 1
      warned = true
      this.logger?.warn(
        `PerformanceBudget: ${fps.toFixed(1)} fps is under the Quest Pro floor of ${this.floorFps} fps (target ${this.targetFps}).`,
      )
    } else if (!underFloor && this.underLatch) {
      this.underLatch = false
    }
    return { fps, underFloor, warned }
  }

  /** Frames per second from the last positive delta, or the target before that. */
  getLastFps(): number {
    return this.lastFps
  }

  /** How many times the floor warning has fired. */
  getWarnCount(): number {
    return this.warnCount
  }
}
