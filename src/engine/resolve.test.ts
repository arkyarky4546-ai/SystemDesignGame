import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { meanResponseTimeMs, p50LatencyMs, p99LatencyMs, simulateTick } from './resolve'
import { deepFreeze, edge, linearInput, metricsFor, unwrap } from './test-helpers'
import { REQUEST_CLASSES, type ComponentNode, type TickInput } from './types'

const SERVICE_MS = 20
const ROOMY_DATABASE = { capacityRps: 1_000_000, serviceTimeMs: 5 }

describe('latency model: the exact curve the lessons claim (07-TESTING §2)', () => {
  it.each([
    [0.5, 2],
    [0.9, 10],
    [0.99, 100],
  ])('W at u = %s is %s× service time', (u, multiple) => {
    expect(meanResponseTimeMs(SERVICE_MS, u) / SERVICE_MS).toBeCloseTo(multiple, 3)
  })

  it('puts p99 at 4.605 × W and p50 at 0.693 × W', () => {
    const meanMs = meanResponseTimeMs(SERVICE_MS, 0.7)
    expect(p99LatencyMs(meanMs) / meanMs).toBeCloseTo(4.605, 3)
    expect(p50LatencyMs(meanMs) / meanMs).toBeCloseTo(0.693, 3)
  })

  it('has a saturation cliff: 85% → 95% utilization triples latency (§8)', () => {
    expect(meanResponseTimeMs(SERVICE_MS, 0.95) / meanResponseTimeMs(SERVICE_MS, 0.85)).toBeCloseTo(3, 6)
  })
})

describe('simulateTick on ingress → app → database', () => {
  const appTier = { capacityRps: 1000, serviceTimeMs: SERVICE_MS }

  it.each([
    [0.5, 2],
    [0.9, 10],
    [0.99, 100],
  ])('resolves the app tier at u = %s to %s× service time, with p99 at 4.605 × W', (u, multiple) => {
    const result = unwrap(simulateTick(linearInput({ peakRps: 1000 * u, app: appTier, database: ROOMY_DATABASE })))
    const app = metricsFor(result, 'app')
    expect(app.utilization).toBeCloseTo(u, 9)
    expect(app.meanMs / SERVICE_MS).toBeCloseTo(multiple, 3)
    expect(app.p99Ms / app.meanMs).toBeCloseTo(4.605, 3)
    expect(app.p50Ms / app.meanMs).toBeCloseTo(0.693, 3)
  })

  it('resolves at peak, not mean (ADR-0008)', () => {
    const input = linearInput({ peakRps: 0, app: appTier, database: ROOMY_DATABASE })
    const result = unwrap(simulateTick({ ...input, workload: { ...input.workload, meanRps: 250, peakMultiplier: 2 } }))
    expect(result.peakRps).toBe(500)
    expect(metricsFor(result, 'app').inboundRps).toBe(500)
  })

  it('drops exactly the excess over capacity and never sends drops downstream', () => {
    const result = unwrap(
      simulateTick(
        linearInput({
          peakRps: 150,
          fanoutFactor: 2,
          app: { capacityRps: 100, serviceTimeMs: SERVICE_MS },
          database: ROOMY_DATABASE,
        }),
      ),
    )
    const app = metricsFor(result, 'app')
    const database = metricsFor(result, 'db')
    expect(app.droppedRps).toBeCloseTo(50, 9)
    expect(app.servedRps).toBeCloseTo(100, 9)
    expect(app.utilization).toBe(BALANCE.queueing.maxUtilization)
    // 100 served × fanout 2. The 50 dropped requests never issue their queries.
    expect(database.inboundRps).toBeCloseTo(200, 9)
    expect(database.droppedRps).toBe(0)
    for (const requestClass of REQUEST_CLASSES) {
      expect(result.perClass[requestClass].errorRate).toBeCloseTo(1 / 3, 9)
    }
  })

  it('drops nothing when load exactly meets capacity', () => {
    const result = unwrap(
      simulateTick(linearInput({ peakRps: 100, app: { capacityRps: 100, serviceTimeMs: SERVICE_MS }, database: ROOMY_DATABASE })),
    )
    expect(metricsFor(result, 'app').droppedRps).toBe(0)
    expect(metricsFor(result, 'app').utilization).toBe(BALANCE.queueing.maxUtilization)
  })

  it('moves the failure to the database when the app tier is fixed (masked bottleneck, §8)', () => {
    const database = { capacityRps: 200, serviceTimeMs: 5 }
    const constrained = unwrap(
      simulateTick(
        linearInput({ peakRps: 105, fanoutFactor: 2, app: { capacityRps: 100, serviceTimeMs: SERVICE_MS }, database }),
      ),
    )
    const upgraded = unwrap(
      simulateTick(
        linearInput({ peakRps: 105, fanoutFactor: 2, app: { capacityRps: 1000, serviceTimeMs: SERVICE_MS }, database }),
      ),
    )
    expect(metricsFor(constrained, 'db').droppedRps).toBe(0)
    expect(metricsFor(upgraded, 'db').inboundRps).toBeGreaterThan(metricsFor(constrained, 'db').inboundRps)
    expect(metricsFor(upgraded, 'db').droppedRps).toBeGreaterThan(0)
    expect(upgraded.perClass.write.errorRate).toBeGreaterThan(constrained.perClass.write.errorRate)
  })

  it('sums per-hop latency into every request class (ADR-0009)', () => {
    const result = unwrap(
      simulateTick(linearInput({ peakRps: 400, app: appTier, database: { capacityRps: 800, serviceTimeMs: 5 } })),
    )
    const app = metricsFor(result, 'app')
    const database = metricsFor(result, 'db')
    for (const requestClass of REQUEST_CLASSES) {
      expect(result.perClass[requestClass].p50Ms).toBeCloseTo(app.p50Ms + database.p50Ms, 9)
      expect(result.perClass[requestClass].p99Ms).toBeCloseTo(app.p99Ms + database.p99Ms, 9)
    }
  })

  it('is pure: 1,000 runs on a deeply frozen input give identical output', () => {
    const input = deepFreeze(
      linearInput({ peakRps: 950, fanoutFactor: 3, app: appTier, database: { capacityRps: 2000, serviceTimeMs: 8 } }),
    )
    const first = simulateTick(input)
    expect(first.ok).toBe(true)
    for (let run = 0; run < 1000; run++) {
      expect(simulateTick(input)).toStrictEqual(first)
    }
  })
})

describe('simulateTick input errors', () => {
  const base = linearInput({
    peakRps: 10,
    app: { capacityRps: 100, serviceTimeMs: 10 },
    database: { capacityRps: 100, serviceTimeMs: 10 },
  })
  const withApp = (change: (node: ComponentNode) => ComponentNode): TickInput => ({
    ...base,
    architecture: {
      ...base.architecture,
      nodes: base.architecture.nodes.map((node) => (node.id === 'app' ? change(node) : node)),
    },
  })

  it('passes topology errors through', () => {
    const cyclic: TickInput = {
      ...base,
      architecture: { ...base.architecture, edges: [...base.architecture.edges, edge('db', 'app')] },
    }
    expect(simulateTick(cyclic)).toEqual({ ok: false, error: { kind: 'cycle', nodeIds: ['app', 'db'] } })
  })

  it('rejects a tier the catalog does not have', () => {
    expect(simulateTick(withApp((node) => ({ ...node, tier: 3 })))).toEqual({
      ok: false,
      error: { kind: 'unknown-tier', nodeId: 'app', tier: 3 },
    })
  })

  it('rejects replicas until the resolver models them', () => {
    expect(simulateTick(withApp((node) => ({ ...node, replicas: 2 })))).toEqual({
      ok: false,
      error: { kind: 'unsupported-replicas', nodeId: 'app', replicas: 2 },
    })
  })

  it('rejects a replica count that is not a positive integer', () => {
    expect(simulateTick(withApp((node) => ({ ...node, replicas: 1.5 })))).toEqual({
      ok: false,
      error: { kind: 'invalid-node-config', nodeId: 'app', field: 'replicas' },
    })
  })

  it('rejects a negative fanout', () => {
    const input = withApp((node) => (node.kind === 'app-server' ? { ...node, config: { fanoutFactor: -1 } } : node))
    expect(simulateTick(input)).toEqual({
      ok: false,
      error: { kind: 'invalid-node-config', nodeId: 'app', field: 'fanoutFactor' },
    })
  })

  it('rejects non-positive capacity in the catalog', () => {
    const input: TickInput = { ...base, catalog: { ...base.catalog, 'app-server': [{ capacityRps: 0, serviceTimeMs: 10 }] } }
    expect(simulateTick(input)).toEqual({ ok: false, error: { kind: 'invalid-tier-stats', nodeId: 'app' } })
  })

  it('rejects a workload fraction outside 0..1', () => {
    const input: TickInput = { ...base, workload: { ...base.workload, readFraction: 1.5 } }
    expect(simulateTick(input)).toEqual({ ok: false, error: { kind: 'invalid-workload', field: 'readFraction' } })
  })
})
