import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { DIFFICULTIES, type Difficulty } from '../config/difficulty'
import { drawFailures } from './failures'
import { healthFactor, nodeCapacityRps, simulateTick } from './resolve'
import { createRun, simulateTurn } from './run'
import {
  NO_FAILURES,
  TEST_CATALOG,
  appNode,

  deepFreeze,
  edge,
  ingressNode,
  linearInput,
  metricsFor,
  playHeadless,
  unwrap,
} from './test-helpers'
import type { ComponentNode, NodeOutage, PricedCatalog, RunState, TickInput, TurnResult } from './types'

// Component failures and redundancy (02-SIMULATION §5.7, M6a acceptance, ADR-0051).

const ALWAYS: PricedCatalog = {
  'app-server': TEST_CATALOG['app-server'].map((tier) => ({ ...tier, failureRatePerTurn: 1 })),
  database: TEST_CATALOG.database.map((tier) => ({ ...tier, failureRatePerTurn: 1 })),
}

const SERVICE_MS = 20
const ROOMY = { capacityRps: 1_000_000, serviceTimeMs: 5 }

/** ingress → app → db at a chosen load, with the given outages live. */
function tickWith(options: { peakRps: number; capacityRps: number; replicas?: number; outages?: readonly NodeOutage[] }): TickInput {
  const base = linearInput({ peakRps: options.peakRps, app: { capacityRps: options.capacityRps, serviceTimeMs: SERVICE_MS }, database: ROOMY })
  return {
    ...base,
    architecture: {
      ...base.architecture,
      nodes: base.architecture.nodes.map((node) => (node.id === 'app' ? { ...node, replicas: options.replicas ?? 1 } : node)),
    },
    outages: options.outages,
  }
}

const outage = (nodeId: string, failedInstances = 1, turnsRemaining = 1): NodeOutage => ({ nodeId, failedInstances, turnsRemaining })

describe('healthFactor (02-SIMULATION §5.2)', () => {
  it('is the surviving share of instances', () => {
    expect(healthFactor(1, 0)).toBe(1)
    expect(healthFactor(1, 1)).toBe(0)
    expect(healthFactor(3, 1)).toBeCloseTo(2 / 3, 12)
    expect(healthFactor(4, 2)).toBe(0.5)
  })

  it('never goes negative, even if more instances are down than the node now runs', () => {
    expect(healthFactor(1, 3)).toBe(0)
  })

  it('multiplies into capacity exactly as §5.2 writes it', () => {
    expect(nodeCapacityRps(100, 3, healthFactor(3, 1))).toBeCloseTo(200, 9)
  })
})

describe('a node whose last instance is down (M6a acceptance)', () => {
  const result = () => unwrap(simulateTick(tickWith({ peakRps: 50, capacityRps: 100, outages: [outage('app')] })))

  it('takes every request class crossing it to an error rate of 1.0', () => {
    const tick = result()
    for (const metrics of Object.values(tick.perClass)) expect(metrics.errorRate).toBe(1)
  })

  it('serves nothing, drops everything, and reports no capacity', () => {
    const app = metricsFor(result(), 'app')
    expect(app.capacityRps).toBe(0)
    expect(app.servedRps).toBe(0)
    expect(app.droppedRps).toBe(50)
    expect(app.failedInstances).toBe(1)
  })

  it('reports status failed rather than a utilization band', () => {
    const app = metricsFor(result(), 'app')
    expect(app.status).toBe('failed')
    // Nothing is queueing at a node that refuses connections, so it contributes no latency
    // and no utilization figure a player could act on.
    expect(app.utilization).toBe(0)
    expect(app.p99Ms).toBe(0)
    expect(app.meanMs).toBe(0)
  })

  it('sends nothing downstream, so the database sees no load at all', () => {
    const database = metricsFor(result(), 'db')
    expect(database.inboundRps).toBe(0)
    expect(database.status).toBe('healthy')
  })

  it('is named as the bottleneck ahead of any merely overloaded node', () => {
    const tick = unwrap(
      simulateTick(tickWith({ peakRps: 500, capacityRps: 100, outages: [outage('app')] })),
    )
    expect(tick.bottleneck).toBe('app')
  })
})

describe('an app server with replicas (M6a acceptance)', () => {
  it('serves at (replicas − 1) ÷ replicas of capacity and keeps running', () => {
    const whole = unwrap(simulateTick(tickWith({ peakRps: 120, capacityRps: 100, replicas: 3 })))
    const degraded = unwrap(simulateTick(tickWith({ peakRps: 120, capacityRps: 100, replicas: 3, outages: [outage('app')] })))
    expect(metricsFor(whole, 'app').capacityRps).toBe(300)
    expect(metricsFor(degraded, 'app').capacityRps).toBeCloseTo(200, 9)
    expect(metricsFor(degraded, 'app').status).not.toBe('failed')
    expect(metricsFor(degraded, 'app').droppedRps).toBe(0)
    expect(degraded.perClass.write.errorRate).toBe(0)
  })

  it('survives a failure that would have been a total outage on one instance', () => {
    const alone = unwrap(simulateTick(tickWith({ peakRps: 90, capacityRps: 100, replicas: 1, outages: [outage('app')] })))
    const pair = unwrap(simulateTick(tickWith({ peakRps: 90, capacityRps: 100, replicas: 2, outages: [outage('app')] })))
    expect(alone.perClass.write.errorRate).toBe(1)
    expect(pair.perClass.write.errorRate).toBe(0)
  })

  it('multiplies capacity by the instance count when nothing is down', () => {
    const tick = unwrap(simulateTick(tickWith({ peakRps: 100, capacityRps: 100, replicas: 4 })))
    expect(metricsFor(tick, 'app').capacityRps).toBe(400)
    expect(metricsFor(tick, 'app').failedInstances).toBe(0)
  })

  it('still refuses database replicas with the existing typed error', () => {
    const base = linearInput({ peakRps: 10, app: { capacityRps: 100, serviceTimeMs: 10 }, database: { capacityRps: 100, serviceTimeMs: 10 } })
    const nodes = base.architecture.nodes.map((node) => (node.id === 'db' ? { ...node, replicas: 2 } : node))
    expect(simulateTick({ ...base, architecture: { ...base.architecture, nodes } })).toEqual({
      ok: false,
      error: { kind: 'unsupported-replicas', nodeId: 'db', replicas: 2 },
    })
  })

  it('charges setup and running costs per instance', () => {
    const run = createRun({ seed: 5, difficulty: 'junior' })
    const withPair = withReplicas(run, 'app', 2)
    const one = unwrap(simulateTurn(run, { difficulty: 'junior', catalog: NO_FAILURES }))
    const two = unwrap(simulateTurn(withPair, { difficulty: 'junior', catalog: NO_FAILURES }))
    const perInstance = NO_FAILURES['app-server'][0]
    if (!perInstance) throw new Error('expected a base tier')
    expect(two.economy.breakdown.runningCents - one.economy.breakdown.runningCents).toBe(perInstance.runningCostPerTurnCents)
    // The starter app server already ran, so only the instance added is new (ADR-0023).
    expect(two.economy.setupCostCents).toBe(perInstance.setupCostCents)
  })
})

describe('drawing failures (M6a acceptance, ADR-0051)', () => {
  const run = createRun({ seed: 11, difficulty: 'junior' })

  it('is pure and repeatable: the same run and turn always draw the same outages', () => {
    const frozen = deepFreeze({ seed: run.seed, turn: 4, architecture: run.architecture, catalog: ALWAYS, outages: [] })
    const first = drawFailures(frozen)
    for (let attempt = 0; attempt < 100; attempt++) expect(drawFailures(frozen)).toStrictEqual(first)
  })

  it('draws nothing when every rate is zero, and everything when every rate is one', () => {
    expect(drawFailures({ seed: run.seed, turn: 1, architecture: run.architecture, catalog: NO_FAILURES, outages: [] }).outages).toEqual([])
    const all = drawFailures({ seed: run.seed, turn: 1, architecture: run.architecture, catalog: ALWAYS, outages: [] })
    expect(all.outages.map((entry) => entry.nodeId)).toEqual(['app', 'db'])
    expect(all.events).toHaveLength(2)
  })

  it('never draws for ingress, which is where traffic arrives rather than a machine', () => {
    const all = drawFailures({ seed: run.seed, turn: 1, architecture: run.architecture, catalog: ALWAYS, outages: [] })
    expect(all.outages.some((entry) => entry.nodeId === 'ingress')).toBe(false)
  })

  it('keys each node’s draw separately, so another node’s luck never shifts it', () => {
    const extra: ComponentNode = { ...appNode('app-2'), position: { col: 3, row: 3 } }
    const wider = {
      nodes: [...run.architecture.nodes, extra],
      edges: [...run.architecture.edges, edge('app', 'app-2')],
    }
    const catalog = halfRate()
    const before = drawFailures({ seed: run.seed, turn: 6, architecture: run.architecture, catalog, outages: [] })
    const after = drawFailures({ seed: run.seed, turn: 6, architecture: wider, catalog, outages: [] })
    const onlyOriginals = after.outages.filter((entry) => entry.nodeId !== 'app-2')
    expect(onlyOriginals).toEqual(before.outages)
  })

  it('counts an outage down and recovers on its own without a new draw', () => {
    const live = [outage('app', 1, 2)]
    const second = drawFailures({ seed: run.seed, turn: 2, architecture: run.architecture, catalog: NO_FAILURES, outages: live })
    expect(second.outages).toEqual([outage('app', 1, 1)])
    expect(second.events).toEqual([])
    const third = drawFailures({ seed: run.seed, turn: 3, architecture: run.architecture, catalog: NO_FAILURES, outages: second.outages })
    expect(third.outages).toEqual([])
    expect(third.events).toEqual([{ kind: 'node-recovered', nodeId: 'app' }])
  })

  it('gives a node with peers the recovery length and a lone node the outage length', () => {
    const { recoveryTurns, outageDurationTurns } = BALANCE.failure
    const pair = drawFailures({ seed: run.seed, turn: 1, architecture: withReplicas(run, 'app', 3).architecture, catalog: ALWAYS, outages: [] })
    expect(pair.outages.find((entry) => entry.nodeId === 'app')?.turnsRemaining).toBe(recoveryTurns)
    const alone = drawFailures({ seed: run.seed, turn: 1, architecture: run.architecture, catalog: ALWAYS, outages: [] })
    expect(alone.outages.find((entry) => entry.nodeId === 'app')?.turnsRemaining).toBe(outageDurationTurns)
  })

  it('drops an outage for a node the player removed', () => {
    const smaller = { nodes: [ingressNode(), appNode('app')], edges: [edge('ingress', 'app')] }
    const next = drawFailures({ seed: run.seed, turn: 2, architecture: smaller, catalog: NO_FAILURES, outages: [outage('db', 1, 5)] })
    expect(next.outages).toEqual([])
  })
})

describe('failures inside a run (M6a acceptance)', () => {
  it('leaves simulateTick pure: the resolver is never handed a generator', () => {
    const run = deepFreeze(createRun({ seed: 7, difficulty: 'senior' }))
    const input = { difficulty: 'senior' as Difficulty, catalog: ALWAYS }
    const first = simulateTurn(run, input)
    for (let attempt = 0; attempt < 50; attempt++) expect(simulateTurn(run, input)).toStrictEqual(first)
  })

  it('makes two runs on one seed fail identically', () => {
    // A rate high enough that 25 weeks certainly contain outages, so this compares something.
    const play = () => playHeadless({ seed: 4242, difficulty: 'junior', turns: 25, catalog: halfRate() })
    const outagesOf = (results: readonly TurnResult[]) => results.map((result) => result.nextRun.outages)
    expect(outagesOf(play())).toStrictEqual(outagesOf(play()))
    expect(outagesOf(play()).flat().length).toBeGreaterThan(0)
  })

  it('carries the outage into the tick, the events and the next run', () => {
    const run = createRun({ seed: 3, difficulty: 'junior' })
    const result = unwrap(simulateTurn(run, { difficulty: 'junior', catalog: ALWAYS }))
    expect(result.perNode.app?.status).toBe('failed')
    expect(result.events).toContainEqual({ kind: 'node-failed', nodeId: 'app', failedInstances: 1, replicas: 1, turns: BALANCE.failure.outageDurationTurns })
    expect(result.nextRun.outages.map((entry) => entry.nodeId)).toEqual(['app', 'db'])
    expect(result.economy.revenueCents).toBe(0)
    expect(result.service.errorRate).toBe(1)
  })

  it('restores the act’s outages on a rollback, so none outlives its architecture', () => {
    const run = createRun({ seed: 3, difficulty: 'junior' })
    const broke: RunState = { ...run, cashCents: -1, bailoutAvailable: false }
    const result = unwrap(simulateTurn(broke, { difficulty: 'junior', catalog: ALWAYS }))
    expect(result.events.some((event) => event.kind === 'rollback')).toBe(true)
    expect(result.nextRun.outages).toEqual(run.actStart.outages)
  })
})

// The milestone's balance-sanity criterion, measured rather than assumed. These numbers are
// the finding M6a reports to the human, not a target: see ADR-0053 and the M6a checkpoint.
describe('what an outage costs a run (M6a balance sanity)', () => {
  const SEEDS = 120

  it('empties reputation in the single week it happens', () => {
    const run = createRun({ seed: 3, difficulty: 'junior' })
    const result = unwrap(simulateTurn(run, { difficulty: 'junior', catalog: ALWAYS }))
    // §7's severity is errorRate ÷ errorRateTarget, uncapped: 1.0 ÷ 0.01 is 100, and
    // lossPerBadTurn × 100 is far past the whole 0..1 range.
    expect(result.reputation.severity).toBe(1 / BALANCE.slo.errorRateTarget)
    expect(result.reputation.value).toBe(0)
  })

  it.each(DIFFICULTIES)('on %s, an outage in the first ten weeks stalls the run', (difficulty) => {
    const peaks = { early: [] as number[], untouched: [] as number[] }
    for (let seed = 1; seed <= SEEDS; seed++) {
      const results = playHeadless({ seed, difficulty, turns: 20 })
      const firstFailure = results.findIndex((result) => result.events.some((event) => event.kind === 'node-failed')) + 1
      const peak = Math.max(...results.map((result) => result.users))
      if (firstFailure === 0) peaks.untouched.push(peak)
      else if (firstFailure <= 10) peaks.early.push(peak)
    }
    // A run hardware left alone reaches thousands of users in 20 weeks. One that loses a
    // week early is still in the dozens: reputation is floored, so the traffic modifier sits
    // at 0.6 and the user base shrinks faster than it grows.
    expect(median(peaks.untouched)).toBeGreaterThan(1_000)
    expect(median(peaks.early)).toBeLessThan(200)
    expect(peaks.early.filter((peak) => peak <= 100).length / peaks.early.length).toBeGreaterThan(0.4)
  })

  it('costs nothing at all when hardware holds, so the model adds no drag of its own', () => {
    for (const difficulty of DIFFICULTIES) {
      const withRates = playHeadless({ seed: 1, difficulty, turns: 20 })
      const without = playHeadless({ seed: 1, difficulty, turns: 20, catalog: NO_FAILURES })
      if (withRates.some((result) => result.events.some((event) => event.kind === 'node-failed'))) continue
      expect(withRates.map((result) => result.economy.cashCents)).toEqual(without.map((result) => result.economy.cashCents))
    }
  })
})

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function halfRate(): PricedCatalog {
  return {
    'app-server': TEST_CATALOG['app-server'].map((tier) => ({ ...tier, failureRatePerTurn: 0.5 })),
    database: TEST_CATALOG.database.map((tier) => ({ ...tier, failureRatePerTurn: 0.5 })),
  }
}

function withReplicas(run: RunState, nodeId: string, replicas: number): RunState {
  const nodes = run.architecture.nodes.map((node) => (node.id === nodeId ? { ...node, replicas } : node))
  return { ...run, architecture: { ...run.architecture, nodes } }
}

