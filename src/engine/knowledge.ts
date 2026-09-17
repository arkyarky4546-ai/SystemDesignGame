import { BALANCE } from '../config/balance'
import type { CheckAttempt, Knowledge } from './types'

// What passing a check does to a player's knowledge and to the run's cash (00-GAME-DESIGN §4,
// ADR-0040). Pure functions over plain data, like the rest of the engine: the store applies
// what they return and saves it.

/** Whether this concept's check has ever been passed, in this run or an earlier one. */
export function hasPassed(knowledge: Knowledge, conceptId: string): boolean {
  return knowledge.unlockedConcepts.includes(conceptId)
}

/** The attempt number the next try at this concept's check gets. 1 when it has never been taken. */
export function nextAttemptNumber(knowledge: Knowledge, conceptId: string): number {
  return knowledge.checkHistory.filter((attempt) => attempt.conceptId === conceptId).length + 1
}

/**
 * How many past attempts missed each question, keyed by question id. Retake draws weight
 * these up, which is spaced repetition for the price of a counter (03-CONTENT-SCHEMA §4).
 */
export function missCounts(knowledge: Knowledge, conceptId: string): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const attempt of knowledge.checkHistory) {
    if (attempt.conceptId !== conceptId) continue
    for (const questionId of attempt.missedQuestionIds) counts[questionId] = (counts[questionId] ?? 0) + 1
  }
  return counts
}

/**
 * The one-time cash bonus, integer cents, that recording `attempt` would pay (ADR-0040).
 * Only a passing attempt at a concept that hasn't been passed before pays; a retake after
 * passing, a failed attempt, and practice mode all pay nothing.
 */
export function firstPassBonusCents(knowledge: Knowledge, attempt: CheckAttempt): number {
  if (!attempt.passed || hasPassed(knowledge, attempt.conceptId)) return 0
  return BALANCE.knowledge.firstPassBonusCents
}

/**
 * Records one check attempt: the knowledge it leaves behind, and the bonus in integer cents
 * to pay into the run's cash. Passing unlocks the concept permanently, so a later run gets
 * the unlock and no second bonus.
 */
export function recordCheckAttempt(
  knowledge: Knowledge,
  attempt: CheckAttempt,
): { readonly knowledge: Knowledge; readonly bonusCents: number } {
  const bonusCents = firstPassBonusCents(knowledge, attempt)
  const unlocked = attempt.passed && !hasPassed(knowledge, attempt.conceptId)
  return {
    knowledge: {
      unlockedConcepts: unlocked ? [...knowledge.unlockedConcepts, attempt.conceptId] : knowledge.unlockedConcepts,
      checkHistory: [...knowledge.checkHistory, attempt],
    },
    bonusCents,
  }
}
