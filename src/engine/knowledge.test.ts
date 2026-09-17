import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { firstPassBonusCents, hasPassed, missCounts, nextAttemptNumber, recordCheckAttempt } from './knowledge'
import type { CheckAttempt, Knowledge } from './types'

const EMPTY: Knowledge = { unlockedConcepts: [], checkHistory: [] }

const attempt = (over: Partial<CheckAttempt> = {}): CheckAttempt => ({
  conceptId: 'capacity-and-utilization',
  attemptNumber: 1,
  correct: 5,
  total: 5,
  passed: true,
  missedQuestionIds: [],
  ...over,
})

describe('knowledge (ADR-0040)', () => {
  it('unlocks a concept on the first pass and keeps it unlocked', () => {
    const first = recordCheckAttempt(EMPTY, attempt())
    expect(hasPassed(first.knowledge, 'capacity-and-utilization')).toBe(true)
    expect(first.knowledge.unlockedConcepts).toEqual(['capacity-and-utilization'])

    // A retake doesn't unlock it twice.
    const second = recordCheckAttempt(first.knowledge, attempt({ attemptNumber: 2 }))
    expect(second.knowledge.unlockedConcepts).toEqual(['capacity-and-utilization'])
  })

  it('pays the first-pass bonus once, in integer cents from BALANCE', () => {
    const first = recordCheckAttempt(EMPTY, attempt())
    expect(first.bonusCents).toBe(BALANCE.knowledge.firstPassBonusCents)
    expect(Number.isSafeInteger(first.bonusCents)).toBe(true)

    const retake = recordCheckAttempt(first.knowledge, attempt({ attemptNumber: 2 }))
    expect(retake.bonusCents).toBe(0)
  })

  it('pays nothing for a failed attempt, and nothing later for the pass it leads to being a second pass', () => {
    const failed = recordCheckAttempt(EMPTY, attempt({ passed: false, correct: 2, missedQuestionIds: ['q-1', 'q-2', 'q-3'] }))
    expect(failed.bonusCents).toBe(0)
    expect(failed.knowledge.unlockedConcepts).toEqual([])

    // The pass that follows is still the concept's first, so it pays.
    const passed = recordCheckAttempt(failed.knowledge, attempt({ attemptNumber: 2 }))
    expect(passed.bonusCents).toBe(BALANCE.knowledge.firstPassBonusCents)
  })

  it('reads the bonus without recording, so a caller can ask before it commits', () => {
    expect(firstPassBonusCents(EMPTY, attempt())).toBe(BALANCE.knowledge.firstPassBonusCents)
    expect(firstPassBonusCents(EMPTY, attempt({ passed: false }))).toBe(0)
  })

  it('never modifies the knowledge it is given', () => {
    const before: Knowledge = { unlockedConcepts: [], checkHistory: [] }
    const snapshot = structuredClone(before)
    recordCheckAttempt(before, attempt())
    expect(before).toEqual(snapshot)
  })

  it('counts attempts per concept, so the next attempt number is the draw seed', () => {
    expect(nextAttemptNumber(EMPTY, 'capacity-and-utilization')).toBe(1)
    const after = recordCheckAttempt(EMPTY, attempt({ passed: false }))
    expect(nextAttemptNumber(after.knowledge, 'capacity-and-utilization')).toBe(2)
    expect(nextAttemptNumber(after.knowledge, 'percentiles')).toBe(1)
  })

  it('counts how often each question was missed, across attempts and only for its concept', () => {
    const one = recordCheckAttempt(EMPTY, attempt({ passed: false, missedQuestionIds: ['q-a', 'q-b'] }))
    const two = recordCheckAttempt(one.knowledge, attempt({ attemptNumber: 2, passed: false, missedQuestionIds: ['q-a'] }))
    const other = recordCheckAttempt(two.knowledge, attempt({ conceptId: 'percentiles', passed: false, missedQuestionIds: ['q-z'] }))

    expect(missCounts(other.knowledge, 'capacity-and-utilization')).toEqual({ 'q-a': 2, 'q-b': 1 })
    expect(missCounts(other.knowledge, 'percentiles')).toEqual({ 'q-z': 1 })
  })
})
