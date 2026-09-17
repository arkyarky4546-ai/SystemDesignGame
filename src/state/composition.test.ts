import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { DIFFICULTIES } from '../config/difficulty'
import { CONCEPTS } from '../content/concepts'
import { loadQuestions } from '../content/questions'
import type { Question } from '../content/schema'
import { recordCheckAttempt, type Knowledge } from '../engine'
import { drawCheck, drawPractice, shuffledOptions } from './check'

// 09-QUESTION-BANK §5's hard rules, asserted over enough draws that a rare composition can't
// hide, and §6's deterministic option order. M6's acceptance asks for 10,000 simulated draws;
// these run 12,000, spread over every difficulty and a range of seeds and attempts.

const CONCEPT_ID = 'capacity-and-utilization'
const DRAW_COUNT = CONCEPTS[CONCEPT_ID].check.drawCount
const POOL = await loadQuestions(CONCEPT_ID)
const EMPTY: Knowledge = { unlockedConcepts: [], checkHistory: [] }

const isDerived = (question: Question) => question.provenance.origin === 'derived'

function* everyDraw(count: number) {
  for (let index = 0; index < count; index++) {
    const difficulty = DIFFICULTIES[index % DIFFICULTIES.length]
    if (!difficulty) continue
    yield {
      difficulty,
      questions: drawCheck({
        pool: POOL,
        conceptId: CONCEPT_ID,
        drawCount: DRAW_COUNT,
        difficulty,
        knowledge: EMPTY,
        seed: Math.floor(index / DIFFICULTIES.length),
        attemptNumber: (index % 97) + 1,
      }),
    }
  }
}

describe('draw composition (09-QUESTION-BANK §5), over 12,000 draws', () => {
  const draws = [...everyDraw(12_000)]

  it('produced a full check every time', () => {
    expect(draws).toHaveLength(12_000)
    for (const draw of draws) expect(draw.questions).toHaveLength(DRAW_COUNT)
  })

  it('never takes more than two derived questions', () => {
    const worst = Math.max(...draws.map((draw) => draw.questions.filter(isDerived).length))
    expect(worst).toBeLessThanOrEqual(BALANCE.check.maxDerived)
  })

  it('never takes fewer than two authored questions', () => {
    const fewest = Math.min(...draws.map((draw) => draw.questions.filter((question) => !isDerived(question)).length))
    expect(fewest).toBeGreaterThanOrEqual(BALANCE.check.minAuthored)
  })

  it('never takes two questions from one template', () => {
    for (const draw of draws) {
      const templates = draw.questions.flatMap((question) => (question.provenance.templateId ? [question.provenance.templateId] : []))
      expect(new Set(templates).size).toBe(templates.length)
    }
  })

  it('never repeats a question inside one draw', () => {
    for (const draw of draws) {
      const ids = draw.questions.map((question) => question.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('does take derived questions, so the rules are constraining something real', () => {
    expect(draws.some((draw) => draw.questions.some(isDerived))).toBe(true)
  })

  it('keeps every question inside its difficulty’s depths', () => {
    for (const draw of draws) {
      for (const question of draw.questions) {
        expect(BALANCE.check.depths[draw.difficulty], `${draw.difficulty} drew depth ${question.depth}`).toContain(question.depth)
      }
    }
  })
})

describe('option order (09-QUESTION-BANK §6)', () => {
  const question = POOL.find((each) => each.kind.type === 'single' && each.kind.options.length >= 4)

  it('is the same every time for one question and attempt', () => {
    if (!question) throw new Error('expected a four-option question')
    expect(shuffledOptions(question, 3).map((option) => option.id)).toEqual(shuffledOptions(question, 3).map((option) => option.id))
  })

  it('differs across attempts, so a retake is not the same picture', () => {
    if (!question) throw new Error('expected a four-option question')
    const orders = new Set(
      Array.from({ length: 20 }, (_, attempt) =>
        shuffledOptions(question, attempt + 1)
          .map((option) => option.id)
          .join(''),
      ),
    )
    expect(orders.size).toBeGreaterThan(1)
  })

  it('shows every option exactly once, and leaves the stored order alone', () => {
    if (!question || question.kind.type !== 'single') throw new Error('expected a single question')
    const stored = question.kind.options.map((option) => option.id)
    for (let attempt = 1; attempt <= 50; attempt++) {
      const shown = shuffledOptions(question, attempt).map((option) => option.id)
      expect([...shown].sort()).toEqual([...stored].sort())
    }
    expect(question.kind.options.map((option) => option.id)).toEqual(stored)
  })

  it('puts the correct answer in every position across attempts, so position says nothing', () => {
    if (!question || question.kind.type !== 'single') throw new Error('expected a single question')
    const correctId = question.kind.correctId
    const positions = new Set(
      Array.from({ length: 200 }, (_, attempt) => shuffledOptions(question, attempt + 1).findIndex((option) => option.id === correctId)),
    )
    expect(positions.size).toBe(question.kind.options.length)
  })
})

describe('practice draws (09-QUESTION-BANK §9)', () => {
  const practice = (round: number, knowledge: Knowledge = EMPTY) =>
    drawPractice({ pool: POOL, conceptId: CONCEPT_ID, count: 10, knowledge, seed: 5, round })

  it('draws from the full active pool, at depths a difficulty would filter out', () => {
    const seen = new Set<number>()
    for (let round = 0; round < 40; round++) for (const question of practice(round)) seen.add(question.depth)
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('mixes authored and derived without §5’s check limits, because nothing is at stake', () => {
    const derivedPerRound = Array.from({ length: 40 }, (_, round) => practice(round).filter(isDerived).length)
    expect(Math.max(...derivedPerRound)).toBeGreaterThan(BALANCE.check.maxDerived)
  })

  it('repeats a round exactly, and moves on to different questions in the next', () => {
    expect(practice(1).map((question) => question.id)).toEqual(practice(1).map((question) => question.id))
    expect(practice(1).map((question) => question.id)).not.toEqual(practice(2).map((question) => question.id))
  })

  it('weights a previously missed question up', () => {
    const missed = POOL[0]
    if (!missed) throw new Error('expected a pool')
    const weighted = recordCheckAttempt(EMPTY, {
      conceptId: CONCEPT_ID,
      attemptNumber: 1,
      correct: 0,
      total: 5,
      passed: false,
      missedQuestionIds: [missed.id],
    }).knowledge

    const rate = (knowledge: Knowledge) =>
      Array.from({ length: 200 }, (_, round) => practice(round, knowledge)).filter((questions) =>
        questions.some((question) => question.id === missed.id),
      ).length
    expect(rate(weighted)).toBeGreaterThan(rate(EMPTY))
  })

  it('never offers a retired question', () => {
    const retired = POOL.map((question): Question => ({ ...question, status: 'retired' }))
    expect(drawPractice({ pool: retired, conceptId: CONCEPT_ID, count: 10, knowledge: EMPTY, seed: 1, round: 0 })).toEqual([])
  })
})
