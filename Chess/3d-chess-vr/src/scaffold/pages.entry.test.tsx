import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { AppProps } from 'next/app'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-three/fiber', () => {
  const React = require('react') as typeof import('react')
  return {
    Canvas: (props: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'hall-canvas' }, props.children),
    useFrame: () => undefined,
  }
})

vi.mock('next/document', () => {
  const React = require('react') as typeof import('react')
  return {
    __esModule: true,
    default: class Document {},
    Html: (props: { children?: React.ReactNode; lang?: string }) =>
      React.createElement('html', { lang: props.lang }, props.children),
    Head: (props: { children?: React.ReactNode }) => React.createElement('head', null, props.children),
    Main: () => React.createElement('div', { id: 'main' }),
    NextScript: () => React.createElement('script', { id: 'next' }),
  }
})

vi.mock('@react-three/xr', () => {
  const React = require('react') as typeof import('react')
  return {
    XR: (props: { children?: React.ReactNode }) => React.createElement('div', null, props.children),
    XROrigin: React.forwardRef(() => null),
    useXR: () => ({ inputSourceStates: [] }),
    createXRStore: () => ({
      enterVR: async () => undefined,
      enterAR: async () => undefined,
      getState: () => ({}),
      onSessionEnd: () => () => undefined,
    }),
  }
})

import App from '../pages/_app'
import HallDocument from '../pages/_document'
import Home from '../pages/index'

describe('page entry', () => {
  it('mounts the hall through the app shell', () => {
    const props = {
      Component: Home,
      pageProps: {},
      router: {} as AppProps['router'],
    }
    render(<App {...props} />)
    expect(screen.getByRole('heading', { name: 'Chess Hall' })).toBeTruthy()
  })

  it('renders the html document shell', () => {
    const DocumentCtor = HallDocument as unknown as new () => { render: () => ReactElement }
    const markup = renderToStaticMarkup(new DocumentCtor().render())
    expect(markup).toContain('lang="en"')
  })
})
