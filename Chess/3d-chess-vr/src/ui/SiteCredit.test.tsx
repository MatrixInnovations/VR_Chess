import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SiteCredit } from './SiteCredit'

describe('SiteCredit', () => {
  it('names Andrew and links The Software Doctor in a new tab', () => {
    render(<SiteCredit />)
    expect(screen.getByText(/Developed and Designed by/)).toBeTruthy()
    expect(screen.getByText('Andrew').className).toContain('site-credit-name')
    expect(screen.getByText('Yeshua is Lord')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'The Software Doctor' })
    expect(link.getAttribute('href')).toBe('https://thesoftwaredoctor.com/card')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.className).toContain('site-credit-name')
  })
})
