import type {
  ComponentNode,
  Edge,
  NodeId,
  NodeMetrics,
  Result,
  TickInput,
  TickResult,
  TierStats,
  Workload,
} from './types'

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

export const ingressNode = (id: NodeId = 'ingress'): ComponentNode => ({
  id,
  kind: 'ingress',
  replicas: 1,
  tier: 0,
  config: {},
})

export const appNode = (id: NodeId, fanoutFactor = 1): ComponentNode => ({
  id,
  kind: 'app-server',
  replicas: 1,
  tier: 0,
  config: { fanoutFactor },
})

export const databaseNode = (id: NodeId): ComponentNode => ({
  id,
  kind: 'database',
  replicas: 1,
  tier: 0,
  config: {},
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
