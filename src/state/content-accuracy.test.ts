import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { COMPONENT_DEFS } from '../content/components'
import { CONCEPTS } from '../content/concepts'
import { DEMOS } from '../content/demos'
import { loadQuestions } from '../content/questions'
import { AUTHORED } from '../content/questions/authored'
import { CONCEPT_IDS, type Block, type Concept } from '../content/schema'
import { meanResponseTimeMs, p50LatencyMs, p99LatencyMs, qualityMultiplier, simulateTick, utilization } from '../engine'
import { linearInput, metricsFor, unwrap } from '../engine/test-helpers'

// The content rules that need the engine (CLAUDE.md: never invent content correctness). Every
// number a lesson or a question states is recomputed here through the same functions the game
// resolves turns with, so a question and the game can't disagree. The structural rules —
// 03-CONTENT-SCHEMA §8 — live in `content/validate.ts` and run under `npm run validate`.

/** Concepts with an authored batch. M7b writes the rest, a batch at a time. */
const WITH_AUTHORED = CONCEPT_IDS.filter((id) => AUTHORED[id].length > 0)
const POOLS = AUTHORED

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

const blockText = (block: Block): string => {
  switch (block.kind) {
    case 'prose':
    case 'callout':
      return block.text
    case 'formula':
      return `${block.formula} ${block.explanation}`
    case 'diagram':
      return block.caption
    case 'demo':
      return ''
  }
}

describe.each(CONCEPT_IDS)('the %s lesson (03-CONTENT-SCHEMA §2)', (conceptId) => {
  const concept: Concept = CONCEPTS[conceptId]

  it('has core prose in the 250–450 word range', () => {
    const count = words(concept.lesson.core.map(blockText).join(' '))
    expect(count).toBeGreaterThanOrEqual(250)
    expect(count).toBeLessThanOrEqual(450)
  })

  it('carries key numbers and at least one misconception', () => {
    expect(concept.lesson.keyNumbers.length).toBeGreaterThan(0)
    expect(concept.lesson.misconceptions.length).toBeGreaterThanOrEqual(1)
  })

  it('names its sources, so a human can check the claims', () => {
    expect(concept.sources?.length).toBeGreaterThan(0)
  })

  it('ships as needs-review until a human clears it', () => {
    expect(concept.reviewStatus).toBe('needs-review')
  })
})

describe('what capacity-and-utilization claims about the model (02-SIMULATION §5.2)', () => {
  it('is right that the mean is 2×, 10× and 100× the service time at 50%, 90% and 99%', () => {
    expect(meanResponseTimeMs(1, 0.5)).toBeCloseTo(2, 10)
    expect(meanResponseTimeMs(1, 0.9)).toBeCloseTo(10, 10)
    expect(meanResponseTimeMs(1, 0.99)).toBeCloseTo(100, 10)
  })

  it('is right that a 12 ms component at 90% has a mean of 120 ms and a p99 of about 553 ms', () => {
    const mean = meanResponseTimeMs(12, 0.9)
    expect(mean).toBeCloseTo(120, 10)
    expect(Math.round(p99LatencyMs(mean))).toBe(553)
  })

  it('is right that a 2,400/s peak at 80% needs 3,000/s of capacity', () => {
    expect(utilization(2400, 3000)).toBeCloseTo(0.8, 10)
  })

  it('is right that 85% → 60% takes about 1.4× the capacity and buys 6.7× → 2.5×', () => {
    expect(meanResponseTimeMs(1, 0.85)).toBeCloseTo(6.67, 2)
    expect(meanResponseTimeMs(1, 0.6)).toBeCloseTo(2.5, 10)
    // Same load, lower utilization: capacity rises by the ratio of the two utilizations.
    expect(0.85 / 0.6).toBeCloseTo(1.4, 1)
  })

  it('is right that doubling capacity at 50% gives about 1.3× and at 95% about 1.9×', () => {
    expect(meanResponseTimeMs(1, 0.95)).toBeCloseTo(20, 10)
    expect(meanResponseTimeMs(1, 0.5 / 2)).toBeCloseTo(1.33, 2)
    expect(meanResponseTimeMs(1, 0.95 / 2)).toBeCloseTo(1.9, 1)
  })

  it('is right that 96% utilization is already 25× the service time, and reads as 99%', () => {
    expect(meanResponseTimeMs(1, 0.96)).toBeCloseTo(25, 10)
    expect(BALANCE.queueing.maxUtilization).toBeLessThan(1)
  })

  it('is right that a tier sized for a 400/s mean meets 1,000/s at a 2.5× peak and drops 600/s', () => {
    const tick = unwrap(
      simulateTick({
        ...linearInput({
          peakRps: 400,
          app: { capacityRps: 400, serviceTimeMs: 10 },
          database: { capacityRps: 10_000, serviceTimeMs: 5 },
        }),
        workload: { meanRps: 400, peakMultiplier: 2.5, readFraction: 0.8, staticFraction: 0.25, keySkew: 0, payloadKb: 40 },
      }),
    )
    expect(tick.peakRps).toBe(1000)
    expect(metricsFor(tick, 'app').droppedRps).toBeCloseTo(600, 10)
  })
})

describe('what percentiles claims about the model (02-SIMULATION §5.2, §6)', () => {
  it('is right that p50 is about 0.69 of the mean and p99 about 4.61', () => {
    expect(p50LatencyMs(1)).toBeCloseTo(0.693, 3)
    expect(p99LatencyMs(1)).toBeCloseTo(4.605, 3)
  })

  it('is right that a 40 ms mean gives a median near 28 ms and a p99 near 184 ms', () => {
    expect(Math.round(p50LatencyMs(40))).toBe(28)
    expect(Math.round(p99LatencyMs(40))).toBe(184)
  })

  it('is right that p99 is about 6.6 times p50', () => {
    expect(p99LatencyMs(1) / p50LatencyMs(1)).toBeCloseTo(6.6, 1)
  })

  it('is right that a ten-request page view has about a 10% chance of touching the tail', () => {
    expect(1 - 0.99 ** 10).toBeCloseTo(0.1, 2)
  })

  it('is right that end-to-end p99 is the sum of the hops’ p99s (ADR-0009)', () => {
    const tick = unwrap(
      simulateTick(
        linearInput({ peakRps: 90, app: { capacityRps: 200, serviceTimeMs: 20 }, database: { capacityRps: 200, serviceTimeMs: 8 } }),
      ),
    )
    const summed = metricsFor(tick, 'app').p99Ms + metricsFor(tick, 'db').p99Ms
    expect(tick.perClass['dynamic-read'].p99Ms).toBeCloseTo(summed, 10)
  })

  it('is right about the quality multiplier: capped at target, 0.8 at twice it, floored at 2.75×', () => {
    const target = BALANCE.slo.p99TargetMs
    expect(target).toBe(300)
    expect(qualityMultiplier(target)).toBeCloseTo(1.2, 10)
    expect(qualityMultiplier(250)).toBeCloseTo(1.2, 10)
    expect(qualityMultiplier(600)).toBeCloseTo(0.8, 10)
    expect(qualityMultiplier(target * 2.75)).toBeCloseTo(0.5, 10)
    // 0.8 against the 1.2 a week at target would earn is a third less revenue.
    expect(0.8 / 1.2).toBeCloseTo(2 / 3, 10)
  })

  it('is right that a 600 ms p99 has a median near 90 ms, and a 150 ms p99 one near 23 ms', () => {
    const medianFromP99 = (p99: number) => (p99 * p50LatencyMs(1)) / p99LatencyMs(1)
    expect(Math.round(medianFromP99(600))).toBe(90)
    expect(Math.round(medianFromP99(150))).toBe(23)
  })
})

const APP_TIERS = COMPONENT_DEFS['app-server'].tiers
const DB_TIERS = COMPONENT_DEFS.database.tiers
const smallestApp = APP_TIERS[0]
const largestApp = APP_TIERS[APP_TIERS.length - 1]
const largestDb = DB_TIERS[DB_TIERS.length - 1]
const ROOMY = { capacityRps: 100_000, serviceTimeMs: 1 }

describe('what client-server-basics claims about the model (02-SIMULATION §4–5)', () => {
  it('is right that 200/s served with three queries each sends the database 600/s', () => {
    const tick = unwrap(simulateTick(linearInput({ peakRps: 200, app: ROOMY, database: ROOMY, fanoutFactor: 3 })))
    expect(metricsFor(tick, 'db').inboundRps).toBe(600)
  })

  it('is right that a request the app server drops makes no queries', () => {
    const tick = unwrap(
      simulateTick(linearInput({ peakRps: 150, app: { capacityRps: 100, serviceTimeMs: 10 }, database: ROOMY, fanoutFactor: 2 })),
    )
    expect(metricsFor(tick, 'app').droppedRps).toBe(50)
    expect(metricsFor(tick, 'db').inboundRps).toBe(200)
  })

  it('is right that a 100/s mean with a 2.5× busy hour puts 250/s on the path', () => {
    const input = linearInput({ peakRps: 100, app: ROOMY, database: ROOMY })
    const tick = unwrap(simulateTick({ ...input, workload: { ...input.workload, peakMultiplier: 2.5 } }))
    expect(tick.peakRps).toBe(250)
    expect(tick.perEdge[0]?.rps).toBe(250)
  })

  it('is right that a same-datacenter round trip is about five thousand memory reads', () => {
    const memoryReadNs = 100
    const datacenterRoundTripNs = 500_000
    expect(datacenterRoundTripNs / memoryReadNs).toBe(5000)
  })

  it('is right that 100 km of fiber costs roughly a millisecond per round trip', () => {
    const fiberKmPerSecond = 299_792 / 1.47
    expect(((2 * 100) / fiberKmPerSecond) * 1000).toBeCloseTo(1, 1)
  })
})

describe('what latency-and-throughput claims about the model (02-SIMULATION §5.2, ADR-0020)', () => {
  it('is right that a 400/s app server in front of a 150/s database completes at most 150/s', () => {
    for (const peakRps of [200, 400, 900]) {
      const tick = unwrap(
        simulateTick(
          linearInput({ peakRps, app: { capacityRps: 400, serviceTimeMs: 10 }, database: { capacityRps: 150, serviceTimeMs: 5 } }),
        ),
      )
      expect(peakRps * (1 - tick.perClass['dynamic-read'].errorRate)).toBeCloseTo(150, 9)
    }
  })

  it('is right that 200/s at a 150/s component loses a quarter, not a third', () => {
    const tick = unwrap(
      simulateTick(linearInput({ peakRps: 200, app: { capacityRps: 150, serviceTimeMs: 10 }, database: ROOMY })),
    )
    expect(tick.perClass['dynamic-read'].errorRate).toBeCloseTo(0.25, 12)
    expect((200 - 150) / 150).toBeCloseTo(1 / 3, 12)
  })

  it('is right that response time with nothing queued is the service time', () => {
    expect(meanResponseTimeMs(12, 0)).toBe(12)
  })

  it('quotes the app server sizes as they are: 12 ms and 10/s, 10 ms and 500/s, fifty times the capacity', () => {
    expect(smallestApp).toMatchObject({ serviceTimeMs: 12, capacityRps: 10 })
    expect(largestApp).toMatchObject({ serviceTimeMs: 10, capacityRps: 500 })
    expect((largestApp?.capacityRps ?? 0) / (smallestApp?.capacityRps ?? 1)).toBe(50)
  })

  it('does Little’s law arithmetic right: 200/s at 40 ms is 8 in flight, and one at a time is 25/s', () => {
    expect(200 * 0.04).toBeCloseTo(8, 12)
    expect(200 * 0.08).toBeCloseTo(16, 12)
    expect(1 / 0.04).toBeCloseTo(25, 12)
    expect(8 / 0.04).toBeCloseTo(200, 12)
  })
})

describe('what vertical-scaling claims about the model and the catalog (02-SIMULATION §5.2, §8)', () => {
  it('is right that doubling capacity at 95% takes the mean from 20 service times to under 2', () => {
    expect(meanResponseTimeMs(1, 0.95)).toBeCloseTo(20, 10)
    expect(meanResponseTimeMs(1, utilization(95, 200))).toBeCloseTo(1.9, 1)
    expect(meanResponseTimeMs(1, utilization(95, 200))).toBeLessThan(2)
  })

  it('is right that doubling capacity at 30% takes the mean from 1.43 to 1.18', () => {
    expect(meanResponseTimeMs(1, 0.3)).toBeCloseTo(1.43, 2)
    expect(meanResponseTimeMs(1, utilization(30, 200))).toBeCloseTo(1.18, 2)
  })

  it('is right that the floor is about 4.6 service times, and about 46 ms for the largest app server', () => {
    expect(p99LatencyMs(meanResponseTimeMs(1, 0))).toBeCloseTo(4.6, 1)
    expect(Math.round(p99LatencyMs(meanResponseTimeMs(largestApp?.serviceTimeMs ?? 0, 0)))).toBe(46)
  })

  it('quotes the largest sizes as they are: 500/s app server and 600/s database', () => {
    expect(largestApp?.capacityRps).toBe(500)
    expect(largestDb?.capacityRps).toBe(600)
  })

  it('is right that an upgrade in front can make a healthy database drop load', () => {
    const database = { capacityRps: 200, serviceTimeMs: 5 }
    const before = unwrap(simulateTick(linearInput({ peakRps: 300, app: { capacityRps: 100, serviceTimeMs: 10 }, database })))
    const after = unwrap(simulateTick(linearInput({ peakRps: 300, app: { capacityRps: 600, serviceTimeMs: 10 }, database })))
    expect(metricsFor(before, 'db').status).toBe('healthy')
    expect(metricsFor(before, 'db').droppedRps).toBe(0)
    expect(metricsFor(after, 'db').droppedRps).toBe(100)
  })

  it('is right that each size up costs more per week than the one before, for both kinds', () => {
    for (const tiers of [APP_TIERS, DB_TIERS]) {
      for (let index = 1; index < tiers.length; index++) {
        expect(tiers[index]?.runningCostPerTurnCents).toBeGreaterThan(tiers[index - 1]?.runningCostPerTurnCents ?? Infinity)
      }
    }
  })

  it('does Amdahl’s arithmetic right: 5% serial gives about 5.9× on 8 cores, 12.5× on 32, and never 20×', () => {
    const speedup = (serial: number, cores: number) => 1 / (serial + (1 - serial) / cores)
    expect(speedup(0.05, 8)).toBeCloseTo(5.9, 1)
    expect(speedup(0.05, 32)).toBeCloseTo(12.5, 1)
    expect(speedup(0.05, 1_000_000)).toBeLessThan(20)
  })

  it('names the gate the curriculum gives it: every database size above Small', () => {
    expect(DB_TIERS.map((tier) => tier.gatedBy ?? null)).toEqual([null, 'vertical-scaling', 'vertical-scaling', 'vertical-scaling'])
  })
})

describe('what the vertical scaling demo’s caption claims (03-CONTENT-SCHEMA §7)', () => {
  const demo = DEMOS['vertical-scaling']
  const variable = demo.variable
  const serviceTimeMs = largestApp?.serviceTimeMs ?? 0
  const p99At = (capacityRps: number) => {
    if (variable.kind !== 'capacityRps') throw new Error('expected a capacity slider')
    return p99LatencyMs(meanResponseTimeMs(serviceTimeMs, utilization(variable.loadRps, capacityRps)))
  }

  it('holds fifty requests a second on the largest app server, and slides up to its capacity', () => {
    expect(variable).toMatchObject({ kind: 'capacityRps', loadRps: 50, max: largestApp?.capacityRps })
    expect(demo.architecture.nodes.find((node) => node.id === demo.nodeId)).toMatchObject({ kind: 'app-server', tier: 3 })
  })

  it('is right that the first steps are worth seconds of p99', () => {
    expect(p99At(variable.min)).toBeGreaterThan(1000)
    expect(p99At(100)).toBeLessThan(100)
  })

  it('is right that the last 300/s of capacity are worth about 10 ms', () => {
    expect(p99At(200) - p99At(500)).toBeCloseTo(10, 0)
  })
})

/**
 * Every numeric question, recomputed the way the engine would. The key is the question id and
 * the value is what the engine says the answer is, in the question's own unit.
 */
const NUMERIC_ANSWERS: Readonly<Record<string, () => number>> = {
  // Capacity for a 2,400/s peak at 80%: the utilization the answer claims is exactly 0.80.
  'q-capacity-and-utilization-a-0005': () => {
    const capacity = 3000
    expect(utilization(2400, capacity)).toBeCloseTo(0.8, 10)
    return capacity
  },
  'q-capacity-and-utilization-a-0006': () => utilization(340, 400) * 100,
  'q-capacity-and-utilization-a-0007': () => meanResponseTimeMs(6, 0.75),
  'q-capacity-and-utilization-a-0008': () => p99LatencyMs(meanResponseTimeMs(12, 0.8)),
  // Load turned away by a 150/s component receiving 190/s, straight out of a resolved tick.
  'q-capacity-and-utilization-a-0009': () => {
    const tick = unwrap(
      simulateTick(
        linearInput({ peakRps: 190, app: { capacityRps: 150, serviceTimeMs: 10 }, database: { capacityRps: 10_000, serviceTimeMs: 5 } }),
      ),
    )
    return metricsFor(tick, 'app').droppedRps
  },
  'q-percentiles-a-0005': () => p99LatencyMs(40),
  'q-percentiles-a-0006': () => 460 / p99LatencyMs(1),
  'q-percentiles-a-0007': () => p50LatencyMs(meanResponseTimeMs(15, 0.8)),
  'q-percentiles-a-0008': () => p99LatencyMs(1) / p50LatencyMs(1),
  // Two hops of 120 ms each, summed the way the resolver sums a path (ADR-0009).
  'q-percentiles-a-0009': () => {
    const tick = unwrap(
      simulateTick(
        linearInput({ peakRps: 50, app: { capacityRps: 100, serviceTimeMs: 10 }, database: { capacityRps: 100, serviceTimeMs: 10 } }),
      ),
    )
    const hops = tick.perEdge.length
    expect(hops).toBe(2)
    return 120 * hops
  },
  'q-percentiles-a-0010': () => (1 - 0.99 ** 20) * 100,
  // Two queries for each of 450 requests, against the largest database's capacity.
  'q-vertical-scaling-a-0005': () => {
    expect(largestDb?.capacityRps).toBe(600)
    const tick = unwrap(
      simulateTick(
        linearInput({ peakRps: 450, app: ROOMY, database: { capacityRps: 600, serviceTimeMs: 5 }, fanoutFactor: 2 }),
      ),
    )
    return metricsFor(tick, 'db').droppedRps
  },
  // Sized so the peak sits at 75%, then loaded with the weekly mean: a 2.5× peak multiplier.
  'q-vertical-scaling-a-0008': () => {
    const peakRps = 250
    return utilization(peakRps / 2.5, peakRps / 0.75) * 100
  },
  // Medium at 90%, then the same peak on Large, with the sizes read from the catalog.
  'q-vertical-scaling-a-0009': () => {
    expect(APP_TIERS[1]).toMatchObject({ label: 'Medium', capacityRps: 40, serviceTimeMs: 11 })
    expect(APP_TIERS[2]).toMatchObject({ label: 'Large', capacityRps: 150, serviceTimeMs: 10 })
    const peakRps = 40 * 0.9
    expect(meanResponseTimeMs(11, utilization(peakRps, 40))).toBeCloseTo(110, 9)
    return meanResponseTimeMs(10, utilization(peakRps, 150))
  },
}

describe('what the vertical-scaling authored batch claims (02-SIMULATION §5.2)', () => {
  const p99 = (serviceTimeMs: number, u: number) => p99LatencyMs(meanResponseTimeMs(serviceTimeMs, u))

  it('a-0004: 10 ms at 20% is about 58 ms; four times the room is about 48; the floor is 46', () => {
    expect(Math.round(p99(10, 0.2))).toBe(58)
    expect(Math.round(p99(10, utilization(20, 400)))).toBe(48)
    expect(Math.round(p99(10, 0.2) / 4)).toBe(14)
    expect(Math.round(p99(10, 0.2) - p99(10, 0.05))).toBe(9)
    expect(Math.round(p99(10, 0))).toBe(46)
    expect(meanResponseTimeMs(10, 0.2)).toBeCloseTo(12.5, 9)
    expect(meanResponseTimeMs(10, 0.05)).toBeCloseTo(10.5, 1)
  })

  it('a-0006: 180/s behind a 150/s app server puts the database at 75%, and at 90% once it is upgraded', () => {
    const database = { capacityRps: 200, serviceTimeMs: 5 }
    const before = unwrap(simulateTick(linearInput({ peakRps: 180, app: { capacityRps: 150, serviceTimeMs: 10 }, database })))
    const after = unwrap(simulateTick(linearInput({ peakRps: 180, app: { capacityRps: 500, serviceTimeMs: 10 }, database })))
    expect(metricsFor(before, 'app').droppedRps).toBe(30)
    expect(metricsFor(before, 'db')).toMatchObject({ utilization: 0.75, status: 'warning' })
    expect(metricsFor(after, 'db')).toMatchObject({ utilization: 0.9, status: 'saturated', droppedRps: 0 })
    expect(metricsFor(after, 'db').meanMs).toBeCloseTo(50, 9)
  })

  it('a-0007: the path is about 340 ms; doubling the database gives about 116, doubling the app server about 330', () => {
    const now = p99(10, 0.3) + p99(6, 0.9)
    expect(Math.round(now / 10) * 10).toBe(340)
    expect(Math.round(p99(6, 0.9))).toBe(276)
    expect(Math.round(p99(10, 0.3))).toBe(66)
    expect(Math.round(p99(10, 0.3) + p99(6, 0.45))).toBe(116)
    expect(Math.round(p99(6, 0.45))).toBe(50)
    expect(Math.round((p99(10, 0.15) + p99(6, 0.9)) / 10) * 10).toBe(330)
    expect(Math.round(p99(10, 0.3) - p99(10, 0.15))).toBe(12)
    expect(meanResponseTimeMs(1, 0.45)).toBeCloseTo(1.8, 1)
  })

  it('a-0010: Large at 40% to Extra large saves about 12 ms of p99, for $250 more a week and $4,500 of setup', () => {
    const [, , large, extraLarge] = DB_TIERS
    expect(large).toMatchObject({ capacityRps: 200, serviceTimeMs: 5, runningCostPerTurnCents: 200_00 })
    expect(extraLarge).toMatchObject({ capacityRps: 600, serviceTimeMs: 5, runningCostPerTurnCents: 450_00, setupCostCents: 4_500_00 })
    const load = 200 * 0.4
    expect(Math.round(p99(5, 0.4))).toBe(38)
    expect(Math.round(p99(5, utilization(load, 600)))).toBe(27)
    expect(Math.round(p99(5, 0.4) - p99(5, utilization(load, 600)))).toBe(12)
    expect(meanResponseTimeMs(5, 0.4)).toBeCloseTo(8.3, 1)
    expect(meanResponseTimeMs(5, utilization(load, 600))).toBeCloseTo(5.8, 1)
    expect(600 / load).toBe(7.5)
    expect(Math.round(utilization(load, 600) * 100)).toBe(13)
    expect(Math.round(p99(5, 0))).toBe(23)
  })

  it('a-0011: at 60% the mean is 2.5 service times and nothing is dropped', () => {
    expect(meanResponseTimeMs(1, 0.6)).toBeCloseTo(2.5, 9)
    const tick = unwrap(simulateTick(linearInput({ peakRps: 60, app: { capacityRps: 100, serviceTimeMs: 10 }, database: ROOMY })))
    expect(metricsFor(tick, 'app').droppedRps).toBe(0)
  })
})

describe('numeric answers, recomputed through the engine', () => {
  const numeric = Object.values(POOLS)
    .flat()
    .filter((question) => question.kind.type === 'numeric')

  it('covers every numeric question in every pool', () => {
    expect(numeric.map((question) => question.id).sort()).toEqual(Object.keys(NUMERIC_ANSWERS).sort())
  })

  it.each(numeric.map((question) => [question.id, question] as const))('%s matches the engine', (id, question) => {
    if (question.kind.type !== 'numeric') throw new Error('expected a numeric question')
    const computed = NUMERIC_ANSWERS[id]
    if (!computed) throw new Error(`no engine check for ${id}`)
    expect(Math.abs(computed() - question.kind.answer)).toBeLessThanOrEqual(question.kind.tolerance)
  })
})

describe('which concepts have an authored batch', () => {
  it('is every concept but the two M7b hasn’t reached yet', () => {
    expect(CONCEPT_IDS.filter((id) => !WITH_AUTHORED.includes(id))).toEqual(['client-server-basics', 'latency-and-throughput'])
  })

  it('gives every batch its own id (M7b)', () => {
    const batches = WITH_AUTHORED.map((id) => new Set(AUTHORED[id].map((question) => question.provenance.batchId)))
    expect(new Set(batches.flatMap((batch) => [...batch])).size).toBe(WITH_AUTHORED.length)
  })
})

describe.each(WITH_AUTHORED)('the %s authored batch (09-QUESTION-BANK §2.2, §7, §8)', (conceptId) => {
  const concept: Concept = CONCEPTS[conceptId]
  const pool = POOLS[conceptId]

  it('is one batch of 10–15 questions', () => {
    expect(pool.length).toBeGreaterThanOrEqual(10)
    expect(pool.length).toBeLessThanOrEqual(15)
    expect(new Set(pool.map((question) => question.provenance.batchId)).size).toBe(1)
  })

  it('ships every item for review', () => {
    for (const question of pool) {
      expect(['needs-review', 'needs-expert-review'], question.id).toContain(question.reviewStatus)
    }
  })

  it('records where every question came from', () => {
    for (const question of pool) {
      expect(question.provenance.origin).toBe('authored')
      expect(question.provenance.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(question.provenance.generator).toBeTruthy()
    }
  })

  it('has at least two questions at each depth, so no depth is a token presence', () => {
    for (const depth of [1, 2, 3]) {
      expect(pool.filter((question) => question.depth === depth).length, `depth ${depth}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('never restates the explanation as a whyWrong', () => {
    for (const question of pool) {
      if (question.kind.type === 'numeric') continue
      for (const option of question.kind.options) {
        if (option.whyWrong) expect(option.whyWrong, `${question.id} option ${option.id}`).not.toBe(question.explanation)
      }
    }
  })

  it('makes every depth-3 question a multi with partial credit, per §6', () => {
    for (const question of pool.filter((item) => item.depth === 3)) {
      expect(question.kind.type, question.id).toBe('multi')
      if (question.kind.type === 'multi') {
        expect(question.kind.partialCredit, question.id).toBe(true)
        expect(question.kind.correctIds.length, question.id).toBeLessThan(question.kind.options.length)
      }
    }
  })

  it('keeps prompts, options and explanations inside §7’s length bounds', () => {
    for (const question of pool) {
      expect(words(question.prompt), `${question.id} prompt`).toBeGreaterThanOrEqual(15)
      expect(words(question.prompt), `${question.id} prompt`).toBeLessThanOrEqual(60)
      expect(words(question.explanation), `${question.id} explanation`).toBeGreaterThanOrEqual(25)
      expect(words(question.explanation), `${question.id} explanation`).toBeLessThanOrEqual(80)
      if (question.kind.type === 'numeric') continue
      for (const option of question.kind.options) {
        expect(words(option.text), `${question.id} option ${option.id}`).toBeLessThanOrEqual(20)
      }
    }
  })

  it('bans the generation crutches §7 bans', () => {
    for (const question of pool) {
      if (question.kind.type === 'numeric') continue
      for (const option of question.kind.options) {
        expect(option.text.toLowerCase(), question.id).not.toContain('all of the above')
        expect(option.text.toLowerCase(), question.id).not.toContain('none of the above')
      }
    }
  })

  it('does not make the correct answer the longest option most of the time', () => {
    const choice = pool.filter((question) => question.kind.type !== 'numeric')
    const longestIsCorrect = choice.filter((question) => {
      const kind = question.kind
      if (kind.type === 'numeric') return false
      const correct = kind.type === 'single' ? [kind.correctId] : kind.correctIds
      const longest = [...kind.options].sort((a, b) => b.text.length - a.text.length)[0]
      return longest !== undefined && correct.includes(longest.id)
    }).length
    expect(longestIsCorrect / choice.length).toBeLessThanOrEqual(0.45)
  })

  it('covers every key number and misconception in the lesson with at least one question', () => {
    const tags = new Set(pool.flatMap((question) => question.tags))
    for (const fact of concept.lesson.keyNumbers) expect([...tags], `keyNumber ${fact.tag}`).toContain(fact.tag)
    for (const item of concept.lesson.misconceptions) expect([...tags], `misconception ${item.tag}`).toContain(item.tag)
  })

  it('loads as its own chunk, with the authored pool first and the frozen derived bank after', async () => {
    const loaded = await loadQuestions(conceptId)
    expect(loaded.slice(0, pool.length)).toEqual(pool)
    expect(loaded.slice(pool.length).every((question) => question.provenance.origin === 'derived')).toBe(true)
  })
})
