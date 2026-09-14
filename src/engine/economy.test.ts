import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import {
  actForUsers,
  bandwidthCents,
  nextReputation,
  qualityMultiplier,
  reputationModifier,
  requestClassShares,
  revenueCents,
  runningCostCents,
  serviceLevel,
  setupCostCents,
  usersForMeanRps,
  type PricedNode,
} from './economy'
import { BASE_WORKLOAD, TEST_CATALOG, appNode, databaseNode, edge, ingressNode } from './test-helpers'
import type { Architecture, ClassMetrics, ComponentNode, ResourceNode, TickResult } from './types'

const TARGET_MS = BALANCE.slo.p99TargetMs
const QUALITY = BALANCE.economy.qualityMultiplier
// Seconds in a week divided by a thousand: 1 rps for a turn is 604.8 thousand requests.
const THOUSANDS_PER_RPS_TURN = 604.8

describe('qualityMultiplier (02-SIMULATION §6, ADR-0022)', () => {
  it('clamps at the top: meeting the SLO pays the maximum and beating it pays no more', () => {
    for (const ratio of [0, 0.25, 0.5, 0.9, 1]) {
      expect(qualityMultiplier(ratio * TARGET_MS), `p99 at ${ratio}× target`).toBe(QUALITY.max)
    }
    // Proof the cap is doing the work: unclamped, half the target would pay more than max.
    expect(QUALITY.intercept - QUALITY.slopePerTargetRatio * 0.5).toBeGreaterThan(QUALITY.max)
  })

  it('clamps at the bottom from 2.75× the target', () => {
    expect(qualityMultiplier(2.75 * TARGET_MS)).toBeCloseTo(QUALITY.min, 12)
    for (const ratio of [3, 10, 1_000]) {
      expect(qualityMultiplier(ratio * TARGET_MS), `p99 at ${ratio}× target`).toBe(QUALITY.min)
    }
    expect(QUALITY.intercept - QUALITY.slopePerTargetRatio * 3).toBeLessThan(QUALITY.min)
  })

  it('falls linearly between the clamps', () => {
    expect(qualityMultiplier(1.5 * TARGET_MS)).toBeCloseTo(1, 12)
    expect(qualityMultiplier(2 * TARGET_MS)).toBeCloseTo(0.8, 12)
  })

  it('never rises as latency worsens', () => {
    let previous = Infinity
    for (let p99Ms = 0; p99Ms <= 4 * TARGET_MS; p99Ms += 7) {
      const quality = qualityMultiplier(p99Ms)
      expect(quality).toBeLessThanOrEqual(previous)
      previous = quality
    }
  })
})

describe('revenue and costs (02-SIMULATION §6)', () => {
  it('prices every request served over a week per thousand, in integer cents', () => {
    const perThousand = BALANCE.economy.revenuePerThousandRequestsCents
    expect(revenueCents(1, 1)).toBe(Math.round(THOUSANDS_PER_RPS_TURN * perThousand))
    expect(revenueCents(10, 1)).toBe(Math.round(10 * THOUSANDS_PER_RPS_TURN * perThousand))
    expect(revenueCents(10, 0.5)).toBe(Math.round(5 * THOUSANDS_PER_RPS_TURN * perThousand))
    expect(Number.isInteger(revenueCents(3.3333, 1.17))).toBe(true)
    expect(revenueCents(0, 1.2)).toBe(0)
  })

  it('charges bandwidth per decimal GB of payload served', () => {
    // 10 rps × 604,800 s × 50 KB = 302.4 GB.
    expect(bandwidthCents(10, 50)).toBe(Math.round(302.4 * BALANCE.economy.bandwidthCostPerGbCents))
    expect(bandwidthCents(0, 50)).toBe(0)
  })

  it('sums running cost per instance across nodes', () => {
    const nodes = pricedNodes([appNode('app'), withReplicas(databaseNode('db'), 3)])
    const [app, db] = [TEST_CATALOG['app-server'][0], TEST_CATALOG.database[0]]
    expect(runningCostCents(nodes)).toBe((app?.runningCostPerTurnCents ?? NaN) + 3 * (db?.runningCostPerTurnCents ?? NaN))
  })
})

describe('setupCostCents (ADR-0023)', () => {
  const built = architectureOf([appNode('app'), databaseNode('db')])
  const setup = (kind: 'app-server' | 'database', tier: number) =>
    TEST_CATALOG[kind][tier]?.setupCostCents ?? NaN

  it('charges nothing when nothing changed', () => {
    expect(setupCostCents(built, pricedNodes([appNode('app'), databaseNode('db')]))).toBe(0)
  })

  it('charges a new node for every instance', () => {
    const next = [appNode('app'), databaseNode('db'), withReplicas(appNode('app-2'), 2)]
    expect(setupCostCents(built, pricedNodes(next))).toBe(2 * setup('app-server', 0))
  })

  it('charges a tier change for every instance at the new tier, upgrade or downgrade', () => {
    const upgraded = [{ ...withReplicas(appNode('app'), 2), tier: 2 }, databaseNode('db')]
    expect(setupCostCents(built, pricedNodes(upgraded))).toBe(2 * setup('app-server', 2))
    const builtHigh = architectureOf([{ ...appNode('app'), tier: 3 }, databaseNode('db')])
    expect(setupCostCents(builtHigh, pricedNodes([appNode('app'), databaseNode('db')]))).toBe(setup('app-server', 0))
  })

  it('charges only added replicas, and refunds nothing for removals', () => {
    expect(setupCostCents(built, pricedNodes([withReplicas(appNode('app'), 4), databaseNode('db')]))).toBe(
      3 * setup('app-server', 0),
    )
    expect(setupCostCents(architectureOf([withReplicas(appNode('app'), 4)]), pricedNodes([appNode('app')]))).toBe(0)
  })

  it('treats a reused id with a different kind as a new machine', () => {
    const swapped = [{ ...databaseNode('app') }, databaseNode('db')]
    expect(setupCostCents(built, pricedNodes(swapped))).toBe(setup('database', 0))
  })
})

describe('serviceLevel (ADR-0023)', () => {
  const tickWith = (perClass: TickResult['perClass'], readFraction: number, staticFraction: number): TickResult => ({
    turn: 1,
    workload: { ...BASE_WORKLOAD, readFraction, staticFraction },
    peakRps: 0,
    perNode: {},
    perClass,
  })
  const metrics = (p99Ms: number, errorRate: number): ClassMetrics => ({ p50Ms: p99Ms / 2, p99Ms, errorRate })

  it('splits requests into classes that sum to 1', () => {
    const shares = requestClassShares({ ...BASE_WORKLOAD, readFraction: 0.8, staticFraction: 0.25 })
    expect(shares['static-read']).toBeCloseTo(0.2, 12)
    expect(shares['dynamic-read']).toBeCloseTo(0.6, 12)
    expect(shares.write).toBeCloseTo(0.2, 12)
  })

  it('weights error rate by traffic and takes the worst p99 among classes with traffic', () => {
    const tick = tickWith(
      { 'static-read': metrics(100, 0), 'dynamic-read': metrics(200, 0.1), write: metrics(900, 0.5) },
      1,
      0.3,
    )
    const service = serviceLevel(tick)
    // Writes carry no traffic here, so their 900 ms and 50% errors don't count.
    expect(service.p99Ms).toBe(200)
    expect(service.errorRate).toBeCloseTo(0.07, 12)
  })

  it('keeps error rate within 0..1 when every class fails', () => {
    const all = metrics(1, 1)
    const service = serviceLevel(tickWith({ 'static-read': all, 'dynamic-read': all, write: all }, 0.7, 0.1))
    expect(service.errorRate).toBeLessThanOrEqual(1)
    expect(service.errorRate).toBeCloseTo(1, 12)
  })
})

describe('reputation (02-SIMULATION §7)', () => {
  const healthy = { p99Ms: TARGET_MS / 2, errorRate: 0 }
  const justMissed = { p99Ms: TARGET_MS / 2, errorRate: BALANCE.slo.errorRateTarget * 1.000001 }

  it('loses about 3× what a good turn gains', () => {
    expect(BALANCE.reputation.lossPerBadTurn / BALANCE.reputation.gainPerGoodTurn).toBeCloseTo(3, 1)
    const gained = nextReputation(0.5, healthy)
    const lost = nextReputation(0.5, justMissed)
    expect(gained.sloMet).toBe(true)
    expect(lost.sloMet).toBe(false)
    expect(lost.severity).toBeCloseTo(1, 5)
    expect(-lost.delta / gained.delta).toBeCloseTo(3, 1)
  })

  it('meets the SLO exactly at both targets', () => {
    const result = nextReputation(0.5, { p99Ms: TARGET_MS, errorRate: BALANCE.slo.errorRateTarget })
    expect(result.sloMet).toBe(true)
    expect(result.delta).toBeCloseTo(BALANCE.reputation.gainPerGoodTurn, 12)
  })

  it('scales the loss by the worse of the two severities', () => {
    const slow = nextReputation(0.9, { p99Ms: 2 * TARGET_MS, errorRate: 0 })
    const failing = nextReputation(0.9, { p99Ms: 2 * TARGET_MS, errorRate: 4 * BALANCE.slo.errorRateTarget })
    expect(slow.severity).toBeCloseTo(2, 12)
    expect(slow.delta).toBeCloseTo(-2 * BALANCE.reputation.lossPerBadTurn, 12)
    expect(failing.severity).toBeCloseTo(4, 12)
    expect(failing.delta).toBeCloseTo(-4 * BALANCE.reputation.lossPerBadTurn, 12)
  })

  it('stays within 0..1 and reports the change actually applied', () => {
    const floored = nextReputation(0.1, { p99Ms: 100 * TARGET_MS, errorRate: 1 })
    expect(floored.value).toBe(0)
    expect(floored.delta).toBeCloseTo(-0.1, 12)
    const capped = nextReputation(1, healthy)
    expect(capped.value).toBe(1)
    expect(capped.delta).toBe(0)
  })

  it('maps reputation onto a traffic modifier from 0.6 to 1.4', () => {
    expect(reputationModifier(0)).toBeCloseTo(0.6, 12)
    expect(reputationModifier(0.5)).toBeCloseTo(1, 12)
    expect(reputationModifier(1)).toBeCloseTo(1.4, 12)
  })
})

describe('users and acts (00-GAME-DESIGN §9, ADR-0024)', () => {
  it('derives users from mean traffic', () => {
    expect(usersForMeanRps(BALANCE.traffic.startingUsers * BALANCE.traffic.meanRpsPerUser)).toBeCloseTo(
      BALANCE.traffic.startingUsers,
      9,
    )
  })

  it('places each act boundary at the design doc thresholds', () => {
    expect(actForUsers(0)).toBe(1)
    expect(actForUsers(BALANCE.traffic.startingUsers)).toBe(1)
    expect(actForUsers(999)).toBe(1)
    expect(actForUsers(1_000)).toBe(2)
    expect(actForUsers(99_999)).toBe(2)
    expect(actForUsers(100_000)).toBe(3)
    expect(actForUsers(5_000_000)).toBe(4)
    expect(actForUsers(100_000_000)).toBe(5)
    expect(actForUsers(1e12)).toBe(5)
  })
})

function withReplicas<T extends ComponentNode>(node: T, replicas: number): T {
  return { ...node, replicas }
}

function architectureOf(nodes: readonly ComponentNode[]): Architecture {
  return { nodes: [ingressNode(), ...nodes], edges: nodes.map((node) => edge('ingress', node.id)) }
}

function pricedNodes(nodes: readonly ComponentNode[]): PricedNode[] {
  return nodes
    .filter((node): node is ResourceNode => node.kind !== 'ingress')
    .map((node) => {
      const tier = TEST_CATALOG[node.kind][node.tier]
      if (!tier) throw new Error(`no tier ${node.tier} for ${node.kind}`)
      return { node, tier }
    })
}
