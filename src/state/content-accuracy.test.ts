import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { CONCEPTS } from '../content/concepts'
import { loadQuestions } from '../content/questions'
import { capacityAndUtilizationAuthored } from '../content/questions/capacity-and-utilization/authored'
import { percentilesAuthored } from '../content/questions/percentiles/authored'
import { CONCEPT_IDS, type Block, type Concept, type ConceptId, type Question } from '../content/schema'
import { meanResponseTimeMs, p50LatencyMs, p99LatencyMs, qualityMultiplier, simulateTick, utilization } from '../engine'
import { linearInput, metricsFor, unwrap } from '../engine/test-helpers'

// The content rules that need the engine (CLAUDE.md: never invent content correctness). Every
// number a lesson or a question states is recomputed here through the same functions the game
// resolves turns with, so a question and the game can't disagree. The structural rules —
// 03-CONTENT-SCHEMA §8 — live in `content/validate.ts` and run under `npm run validate`.

const POOLS: Readonly<Record<ConceptId, readonly Question[]>> = {
  'capacity-and-utilization': capacityAndUtilizationAuthored,
  percentiles: percentilesAuthored,
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

const blockText = (block: Block): string => {
  switch (block.kind) {
    case 'prose':
    case 'callout':
      return block.text
    case 'formula':
      return `${block.formula} ${block.explanation}`
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
}

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

describe.each(CONCEPT_IDS)('the %s authored batch (09-QUESTION-BANK §2.2, §7, §8)', (conceptId) => {
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

  it('loads as its own chunk, so no question is in the initial bundle', async () => {
    expect(await loadQuestions(conceptId)).toEqual(pool)
  })
})
