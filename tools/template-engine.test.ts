import { describe, expect, it } from 'vitest'
import { meanResponseTimeMs, p99LatencyMs, simulateTick, utilization } from '../src/engine'
import { linearInput, metricsFor, unwrap } from '../src/engine/test-helpers'
import { TEMPLATE_ENGINE } from './bank'

// `resolvePath` is how a derived question asks the game's own resolver about a whole path
// (ADR-0048). It has to agree with `simulateTick` exactly, or a question could disagree with
// the week it describes.

const { resolvePath } = TEMPLATE_ENGINE

describe('resolvePath', () => {
  it('matches simulateTick on the game’s own path shape', () => {
    const app = { capacityRps: 150, serviceTimeMs: 12 }
    const database = { capacityRps: 400, serviceTimeMs: 6 }
    const tick = unwrap(simulateTick(linearInput({ peakRps: 180, app, database, fanoutFactor: 2 })))
    const path = resolvePath({ peakRps: 180, appServers: [{ ...app, queriesPerRequest: 2 }], database })

    expect(path.appServers[0]).toMatchObject({
      inboundRps: 180,
      servedRps: 150,
      droppedRps: 30,
      p99Ms: metricsFor(tick, 'app').p99Ms,
    })
    expect(path.database).toMatchObject({ inboundRps: 300, droppedRps: 0, p99Ms: metricsFor(tick, 'db').p99Ms })
    expect(path.p99Ms).toBe(tick.perClass['dynamic-read'].p99Ms)
    expect(path.errorRate).toBe(tick.perClass['dynamic-read'].errorRate)
  })

  it('completes no more than the narrowest hop', () => {
    const path = resolvePath({
      peakRps: 900,
      appServers: [{ capacityRps: 400, serviceTimeMs: 10, queriesPerRequest: 1 }],
      database: { capacityRps: 150, serviceTimeMs: 5 },
    })
    expect(path.completedRps).toBeCloseTo(150, 9)
    expect(path.database.droppedRps).toBe(250)
  })

  it('adds up each hop’s p99, including a chain of app servers', () => {
    const hop = { capacityRps: 200, serviceTimeMs: 8 }
    const path = resolvePath({
      peakRps: 100,
      appServers: [
        { ...hop, queriesPerRequest: 1 },
        { ...hop, queriesPerRequest: 1 },
      ],
      database: hop,
    })
    const each = p99LatencyMs(meanResponseTimeMs(8, utilization(100, 200)))
    expect(path.appServers).toHaveLength(2)
    expect(path.p99Ms).toBeCloseTo(3 * each, 9)
  })

  it('throws on a path the resolver refuses, rather than producing a question from it', () => {
    expect(() =>
      resolvePath({
        peakRps: 100,
        appServers: [{ capacityRps: 0, serviceTimeMs: 10, queriesPerRequest: 1 }],
        database: { capacityRps: 100, serviceTimeMs: 5 },
      }),
    ).toThrow(/doesn't resolve/)
  })
})
