import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './_app'
import Home from './index'

describe('page entry', () => {
  it('mounts the foundation page through the app shell', () => {
    render(<App Component={Home} pageProps={{}} />)
    expect(screen.getByRole('heading', { name: 'Chess Hall' })).toBeTruthy()
  })
})
