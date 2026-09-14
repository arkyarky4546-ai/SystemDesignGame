// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { forecastTraffic, type RunState } from '../engine'
import { CONTENT_CATALOG } from '../state/catalog'
import { createGameStore } from '../state/store'
import { FIXED_NOW, memoryStorage } from '../state/test-helpers'
import { App } from './App'
import { formatCount, formatDollars, formatErrorRate, formatMs, formatRps } from './format'
import { describeLoad } from './screens/report/load-paragraph'

afterEach(cleanup)

function setup({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const store = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })
  store.getState().startRun(1)
  store.setState({ settings: { ...store.getState().settings, reducedMotion } })
  render(<App store={store} />)
  const run = (): RunState => {
    const current = store.getState().run
    if (!current) throw new Error('expected a run')
    return current
  }
  return { store, run, user: userEvent.setup() }
}

const advanceButton = () => screen.getByRole('button', { name: 'Advance week' })
const describedBy = (element: HTMLElement) => document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent
const canvas = () => screen.getByRole('application', { name: 'Architecture canvas' })
const status = () => screen.getByLabelText('Run status')

describe('the playable loop (M4 acceptance)', () => {
  it('resolves a full turn end to end: plan, build, advance, report, and round again', async () => {
    const { store, run, user } = setup({ reducedMotion: true })

    // Plan: next week's peak is on screen before Advance.
    const forecast = forecastTraffic(run(), store.getState().settings.difficulty)
    expect(screen.getByText(/^Forecast for week 1:/).textContent).toContain(`${formatRps(forecast.peakRps)} at peak`)
    expect(within(status()).getByText(formatDollars(run().cashCents))).toBeTruthy()

    // Build: a larger app server, whose setup cost shows before Advance.
    canvas().focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    await user.selectOptions(within(screen.getByRole('region', { name: 'App server' })).getByLabelText('Size'), '1')
    expect(describedBy(advanceButton())).toContain('$400 setup')

    // Advance: the report opens on the week that just ran.
    await user.click(advanceButton())
    expect(run().turn).toBe(1)
    const dialog = await screen.findByRole('dialog', { name: 'Week 1' })
    for (const title of ['p99 latency', 'Error rate', 'Cash', 'Users']) {
      expect(within(dialog).getByRole('region', { name: title })).toBeTruthy()
    }
    const lastTurn = store.getState().ui.lastTurn
    if (!lastTurn) throw new Error('expected a resolved turn')
    expect(lastTurn.before.architecture.nodes.find((node) => node.id === 'app')?.tier).toBe(1)
    expect(dialog.textContent).toContain(describeLoad(lastTurn.result, lastTurn.before.architecture))
    expect(within(status()).getByText(formatDollars(run().cashCents))).toBeTruthy()

    // Back to the canvas with focus on Advance, then round again.
    await user.click(within(dialog).getByRole('button', { name: 'Back to canvas' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(advanceButton()))
    expect(screen.getByText(/^Forecast for week 2:/)).toBeTruthy()
    expect(screen.getByText(/last week/).textContent).toContain(formatRps(lastTurn.result.peakRps))
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Week 2' })).toBeTruthy()
    expect(run().turn).toBe(2)
  })

  it('gives every report chart a working table view', async () => {
    const { run, user } = setup({ reducedMotion: true })
    for (let week = 1; week <= 3; week++) {
      await user.click(advanceButton())
      await screen.findByRole('dialog', { name: `Week ${week}` })
      // Escape closes the report as well as the button does.
      if (week < 3) await user.keyboard('{Escape}')
    }
    const dialog = screen.getByRole('dialog', { name: 'Week 3' })
    const { history } = run()
    const expected: Readonly<Record<string, readonly string[]>> = {
      'p99 latency': history.map((turn) => formatMs(turn.p99Ms)),
      'Error rate': history.map((turn) => formatErrorRate(turn.errorRate)),
      Cash: history.map((turn) => formatDollars(turn.cashCents)),
      Users: history.map((turn) => formatCount(turn.users)),
    }

    for (const [title, values] of Object.entries(expected)) {
      const panel = within(dialog).getByRole('region', { name: title })
      expect(within(panel).getByRole('img')).toBeTruthy()
      await user.click(within(panel).getByRole('button', { name: `Show table for ${title}` }))
      const rows = within(within(panel).getByRole('table')).getAllByRole('row').slice(1)
      expect(rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual(values)
      expect(within(panel).queryByRole('img')).toBeNull()
      await user.click(within(panel).getByRole('button', { name: `Show chart for ${title}` }))
      expect(within(panel).getByRole('img')).toBeTruthy()
      expect(within(panel).queryByRole('table')).toBeNull()
    }
  })

  it('says why an architecture can’t run before Advance is pressed, and doesn’t run it', async () => {
    const { store, run, user } = setup({ reducedMotion: true })
    const { architecture } = run()
    act(() =>
      store.getState().setArchitecture({
        nodes: [...architecture.nodes, { id: 'database-1', kind: 'database', replicas: 1, tier: 0, config: {}, position: { col: 1, row: 2 } }],
        edges: [...architecture.edges, { from: 'app', to: 'database-1' }],
      }),
    )
    expect(advanceButton().getAttribute('aria-disabled')).toBe('true')
    expect(describedBy(advanceButton())).toBe(
      'App server sends requests to 2 components. Requests follow a single path for now, so remove all but one of those connections.',
    )
    await user.click(advanceButton())
    expect(run().turn).toBe(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('animates load flowing along the edges, then opens the report', async () => {
    const { run, user } = setup({ reducedMotion: false })
    await user.click(advanceButton())
    expect(run().turn).toBe(1)
    expect(canvas().getAttribute('data-flowing')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(advanceButton().getAttribute('aria-disabled')).toBe('true')
    expect(await screen.findByRole('dialog', { name: 'Week 1' }, { timeout: 3_000 })).toBeTruthy()
    await waitFor(() => expect(canvas().getAttribute('data-flowing')).toBeNull())
  })

  it('under reduced motion, cuts straight to the result and highlights what changed', async () => {
    const { user } = setup({ reducedMotion: true })
    await user.click(advanceButton())
    expect(canvas().getAttribute('data-flowing')).toBeNull()
    expect(await screen.findByRole('dialog', { name: 'Week 1' })).toBeTruthy()
    expect(status().querySelector('[data-changed="true"]')).not.toBeNull()
    expect(canvas().querySelector('[data-node-id="app"]')?.getAttribute('data-changed')).toBe('true')
  })
})
