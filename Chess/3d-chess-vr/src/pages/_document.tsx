import type { ReactElement } from 'react'
import Document, { Head, Html, Main, NextScript } from 'next/document'

/**
 * HTML document. No third-party scripts.
 */
export default class HallDocument extends Document {
  /**
   * @returns The document shell around the Next.js app.
   */
  public render(): ReactElement {
    return (
      <Html lang="en">
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
