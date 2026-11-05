import type { ReactElement } from 'react'
import type { AppProps } from 'next/app'
import '../styles/global.css'

/**
 * Next.js app shell. Global CSS only; lanes add their own providers.
 *
 * @param props - The active page component and its props.
 * @returns The page.
 */
export default function App({ Component, pageProps }: AppProps): ReactElement {
  return <Component {...pageProps} />
}
