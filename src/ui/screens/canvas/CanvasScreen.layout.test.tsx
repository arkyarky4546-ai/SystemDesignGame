// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { TEST_CATALOG } from '../../../engine/test-helpers'
import { createGameStore } from '../../../state/store'
import { FIXED_NOW, memoryStorage } from '../../../state/test-helpers'
import { CanvasScreen } from './CanvasScreen'

// 05-UI-DESIGN §9 layouts, chosen by viewport width. jsdom has no matchMedia, so each test
// answers min-width queries for the width it simulates.
function renderAt(width: number, guide?: ReactNode) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
  const store = createGameStore({ storage: memoryStorage(), catalog: TEST_CATALOG, now: FIXED_NOW })
  store.getState().startRun(1)
  render(<CanvasScreen store={store} guide={guide} />)
  return { store, canvas: screen.getByRole('application', { name: 'Architecture canvas' }), user: userEvent.setup() }
}

const follows = (earlier: Node, later: Node | null) =>
  later !== null && Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING)

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('canvas screen layout (05-UI-DESIGN §9)', () => {
  it.each([1440, 900])('at %ipx shows palette, canvas and inspector side by side, all editable', (width) => {
    const { canvas } = renderAt(width)
    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Inspector' })).toBeTruthy()
    expect(document.querySelectorAll('details')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'On the canvas' })).toBeNull()
    expect(canvas.querySelectorAll('[data-port="out"]').length).toBeGreaterThan(0)
  })

  it('below 900px gives the canvas full width and moves palette and inspector into bottom sheets', () => {
    const { canvas } = renderAt(600)
    const sheets = [...document.querySelectorAll('details > summary')].map((summary) => summary.textContent)
    expect(sheets).toEqual(['Catalog', 'Inspector'])
    expect(canvas.querySelectorAll('[data-port="out"]').length).toBeGreaterThan(0)
  })

  it('below 600px makes the canvas pan and zoom only, with editing through the component list', async () => {
    const { store, canvas, user } = renderAt(400)
    expect(canvas.querySelectorAll('[data-port="out"]')).toHaveLength(0)
    expect(canvas.querySelector('[data-part="body"].cursor-grab')).toBeNull()

    // The canvas itself ignores editing keys.
    canvas.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Delete}')
    expect(store.getState().run?.architecture.nodes).toHaveLength(3)

    // The list selects; the inspector and palette edit.
    const list = screen.getByRole('region', { name: 'On the canvas' })
    await user.click(within(list).getByRole('button', { name: /Database/ }))
    expect(screen.getByRole('region', { name: 'Database' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'App server' }))
    expect(store.getState().run?.architecture.nodes).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Remove App server 2' }))
    expect(store.getState().run?.architecture.nodes).toHaveLength(3)
  })

  it('zooms the canvas between 50% and 150%', async () => {
    const { canvas, user } = renderAt(400)
    const width = () => Number(canvas.getAttribute('width'))
    const full = width()
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(width()).toBe(full / 2)
    expect(screen.getByRole('button', { name: 'Zoom out' }).hasAttribute('disabled')).toBe(true)
    for (let step = 0; step < 4; step++) await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(width()).toBe(full * 1.5)
    expect(screen.getByRole('button', { name: 'Zoom in' }).hasAttribute('disabled')).toBe(true)
  })

  it.each([1440, 900])('at %ipx shows the week guide above the three columns', (width) => {
    renderAt(width, <section aria-label="Week guide" />)
    const guide = screen.getByRole('region', { name: 'Week guide' })
    expect(follows(guide, screen.getByRole('heading', { name: 'Catalog' }))).toBe(true)
  })

  // A banner above the canvas took it down to 97px tall at 600 × 900 (ADR-0038).
  it.each([
    { width: 600, panelStart: () => document.querySelector('details') },
    { width: 400, panelStart: () => screen.getByRole('region', { name: 'On the canvas' }) },
  ])('at $width px puts the week guide under the canvas, first in the panel that scrolls', ({ width, panelStart }) => {
    const { canvas } = renderAt(width, <section aria-label="Week guide" />)
    const guide = screen.getByRole('region', { name: 'Week guide' })
    expect(follows(canvas, guide)).toBe(true)
    expect(follows(guide, panelStart())).toBe(true)
  })
})
