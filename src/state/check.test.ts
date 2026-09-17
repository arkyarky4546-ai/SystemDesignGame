import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { DIFFICULTIES, type Difficulty } from '../config/difficulty'
import { capacityAndUtilizationAuthored } from '../content/questions/capacity-and-utilization/authored'
import { CONCEPTS } from '../content/concepts'
import type { Question } from '../content/schema'
import { recordCheckAttempt, type Knowledge } from '../engine'
import { attemptFrom, depthsFor, drawCheck, eligibleQuestions, gradeAnswer, passThreshold, scoreCheck, type Answer } from './check'

const POOL: readonly Question[] = capacityAndUtilizationAuthored
const CONCEPT_ID = 'capacity-and-utilization'
const DRAW_COUNT = CONCEPTS[CONCEPT_ID].check.drawCount
const EMPTY: Knowledge = { unlockedConcepts: [], checkHistory: [] }

const draw = (over: Partial<Parameters<typeof drawCheck>[0]> = {}) =>
  drawCheck({
    pool: POOL,
    conceptId: CONCEPT_ID,
    drawCount: DRAW_COUNT,
    difficulty: 'junior',
    knowledge: EMPTY,
    seed: 42,
    attemptNumber: 1,
    ...over,
  })

const ids = (questions: readonly Question[]) => questions.map((question) => question.id)

describe('check draw (03-CONTENT-SCHEMA §4)', () => {
  it('draws the same questions for the same attempt, every time', () => {
    expect(ids(draw())).toEqual(ids(draw()))
  })

  it('draws a different set on a retake', () => {
    expect(ids(draw({ attemptNumber: 2 }))).not.toEqual(ids(draw({ attemptNumber: 1 })))
  })

  it('draws a different set in a different run', () => {
    expect(ids(draw({ seed: 7 }))).not.toEqual(ids(draw({ seed: 42 })))
  })

  it('draws the asked-for number of questions, with no repeats', () => {
    const drawn = draw()
    expect(drawn).toHaveLength(DRAW_COUNT)
    expect(new Set(ids(drawn)).size).toBe(DRAW_COUNT)
  })

  it('always includes a question at the required depth', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let attemptNumber = 1; attemptNumber <= 20; attemptNumber++) {
        const drawn = draw({ difficulty, attemptNumber })
        expect(drawn.some((question) => question.depth === BALANCE.check.requiredDepth), `${difficulty} attempt ${attemptNumber}`).toBe(true)
      }
    }
  })

  it('only draws depths the difficulty is allowed, per §4', () => {
    expect(depthsFor('intern')).toEqual([1, 2])
    expect(depthsFor('junior')).toEqual([1, 2])
    expect(depthsFor('senior')).toEqual([1, 2, 3])
    expect(depthsFor('staff')).toEqual([2, 3])

    for (const difficulty of DIFFICULTIES) {
      for (let attemptNumber = 1; attemptNumber <= 20; attemptNumber++) {
        for (const question of draw({ difficulty, attemptNumber })) {
          expect(depthsFor(difficulty), `${difficulty} drew depth ${question.depth}`).toContain(question.depth)
        }
      }
    }
  })

  it('matches §4 and 00-GAME-DESIGN §6 on pass thresholds', () => {
    expect(passThreshold('intern')).toBe(0.6)
    expect(passThreshold('junior')).toBe(0.7)
    expect(passThreshold('senior')).toBe(0.8)
    expect(passThreshold('staff')).toBe(0.85)
  })

  it('weights a previously missed question up, so it comes back sooner', () => {
    const missed = POOL[0]
    if (!missed) throw new Error('expected a pool')
    const weighted = recordCheckAttempt(EMPTY, {
      conceptId: CONCEPT_ID,
      attemptNumber: 1,
      correct: 0,
      total: DRAW_COUNT,
      passed: false,
      missedQuestionIds: [missed.id],
    }).knowledge

    // Over many attempts, the missed question shows up more often than it does with no history.
    const rate = (knowledge: Knowledge) => {
      let seen = 0
      for (let attemptNumber = 2; attemptNumber <= 200; attemptNumber++) {
        if (ids(draw({ knowledge, attemptNumber })).includes(missed.id)) seen++
      }
      return seen
    }
    expect(rate(weighted)).toBeGreaterThan(rate(EMPTY))
  })
})

describe('eligible pool (M4b acceptance)', () => {
  it.each(DIFFICULTIES)('gives %s an eligible pool of at least twice the draw count', (difficulty: Difficulty) => {
    expect(eligibleQuestions(POOL, difficulty).length).toBeGreaterThanOrEqual(DRAW_COUNT * 2)
  })

  it('leaves out retired questions', () => {
    const retired: Question[] = POOL.map((question) => ({ ...question, status: 'retired' as const }))
    expect(eligibleQuestions(retired, 'senior')).toEqual([])
  })
})

describe('grading', () => {
  const single = POOL.find((question) => question.kind.type === 'single')
  const multi = POOL.find((question) => question.kind.type === 'multi')
  const numeric = POOL.find((question) => question.kind.type === 'numeric')

  it('scores a single-choice question right or wrong', () => {
    if (!single || single.kind.type !== 'single') throw new Error('expected a single question')
    const { options, correctId } = single.kind
    expect(gradeAnswer(single, { kind: 'single', optionId: correctId }).score).toBe(1)
    const wrong = options.find((option) => option.id !== correctId)
    expect(gradeAnswer(single, { kind: 'single', optionId: wrong?.id ?? '' }).score).toBe(0)
  })

  it('scores a numeric question inside its tolerance', () => {
    if (!numeric || numeric.kind.type !== 'numeric') throw new Error('expected a numeric question')
    const { answer, tolerance } = numeric.kind
    expect(gradeAnswer(numeric, { kind: 'numeric', value: answer }).score).toBe(1)
    expect(gradeAnswer(numeric, { kind: 'numeric', value: answer + tolerance }).score).toBe(1)
    expect(gradeAnswer(numeric, { kind: 'numeric', value: answer + tolerance + 1 }).score).toBe(0)
  })

  it('gives a multi question partial credit, and nothing for selecting everything', () => {
    if (!multi || multi.kind.type !== 'multi') throw new Error('expected a multi question')
    const { options, correctIds } = multi.kind
    expect(gradeAnswer(multi, { kind: 'multi', optionIds: [...correctIds] }).score).toBe(1)

    const partial = correctIds.slice(0, -1)
    const partialScore = gradeAnswer(multi, { kind: 'multi', optionIds: partial }).score
    expect(partialScore).toBeGreaterThan(0)
    expect(partialScore).toBeLessThan(1)

    // Selecting every option cancels out: the wrong ones subtract the right ones.
    expect(gradeAnswer(multi, { kind: 'multi', optionIds: options.map((option) => option.id) }).score).toBe(0)
  })

  it('scores an unanswered question as wrong', () => {
    if (!single) throw new Error('expected a single question')
    expect(gradeAnswer(single, null).score).toBe(0)
  })

  it('passes at the threshold and fails below it', () => {
    const questions = draw({ difficulty: 'junior' })
    const correctAnswer = (question: Question): Answer => {
      switch (question.kind.type) {
        case 'single':
          return { kind: 'single', optionId: question.kind.correctId }
        case 'multi':
          return { kind: 'multi', optionIds: [...question.kind.correctIds] }
        case 'numeric':
          return { kind: 'numeric', value: question.kind.answer }
      }
    }
    const all = Object.fromEntries(questions.map((question) => [question.id, correctAnswer(question)]))
    const perfect = scoreCheck(questions, all, 'junior')
    expect(perfect.score).toBe(questions.length)
    expect(perfect.passed).toBe(true)
    expect(perfect.missedQuestionIds).toEqual([])

    const none = scoreCheck(questions, {}, 'junior')
    expect(none.passed).toBe(false)
    expect(none.missedQuestionIds).toEqual(ids(questions))
  })

  it('records an attempt with a whole number of questions, as the save schema holds', () => {
    const outcome = { score: 3.5, total: 5, passed: true, missedQuestionIds: ['q-a'] }
    const attempt = attemptFrom(CONCEPT_ID, 2, outcome)
    expect(Number.isInteger(attempt.correct)).toBe(true)
    expect(attempt).toEqual({
      conceptId: CONCEPT_ID,
      attemptNumber: 2,
      correct: 4,
      total: 5,
      passed: true,
      missedQuestionIds: ['q-a'],
    })
  })
})
