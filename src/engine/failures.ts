import { BALANCE } from '../config/balance'
import { nextFloat, rngForKey } from './rng'
import type { Architecture, NodeOutage, PricedCatalog, ResourceNode, SimEvent } from './types'

// Component failures (02-SIMULATION §5.7), drawn once per turn outside the resolver so
// `simulateTick` stays a pure function of its input and `resolve.ts` holds no randomness
// (ADR-0051, CLAUDE.md's determinism rule).

/** Outages after one turn's draws, with what happened, for the report to state. */
export type FailureDraw = {
  /** Every outage still running after this turn, one entry per node. */
  readonly outages: readonly NodeOutage[]
  readonly events: readonly SimEvent[]
}

/**
 * Draws this turn's failures and ages the outages already running (§5.7).
 *
 * Each resource node gets exactly one draw, from a generator keyed by the run's seed, the
 * node's id and the turn. Keying per node rather than walking one turn generator means
 * adding, removing or re-ordering a node never shifts another node's luck, which is the
 * same guarantee §2 gives turns. A node already down doesn't draw: it counts a turn off its
 * outage and recovers when the count runs out.
 *
 * `turn` is the turn being resolved and `seed` the run's. An outage lasts
 * `outageDurationTurns` when it takes the node's last instance and `recoveryTurns` when
 * peers survive it, both from `BALANCE.failure`.
 */
export function drawFailures(options: {
  readonly seed: number
  readonly turn: number
  readonly architecture: Architecture
  readonly catalog: PricedCatalog
  readonly outages: readonly NodeOutage[]
}): FailureDraw {
  const { seed, turn, architecture, catalog, outages } = options
  const next: NodeOutage[] = []
  const events: SimEvent[] = []

  for (const node of architecture.nodes) {
    if (node.kind === 'ingress') continue
    const running = outages.find((outage) => outage.nodeId === node.id)
    if (running) {
      // The outage covers the turn it was drawn in, so a one-turn outage is spent by the
      // next turn and the node serves normally again.
      const turnsRemaining = running.turnsRemaining - 1
      if (turnsRemaining > 0) next.push({ ...running, turnsRemaining })
      else events.push({ kind: 'node-recovered', nodeId: node.id })
      continue
    }
    const outage = drawNode(node, seed, turn, catalog)
    if (!outage) continue
    next.push(outage)
    events.push({
      kind: 'node-failed',
      nodeId: node.id,
      failedInstances: outage.failedInstances,
      replicas: node.replicas,
      turns: outage.turnsRemaining,
    })
  }

  return { outages: next, events }
}

// One instance of one node, one draw. §5.7 fails a single instance at a time: a node with
// peers loses a fraction of its capacity, a node without loses all of it.
function drawNode(node: ResourceNode, seed: number, turn: number, catalog: PricedCatalog): NodeOutage | null {
  const tier = catalog[node.kind][node.tier]
  if (!tier) return null
  if (nextFloat(rngForKey(seed, node.id, turn)).value >= tier.failureRatePerTurn) return null
  const survivors = node.replicas > 1
  return {
    nodeId: node.id,
    failedInstances: 1,
    turnsRemaining: survivors ? BALANCE.failure.recoveryTurns : BALANCE.failure.outageDurationTurns,
  }
}
