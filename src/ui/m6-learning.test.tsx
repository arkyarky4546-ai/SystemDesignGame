// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { COMPONENT_DEFS } from '../content/components'
import { CONCEPTS } from '../content/concepts'
import { DEMOS } from '../content/demos'
import type { ComponentDef, ComponentKind } from '../content/schema'
import { meanResponseTimeMs, p99LatencyMs, utilization, type Knowledge } from '../engine'
import { CONTENT_CATALOG } from '../state/catalog'
import { passThreshold } from '../state/check'
import { architectureFor } from '../state/diagram'
import { createGameStore } from '../state/store'
import { FIXED_NOW, memoryStorage } from '../state/test-helpers'
import { App } from './App'
import { formatMs, formatUtilization } from './format'
import { ComponentPalette } from './screens/canvas/ComponentPalette'

afterEach(cleanup)

const NOTHING_LEARNED: Knowledge = { unlockedConcepts: [], checkHistory: [] }

function setup() {
  const store = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })
  store.getState().startRun(3)
  store.setState({ settings: { ...store.getState().settings, reducedMotion: true } })
  render(<App store={store} />)
  return { store, user: userEvent.setup() }
}

const library = () => screen.getByRole('button', { name: 'Library' })

describe('the library (00-GAME-DESIGN §7)', () => {
  it('lists every concept by tier, passed or not, and opens a lesson', async () => {
    const { user } = setup()
    await user.click(library())

    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tier 1' })).toBeTruthy()
    for (const concept of Object.values(CONCEPTS)) {
      expect(screen.getByRole('button', { name: concept.title }), concept.id).toBeTruthy()
      expect(screen.getByText(concept.oneLiner), concept.id).toBeTruthy()
    }

    // A concept whose check hasn't been passed is still readable: looking things up is the job.
    expect(screen.getAllByText(/not passed yet/).length).toBe(Object.keys(CONCEPTS).length)
    await user.click(screen.getByRole('button', { name: CONCEPTS.percentiles.title }))
    expect(screen.getByRole('heading', { name: CONCEPTS.percentiles.title })).toBeTruthy()
  })

  it('searches the lessons, not just the titles', async () => {
    const { user } = setup()
    await user.click(library())
    const search = screen.getByLabelText('Search the lessons')

    await user.type(search, 'support queue')
    expect(screen.queryByRole('button', { name: CONCEPTS.percentiles.title })).not.toBeNull()
    expect(screen.queryByRole('button', { name: CONCEPTS['capacity-and-utilization'].title })).toBeNull()

    await user.clear(search)
    await user.type(search, 'nothing in any lesson')
    expect(screen.getByText(/Nothing matches that/)).toBeTruthy()
  })
})

describe('practice mode (09-QUESTION-BANK §9)', () => {
  it('asks questions without a score, and changes nothing about the run', async () => {
    const { store, user } = setup()
    const cashBefore = store.getState().run?.cashCents
    await user.click(library())
    await user.click(screen.getAllByRole('button', { name: 'Practise this concept' })[0] as HTMLElement)

    expect(await screen.findByRole('heading', { name: /^Practising / })).toBeTruthy()
    expect(await screen.findByText(/No score, no threshold/)).toBeTruthy()
    expect(screen.getByText(/0 right of 0 asked/)).toBeTruthy()

    // Answering something doesn't touch knowledge, unlocks or cash.
    const options = screen.queryAllByRole('radio')
    if (options.length > 0) {
      await user.click(options[0] as HTMLElement)
      await user.click(screen.getByRole('button', { name: 'Check answer' }))
      expect(screen.getByRole('button', { name: 'Next question' })).toBeTruthy()
    }
    expect(store.getState().knowledge).toEqual(NOTHING_LEARNED)
    expect(store.getState().run?.cashCents).toBe(cashBefore)
  })
})

describe('the saturation demo (03-CONTENT-SCHEMA §7)', () => {
  it('shows what the real engine says at the load the slider is on', async () => {
    const { user } = setup()
    await user.click(library())
    await user.click(screen.getByRole('button', { name: CONCEPTS['capacity-and-utilization'].title }))

    const slider = screen.getByLabelText(DEMOS.saturation.variable.label, { exact: false }) as HTMLInputElement
    expect(slider.min).toBe(String(DEMOS.saturation.variable.min))
    expect(slider.max).toBe(String(DEMOS.saturation.variable.max))

    const app = CONTENT_CATALOG['app-server'][2]
    if (!app) throw new Error('expected the app server tier the demo names')
    const shown = (load: number) => {
      const u = utilization(load, app.capacityRps)
      return { u: formatUtilization(u), p99: formatMs(p99LatencyMs(meanResponseTimeMs(app.serviceTimeMs, u))) }
    }

    // Low on the curve, then high: the figures are the engine's, and p99 climbs steeply.
    for (const load of [20, 140]) {
      fireEvent.change(slider, { target: { value: String(load) } })
      const expected = shown(load)
      expect(await screen.findByText(expected.u), `utilization at ${load}`).toBeTruthy()
      expect(screen.getByText(expected.p99), `p99 at ${load}`).toBeTruthy()
    }
  })
})

describe('lesson diagrams (03-CONTENT-SCHEMA §2)', () => {
  it('render through the real canvas component, from an architecture the game could build', async () => {
    const { user } = setup()
    await user.click(library())
    await user.click(screen.getByRole('button', { name: CONCEPTS['capacity-and-utilization'].title }))

    const diagram = CONCEPTS['capacity-and-utilization'].lesson.core.find((block) => block.kind === 'diagram')
    if (!diagram || diagram.kind !== 'diagram') throw new Error('expected a diagram block')

    const canvas = screen.getByRole('application', { name: diagram.caption })
    expect(canvas).toBeTruthy()
    for (const node of diagram.architecture.nodes) {
      expect(within(canvas).getAllByText(COMPONENT_DEFS[node.kind].displayName, { exact: false }).length, node.id).toBeGreaterThan(0)
    }

    // The value behind it is a real Architecture, laid out the way the game lays one out.
    const built = architectureFor(diagram.architecture)
    expect(built.nodes.map((node) => node.id)).toEqual(diagram.architecture.nodes.map((node) => node.id))
    for (const node of built.nodes) {
      expect(Number.isInteger(node.position.col) && Number.isInteger(node.position.row), node.id).toBe(true)
    }
  })
})

describe('difficulty, switchable at any time (00-GAME-DESIGN §6)', () => {
  it('changes the threshold and the economy from the next turn, and loses no progress', async () => {
    const { store, user } = setup()
    store.setState({ knowledge: { unlockedConcepts: ['percentiles'], checkHistory: [] } })
    const runBefore = store.getState().run

    await user.selectOptions(screen.getByLabelText('Difficulty'), 'staff')

    expect(store.getState().settings.difficulty).toBe('staff')
    expect(passThreshold('staff')).toBeGreaterThan(passThreshold('junior'))
    expect(BALANCE.traffic.baseGrowthPerTurn.staff).toBeGreaterThan(BALANCE.traffic.baseGrowthPerTurn.junior)
    // The run and what was learned are untouched: switching is not a penalty.
    expect(store.getState().run).toEqual(runBefore)
    expect(store.getState().knowledge.unlockedConcepts).toEqual(['percentiles'])
  })
})

describe('the catalog names what gates a component (00-GAME-DESIGN §4)', () => {
  it('says which sizes are locked, and by which concept', async () => {
    const { user } = setup()
    const palette = screen.getByRole('region', { name: 'Catalog' })
    expect(within(palette).getByText(/Medium, Large and Extra large need/)).toBeTruthy()

    await user.click(within(palette).getByRole('button', { name: 'Open the lesson' }))
    expect(screen.getByRole('heading', { name: CONCEPTS['capacity-and-utilization'].title })).toBeTruthy()
  })

  it('shows a component gated as a whole as a locked card that opens its lesson', async () => {
    const opened: string[] = []
    const gated: Record<ComponentKind, ComponentDef> = {
      ...COMPONENT_DEFS,
      database: { ...COMPONENT_DEFS.database, gatedBy: 'percentiles' },
    }
    const user = userEvent.setup()
    render(
      <ComponentPalette
        catalog={CONTENT_CATALOG}
        onDrop={() => {}}
        onPlace={() => {}}
        knowledge={NOTHING_LEARNED}
        onOpenConcept={(conceptId) => opened.push(conceptId)}
        defs={gated}
      />,
    )

    const card = screen.getByText('Database').closest('li')
    if (!card) throw new Error('expected a catalog card')
    expect(within(card).getByText(`This needs ${CONCEPTS.percentiles.title}.`)).toBeTruthy()
    // It can't be placed while it's locked: there is no button to place it.
    expect(within(card).queryByRole('button', { name: 'Database' })).toBeNull()

    await user.click(within(card).getByRole('button', { name: 'Open the lesson' }))
    expect(opened).toEqual(['percentiles'])
  })
})
