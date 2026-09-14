// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { BALANCE } from '../../config/balance'
import { CONTENT_CATALOG } from '../../state/catalog'
import { createGameStore } from '../../state/store'
import { FIXED_NOW, memoryStorage } from '../../state/test-helpers'
import { App } from '../App'
import { WEEK_GUIDE, type GuidePart, type GuideScreen } from './week-guide-copy'

afterEach(cleanup)

function setup() {
  const store = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })
  store.getState().startRun(1)
  store.setState({ settings: { ...store.getState().settings, reducedMotion: true } })
  render(<App store={store} />)
  return { store, user: userEvent.setup() }
}

const guide = () => screen.queryByRole('region', { name: WEEK_GUIDE.title })
const openGuide = () => {
  const region = guide()
  if (!region) throw new Error('expected the guide to be open')
  return region
}
const guideButton = () => screen.getByRole('button', { name: 'How a week works' })

const labels = WEEK_GUIDE.steps
  .flatMap((step) => step.body)
  .filter((part): part is Exclude<GuidePart, string> => typeof part !== 'string')
const labelsShownIn = (shownIn: GuideScreen) => labels.filter((part) => part.shownIn === shownIn).map((part) => part.text)

const normalized = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()

/** Elements outside the guide whose visible text starts with the label. */
function shownOutsideGuide(label: string, root: HTMLElement) {
  const guideElement = guide()
  return within(root).queryAllByText(
    (_, element) =>
      element !== null &&
      !element.contains(guideElement) &&
      !(guideElement?.contains(element) ?? false) &&
      normalized(element.textContent).startsWith(label),
  )
}

describe('How a week works (M4a acceptance)', () => {
  it('opens on a new run, and every label it names is on screen where the step points', async () => {
    const { user } = setup()
    openGuide()

    // Every step names something on screen, and the guide emphasizes each name.
    for (const step of WEEK_GUIDE.steps) expect(step.body.some((part) => typeof part !== 'string'), step.title).toBe(true)
    expect(openGuide().querySelectorAll('[data-guide-label]')).toHaveLength(labels.length)

    // Planning: the forecast line, a component on the canvas, the inspector and Advance week.
    for (const label of labelsShownIn('planning')) expect(shownOutsideGuide(label, document.body), label).not.toHaveLength(0)
    const canvas = screen.getByRole('application', { name: 'Architecture canvas' })
    expect(labelsShownIn('planning').filter((label) => within(canvas).queryAllByText(label).length > 0)).not.toHaveLength(0)

    // The inspector's size and capacity, once a component is selected.
    canvas.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const inspector = screen.getByRole('region', { name: 'App server' })
    for (const label of labelsShownIn('selection')) expect(shownOutsideGuide(label, inspector), label).not.toHaveLength(0)

    // The weekly report.
    await user.click(screen.getByRole('button', { name: 'Advance week' }))
    const report = await screen.findByRole('dialog', { name: 'Week 1' })
    for (const label of labelsShownIn('report')) expect(shownOutsideGuide(label, report), label).not.toHaveLength(0)
  })

  it('closes and reopens from the header with the mouse', async () => {
    const { user } = setup()
    expect(guideButton().getAttribute('aria-expanded')).toBe('true')
    expect(guideButton().getAttribute('aria-controls')).toBe(openGuide().id)

    await user.click(within(openGuide()).getByRole('button', { name: 'Close guide' }))
    expect(guide()).toBeNull()
    expect(guideButton().getAttribute('aria-expanded')).toBe('false')

    await user.click(guideButton())
    expect(guide()).not.toBeNull()
    await user.click(guideButton())
    expect(guide()).toBeNull()
  })

  it('closes and reopens with the keyboard alone', async () => {
    const { user } = setup()
    await user.tab()
    expect(document.activeElement).toBe(guideButton())
    await user.tab()
    expect(document.activeElement).toBe(within(openGuide()).getByRole('button', { name: 'Close guide' }))

    // Closing from inside puts focus back on the button that reopens it.
    await user.keyboard('{Enter}')
    expect(guide()).toBeNull()
    expect(document.activeElement).toBe(guideButton())

    // Opened from the header, the guide takes focus, wherever the layout puts it.
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(within(openGuide()).getByRole('heading', { name: WEEK_GUIDE.title }))
    await user.tab()
    expect(document.activeElement).toBe(within(openGuide()).getByRole('button', { name: 'Close guide' }))
    await user.keyboard('{Escape}')
    expect(guide()).toBeNull()
    expect(document.activeElement).toBe(guideButton())
  })

  it('stays where the player left it after a week runs', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Advance week' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Week 1' })).getByRole('button', { name: 'Back to canvas' }))
    expect(guide()).not.toBeNull()
  })

  it('says every request passes through each component only while an app server makes one query per request', () => {
    // Step 3's sizing advice depends on this. A different fanout needs new copy.
    expect(BALANCE.starter.appFanoutFactor).toBe(1)
  })
})
