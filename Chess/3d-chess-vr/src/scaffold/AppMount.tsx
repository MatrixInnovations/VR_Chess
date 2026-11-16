import type { ReactElement } from 'react'

import { ChessHallPage } from '../ui/ChessHallPage'

/**
 * Home mount. The hall, the clock, and the session live in {@link ChessHallPage}.
 *
 * @returns The seated chess hall.
 */
export function AppMount(): ReactElement {
  return <ChessHallPage />
}
