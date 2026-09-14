import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentNode, Edge, PricedCatalog, TurnSummary } from '../../engine'
import { createGameStore } from '../../state/store'
import { App } from '../App'
import '../index.css'

// Dev-only lab for the canvas (ADR-0030): a 30-node architecture with varied load, used to
// measure drag frame times against M3's 60fps criterion. The page opens at
// /canvas-lab.html under `npm run dev`. It isn't part of the production build and saves nothing.

const APP_ROWS = 4
const APPS_PER_ROW = 6
const DATABASES = 5

const nodes: ComponentNode[] = [{ id: 'ingress', kind: 'ingress', replicas: 1, tier: 0, config: {}, position: { col: 2, row: 0 } }]
const edges: Edge[] = []
for (let row = 0; row < APP_ROWS; row++) {
  for (let col = 0; col < APPS_PER_ROW; col++) {
    const id = `app-${row}-${col}`
    nodes.push({ id, kind: 'app-server', replicas: 1, tier: col % 4, config: { fanoutFactor: 1 }, position: { col, row: row + 1 } })
    edges.push({ from: row === 0 ? 'ingress' : `app-${row - 1}-${col}`, to: id })
  }
}
for (let index = 0; index < DATABASES; index++) {
  nodes.push({ id: `db-${index}`, kind: 'database', replicas: 1, tier: 1, config: {}, position: { col: index, row: APP_ROWS + 1 } })
}
for (let col = 0; col < APPS_PER_ROW; col++) edges.push({ from: `app-${APP_ROWS - 1}-${col}`, to: `db-${col % DATABASES}` })

// Deterministic spread across healthy, warning and saturated.
const utilization = Object.fromEntries(nodes.map((node, index) => [node.id, ((index * 37) % 100) / 100]))

const items = new Map<string, string>()
const store = createGameStore({
  storage: { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) },
  catalog: { 'app-server': [], database: [] } satisfies PricedCatalog,
  now: () => new Date(),
})
store.getState().startRun(1)
const run = store.getState().run
if (run) {
  const summary: TurnSummary = {
    turn: 1,
    meanRps: 0,
    peakRps: 0,
    users: 0,
    p99Ms: 0,
    errorRate: 0,
    utilization,
    revenueCents: 0,
    costCents: 0,
    setupCostCents: 0,
    sloMet: true,
    cashCents: run.cashCents,
    reputation: run.reputation,
    events: [],
  }
  store.setState({ run: { ...run, architecture: { nodes, edges }, builtArchitecture: { nodes, edges }, history: [summary] } })
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  )
}
