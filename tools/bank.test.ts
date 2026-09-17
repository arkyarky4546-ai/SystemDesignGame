import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONCEPTS } from '../src/content/concepts'
import { AUTHORED } from '../src/content/questions/authored'
import { TEMPLATES } from '../src/content/questions/templates'
import { CONCEPT_IDS, type ConceptId, type Question } from '../src/content/schema'
import {
  TEMPLATE_ENGINE,
  buildManifest,
  checkManifest,
  generateForConcept,
  generationOptionsFor,
  screenQuestions,
  serializeBank,
  tooClose,
  type BankManifest,
  type Finding,
} from './bank'

// M5a's acceptance criteria. The bank is only as trustworthy as these are.

const CONCEPT_ID = 'capacity-and-utilization'
const DERIVED_FILE = `src/content/questions/${CONCEPT_ID}/derived.json`
const MANIFEST_FILE = 'src/content/questions/bank-manifest.json'

const templates = TEMPLATES[CONCEPT_ID]
const generate = () => generateForConcept(templates, TEMPLATE_ENGINE, generationOptionsFor(CONCEPT_ID))
const committedFor = (conceptId: ConceptId) =>
  JSON.parse(readFileSync(`src/content/questions/${conceptId}/derived.json`, 'utf8')) as Question[]
const committed = committedFor(CONCEPT_ID)
const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as BankManifest

/** The whole bank, with a given set of derived questions in place of this concept's committed ones. */
const pools = (derived: readonly Question[]) =>
  Object.fromEntries(
    CONCEPT_IDS.map((id) => [id, [...AUTHORED[id], ...(id === CONCEPT_ID ? derived : committedFor(id))]] as const),
  )

const screen = (questions: readonly Question[]): readonly Finding[] =>
  screenQuestions({
    concepts: Object.values(CONCEPTS),
    questions: pools(questions),
    engine: TEMPLATE_ENGINE,
    templates: TEMPLATES,
  })

const errorsOn = (questionId: string, questions: readonly Question[]) =>
  screen(questions).filter((finding) => finding.severity === 'error' && finding.questionId === questionId)

/** The committed derived bank, with one question replaced. */
const withQuestion = (question: Question): readonly Question[] =>
  committed.map((each) => (each.id === question.id ? question : each))

const ALL = [...AUTHORED[CONCEPT_ID], ...committed]

describe('generation (09-QUESTION-BANK §2.1)', () => {
  it('is deterministic: the same templates produce byte-identical output', () => {
    expect(serializeBank(generate().questions)).toBe(serializeBank(generate().questions))
  })

  it('reproduces the committed derived.json exactly', () => {
    expect(serializeBank(generate().questions)).toBe(readFileSync(DERIVED_FILE, 'utf8'))
  })

  it('freezes the number of instances each template asks for, with no repeated parameters', () => {
    const { questions, abandoned } = generate()
    expect(abandoned).toBe(0)
    expect(questions).toHaveLength(templates.reduce((total, template) => total + template.instanceCount, 0))
    const tuples = questions.map((question) => `${question.provenance.templateId}:${JSON.stringify(question.provenance.params)}`)
    expect(new Set(tuples).size).toBe(tuples.length)
  })

  it('records the template and the parameters every instance was built from', () => {
    for (const question of generate().questions) {
      expect(question.provenance.origin).toBe('derived')
      expect(question.provenance.templateId, question.id).toBeTruthy()
      expect(question.provenance.params, question.id).toBeTruthy()
    }
  })

  it('gives every distractor a whyWrong that names a mistake, and the answer none', () => {
    for (const question of generate().questions) {
      if (question.kind.type !== 'single') throw new Error('derived questions are single choice')
      const { options, correctId } = question.kind
      expect(options.length, question.id).toBeGreaterThanOrEqual(3)
      for (const option of options) {
        if (option.id === correctId) expect(option.whyWrong, question.id).toBeUndefined()
        else expect(option.whyWrong, `${question.id} ${option.id}`).toBeTruthy()
      }
    }
  })

  it('never offers two options within 2% of each other', () => {
    for (const question of generate().questions) {
      if (question.kind.type !== 'single') continue
      const values = question.kind.options.map((option) => Number(option.text.replace(/[^\d.-]/g, '')))
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const a = values[i]
          const b = values[j]
          if (a === undefined || b === undefined) continue
          expect(tooClose(a, b), `${question.id}: ${a} vs ${b}`).toBe(false)
        }
      }
    }
  })
})

describe('screening (09-QUESTION-BANK §7)', () => {
  it('passes the whole committed bank with no errors', () => {
    expect(screen(committed).filter((finding) => finding.severity === 'error')).toEqual([])
  })

  it('fails a derived answer that has been corrupted', () => {
    const target = committed[0]
    if (!target || target.kind.type !== 'single') throw new Error('expected a derived single question')
    const corrupted: Question = {
      ...target,
      kind: {
        ...target.kind,
        options: target.kind.options.map((option) => (option.id === 'a' ? { ...option, text: '999999' } : option)),
      },
    }
    const findings = errorsOn(target.id, withQuestion(corrupted))
    expect(findings.some((finding) => finding.rule === 'numeric self-verification')).toBe(true)
  })

  it('fails a derived question whose prompt no longer matches its template', () => {
    const target = committed[0]
    if (!target) throw new Error('expected a derived question')
    const findings = errorsOn(target.id, withQuestion({ ...target, prompt: `${target.prompt} And another thing.` }))
    expect(findings.some((finding) => finding.rule === 'numeric self-verification')).toBe(true)
  })

  it('rejects two options that are within 2% of each other', () => {
    const target = committed[0]
    if (!target || target.kind.type !== 'single') throw new Error('expected a derived single question')
    const kind = target.kind
    const correct = kind.options.find((option) => option.id === kind.correctId)
    const other = kind.options.find((option) => option.id !== kind.correctId)
    if (!correct || !other) throw new Error('expected options')
    const tooSimilar: Question = {
      ...target,
      kind: { ...kind, options: kind.options.map((option) => (option.id === other.id ? { ...option, text: correct.text } : option)) },
    }
    const findings = errorsOn(target.id, withQuestion(tooSimilar))
    expect(findings.some((finding) => finding.rule === 'distractor distinctness')).toBe(true)
  })

  it('rejects a banned phrase', () => {
    const target = committed[0]
    if (!target || target.kind.type !== 'single') throw new Error('expected a derived single question')
    const banned: Question = {
      ...target,
      kind: {
        ...target.kind,
        options: target.kind.options.map((option) =>
          option.id === 'b' ? { ...option, text: 'All of the above' } : option,
        ),
      },
    }
    const findings = errorsOn(target.id, withQuestion(banned))
    expect(findings.some((finding) => finding.rule === 'forbidden content')).toBe(true)
  })

  it('rejects a missing whyWrong', () => {
    const target = committed[0]
    if (!target || target.kind.type !== 'single') throw new Error('expected a derived single question')
    const stripped: Question = {
      ...target,
      kind: {
        ...target.kind,
        options: target.kind.options.map((option) => ({ id: option.id, text: option.text })),
      },
    }
    expect(errorsOn(target.id, withQuestion(stripped)).some((finding) => finding.rule === 'whyWrong coverage')).toBe(true)
  })

  it('flags a hand-planted near-duplicate pair', () => {
    const [first, second] = AUTHORED[CONCEPT_ID]
    if (!first || !second) throw new Error('expected two authored questions')
    const duplicate: Question = { ...second, prompt: first.prompt }
    const findings = screenQuestions({
      concepts: Object.values(CONCEPTS),
      questions: { [CONCEPT_ID]: [first, duplicate], percentiles: AUTHORED.percentiles },
      engine: TEMPLATE_ENGINE,
      templates: TEMPLATES,
    })
    expect(findings.some((finding) => finding.rule === 'near-duplicate detection')).toBe(true)
  })

  it('does not flag two instances of one template as near-duplicates', () => {
    const fromOneTemplate = committed.filter((question) => question.provenance.templateId === templates[0]?.id)
    expect(fromOneTemplate.length).toBeGreaterThan(1)
    const findings = screen(committed).filter((finding) => finding.rule === 'near-duplicate detection')
    expect(findings).toEqual([])
  })
})

describe('Tier 1’s derived bank (M7)', () => {
  const everyTemplate = CONCEPT_IDS.flatMap((id) => TEMPLATES[id])
  const regenerated = CONCEPT_IDS.map((id) => ({
    id,
    result: generateForConcept(TEMPLATES[id], TEMPLATE_ENGINE, generationOptionsFor(id)),
  }))

  it('has about fifteen templates, and every concept has at least three', () => {
    expect(everyTemplate.length).toBeGreaterThanOrEqual(14)
    expect(everyTemplate.length).toBeLessThanOrEqual(17)
    for (const id of CONCEPT_IDS) expect(TEMPLATES[id].length, id).toBeGreaterThanOrEqual(3)
  })

  it('freezes about 240 instances, none abandoned, each exactly as committed', () => {
    const total = regenerated.reduce((sum, each) => sum + each.result.questions.length, 0)
    expect(total).toBeGreaterThanOrEqual(225)
    expect(total).toBeLessThanOrEqual(260)
    for (const { id, result } of regenerated) {
      expect(result.abandoned, id).toBe(0)
      expect(serializeBank(result.questions), id).toBe(readFileSync(`src/content/questions/${id}/derived.json`, 'utf8'))
    }
  })

  it('screens clean: no errors anywhere in the bank', () => {
    const findings = screenQuestions({
      concepts: Object.values(CONCEPTS),
      questions: pools(committed),
      engine: TEMPLATE_ENGINE,
      templates: TEMPLATES,
    })
    expect(findings.filter((finding) => finding.severity === 'error')).toEqual([])
  })

  it('ships every template, and so every instance, for review', () => {
    for (const template of everyTemplate) expect(template.reviewStatus, template.id).toBe('needs-review')
    for (const { result } of regenerated) {
      for (const question of result.questions) expect(question.reviewStatus, question.id).toBe('needs-review')
    }
  })

  it('references every key number in every lesson from at least one question', () => {
    for (const concept of Object.values(CONCEPTS)) {
      const tags = new Set((pools(committed)[concept.id] ?? []).flatMap((question) => question.tags))
      for (const fact of concept.lesson.keyNumbers) expect([...tags], `${concept.id}: ${fact.tag}`).toContain(fact.tag)
    }
  })

  it('gives each concept its own batch', () => {
    const batches = regenerated.map(({ result }) => new Set(result.questions.map((question) => question.provenance.batchId)))
    for (const batch of batches) expect(batch.size).toBe(1)
    expect(new Set(batches.flatMap((batch) => [...batch])).size).toBe(CONCEPT_IDS.length)
  })
})

describe('the bank manifest (09-QUESTION-BANK §4.3)', () => {
  it('exists and holds every id in the bank', () => {
    expect(checkManifest(pools(committed), manifest)).toEqual([])
    for (const question of ALL) expect(Object.keys(manifest.issued), question.id).toContain(question.id)
  })

  it('is what the current content implies, so nothing has drifted', () => {
    expect(buildManifest(pools(committed))).toEqual(manifest)
  })

  it('fails hard when an id is reused for a different question', () => {
    const [first] = ALL
    if (!first) throw new Error('expected a bank')
    // The same id, issued to another concept: a save referencing it would resolve wrongly.
    const reused = { ...AUTHORED.percentiles[0], id: first.id } as Question
    const findings = checkManifest({ percentiles: [reused] }, manifest)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.detail).toContain('ids are never reused')
  })

  it('fails when a question has no manifest entry at all', () => {
    const [first] = ALL
    if (!first) throw new Error('expected a bank')
    const unissued: Question = { ...first, id: 'q-percentiles-a-9999' }
    const findings = checkManifest({ percentiles: [unissued] }, manifest)
    expect(findings[0]?.detail).toContain('not in bank-manifest.json')
  })
})
