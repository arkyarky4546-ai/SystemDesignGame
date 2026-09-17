import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONCEPTS } from '../src/content/concepts'
import { AUTHORED } from '../src/content/questions/authored'
import { TEMPLATES } from '../src/content/questions/templates'
import type { Question, QuestionTemplate } from '../src/content/schema'
import { TEMPLATE_ENGINE, generateForConcept, generationOptionsFor } from './bank'
import {
  SPOT_CHECK_SHARE,
  applyToSource,
  buildQueue,
  changeFor,
  entryFor,
  fieldAfterId,
  logLine,
  setFieldAfterId,
  sourceFileFor,
  spotCheck,
  targetIdFor,
  type QueueInput,
} from './review-queue'

// M5b's acceptance criteria. The review tool is the only thing standing between generated
// content and a human learning from it, so its rules are asserted rather than eyeballed.

const CONCEPT_ID = 'capacity-and-utilization'
const TEMPLATES_FILE = `src/content/questions/${CONCEPT_ID}/templates.ts`
const AUTHORED_FILE = `src/content/questions/${CONCEPT_ID}/authored.ts`

const derived = JSON.parse(readFileSync(`src/content/questions/${CONCEPT_ID}/derived.json`, 'utf8')) as Question[]
const templates = TEMPLATES[CONCEPT_ID]

const queueInput = (over: Partial<QueueInput> = {}): QueueInput => ({
  concepts: Object.values(CONCEPTS),
  templates: TEMPLATES,
  authored: AUTHORED,
  derived: { [CONCEPT_ID]: derived, percentiles: [] },
  ...over,
})

describe('the review queue (09-QUESTION-BANK §8)', () => {
  it('serves templates first, then their spot checks, then authored questions', () => {
    const kinds = buildQueue(queueInput()).map((item) => item.kind)
    const first = kinds.indexOf('template')
    const sample = kinds.indexOf('instance')
    const authored = kinds.indexOf('authored')
    expect(first).toBeLessThan(sample)
    expect(sample).toBeLessThan(authored)
  })

  it('covers every template and every authored question exactly once', () => {
    const queue = buildQueue(queueInput())
    const templateIds = queue.filter((item) => item.kind === 'template').map((item) => item.id)
    expect(templateIds).toEqual(templates.map((template) => template.id))

    const authoredIds = queue.filter((item) => item.kind === 'authored').map((item) => item.id)
    const expected = Object.values(AUTHORED)
      .flat()
      .map((question) => question.id)
    expect(authoredIds.sort()).toEqual(expected.sort())
  })

  it('serves about a tenth of each template’s instances as a spot check', () => {
    const queue = buildQueue(queueInput())
    for (const template of templates) {
      const instances = derived.filter((question) => question.provenance.templateId === template.id)
      const served = queue.filter((item) => item.kind === 'instance' && item.template.id === template.id)
      expect(served.length, template.id).toBe(Math.max(1, Math.ceil(instances.length * SPOT_CHECK_SHARE)))
      for (const item of served) {
        expect(instances.map((question) => question.id), template.id).toContain(item.id)
      }
    }
  })

  it('serves the same sample every time, so an interrupted review resumes', () => {
    const instances = derived.filter((question) => question.provenance.templateId === templates[0]?.id)
    expect(spotCheck('tpl-a', instances).map((question) => question.id)).toEqual(
      spotCheck('tpl-a', instances).map((question) => question.id),
    )
    // A different template samples differently.
    expect(spotCheck('tpl-a', instances).map((question) => question.id)).not.toEqual(
      spotCheck('tpl-z', instances).map((question) => question.id),
    )
  })

  it('serves only the spot checks in spot-check mode', () => {
    const kinds = new Set(buildQueue(queueInput({ spotCheckOnly: true })).map((item) => item.kind))
    expect([...kinds]).toEqual(['instance'])
  })

  it('leaves out what a human has already cleared, unless asked for everything', () => {
    const reviewed = AUTHORED[CONCEPT_ID].map((question): Question => ({ ...question, reviewStatus: 'reviewed' }))
    const input = queueInput({ authored: { ...AUTHORED, [CONCEPT_ID]: reviewed } })
    expect(buildQueue(input).some((item) => item.kind === 'authored' && item.conceptId === CONCEPT_ID)).toBe(false)
    expect(buildQueue({ ...input, includeReviewed: true }).some((item) => item.kind === 'authored')).toBe(true)
  })

  it('decides a spot-checked instance on its template, because derived.json is generated', () => {
    const item = buildQueue(queueInput()).find((each) => each.kind === 'instance')
    if (!item || item.kind !== 'instance') throw new Error('expected a spot check')
    expect(targetIdFor(item)).toBe(item.template.id)
    expect(sourceFileFor(item)).toBe(TEMPLATES_FILE)
  })

  it('sends an authored decision to the authored file', () => {
    const item = buildQueue(queueInput()).find((each) => each.kind === 'authored')
    if (!item) throw new Error('expected an authored question')
    expect(targetIdFor(item)).toBe(item.id)
    expect(sourceFileFor(item)).toBe(`src/content/questions/${item.conceptId}/authored.ts`)
  })
})

describe('what each action does (§8)', () => {
  it('approves to reviewed, flags to needs-expert-review, and rejects to retired', () => {
    expect(changeFor({ kind: 'approve' })).toEqual({ reviewStatus: 'reviewed' })
    expect(changeFor({ kind: 'flag' })).toEqual({ reviewStatus: 'needs-expert-review' })
    expect(changeFor({ kind: 'reject', reason: 'wrong' })).toEqual({ status: 'retired', reviewStatus: 'reviewed' })
  })

  it('retires rather than deletes, so a save referencing the id still resolves', () => {
    const source = readFileSync(AUTHORED_FILE, 'utf8')
    const id = AUTHORED[CONCEPT_ID][0]?.id
    if (!id) throw new Error('expected an authored question')
    const updated = applyToSource(source, id, { kind: 'reject', reason: 'the arithmetic is wrong' })
    expect(updated).toContain(id)
    expect(fieldAfterId(updated, id, 'status')).toBe('retired')
  })

  it('writes the decision onto the right object and leaves its neighbours alone', () => {
    const source = readFileSync(AUTHORED_FILE, 'utf8')
    const pool = AUTHORED[CONCEPT_ID]
    const target = pool[1]
    const neighbour = pool[2]
    if (!target || !neighbour) throw new Error('expected several authored questions')

    const updated = applyToSource(source, target.id, { kind: 'approve' })
    expect(fieldAfterId(updated, target.id, 'reviewStatus')).toBe('reviewed')
    expect(fieldAfterId(updated, neighbour.id, 'reviewStatus')).toBe('needs-review')
    expect(fieldAfterId(updated, pool[0]?.id ?? '', 'reviewStatus')).toBe('needs-review')
  })

  it('refuses to write against an id that is not in the file', () => {
    expect(() => setFieldAfterId('const x = 1', 'q-nope-a-0001', 'status', 'retired')).toThrow(/no object with id/)
  })

  it('marks every instance of a template reviewed in one action', () => {
    const source = readFileSync(TEMPLATES_FILE, 'utf8')
    const template = templates[0]
    if (!template) throw new Error('expected a template')
    expect(fieldAfterId(source, template.id, 'reviewStatus')).toBe('needs-review')

    const updated = applyToSource(source, template.id, { kind: 'approve' })
    expect(fieldAfterId(updated, template.id, 'reviewStatus')).toBe('reviewed')

    // The bank is regenerated from the template, so every instance carries the new stamp.
    const approved: QuestionTemplate = { ...template, reviewStatus: 'reviewed' }
    const regenerated = generateForConcept([approved], TEMPLATE_ENGINE, generationOptionsFor(CONCEPT_ID))
    expect(regenerated.questions).toHaveLength(template.instanceCount)
    for (const question of regenerated.questions) expect(question.reviewStatus, question.id).toBe('reviewed')
  })

  it('retires every instance of a retired template without losing an id', () => {
    const template = templates[0]
    if (!template) throw new Error('expected a template')
    const retired: QuestionTemplate = { ...template, status: 'retired' }
    const regenerated = generateForConcept([retired], TEMPLATE_ENGINE, generationOptionsFor(CONCEPT_ID))
    expect(regenerated.questions).toHaveLength(template.instanceCount)
    for (const question of regenerated.questions) expect(question.status, question.id).toBe('retired')
  })
})

describe('the review log (§8, §10)', () => {
  it('records the reviewer, the item, the action and — for a rejection — the reason', () => {
    const item = buildQueue(queueInput())[0]
    if (!item) throw new Error('expected a queue')
    const entry = entryFor(item, { kind: 'reject', reason: 'distractor is not plausible' }, 'noah', '2026-09-16T12:00:00.000Z')
    expect(entry).toEqual({
      at: '2026-09-16T12:00:00.000Z',
      reviewer: 'noah',
      item: item.kind,
      id: item.id,
      conceptId: item.conceptId,
      action: 'reject',
      reason: 'distractor is not plausible',
    })
    expect(logLine(entry).endsWith('\n')).toBe(true)
    expect(JSON.parse(logLine(entry))).toEqual(entry)
  })

  it('records no reason for an approval', () => {
    const item = buildQueue(queueInput())[0]
    if (!item) throw new Error('expected a queue')
    expect(entryFor(item, { kind: 'approve' }, 'noah', '2026-09-16T12:00:00.000Z').reason).toBeUndefined()
  })
})

describe('the review tool never ships (M5b acceptance)', () => {
  it('is not reachable from the app: nothing under src/ imports tools/', () => {
    const offenders = sourceFiles('src').filter((file) => /from\s+'[^']*tools\//.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('is absent from the built bundle', () => {
    const assets = 'dist/assets'
    if (!existsSync(assets)) {
      // `npm run build` is part of the definition of done, so this runs for real there.
      expect(existsSync('tools/review.ts')).toBe(true)
      return
    }
    const marker = 'reason for rejecting'
    expect(readFileSync('tools/review.ts', 'utf8')).toContain(marker)
    for (const file of readdirSync(assets).filter((name) => name.endsWith('.js'))) {
      expect(readFileSync(`${assets}/${file}`, 'utf8'), file).not.toContain(marker)
    }
  })
})

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}
