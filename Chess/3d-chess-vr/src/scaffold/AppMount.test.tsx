import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppMount } from './AppMount'

describe('AppMount', () => {
  it('renders the scaffold and every lane title', () => {
    render(<AppMount />)
    expect(screen.getByRole('heading', { name: 'Chess Hall' })).toBeTruthy()
    expect(screen.getByText(/Foundation scaffold/)).toBeTruthy()
    expect(screen.getByText(/PR #1: Vision UI/)).toBeTruthy()
    expect(screen.getByText(/PR #2: Mad Scientist hall and input/)).toBeTruthy()
    expect(screen.getByText(/PR #3: Fridae clock/)).toBeTruthy()
    expect(screen.getByText(/PR #5: Ultron core/)).toBeTruthy()
  })
})
