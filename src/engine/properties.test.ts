import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { nodeCapacityRps, simulateTick, utilization } from './resolve'
import { nextFloat, rngForTurn, type Rng } from './rng'
import { unwrap } from './test-helpers'
import { REQUEST_CLASSES, type ComponentNode, type TickInput, type TickResult } from './types'

// 07-TESTING §2 invariants, checked across generated architectures. The generator is
// seeded and every assertion names its case, so a failure reproduces exactly.
const TEST_SEED = 20260914
const CASE_COUNT = 300
const CASES = Array.from({ length: CASE_COUNT }, (_, index) => index)

function sampler(index: number) {
  let rng: Rng = rngForTurn(TEST_SEED, index)
  const draw = (): number => {
    const next = nextFloat(rng)
    rng = next.rng
    return next.value
  }
  return {
    between: (min: number, max: number): number => min + draw() * (max - min),
    integer: (min: number, max: number): number => min + Math.floor(draw() * (max - min + 1)),
  }
}

/** ingress → 1–3 app servers → database, with random tier stats, fanout and load. */
function randomLinearInput(index: number): TickInput {
  const sample = sampler(index)
  const appServers = Array.from(
    { length: sample.integer(1, 3) },
    (_, i): ComponentNode => ({
      id: `app-${i}`,
      kind: 'app-server',
      replicas: 1,
      tier: i,
      config: { fanoutFactor: sample.between(0, 4) },
      position: { col: 0, row: i + 1 },
    }),
  )
  const nodes: ComponentNode[] = [
    { id: 'ingress', kind: 'ingress', replicas: 1, tier: 0, config: {}, position: { col: 0, row: 0 } },
    ...appServers,
    { id: 'db', kind: 'database', replicas: 1, tier: 0, config: {}, position: { col: 0, row: appServers.length + 1 } },
  ]
  const edges = nodes.flatMap((node, i) => {
    const next = nodes[i + 1]
    return next ? [{ from: node.id, to: next.id }] : []
  })
  const peakMultiplier = sample.between(1, 4)
  return {
    turn: index,
    workload: {
      meanRps: sample.between(0, 5000) / peakMultiplier,
      peakMultiplier,
      readFraction: sample.between(0, 1),
      staticFraction: sample.between(0, 1),
      keySkew: sample.between(0, 1),
      payloadKb: sample.between(1, 500),
    },
    catalog: {
      'app-server': Array.from({ length: 3 }, () => ({
        capacityRps: sample.between(10, 3000),
        serviceTimeMs: sample.between(1, 200),
      })),
      database: [{ capacityRps: sample.between(10, 3000), serviceTimeMs: sample.between(1, 500) }],
    },
    architecture: { nodes, edges },
  }
}

const resolve = (input: TickInput): TickResult => unwrap(simulateTick(input))

describe(`engine invariants across ${CASE_COUNT} generated linear architectures (seed ${TEST_SEED})`, () => {
  it('conserves requests at every node: served + dropped = inbound', () => {
    for (const index of CASES) {
      for (const [id, node] of Object.entries(resolve(randomLinearInput(index)).perNode)) {
        const imbalance = Math.abs(node.servedRps + node.droppedRps - node.inboundRps)
        expect(imbalance, `case ${index}, node ${id}`).toBeLessThanOrEqual(1e-9 * Math.max(1, node.inboundRps))
      }
    }
  })

  it('never produces a negative metric', () => {
    for (const index of CASES) {
      const result = resolve(randomLinearInput(index))
      const metrics = [
        ...Object.values(result.perNode),
        ...result.perEdge,
        ...REQUEST_CLASSES.map((requestClass) => result.perClass[requestClass]),
      ]
      // Status and edge endpoints are labels, not metrics.
      const numbers = metrics.flatMap((metric) => Object.values(metric)).filter((value) => typeof value === 'number')
      expect(numbers.length, `case ${index}`).toBeGreaterThan(0)
      for (const value of numbers) {
        expect(value, `case ${index}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('keeps utilization within [0, U_MAX] and error rates within [0, 1]', () => {
    for (const index of CASES) {
      const result = resolve(randomLinearInput(index))
      for (const node of Object.values(result.perNode)) {
        expect(node.utilization, `case ${index}`).toBeGreaterThanOrEqual(0)
        expect(node.utilization, `case ${index}`).toBeLessThanOrEqual(BALANCE.queueing.maxUtilization)
      }
      for (const requestClass of REQUEST_CLASSES) {
        expect(result.perClass[requestClass].errorRate, `case ${index}`).toBeGreaterThanOrEqual(0)
        expect(result.perClass[requestClass].errorRate, `case ${index}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never lowers p99 when load rises (monotonic latency)', () => {
    for (const index of CASES) {
      const input = randomLinearInput(index)
      const light = resolve(input)
      const heavy = resolve({ ...input, workload: { ...input.workload, meanRps: input.workload.meanRps * 1.25 } })
      for (const [id, node] of Object.entries(light.perNode)) {
        expect(heavy.perNode[id]?.p99Ms, `case ${index}, node ${id}`).toBeGreaterThanOrEqual(node.p99Ms)
      }
      for (const requestClass of REQUEST_CLASSES) {
        expect(heavy.perClass[requestClass].p99Ms, `case ${index}, ${requestClass}`).toBeGreaterThanOrEqual(
          light.perClass[requestClass].p99Ms,
        )
      }
    }
  })

  it('never raises utilization when replicas are added (monotonic capacity)', () => {
    for (const index of CASES) {
      const sample = sampler(index)
      const inboundRps = sample.between(0, 10_000)
      const perInstanceRps = sample.between(1, 3000)
      const replicas = sample.integer(1, 20)
      expect(
        utilization(inboundRps, nodeCapacityRps(perInstanceRps, replicas + 1, 1)),
        `case ${index}`,
      ).toBeLessThanOrEqual(utilization(inboundRps, nodeCapacityRps(perInstanceRps, replicas, 1)))
    }
  })

  it('gives identical output when a generated case is resolved again (determinism)', () => {
    for (const index of CASES) {
      expect(simulateTick(randomLinearInput(index)), `case ${index}`).toStrictEqual(
        simulateTick(randomLinearInput(index)),
      )
    }
  })
})
