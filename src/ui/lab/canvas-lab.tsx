import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentNode, Edge } from '../../engine'
import { CONTENT_CATALOG } from '../../state/catalog'
import { createGameStore } from '../../state/store'
import { App } from '../App'
import '../index.css'

// Dev-only lab (ADR-0030, ADR-0036): ingress → a chain of app servers → database, the
// largest shape the resolver accepts, running real turns. It measures drag frame times (M3)
// and turn resolution (M4) in a real browser. Open /canvas-lab.html under `npm run dev`;
// ?nodes=50 sets the node count (default 30). It isn't part of the production build and
// saves nothing.

const DEFAULT_NODES = 30
const MIN_NODES = 3
const COLUMNS = 6
// Mean traffic before the lab's first turn, rps. Growth takes the peak to about 8.5 rps, which
// puts every small app server under pressure and leaves larger ones healthy.
const LAB_MEAN_RPS = 2.6

const requested = Number(new URLSearchParams(window.location.search).get('nodes'))
const nodeCount = Number.isInteger(requested) && requested >= MIN_NODES ? requested : DEFAULT_NODES

const nodes: ComponentNode[] = [{ id: 'ingress', kind: 'ingress', replicas: 1, tier: 0, config: {}, position: { col: 0, row: 0 } }]
const edges: Edge[] = []
let previous = 'ingress'
for (let index = 0; index < nodeCount - 2; index++) {
  const id = `app-${index}`
  const row = 1 + Math.floor(index / COLUMNS)
  // Snakes left to right, then right to left, so every connection stays short.
  const col = row % 2 === 1 ? index % COLUMNS : COLUMNS - 1 - (index % COLUMNS)
  nodes.push({ id, kind: 'app-server', replicas: 1, tier: index % 4, config: { fanoutFactor: 1 }, position: { col, row } })
  edges.push({ from: previous, to: id })
  previous = id
}
const lastAppRow = 1 + Math.floor((nodeCount - 3) / COLUMNS)
nodes.push({ id: 'db', kind: 'database', replicas: 1, tier: 3, config: {}, position: { col: 0, row: lastAppRow + 1 } })
edges.push({ from: previous, to: 'db' })

const items = new Map<string, string>()
const store = createGameStore({
  storage: { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) },
  catalog: CONTENT_CATALOG,
  now: () => new Date(),
})
store.getState().startRun(1)
const run = store.getState().run
if (run) {
  const architecture = { nodes, edges }
  store.setState({ run: { ...run, architecture, builtArchitecture: architecture, workload: { ...run.workload, meanRps: LAB_MEAN_RPS } } })
  // One real turn so the canvas opens with load on it, without replaying that turn's report.
  store.getState().advanceTurn()
  store.setState({ ui: { ...store.getState().ui, lastTurn: null } })
}

// The headless measurement script drives turns through this.
Object.assign(window, { ninesLab: { store } })

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  )
}
