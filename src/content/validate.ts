import { BALANCE } from '../config/balance'
import { DIFFICULTIES } from '../config/difficulty'
import { ComponentDefSchema, ConceptSchema, QuestionSchema, parseContent, type ContentProblem } from './parse'
import type { ComponentDef, Concept, ConceptId, Question } from './schema'

// Every rule in 03-CONTENT-SCHEMA §8, over content passed in rather than imported, so a test
// can feed it a deliberately broken fixture. `tools/validate-content.ts` runs it over the
// real content and prints the result; nothing in the shipped bundle calls it.

export type ContentSource = {
  readonly concepts: readonly Concept[]
  readonly components: readonly ComponentDef[]
  /** Each concept's question pool, keyed by concept id. */
  readonly questions: Readonly<Record<string, readonly Question[]>>
}

export type ValidationReport = {
  readonly problems: readonly ContentProblem[]
  /** Items a human still has to clear (§1). Not a problem: the build warns, it doesn't fail. */
  readonly needsReview: { readonly concepts: number; readonly components: number; readonly questions: number }
  /** Items whose author wasn't fully confident (09-QUESTION-BANK §8). */
  readonly needsExpertReview: number
  readonly counts: { readonly concepts: number; readonly components: number; readonly questions: number }
  /**
   * §8's incident rule — running the engine against each incident's `goodResponses` — has
   * nothing to run on yet and can't be written against §6's schema as it stands, because
   * `goodResponses` is prose rather than architectures. M8 resolves it (ADR-0043).
   */
  readonly incidentsChecked: number
}

const conceptFile = (concept: Concept) => `src/content/concepts/tier-${concept.tier}/${concept.id}.ts`
const questionFile = (conceptId: string) => `src/content/questions/${conceptId}/authored.ts`
const componentFile = (def: ComponentDef) => `src/content/components/${def.kind}.ts`

export function validateContent(source: ContentSource): ValidationReport {
  const problems: ContentProblem[] = []
  const say = (file: string, message: string) => problems.push({ file, message })

  for (const concept of source.concepts) problems.push(...parseContent(ConceptSchema, concept, conceptFile(concept)))
  for (const def of source.components) problems.push(...parseContent(ComponentDefSchema, def, componentFile(def)))
  for (const [conceptId, pool] of Object.entries(source.questions)) {
    for (const question of pool) problems.push(...parseContent(QuestionSchema, question, questionFile(conceptId)))
  }

  const byId = new Map<string, Concept>()
  for (const concept of source.concepts) {
    if (byId.has(concept.id)) say(conceptFile(concept), `concept id "${concept.id}" is used twice; ids are permanent and unique`)
    byId.set(concept.id, concept)
  }
  const kinds = new Set(source.components.map((def) => def.kind))

  for (const concept of source.concepts) {
    const file = conceptFile(concept)

    for (const prerequisite of concept.prerequisites) {
      if (!byId.has(prerequisite)) say(file, `prerequisite "${prerequisite}" is not a concept that exists`)
    }
    for (const kind of concept.unlocks.components) {
      if (!kinds.has(kind)) say(file, `unlocks component kind "${kind}", which has no ComponentDef`)
    }
    checkPool(concept, source.questions[concept.id] ?? [], say)
  }

  checkPrerequisiteCycles(source.concepts, byId, say)
  checkReachableFromTierOne(source.concepts, say)
  checkGates(source.components, byId, say)
  checkQuestionIds(source.questions, say)

  return {
    problems,
    needsReview: {
      concepts: source.concepts.filter((concept) => concept.reviewStatus === 'needs-review').length,
      components: source.components.filter((def) => def.reviewStatus === 'needs-review').length,
      questions: allQuestions(source).filter((question) => question.reviewStatus === 'needs-review').length,
    },
    needsExpertReview: allQuestions(source).filter((question) => question.reviewStatus === 'needs-expert-review').length,
    counts: {
      concepts: source.concepts.length,
      components: source.components.length,
      questions: allQuestions(source).length,
    },
    incidentsChecked: 0,
  }
}

const allQuestions = (source: ContentSource): readonly Question[] => Object.values(source.questions).flat()

type Say = (file: string, message: string) => void

/**
 * §8's pool rules for one concept: at least twice the draw count of eligible questions, at
 * least one depth-2 question, and a depth-3 one from tier 3 up. The pool rule is checked per
 * difficulty, because each draws a different set of depths (03-CONTENT-SCHEMA §4) and the
 * narrowest of them is what actually has to hold.
 */
function checkPool(concept: Concept, pool: readonly Question[], say: Say) {
  const file = questionFile(concept.id)
  const active = pool.filter((question) => question.status === 'active')
  const needed = concept.check.drawCount * 2

  if (active.length === 0) {
    say(file, `concept "${concept.id}" has no active questions`)
    return
  }
  for (const difficulty of DIFFICULTIES) {
    const depths = BALANCE.check.depths[difficulty]
    const eligible = active.filter((question) => depths.includes(question.depth))
    if (eligible.length < needed) {
      say(
        file,
        `${difficulty} draws depths ${depths.join(' and ')} and has ${eligible.length} eligible questions; it needs ${needed}, twice the draw count of ${concept.check.drawCount}`,
      )
    }
  }
  if (!active.some((question) => question.depth === 2)) say(file, `concept "${concept.id}" has no depth-2 question`)
  if (concept.tier >= 3 && !active.some((question) => question.depth === 3)) {
    say(file, `tier ${concept.tier} concept "${concept.id}" has no depth-3 question`)
  }

  for (const question of active) {
    if (question.conceptId !== concept.id) say(file, `question "${question.id}" names concept "${question.conceptId}"`)
    checkWhyWrong(question, file, say)
  }
}

/** §8: every incorrect option on a single or multi question explains why it's wrong. */
function checkWhyWrong(question: Question, file: string, say: Say) {
  const kind = question.kind
  if (kind.type === 'numeric') return
  const correct = kind.type === 'single' ? [kind.correctId] : kind.correctIds
  const ids = new Set(kind.options.map((option) => option.id))
  for (const id of correct) {
    if (!ids.has(id)) say(file, `question "${question.id}" names correct option "${id}", which isn't in its options`)
  }
  for (const option of kind.options) {
    if (correct.includes(option.id)) continue
    if (!option.whyWrong) say(file, `question "${question.id}" option "${option.id}" has no whyWrong`)
  }
}

/** §8: the prerequisite graph is acyclic. Reports each cycle once, from its lowest id. */
function checkPrerequisiteCycles(concepts: readonly Concept[], byId: Map<string, Concept>, say: Say) {
  const state = new Map<string, 'visiting' | 'done'>()

  const walk = (id: ConceptId, trail: readonly string[]) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') {
      const concept = byId.get(id)
      const cycle = [...trail.slice(trail.indexOf(id)), id].join(' → ')
      if (concept) say(conceptFile(concept), `prerequisites form a cycle: ${cycle}`)
      return
    }
    state.set(id, 'visiting')
    for (const prerequisite of byId.get(id)?.prerequisites ?? []) walk(prerequisite, [...trail, id])
    state.set(id, 'done')
  }

  for (const concept of concepts) walk(concept.id, [])
}

/** §8: no concept is unreachable from tier 1 by following prerequisites. */
function checkReachableFromTierOne(concepts: readonly Concept[], say: Say) {
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    for (const concept of concepts) {
      if (concept.prerequisites.includes(id as ConceptId)) walk(concept.id)
    }
  }
  // The roots are tier-1 concepts that need nothing first. A concept whose prerequisite
  // doesn't exist isn't a root — it's unreachable, and the rule above says so too.
  for (const concept of concepts) {
    if (concept.tier === 1 && concept.prerequisites.length === 0) walk(concept.id)
  }
  for (const concept of concepts) {
    if (!seen.has(concept.id)) {
      say(conceptFile(concept), `"${concept.id}" can't be reached from tier 1 by following prerequisites`)
    }
  }
}

/** §8: every gate names a concept that exists — on a component and on each of its sizes. */
function checkGates(components: readonly ComponentDef[], byId: Map<string, Concept>, say: Say) {
  for (const def of components) {
    const file = componentFile(def)
    if (def.gatedBy !== undefined && !byId.has(def.gatedBy)) {
      say(file, `gatedBy names "${def.gatedBy}", which is not a concept that exists`)
    }
    for (const tier of def.tiers) {
      if (tier.gatedBy !== undefined && !byId.has(tier.gatedBy)) {
        say(file, `size "${tier.label}" is gated by "${tier.gatedBy}", which is not a concept that exists`)
      }
    }
    if (def.placeable && def.tiers.length > 0 && def.tiers[0]?.gatedBy !== undefined) {
      say(file, `the smallest size "${def.tiers[0].label}" is gated, so a new run could never place one`)
    }
    // ADR-0027: the canvas shows a reason whenever it refuses a connection, so every kind
    // this one can't send to needs one.
    for (const other of components) {
      if (def.validConnections.downstream.includes(other.kind)) continue
      if (!def.validConnections.refusedDownstream[other.kind]) {
        say(file, `refusedDownstream has no reason for "${other.kind}", which this component can't send requests to`)
      }
    }
  }
}

/** 09-QUESTION-BANK §4.3: a question id is permanent and never reused. */
function checkQuestionIds(questions: ContentSource['questions'], say: Say) {
  const seen = new Map<string, string>()
  for (const [conceptId, pool] of Object.entries(questions)) {
    for (const question of pool) {
      const first = seen.get(question.id)
      if (first) say(questionFile(conceptId), `question id "${question.id}" is already used in ${first}`)
      else seen.set(question.id, questionFile(conceptId))
    }
  }
}
