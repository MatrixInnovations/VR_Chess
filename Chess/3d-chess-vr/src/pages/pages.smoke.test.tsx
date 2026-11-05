import { render, screen } from '@testing-library/react'
import type { AppProps } from 'next/app'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './_app'
import HallDocument from './_document'
import Home from './index'

describe('page entry', () => {
  it('mounts the foundation page through the app shell', () => {
    const props = {
      Component: Home,
      pageProps: {},
      router: {} as AppProps['router'],
    }
    render(<App {...props} />)
    expect(screen.getByRole('heading', { name: 'Chess Hall' })).toBeTruthy()
  })

  it('renders the html document shell', () => {
    const markup = renderToStaticMarkup(new HallDocument().render())
    expect(markup).toContain('lang="en"')
  })
})
