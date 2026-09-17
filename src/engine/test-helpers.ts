import type { Difficulty } from '../config/difficulty'
import { createRun, simulateTurn } from './run'
import type {
  ComponentNode,
  Edge,
  NodeId,
  NodeMetrics,
  PricedCatalog,
  Result,
  RunState,
  TickInput,
  TickResult,
  TierStats,
  TurnResult,
  Workload,
} from './types'

/**
 * Four priced tiers per resource kind for run tests. The figures make plausible runs; they
 * are not the game's component balance, which M7 sets in content.
 */
export const TEST_CATALOG: PricedCatalog = {
  'app-server': [
    { capacityRps: 50, serviceTimeMs: 12, setupCostCents: 200_00, runningCostPerTurnCents: 25_00, failureRatePerTurn: 0.02 },
    { capacityRps: 150, serviceTimeMs: 11, setupCostCents: 600_00, runningCostPerTurnCents: 60_00, failureRatePerTurn: 0.015 },
    { capacityRps: 400, serviceTimeMs: 10, setupCostCents: 1_500_00, runningCostPerTurnCents: 140_00, failureRatePerTurn: 0.01 },
    { capacityRps: 1_000, serviceTimeMs: 10, setupCostCents: 4_000_00, runningCostPerTurnCents: 320_00, failureRatePerTurn: 0.008 },
  ],
  database: [
    { capacityRps: 80, serviceTimeMs: 6, setupCostCents: 300_00, runningCostPerTurnCents: 40_00, failureRatePerTurn: 0.012 },
    { capacityRps: 250, serviceTimeMs: 6, setupCostCents: 900_00, runningCostPerTurnCents: 100_00, failureRatePerTurn: 0.009 },
    { capacityRps: 700, serviceTimeMs: 5, setupCostCents: 2_400_00, runningCostPerTurnCents: 250_00, failureRatePerTurn: 0.006 },
    { capacityRps: 2_000, serviceTimeMs: 5, setupCostCents: 6_000_00, runningCostPerTurnCents: 600_00, failureRatePerTurn: 0.005 },
  ],
}

/** TEST_CATALOG with every failure rate at zero, for tests about anything but failures. */
export const NO_FAILURES: PricedCatalog = {
  'app-server': TEST_CATALOG['app-server'].map((tier) => ({ ...tier, failureRatePerTurn: 0 })),
  database: TEST_CATALOG.database.map((tier) => ({ ...tier, failureRatePerTurn: 0 })),
}

/**
 * A minimal headless player. Before a turn, it upgrades last turn's busiest node one tier
 * if that node ran above `threshold` utilization at peak and the run can pay the setup.
 */
export function upgradeBusiestNode(run: RunState, catalog: PricedCatalog = TEST_CATALOG, threshold = 0.6): RunState {
  const last = run.history[run.history.length - 1]
  const busiest = last && Object.entries(last.utilization).sort(([, a], [, b]) => b - a)[0]
  if (!busiest || busiest[1] <= threshold) return run
  const nodes = run.architecture.nodes.map((node): ComponentNode => {
    if (node.id !== busiest[0] || node.kind === 'ingress') return node
    const upgrade = catalog[node.kind][node.tier + 1]
    if (!upgrade || upgrade.setupCostCents > run.cashCents) return node
    return { ...node, tier: node.tier + 1 }
  })
  return { ...run, architecture: { ...run.architecture, nodes } }
}

/** Plays a new run headlessly with `upgradeBusiestNode`, returning every turn's result. */
export function playHeadless(options: {
  seed: number
  difficulty: Difficulty
  turns: number
  catalog?: PricedCatalog
}): TurnResult[] {
  const catalog = options.catalog ?? TEST_CATALOG
  const results: TurnResult[] = []
  let run = createRun({ seed: options.seed, difficulty: options.difficulty })
  for (let turn = 0; turn < options.turns; turn++) {
    const result = unwrap(simulateTurn(upgradeBusiestNode(run, catalog), { difficulty: options.difficulty, catalog }))
    results.push(result)
    run = result.nextRun
  }
  return results
}

/**
 * A new Junior run whose architecture is ingress → a chain of app servers → database,
 * `nodeCount` nodes in all. It's the largest shape the linear resolver accepts, so it's
 * what turn-resolution timing measures. App server sizes cycle through the first four tiers.
 */
export function chainRun(nodeCount: number): RunState {
  const run = createRun({ seed: 2026, difficulty: 'junior' })
  const perRow = 8
  const apps = nodeCount - 2
  const nodes: ComponentNode[] = [{ ...ingressNode(), position: { col: 0, row: 0 } }]
  const edges: Edge[] = []
  let previous = 'ingress'
  for (let index = 0; index < apps; index++) {
    const id = `app-${index}`
    nodes.push({ ...appNode(id), tier: index % 4, position: { col: index % perRow, row: 1 + Math.floor(index / perRow) } })
    edges.push(edge(previous, id))
    previous = id
  }
  nodes.push({ ...databaseNode('db'), tier: 3, position: { col: 0, row: 2 + Math.floor(apps / perRow) } })
  edges.push(edge(previous, 'db'))
  const architecture = { nodes, edges }
  return { ...run, architecture, builtArchitecture: architecture }
}

// Shared fixtures for engine tests. The figures are chosen to hit exact utilizations, not
// to represent game balance.

export const BASE_WORKLOAD: Workload = {
  meanRps: 0,
  peakMultiplier: 1,
  readFraction: 0.8,
  staticFraction: 0.25,
  keySkew: 0,
  payloadKb: 40,
}

// The engine ignores positions, so fixtures share the origin unless a test cares.
const ORIGIN = { col: 0, row: 0 }

export const ingressNode = (id: NodeId = 'ingress'): ComponentNode => ({
  id,
  kind: 'ingress',
  replicas: 1,
  tier: 0,
  config: {},
  position: ORIGIN,
})

export const appNode = (id: NodeId, fanoutFactor = 1): ComponentNode => ({
  id,
  kind: 'app-server',
  replicas: 1,
  tier: 0,
  config: { fanoutFactor },
  position: ORIGIN,
})

export const databaseNode = (id: NodeId): ComponentNode => ({
  id,
  kind: 'database',
  replicas: 1,
  tier: 0,
  config: {},
  position: ORIGIN,
})

export const edge = (from: NodeId, to: NodeId): Edge => ({ from, to })

/** ingress → app → db, with peak load applied directly (peakMultiplier 1). */
export function linearInput(options: {
  peakRps: number
  app: TierStats
  database: TierStats
  fanoutFactor?: number
}): TickInput {
  return {
    turn: 1,
    workload: { ...BASE_WORKLOAD, meanRps: options.peakRps },
    catalog: { 'app-server': [options.app], database: [options.database] },
    architecture: {
      nodes: [ingressNode(), appNode('app', options.fanoutFactor ?? 1), databaseNode('db')],
      edges: [edge('ingress', 'app'), edge('app', 'db')],
    },
  }
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`)
  return result.value
}

export function metricsFor(result: TickResult, id: NodeId): NodeMetrics {
  const metrics = result.perNode[id]
  if (!metrics) throw new Error(`no metrics for node ${id}`)
  return metrics
}

/** Freezes a value and everything inside it, so any mutation by the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
