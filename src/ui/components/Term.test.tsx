// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { CONTENT_CATALOG } from '../../state/catalog'
import { createGameStore } from '../../state/store'
import { FIXED_NOW, memoryStorage } from '../../state/test-helpers'
import { App } from '../App'
import { GLOSSARY, type TermId } from '../glossary'

afterEach(cleanup)

type User = ReturnType<typeof userEvent.setup>

function setup(): User {
  const store = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })
  store.getState().startRun(1)
  // The guide has terms of its own. These tests look at the screens under it.
  store.getState().closeGuide()
  store.setState({ settings: { ...store.getState().settings, reducedMotion: true } })
  render(<App store={store} />)
  return userEvent.setup()
}

/** The definition a term button controls, or null while it's hidden. */
const shownDefinition = (button: HTMLElement) => document.getElementById(button.getAttribute('aria-controls') ?? '')?.textContent || null

/** Presses Tab until the element has focus, the way a keyboard user reaches it. */
async function tabTo(user: User, element: HTMLElement) {
  for (let presses = 0; presses < 100 && document.activeElement !== element; presses++) await user.tab()
  expect(document.activeElement).toBe(element)
}

async function openReport(user: User) {
  await user.click(screen.getByRole('button', { name: 'Advance week' }))
  return screen.findByRole('dialog', { name: 'Week 1' })
}

describe('glossary (M4a)', () => {
  it.each(Object.entries(GLOSSARY))('defines %s in one sentence that names it', (_, { words, definition }) => {
    expect(definition.match(/[.?!](?=\s|$)/g)).toEqual(['.'])
    expect(definition.endsWith('.')).toBe(true)
    expect(definition.toLowerCase()).toContain(words.toLowerCase())
  })
})

describe('definitions where terms first appear (M4a acceptance)', () => {
  it('on the forecast line, by click, tap, Enter and Space but not hover', async () => {
    const user = setup()
    const line = screen.getByText(/^Forecast for week 1:/)
    expect(line.textContent).toMatch(/\d\/s at peak/)
    const unit = within(line).getByRole('button', { name: '/s' })

    await user.hover(unit)
    expect(shownDefinition(unit)).toBeNull()
    await user.click(unit)
    expect(unit.getAttribute('aria-expanded')).toBe('true')
    expect(shownDefinition(unit)).toBe(GLOSSARY['per-second'].definition)
    await user.click(unit)
    expect(shownDefinition(unit)).toBeNull()

    // The forecast says what to compare it with.
    const compare = screen.getByText(/^Compare the peak with/)
    expect(compare.textContent).toBe('Compare the peak with each component’s capacity in the inspector.')
    const capacity = within(compare).getByRole('button', { name: 'capacity' })
    await user.pointer({ keys: '[TouchA]', target: capacity })
    expect(shownDefinition(capacity)).toBe(GLOSSARY.capacity.definition)

    // One definition at a time: opening another replaces it.
    await user.click(unit)
    expect(capacity.getAttribute('aria-expanded')).toBe('false')
    expect(shownDefinition(unit)).toBe(GLOSSARY['per-second'].definition)
    await user.click(unit)

    await tabTo(user, capacity)
    await user.keyboard('{Enter}')
    expect(shownDefinition(capacity)).toBe(GLOSSARY.capacity.definition)
    await user.keyboard('[Space]')
    expect(shownDefinition(capacity)).toBeNull()
  })

  it('in the inspector, empty and with a component selected', async () => {
    const user = setup()
    const empty = screen.getByRole('region', { name: 'Inspector' })
    expect(within(empty).getByText(/^Compare its/).textContent).toBe('Compare its capacity with the peak in the forecast above the canvas.')
    const emptyCapacity = within(empty).getByRole('button', { name: 'capacity' })
    await user.click(emptyCapacity)
    expect(shownDefinition(emptyCapacity)).toBe(GLOSSARY.capacity.definition)

    const canvas = screen.getByRole('application', { name: 'Architecture canvas' })
    canvas.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const capacity = within(screen.getByRole('region', { name: 'App server' })).getByRole('button', { name: 'Capacity' })
    await user.click(capacity)
    expect(shownDefinition(capacity)).toBe(GLOSSARY.capacity.definition)

    // Once a week has run, last week's figures define utilization and p99 as well.
    const report = await openReport(user)
    await user.click(within(report).getByRole('button', { name: 'Back to canvas' }))
    const inspector = screen.getByRole('region', { name: 'App server' })
    const terms: readonly (readonly [string, TermId])[] = [
      ['Utilization', 'utilization'],
      ['p99', 'p99'],
    ]
    for (const [name, term] of terms) {
      const button = within(inspector).getByRole('button', { name })
      await user.click(button)
      expect(shownDefinition(button)).toBe(GLOSSARY[term].definition)
    }
  })

  it('in the weekly report’s p99 chart and its components table', async () => {
    const user = setup()
    const report = await openReport(user)

    const chart = within(report).getByRole('region', { name: 'p99 latency' })
    const p99 = within(chart).getByRole('button', { name: 'p99' })
    await user.click(p99)
    expect(shownDefinition(p99)).toBe(GLOSSARY.p99.definition)

    const table = within(report).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Component',
      'Size',
      'Received',
      'Capacity',
      'Utilization',
      'p99',
      'Turned away',
    ])
    const terms: readonly (readonly [string, TermId])[] = [
      ['Capacity', 'capacity'],
      ['Utilization', 'utilization'],
      ['p99', 'p99'],
    ]
    for (const [name, term] of terms) {
      const button = within(table).getByRole('button', { name })
      await user.click(button)
      expect(shownDefinition(button)).toBe(GLOSSARY[term].definition)
    }
  })
})
