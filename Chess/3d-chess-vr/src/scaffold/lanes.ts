/**
 * One feature lane. Implementation lives on that lane's branch, not here.
 */
export interface Lane {
  /** Stable id used in folders and docs. */
  id: string
  /** Short name shown on the foundation page. */
  title: string
  /** Pull request that owns the lane. */
  pr: number
  /** Path teammates add code under, relative to the repo root. */
  folder: string
}

/**
 * The lanes that branch off this scaffold, in merge order.
 *
 * Foundation does not implement these. It only names them so the mount
 * point and the docs stay in step.
 */
export class LaneCatalog {
  private readonly lanes: readonly Lane[]

  /**
   * @param lanes - Lane records. Order is preserved by {@link LaneCatalog.list}.
   */
  constructor(lanes: readonly Lane[]) {
    this.lanes = lanes
  }

  /**
   * The four open feature lanes.
   *
   * @returns A catalog of Vision, Mad Scientist, Fridae, and Ultron.
   */
  static standard(): LaneCatalog {
    return new LaneCatalog([
      {
        id: 'vision',
        title: 'Vision UI',
        pr: 1,
        folder: 'Chess/3d-chess-vr/src/vision',
      },
      {
        id: 'mad-scientist',
        title: 'Mad Scientist hall and input',
        pr: 2,
        folder: 'Chess/3d-chess-vr/src/mad-scientist',
      },
      {
        id: 'fridae',
        title: 'Fridae clock',
        pr: 3,
        folder: 'fridae-clock',
      },
      {
        id: 'ultron',
        title: 'Ultron core',
        pr: 5,
        folder: 'Chess/3d-chess-vr/src/ultron',
      },
    ])
  }

  /**
   * @returns Every lane, in catalog order.
   */
  list(): readonly Lane[] {
    return this.lanes
  }

  /**
   * @param pr - Pull request number.
   * @returns The matching lane, or `undefined` when this scaffold does not track that PR.
   */
  byPr(pr: number): Lane | undefined {
    return this.lanes.find((lane) => lane.pr === pr)
  }

  /**
   * @param folder - Repo-relative folder from {@link Lane.folder}.
   * @returns The matching lane, or `undefined` when the folder is not a lane root.
   */
  byFolder(folder: string): Lane | undefined {
    return this.lanes.find((lane) => lane.folder === folder)
  }
}
