import { describe, expect, it } from 'vitest'
import { COMPONENT_DEFS } from './components'
import { CONCEPTS } from './concepts'
import type { ComponentDef, Concept, Question } from './schema'
import { loadContentSource } from './source'
import { validateContent, type ContentSource } from './validate'

// 03-CONTENT-SCHEMA §8, checked both ways: the real content passes, and a deliberately broken
// copy of it fails with a message naming the file a human has to open.

const REAL = await loadContentSource()

const messagesFor = (source: ContentSource, file: string) =>
  validateContent(source)
    .problems.filter((problem) => problem.file === file)
    .map((problem) => problem.message)

/** The real content with one concept replaced. */
function withConcept(concept: Concept): ContentSource {
  return { ...REAL, concepts: REAL.concepts.map((each) => (each.id === concept.id ? concept : each)) }
}

/** The real content with one concept's pool replaced. */
function withPool(conceptId: string, pool: readonly Question[]): ContentSource {
  return { ...REAL, questions: { ...REAL.questions, [conceptId]: pool } }
}

/** The real content with one component definition replaced. */
function withComponent(def: ComponentDef): ContentSource {
  return { ...REAL, components: REAL.components.map((each) => (each.kind === def.kind ? def : each)) }
}

const CAPACITY = CONCEPTS['capacity-and-utilization']
const CAPACITY_FILE = 'src/content/concepts/tier-1/capacity-and-utilization.ts'
const CAPACITY_QUESTIONS = 'src/content/questions/capacity-and-utilization/authored.ts'

describe('the real content', () => {
  it('has no problems', () => {
    expect(validateContent(REAL).problems).toEqual([])
  })

  it('counts everything, and counts what still needs a human', () => {
    const report = validateContent(REAL)
    expect(report.counts.concepts).toBe(Object.keys(CONCEPTS).length)
    expect(report.counts.components).toBe(Object.keys(COMPONENT_DEFS).length)
    expect(report.counts.questions).toBe(Object.values(REAL.questions).flat().length)
    expect(report.needsReview.questions).toBe(report.counts.questions)
    expect(report.needsReview.concepts).toBe(report.counts.concepts)
  })

  it('reports that no incident has been engine-verified, because none exists yet', () => {
    expect(validateContent(REAL).incidentsChecked).toBe(0)
  })
})

describe('a deliberately broken fixture', () => {
  it('fails when an incorrect option has no whyWrong, naming the question file', () => {
    const pool = REAL.questions['capacity-and-utilization'] ?? []
    const broken = pool.map((question): Question => {
      const kind = question.kind
      if (kind.type !== 'single') return question
      const stripped = kind.options.map((option) => (option.id === kind.correctId ? option : { id: option.id, text: option.text }))
      return { ...question, kind: { ...kind, options: stripped } }
    })
    const messages = messagesFor(withPool('capacity-and-utilization', broken), CAPACITY_QUESTIONS)
    expect(messages.some((message) => message.includes('has no whyWrong'))).toBe(true)
  })

  it('fails when prerequisites form a cycle, naming the concept file', () => {
    const source: ContentSource = {
      ...REAL,
      concepts: REAL.concepts.map((concept) => ({
        ...concept,
        prerequisites: concept.id === 'capacity-and-utilization' ? (['percentiles'] as const) : (['capacity-and-utilization'] as const),
      })),
    }
    const messages = messagesFor(source, CAPACITY_FILE)
    expect(messages.some((message) => message.includes('cycle'))).toBe(true)
  })

  it('fails when a pool is smaller than twice the draw count, naming the question file', () => {
    const pool = (REAL.questions['capacity-and-utilization'] ?? []).slice(0, 4)
    const messages = messagesFor(withPool('capacity-and-utilization', pool), CAPACITY_QUESTIONS)
    expect(messages.some((message) => message.includes('twice the draw count'))).toBe(true)
    // Every difficulty that falls short says so by name.
    expect(messages.some((message) => message.startsWith('staff'))).toBe(true)
  })

  it('fails when a concept has no active questions at all', () => {
    const messages = messagesFor(withPool('capacity-and-utilization', []), CAPACITY_QUESTIONS)
    expect(messages).toContain('concept "capacity-and-utilization" has no active questions')
  })

  it('fails when a pool has no depth-2 question', () => {
    const pool = (REAL.questions['capacity-and-utilization'] ?? []).map((question): Question => ({ ...question, depth: 1 }))
    const messages = messagesFor(withPool('capacity-and-utilization', pool), CAPACITY_QUESTIONS)
    expect(messages).toContain('concept "capacity-and-utilization" has no depth-2 question')
  })

  it('fails when a prerequisite names a concept that does not exist', () => {
    // The id is a union, so an unknown one only arrives from a hand-edited file or a rename.
    const concept = { ...CAPACITY, prerequisites: ['read-replicas'] } as unknown as Concept
    const messages = messagesFor(withConcept(concept), CAPACITY_FILE)
    expect(messages.some((message) => message.includes('is not a concept that exists'))).toBe(true)
  })

  it('fails when a concept is unreachable from tier 1', () => {
    const concept = { ...CAPACITY, prerequisites: ['nothing-real'] } as unknown as Concept
    const messages = messagesFor(withConcept(concept), CAPACITY_FILE)
    expect(messages.some((message) => message.includes("can't be reached from tier 1"))).toBe(true)
  })

  it('fails when a size is gated by a concept that does not exist, naming the component file', () => {
    const def = COMPONENT_DEFS['app-server']
    const broken = {
      ...def,
      tiers: def.tiers.map((tier) => (tier.gatedBy ? { ...tier, gatedBy: 'sharding' } : tier)),
    } as unknown as ComponentDef
    const messages = messagesFor(withComponent(broken), 'src/content/components/app-server.ts')
    expect(messages.some((message) => message.includes('is not a concept that exists'))).toBe(true)
  })

  it('fails when the smallest size of a placeable component is gated', () => {
    const def = COMPONENT_DEFS['app-server']
    const [smallest, ...rest] = def.tiers
    if (!smallest) throw new Error('expected tiers')
    const broken: ComponentDef = { ...def, tiers: [{ ...smallest, gatedBy: 'capacity-and-utilization' }, ...rest] }
    const messages = messagesFor(withComponent(broken), 'src/content/components/app-server.ts')
    expect(messages.some((message) => message.includes('a new run could never place one'))).toBe(true)
  })

  it('fails when a component can refuse a connection without a reason to show', () => {
    const def = COMPONENT_DEFS['app-server']
    const broken: ComponentDef = { ...def, validConnections: { ...def.validConnections, refusedDownstream: {} } }
    const messages = messagesFor(withComponent(broken), 'src/content/components/app-server.ts')
    expect(messages.some((message) => message.includes('refusedDownstream has no reason'))).toBe(true)
  })

  it('fails when a question id is reused, naming both files', () => {
    const first = (REAL.questions['capacity-and-utilization'] ?? [])[0]
    const pool = REAL.questions.percentiles ?? []
    if (!first || pool.length === 0) throw new Error('expected both pools')
    const clashing = pool.map((question, index): Question => (index === 0 ? { ...question, id: first.id } : question))
    const messages = messagesFor(withPool('percentiles', clashing), 'src/content/questions/percentiles/authored.ts')
    expect(messages.some((message) => message.includes('is already used in'))).toBe(true)
  })

  it('fails when a question does not parse against its schema', () => {
    const pool = REAL.questions['capacity-and-utilization'] ?? []
    const broken = pool.map((question, index): Question => (index === 0 ? { ...question, prompt: '' } : question))
    expect(messagesFor(withPool('capacity-and-utilization', broken), CAPACITY_QUESTIONS).length).toBeGreaterThan(0)
  })

  it('fails when a concept unlocks a component kind with no definition', () => {
    const concept = { ...CAPACITY, unlocks: { components: ['cache'] } } as unknown as Concept
    const messages = messagesFor(withConcept(concept), CAPACITY_FILE)
    expect(messages.some((message) => message.includes('has no ComponentDef'))).toBe(true)
  })
})
