import { createElement, type FC } from 'react'

import type { ChessHall } from '../hall/ChessHall'

/**
 * Thin React mount for a {@link ChessHall}.
 *
 * Gesture logic, animation, lighting choices, and move validation stay on
 * the lane classes. This component only inserts the hall root into a
 * React Three Fiber scene via the `primitive` element.
 */
export const ChessHallView: FC<{ hall: ChessHall }> = ({ hall }) => {
  return createElement('primitive', { object: hall.root })
}
