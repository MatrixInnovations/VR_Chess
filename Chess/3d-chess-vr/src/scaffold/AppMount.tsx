import type { ReactElement } from 'react'
import { LaneCatalog } from './lanes'

/**
 * Mount point for the chess app.
 *
 * Feature lanes are not imported here. They attach to this shell on their
 * own branches. Rendering this component does not start a game, a clock,
 * or an XR session.
 *
 * @returns The foundation page listing the lane owners.
 */
export function AppMount(): ReactElement {
  const lanes = LaneCatalog.standard().list()
  return (
    <main>
      <h1>Chess Hall</h1>
      <p>Foundation scaffold. Feature lanes mount on their own branches.</p>
      <ul>
        {lanes.map((lane) => (
          <li key={lane.id}>
            PR #{lane.pr}: {lane.title}
          </li>
        ))}
      </ul>
    </main>
  )
}
