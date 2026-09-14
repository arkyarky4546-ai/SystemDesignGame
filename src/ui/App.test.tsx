// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BRANDING } from '../config/branding'
import { TEST_CATALOG } from '../engine/test-helpers'
import { SAVE_VERSION, saveKey } from '../state/save'
import { createGameStore } from '../state/store'
import { FIXED_NOW, memoryStorage } from '../state/test-helpers'
import { App } from './App'

afterEach(cleanup)

describe('App shell', () => {
  it('shows the product name and the canvas for the current run', () => {
    const store = createGameStore({ storage: memoryStorage(), catalog: TEST_CATALOG, now: FIXED_NOW })
    store.getState().startRun(1)
    render(<App store={store} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(BRANDING.name)
    expect(screen.getByRole('application', { name: 'Architecture canvas' })).toBeTruthy()
  })

  it('turns motion off for the whole interface when the player asks for reduced motion', () => {
    const store = createGameStore({ storage: memoryStorage(), catalog: TEST_CATALOG, now: FIXED_NOW })
    store.getState().startRun(1)
    const { container } = render(<App store={store} />)
    expect(container.firstElementChild?.getAttribute('data-reduced-motion')).toBe('false')
    act(() => store.setState({ settings: { ...store.getState().settings, reducedMotion: true } }))
    expect(container.firstElementChild?.getAttribute('data-reduced-motion')).toBe('true')
  })

  it('tells the player when their save could not be read, and where it was kept', () => {
    const store = createGameStore({
      storage: memoryStorage({ [saveKey(SAVE_VERSION)]: '{"version":' }),
      catalog: TEST_CATALOG,
      now: FIXED_NOW,
    })
    store.getState().load()
    store.getState().startRun(1)
    render(<App store={store} />)
    expect(screen.getByRole('alert').textContent).toContain('nines.save.corrupt.2026-09-14T12:00:00.000Z')
  })
})
