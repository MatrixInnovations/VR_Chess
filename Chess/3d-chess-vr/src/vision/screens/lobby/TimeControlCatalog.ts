/** One suggested time control. The id is the string sent as `SeekParams.timeControl`. */
export interface ITimeControlChoice {
  readonly id: string
  readonly label: string
}

/**
 * Time-control labels the lobby can offer.
 * These are display suggestions. Clock limits and increments belong to Fridae;
 * this catalog does not convert `5+0` into milliseconds.
 */
export class TimeControlCatalog {
  /** Suggested controls. Order is the order of the buttons. */
  static readonly choices: readonly ITimeControlChoice[] = [
    { id: '10+0', label: '10+0 rapid' },
    { id: '15+10', label: '15+10 rapid' },
    { id: '30+0', label: '30+0 classical' },
    { id: '5+0', label: '5+0 blitz (challenge)' },
  ]

  /** Default selection for a new lobby. Seeks must be rapid or classical. */
  static defaultId(): string {
    return '10+0'
  }

  /**
   * @param id - Candidate time-control label.
   * @returns Whether the catalog lists `id`.
   */
  static includes(id: string): boolean {
    return TimeControlCatalog.choices.some((choice) => choice.id === id)
  }
}
