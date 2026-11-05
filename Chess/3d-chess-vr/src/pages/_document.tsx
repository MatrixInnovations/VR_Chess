import type { ReactElement } from 'react'
import Document, { Head, Html, Main, NextScript } from 'next/document'

class HallDocument extends Document {
  public render(): ReactElement {
    return (
      <Html lang="en">
        <Head>
          <meta name="theme-color" content="#1a120c" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <link rel="manifest" href="/manifest.webmanifest" />
          <link rel="icon" href="/icons/icon-192.png" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link
            href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Outfit:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default HallDocument
