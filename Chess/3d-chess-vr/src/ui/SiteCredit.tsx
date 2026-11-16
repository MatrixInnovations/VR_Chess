import type { ReactElement } from 'react'

/**
 * Site credit. Sits over the hall without covering the board.
 * @returns The credit line and the confession under it.
 */
export function SiteCredit(): ReactElement {
  return (
    <footer className="site-credit">
      <p>
        Developed and Designed by <span className="site-credit-name">Andrew</span>{' '}
        <a
          className="site-credit-name"
          href="https://thesoftwaredoctor.com/card"
          target="_blank"
          rel="noopener noreferrer"
        >
          The Software Doctor
        </a>
      </p>
      <p>Yeshua is Lord</p>
    </footer>
  )
}
