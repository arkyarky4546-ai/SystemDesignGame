import { BALANCE } from '../config/balance'
import type { Difficulty } from '../config/difficulty'
import type { Depth, Question } from '../content/schema'
import { missCounts, nextFloat, rngForCheck, type CheckAttempt, type Knowledge, type Rng } from '../engine'

// Drawing and grading one check (03-CONTENT-SCHEMA §4). Pure functions over the concept's
// question pool and the player's knowledge, so a draw can be replayed and asserted without
// a DOM. 09-QUESTION-BANK §5's mix of authored, derived and diagnose slots needs derived
// questions, so it arrives in M6 (ADR-0040); until then every slot is an authored question
// of an eligible depth.

/** What the player chose for one question. */
export type Answer =
  | { readonly kind: 'single'; readonly optionId: string }
  | { readonly kind: 'multi'; readonly optionIds: readonly string[] }
  | { readonly kind: 'numeric'; readonly value: number }

/** One graded question: its score, 0..1, and whether that counts as getting it right. */
export type Grade = {
  readonly score: number
  readonly correct: boolean
}

export type CheckOutcome = {
  /** Sum of every question's score, 0..drawCount. Fractional when a `multi` earned partial credit. */
  readonly score: number
  readonly total: number
  readonly passed: boolean
  /** Questions that didn't score full marks. Retakes weight these up. */
  readonly missedQuestionIds: readonly string[]
}

/** Question depths this difficulty draws from (03-CONTENT-SCHEMA §4). */
export function depthsFor(difficulty: Difficulty): readonly Depth[] {
  return BALANCE.check.depths[difficulty]
}

/** Share of a check that has to be right to pass, 0..1. */
export function passThreshold(difficulty: Difficulty): number {
  return BALANCE.check.passThreshold[difficulty]
}

/** Active questions of a depth this difficulty draws. The pool a check is drawn from. */
export function eligibleQuestions(pool: readonly Question[], difficulty: Difficulty): readonly Question[] {
  const depths = depthsFor(difficulty)
  return pool.filter((question) => question.status === 'active' && depths.includes(question.depth))
}

/**
 * The questions one attempt asks, in the order they're asked. Seeded from the run, the
 * concept and the attempt number, so replaying an attempt gives the same questions and a
 * retake gives different ones. Questions missed in past attempts are weighted up, and a
 * depth-2 question is drawn first whenever the pool has one, so no check is pure recall.
 *
 * Returns fewer than `drawCount` only when the eligible pool is smaller than that, which
 * validation rejects for shipped content.
 */
export function drawCheck(options: {
  readonly pool: readonly Question[]
  readonly conceptId: string
  readonly drawCount: number
  readonly difficulty: Difficulty
  readonly knowledge: Knowledge
  /** The run's seed. Two runs draw different questions for the same attempt number. */
  readonly seed: number
  readonly attemptNumber: number
}): readonly Question[] {
  const eligible = eligibleQuestions(options.pool, options.difficulty)
  const misses = missCounts(options.knowledge, options.conceptId)
  const weightOf = (question: Question) =>
    1 + (misses[question.id] ?? 0) * BALANCE.check.missedQuestionWeight

  let rng = rngForCheck(options.seed, options.conceptId, options.attemptNumber)
  const drawn: Question[] = []
  const remaining = [...eligible]

  const take = (from: readonly Question[]) => {
    const picked = takeOne(from, weightOf, rng)
    rng = picked.rng
    drawn.push(picked.question)
    remaining.splice(remaining.indexOf(picked.question), 1)
  }

  const required = remaining.filter((question) => question.depth === BALANCE.check.requiredDepth)
  if (required.length > 0 && options.drawCount > 0) take(required)

  while (drawn.length < options.drawCount && remaining.length > 0) {
    take(allowedNext(remaining, drawn, options.drawCount))
  }
  return drawn
}

const isDerived = (question: Question) => question.provenance.origin === 'derived'

/**
 * The questions that may fill the next slot, under 09-QUESTION-BANK §5's hard rules: never
 * more than two derived in one check, never fewer than two authored, no two from one
 * template, and no two sharing more than one tag.
 *
 * The composition rules come off in order when nothing satisfies them all — tags first, then
 * templates — so a small pool still fills the check. The derived and authored counts are the
 * two that never come off: they are what stops a check becoming arithmetic drill.
 */
function allowedNext(remaining: readonly Question[], drawn: readonly Question[], drawCount: number): readonly Question[] {
  const derived = drawn.filter(isDerived).length
  const authored = drawn.length - derived
  const slotsLeft = drawCount - drawn.length
  const authoredStillNeeded = Math.max(0, BALANCE.check.minAuthored - authored)

  const byClass = remaining.filter(
    (question) => !isDerived(question) || (derived < BALANCE.check.maxDerived && slotsLeft > authoredStillNeeded),
  )
  const base = byClass.length > 0 ? byClass : remaining

  const templates = new Set(drawn.flatMap((question) => (question.provenance.templateId ? [question.provenance.templateId] : [])))
  const byTemplate = base.filter(
    (question) => question.provenance.templateId === undefined || !templates.has(question.provenance.templateId),
  )
  const afterTemplates = byTemplate.length > 0 ? byTemplate : base

  const byTags = afterTemplates.filter((question) =>
    drawn.every((other) => sharedTags(question, other) <= BALANCE.check.maxSharedTags),
  )
  return byTags.length > 0 ? byTags : afterTemplates
}

function sharedTags(a: Question, b: Question): number {
  const tags = new Set(b.tags)
  return a.tags.filter((tag) => tags.has(tag)).length
}

/** One weighted draw from `candidates`, without removing it. The caller removes what it takes. */
function takeOne(
  candidates: readonly Question[],
  weightOf: (question: Question) => number,
  rng: Rng,
): { readonly question: Question; readonly rng: Rng } {
  const total = candidates.reduce((sum, question) => sum + weightOf(question), 0)
  const draw = nextFloat(rng)
  let target = draw.value * total
  for (const question of candidates) {
    target -= weightOf(question)
    if (target < 0) return { question, rng: draw.rng }
  }
  // Float error can leave `target` at exactly 0 after the last subtraction.
  const last = candidates[candidates.length - 1]
  if (!last) throw new Error('takeOne needs at least one candidate')
  return { question: last, rng: draw.rng }
}

/**
 * Grades one answer, 0..1. A `single` and a `numeric` are right or wrong. A `multi` with
 * partial credit scores the share of correct options chosen less the share of incorrect
 * ones, floored at 0, so selecting everything scores nothing and a depth-3 question rewards
 * naming the benefit and its cost rather than hedging (09-QUESTION-BANK §6).
 */
export function gradeAnswer(question: Question, answer: Answer | null): Grade {
  const score = scoreAnswer(question, answer)
  return { score, correct: score === 1 }
}

function scoreAnswer(question: Question, answer: Answer | null): number {
  if (!answer) return 0
  const kind = question.kind
  switch (kind.type) {
    case 'single':
      return answer.kind === 'single' && answer.optionId === kind.correctId ? 1 : 0
    case 'numeric':
      return answer.kind === 'numeric' && Math.abs(answer.value - kind.answer) <= kind.tolerance ? 1 : 0
    case 'multi': {
      if (answer.kind !== 'multi') return 0
      const chosen = new Set(answer.optionIds)
      const correct = kind.correctIds.filter((id) => chosen.has(id)).length
      const wrong = answer.optionIds.filter((id) => !kind.correctIds.includes(id)).length
      const incorrectOptions = kind.options.length - kind.correctIds.length
      if (!kind.partialCredit) return correct === kind.correctIds.length && wrong === 0 ? 1 : 0
      const penalty = incorrectOptions > 0 ? wrong / incorrectOptions : 0
      return Math.max(0, correct / kind.correctIds.length - penalty)
    }
  }
}

/** The whole attempt's outcome: total score, whether it passed, and what to weight up next time. */
export function scoreCheck(
  questions: readonly Question[],
  answers: Readonly<Record<string, Answer>>,
  difficulty: Difficulty,
): CheckOutcome {
  const grades = questions.map((question) => ({ question, grade: gradeAnswer(question, answers[question.id] ?? null) }))
  const score = grades.reduce((sum, graded) => sum + graded.grade.score, 0)
  const total = questions.length
  return {
    score,
    total,
    // A check with no questions can't be passed; content validation stops that shipping.
    passed: total > 0 && score / total >= passThreshold(difficulty),
    missedQuestionIds: grades.filter((graded) => !graded.grade.correct).map((graded) => graded.question.id),
  }
}

/**
 * The outcome as a saved attempt. `correct` is a whole number of questions, which is what
 * the save schema holds and what the result screen reads out, so an attempt carrying
 * partial credit rounds to the nearest question; the pass decision uses the exact score
 * (ADR-0041).
 */
export function attemptFrom(conceptId: string, attemptNumber: number, outcome: CheckOutcome): CheckAttempt {
  return {
    conceptId,
    attemptNumber,
    correct: Math.round(outcome.score),
    total: outcome.total,
    passed: outcome.passed,
    missedQuestionIds: outcome.missedQuestionIds,
  }
}
