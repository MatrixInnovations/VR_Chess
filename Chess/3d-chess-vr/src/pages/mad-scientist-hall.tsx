import dynamic from 'next/dynamic'
import type { FC } from 'react'

const HallDemoPage = dynamic(
  () => import('../mad-scientist/react/HallDemoPage').then((mod) => mod.HallDemoPage),
  { ssr: false },
)

/**
 * Local route for the Mad Scientist hall smoke test.
 * The live game stays on `/`.
 */
const MadScientistHallPage: FC = () => {
  return <HallDemoPage />
}

export default MadScientistHallPage
