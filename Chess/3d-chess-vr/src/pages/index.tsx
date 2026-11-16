import type { ReactElement } from 'react'
import Head from 'next/head'

import { AppMount } from '../scaffold/AppMount'

/**
 * Next.js page. Delegates to {@link AppMount} and owns no game state.
 *
 * @returns The foundation mount point.
 */
export default function Home(): ReactElement {
  return (
    <>
      <Head>
        <title>Chess Hall</title>
      </Head>
      <AppMount />
    </>
  )
}
