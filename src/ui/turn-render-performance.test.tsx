// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { chainRun } from '../engine/test-helpers'
import { CONTENT_CATALOG } from '../state/catalog'
import { createGameStore } from '../state/store'
import { FIXED_NOW, memoryStorage } from '../state/test-helpers'
import { App } from './App'

// M4's acceptance: turn resolution renders in under 16 ms for a 50-node architecture. This
// times React turning a resolved turn into DOM: the engine call, all 50 nodes and 49 edges
// taking their new load, the status bar, and the report dialog opening with its four charts
// and components table. jsdom does no layout or paint; a real browser's frame is measured
// in ADR-0036.

const NODES = 50
const FRAME_BUDGET_MS = 16
const WARMUP_TURNS = 3
const MEASURED_TURNS = 9

afterEach(cleanup)

describe('turn resolution render time (M4 acceptance)', () => {
  it(`commits a resolved turn on a ${NODES}-node architecture, report included, in under ${FRAME_BUDGET_MS} ms`, () => {
    const store = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })
    // Reduced motion, so the report opens in the same commit instead of after the animation.
    store.setState({ run: chainRun(NODES), settings: { ...store.getState().settings, reducedMotion: true } })
    render(<App store={store} />)
    expect(screen.getByRole('application', { name: 'Architecture canvas' }).querySelectorAll('[data-node-id]')).toHaveLength(NODES)

    const timings: number[] = []
    for (let turn = 1; turn <= WARMUP_TURNS + MEASURED_TURNS; turn++) {
      const start = performance.now()
      act(() => store.getState().advanceTurn())
      const elapsed = performance.now() - start
      expect(screen.getByRole('dialog', { name: `Week ${turn}` })).toBeTruthy()
      if (turn > WARMUP_TURNS) timings.push(elapsed)
      act(() => fireEvent.click(screen.getByRole('button', { name: 'Back to canvas' })))
    }

    const median = [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)] ?? Infinity
    expect(median, `timings ${timings.map((ms) => ms.toFixed(1)).join(', ')} ms`).toBeLessThan(FRAME_BUDGET_MS)
  })
})
