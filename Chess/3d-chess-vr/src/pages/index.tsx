import type { ReactElement } from 'react'
import { AppMount } from '../scaffold/AppMount'

/**
 * Next.js page. Delegates to {@link AppMount} and owns no game state.
 *
 * @returns The foundation mount point.
 */
export default function Home(): ReactElement {
  return <AppMount />
}
