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
    { id: '3+2', label: '3+2 blitz' },
    { id: '5+0', label: '5+0 blitz' },
    { id: '10+0', label: '10+0 rapid' },
  ]

  /** Default selection for a new lobby. */
  static defaultId(): string {
    return '5+0'
  }

  /**
   * @param id - Candidate time-control label.
   * @returns Whether the catalog lists `id`.
   */
  static includes(id: string): boolean {
    return TimeControlCatalog.choices.some((choice) => choice.id === id)
  }
}
