import { describe, expect, it } from 'vitest'
import { CONCEPTS } from '../content/concepts'
import { loadQuestions } from '../content/questions'
import { capacityAndUtilizationAuthored } from '../content/questions/capacity-and-utilization/authored'
import type { Block, Question } from '../content/schema'
import { meanResponseTimeMs, p50LatencyMs, p99LatencyMs, simulateTick, utilization } from '../engine'
import { linearInput, metricsFor, unwrap } from '../engine/test-helpers'

// M4b's content rules, asserted rather than trusted (CLAUDE.md: never invent content
// correctness). Every number a question or the lesson states is recomputed here through the
// same engine functions the game resolves turns with, so a question and the game can't
// disagree. 09-QUESTION-BANK §7's full screener arrives in M5a; these are the rows of it
// that M4b's content has to pass now.

const CONCEPT = CONCEPTS['capacity-and-utilization']
const POOL: readonly Question[] = capacityAndUtilizationAuthored

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

const blockText = (block: Block): string => {
  switch (block.kind) {
    case 'prose':
      return block.text
    case 'callout':
      return block.text
    case 'formula':
      return `${block.formula} ${block.explanation}`
  }
}

describe('the lesson (03-CONTENT-SCHEMA §2)', () => {
  it('has core prose in the 250–450 word range', () => {
    const count = words(CONCEPT.lesson.core.map(blockText).join(' '))
    expect(count).toBeGreaterThanOrEqual(250)
    expect(count).toBeLessThanOrEqual(450)
  })

  it('carries key numbers and at least one misconception', () => {
    expect(CONCEPT.lesson.keyNumbers.length).toBeGreaterThan(0)
    expect(CONCEPT.lesson.misconceptions.length).toBeGreaterThanOrEqual(1)
  })

  it('names its sources, so a human can check the claims', () => {
    expect(CONCEPT.sources?.length).toBeGreaterThan(0)
  })

  it('ships as needs-review until a human clears it', () => {
    expect(CONCEPT.reviewStatus).toBe('needs-review')
  })

  it('draws 3–6 questions, as §3 allows', () => {
    expect(CONCEPT.check.drawCount).toBeGreaterThanOrEqual(3)
    expect(CONCEPT.check.drawCount).toBeLessThanOrEqual(6)
  })
})

describe('what the lesson claims about the model (02-SIMULATION §5.2)', () => {
  it('is right that the mean is 2×, 10× and 100× the service time at 50%, 90% and 99%', () => {
    const service = 1
    expect(meanResponseTimeMs(service, 0.5)).toBeCloseTo(2, 10)
    expect(meanResponseTimeMs(service, 0.9)).toBeCloseTo(10, 10)
    expect(meanResponseTimeMs(service, 0.99)).toBeCloseTo(100, 10)
  })

  it('is right that p99 is about 4.6× the mean, and that the median sits below it', () => {
    expect(p99LatencyMs(1)).toBeCloseTo(4.605, 3)
    expect(p50LatencyMs(1)).toBeCloseTo(0.693, 3)
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

  it('is right that a mean sized for 400/s meets 1,000/s at a 2.5× peak and drops 600/s', () => {
    const tick = unwrap(
      simulateTick({
        ...linearInput({ peakRps: 400, app: { capacityRps: 400, serviceTimeMs: 10 }, database: { capacityRps: 10_000, serviceTimeMs: 5 } }),
        workload: {
          meanRps: 400,
          peakMultiplier: 2.5,
          readFraction: 0.8,
          staticFraction: 0.25,
          keySkew: 0,
          payloadKb: 40,
        },
      }),
    )
    expect(tick.peakRps).toBe(1000)
    expect(metricsFor(tick, 'app').droppedRps).toBeCloseTo(600, 10)
  })
})

/**
 * Every numeric question, recomputed the way the engine would. The key is the question id
 * and the value is what the engine says the answer is, in the question's own unit.
 */
const NUMERIC_ANSWERS: Readonly<Record<string, () => number>> = {
  // Capacity for a 2,400/s peak at 80%: the utilization the answer claims is exactly 0.80.
  'q-capacity-and-utilization-a-0005': () => {
    const capacity = 3000
    expect(utilization(2400, capacity)).toBeCloseTo(0.8, 10)
    return capacity
  },
  // Utilization of 340/s against 400/s, as a percentage.
  'q-capacity-and-utilization-a-0006': () => utilization(340, 400) * 100,
  // Mean response time of a 6 ms component at 75%.
  'q-capacity-and-utilization-a-0007': () => meanResponseTimeMs(6, 0.75),
  // p99 of a 12 ms component at 80%.
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
}

describe('numeric answers, recomputed through the engine', () => {
  const numeric = POOL.filter((question) => question.kind.type === 'numeric')

  it('covers every numeric question in the pool', () => {
    expect(numeric.map((question) => question.id).sort()).toEqual(Object.keys(NUMERIC_ANSWERS).sort())
  })

  it.each(numeric.map((question) => [question.id, question] as const))('%s matches the engine', (id, question) => {
    if (question.kind.type !== 'numeric') throw new Error('expected a numeric question')
    const computed = NUMERIC_ANSWERS[id]
    if (!computed) throw new Error(`no engine check for ${id}`)
    expect(Math.abs(computed() - question.kind.answer)).toBeLessThanOrEqual(question.kind.tolerance)
  })
})

describe('the authored batch (09-QUESTION-BANK §2.2, §7, §8)', () => {
  it('is one batch of 10–15 questions', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(10)
    expect(POOL.length).toBeLessThanOrEqual(15)
    expect(new Set(POOL.map((question) => question.provenance.batchId)).size).toBe(1)
  })

  it('gives every question a unique, correctly shaped, permanent id', () => {
    expect(new Set(POOL.map((question) => question.id)).size).toBe(POOL.length)
    for (const question of POOL) {
      expect(question.id, question.id).toMatch(/^q-capacity-and-utilization-a-\d{4}$/)
    }
  })

  it('belongs to its concept and is active', () => {
    for (const question of POOL) {
      expect(question.conceptId).toBe(CONCEPT.id)
      expect(question.status).toBe('active')
    }
  })

  it('ships every item for review', () => {
    for (const question of POOL) {
      expect(['needs-review', 'needs-expert-review'], question.id).toContain(question.reviewStatus)
    }
  })

  it('records where every question came from', () => {
    for (const question of POOL) {
      expect(question.provenance.origin).toBe('authored')
      expect(question.provenance.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(question.provenance.generator).toBeTruthy()
    }
  })

  it('has at least two questions at each depth, so no depth is a token presence', () => {
    for (const depth of [1, 2, 3]) {
      expect(POOL.filter((question) => question.depth === depth).length, `depth ${depth}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('gives every incorrect option a whyWrong, and never one on a correct option', () => {
    for (const question of POOL) {
      const kind = question.kind
      if (kind.type === 'numeric') continue
      const correct = kind.type === 'single' ? [kind.correctId] : kind.correctIds
      for (const option of kind.options) {
        if (correct.includes(option.id)) continue
        expect(option.whyWrong, `${question.id} option ${option.id}`).toBeTruthy()
        // A restatement of the right answer teaches nothing (03-CONTENT-SCHEMA §3).
        expect(option.whyWrong, `${question.id} option ${option.id}`).not.toBe(question.explanation)
      }
    }
  })

  it('names a correct option that exists', () => {
    for (const question of POOL) {
      const kind = question.kind
      if (kind.type === 'numeric') continue
      const ids = kind.options.map((option) => option.id)
      const correct = kind.type === 'single' ? [kind.correctId] : kind.correctIds
      expect(new Set(ids).size, question.id).toBe(ids.length)
      for (const id of correct) expect(ids, question.id).toContain(id)
      expect(correct.length, question.id).toBeGreaterThan(0)
      if (kind.type === 'multi') expect(correct.length, question.id).toBeLessThan(ids.length)
    }
  })

  it('makes every depth-3 question a multi with partial credit, per §6', () => {
    for (const question of POOL.filter((item) => item.depth === 3)) {
      expect(question.kind.type, question.id).toBe('multi')
      if (question.kind.type === 'multi') expect(question.kind.partialCredit, question.id).toBe(true)
    }
  })

  it('keeps prompts, options and explanations inside §7’s length bounds', () => {
    for (const question of POOL) {
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
    for (const question of POOL) {
      if (question.kind.type === 'numeric') continue
      for (const option of question.kind.options) {
        expect(option.text.toLowerCase(), question.id).not.toContain('all of the above')
        expect(option.text.toLowerCase(), question.id).not.toContain('none of the above')
      }
    }
  })

  it('does not make the correct answer the longest option most of the time', () => {
    const choice = POOL.filter((question) => question.kind.type !== 'numeric')
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
    const tags = new Set(POOL.flatMap((question) => question.tags))
    for (const fact of CONCEPT.lesson.keyNumbers) expect([...tags], `keyNumber ${fact.tag}`).toContain(fact.tag)
    for (const item of CONCEPT.lesson.misconceptions) expect([...tags], `misconception ${item.tag}`).toContain(item.tag)
  })

  it('loads as its own chunk, so no question is in the initial bundle', async () => {
    const loaded = await loadQuestions('capacity-and-utilization')
    expect(loaded).toEqual(POOL)
  })
})
