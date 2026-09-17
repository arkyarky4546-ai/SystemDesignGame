import type {
  Concept,
  HopFigures,
  Params,
  PathFigures,
  PathSpec,
  Question,
  QuestionTemplate,
  TemplateEngine,
} from '../src/content/schema'
import { QuestionSchema, parseContent } from '../src/content/parse'
import {
  instancesNeeded,
  meanResponseTimeMs,
  nextFloat,
  p50LatencyMs,
  p99LatencyMs,
  rngForKey,
  simulateTick,
  utilization,
  type ComponentNode,
  type NodeMetrics,
  type Rng,
} from '../src/engine'

// Generating and screening the derived bank (09-QUESTION-BANK §2.1 and §7). Pure functions:
// the entry points in `generate-questions.ts` and `screen-questions.ts` do the file I/O.
//
// This module imports `src/` directly, so it only ever runs under Vite's SSR module runner or
// under Vitest, never under plain Node (ADR-0044).

/** The engine, as a template sees it. Every function is the one the game resolves turns with. */
export const TEMPLATE_ENGINE: TemplateEngine = {
  utilization,
  meanResponseTimeMs,
  p50LatencyMs,
  p99LatencyMs,
  instancesNeeded,
  resolvePath,
}

/**
 * A request path, resolved by `simulateTick` exactly as a week in the game would be. Each
 * hop gets a catalog tier of its own, so a template can give any figures it likes without
 * touching the game's component balance. A path the resolver refuses is a template bug, so
 * it throws rather than producing a question.
 */
export function resolvePath(path: PathSpec): PathFigures {
  const position = { col: 0, row: 0 }
  const apps: ComponentNode[] = path.appServers.map((hop, index) => ({
    id: `app-${index}`,
    kind: 'app-server',
    replicas: 1,
    tier: index,
    config: { fanoutFactor: hop.queriesPerRequest },
    position,
  }))
  const nodes: ComponentNode[] = [
    { id: 'ingress', kind: 'ingress', replicas: 1, tier: 0, config: {}, position },
    ...apps,
    { id: 'db', kind: 'database', replicas: 1, tier: 0, config: {}, position },
  ]
  const order = nodes.map((node) => node.id)
  const edges = order.slice(1).map((to, index) => ({ from: order[index] ?? '', to }))

  const tick = simulateTick({
    turn: 0,
    architecture: { nodes, edges },
    // The peak is the load, so the multiplier is 1. Every class shares the one path, so the
    // mix doesn't change any figure a template reads.
    workload: { meanRps: path.peakRps, peakMultiplier: 1, readFraction: 1, staticFraction: 0, keySkew: 0, payloadKb: 0 },
    catalog: { 'app-server': path.appServers, database: [path.database] },
  })
  if (!tick.ok) throw new Error(`a template's path doesn't resolve: ${JSON.stringify(tick.error)}`)

  const hop = (id: string): HopFigures => {
    const metrics: NodeMetrics | undefined = tick.value.perNode[id]
    if (!metrics) throw new Error(`the resolved path has no node "${id}"`)
    const { inboundRps, servedRps, droppedRps, utilization: u, meanMs, p50Ms, p99Ms } = metrics
    return { inboundRps, servedRps, droppedRps, utilization: u, meanMs, p50Ms, p99Ms }
  }
  const request = tick.value.perClass['dynamic-read']
  return {
    appServers: apps.map((app) => hop(app.id)),
    database: hop('db'),
    completedRps: path.peakRps * (1 - request.errorRate),
    errorRate: request.errorRate,
    p50Ms: request.p50Ms,
    p99Ms: request.p99Ms,
  }
}

/** Fixed, so regenerating the bank produces the same questions in the same order. */
const GENERATION_SEED = 0

/** Resamples before giving up on an instance, when constraints or distinctness keep rejecting. */
const MAX_ATTEMPTS = 200

/** §2.1: reject an instance where two options round to within this of each other. */
const DISTINCTNESS = 0.02

/** Options per question: the answer and up to three distractors. */
const MAX_DISTRACTORS = 3

/** Fewer than this many distractors and the question isn't worth asking. */
const MIN_DISTRACTORS = 2

export type GenerationOptions = {
  /** ISO date stamped onto every instance. */
  readonly generatedAt: string
  readonly generator: string
  readonly batchId: string
}

/**
 * The stamp every derived instance carries. It is a constant rather than today's date so that
 * regenerating an unchanged bank produces byte-identical output — a diff on `derived.json`
 * should mean a template changed, not that the clock moved.
 */
export const BANK_STAMP = { generatedAt: '2026-09-16', generator: 'claude-code/opus-5' } as const

/**
 * The date each concept's derived batch was generated, where it isn't `BANK_STAMP`'s. Each
 * concept is its own batch, so adding one concept's templates leaves every other batch's
 * provenance alone. Set a concept's date by hand when its batch is genuinely regenerated.
 */
const BATCH_DATES: Readonly<Record<string, string>> = {
  'client-server-basics': '2026-09-17',
  'latency-and-throughput': '2026-09-17',
  percentiles: '2026-09-17',
  'vertical-scaling': '2026-09-17',
}

/** The generation options for one concept's derived batch. */
export function generationOptionsFor(conceptId: string): GenerationOptions {
  const generatedAt = BATCH_DATES[conceptId] ?? BANK_STAMP.generatedAt
  return { generatedAt, generator: BANK_STAMP.generator, batchId: `d-${generatedAt}-${conceptId}` }
}

export type GenerationResult = {
  readonly questions: readonly Question[]
  /** Instances abandoned after MAX_ATTEMPTS, which means the template's ranges are too tight. */
  readonly abandoned: number
}

/** Instance ids read `q-<conceptId>-d-<template>-<nnnn>` (09-QUESTION-BANK §4.3). */
const templateSlug = (templateId: string) => templateId.replace(/^tpl-/, '')

export function generateForTemplate(
  template: QuestionTemplate,
  engine: TemplateEngine,
  options: GenerationOptions,
): GenerationResult {
  const questions: Question[] = []
  const seenParams = new Set<string>()
  let abandoned = 0

  for (let index = 0; index < template.instanceCount; index++) {
    let rng = rngForKey(GENERATION_SEED, template.id, index)
    let built: Question | null = null

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !built; attempt++) {
      const sampled = sampleParams(template, rng)
      rng = sampled.rng
      const params = sampled.params
      const key = JSON.stringify(params)
      if (seenParams.has(key)) continue
      if (template.constraints && !template.constraints(params)) continue

      const question = buildQuestion(template, params, engine, options, index)
      if (!question) continue
      seenParams.add(key)
      built = question
    }

    if (built) questions.push(built)
    else abandoned++
  }
  return { questions, abandoned }
}

/** Every template for one concept, in declaration order. */
export function generateForConcept(
  templates: readonly QuestionTemplate[],
  engine: TemplateEngine,
  options: GenerationOptions,
): GenerationResult {
  const results = templates.map((template) => generateForTemplate(template, engine, options))
  return {
    questions: results.flatMap((result) => result.questions),
    abandoned: results.reduce((total, result) => total + result.abandoned, 0),
  }
}

function sampleParams(template: QuestionTemplate, rng: Rng): { readonly params: Params; readonly rng: Rng } {
  const params: Record<string, number> = {}
  let current = rng
  for (const spec of template.params) {
    const draw = nextFloat(current)
    current = draw.rng
    if (spec.kind === 'choice') {
      const index = Math.min(spec.values.length - 1, Math.floor(draw.value * spec.values.length))
      params[spec.name] = spec.values[index] ?? 0
    } else {
      const steps = Math.floor((spec.max - spec.min) / spec.step) + 1
      const step = Math.min(steps - 1, Math.floor(draw.value * steps))
      params[spec.name] = spec.min + step * spec.step
    }
  }
  return { params, rng: current }
}

function buildQuestion(
  template: QuestionTemplate,
  params: Params,
  engine: TemplateEngine,
  options: GenerationOptions,
  index: number,
): Question | null {
  const generated = template.build(params, engine)
  if (!Number.isFinite(generated.answer)) return null

  const values = [generated.answer]
  const distractors: { readonly text: string; readonly whyWrong: string }[] = []
  for (const rule of template.distractors) {
    if (distractors.length === MAX_DISTRACTORS) break
    const value = rule.compute(params, generated.answer, engine)
    if (value === null || !Number.isFinite(value)) continue
    if (values.some((other) => tooClose(other, value))) continue
    // Two distractors that format to the same text teach nothing extra.
    const text = generated.format(value)
    if (text === generated.format(generated.answer) || distractors.some((other) => other.text === text)) continue
    values.push(value)
    distractors.push({ text, whyWrong: rule.whyWrong })
  }
  if (distractors.length < MIN_DISTRACTORS) return null

  const id = `q-${template.conceptId}-d-${templateSlug(template.id)}-${String(index + 1).padStart(4, '0')}`
  return {
    id,
    conceptId: template.conceptId,
    depth: template.depth,
    prompt: generated.prompt,
    kind: {
      type: 'single',
      // Authoring order: the answer first, then each distractor in rule order. Display
      // shuffles from (questionId, attemptNumber), so position carries no information (§6).
      options: [
        { id: 'a', text: generated.format(generated.answer) },
        ...distractors.map((distractor, position) => ({
          id: String.fromCharCode('b'.charCodeAt(0) + position),
          text: distractor.text,
          whyWrong: distractor.whyWrong,
        })),
      ],
      correctId: 'a',
    },
    explanation: generated.explanation,
    tags: generated.tags,
    // Stamped from the template: approving a template approves every instance it produced,
    // and retiring one retires them without ever reusing an id (09-QUESTION-BANK §8).
    status: template.status,
    reviewStatus: template.reviewStatus,
    provenance: {
      origin: 'derived',
      generatedAt: options.generatedAt,
      generator: options.generator,
      batchId: options.batchId,
      templateId: template.id,
      params,
    },
  }
}

/** §2.1: two options within 2% of each other test arithmetic precision, not understanding. */
export function tooClose(a: number, b: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b))
  return scale === 0 ? a === b : Math.abs(a - b) / scale < DISTINCTNESS
}

/** Stable JSON for a committed bank: two-space indent, sorted nothing, trailing newline. */
export function serializeBank(questions: readonly Question[]): string {
  return `${JSON.stringify(questions, null, 2)}\n`
}

// ---------------------------------------------------------------------------
// Screening (09-QUESTION-BANK §7)
// ---------------------------------------------------------------------------

export type Finding = {
  /** An error stops the batch. A warning is for a human to look at. */
  readonly severity: 'error' | 'warning'
  /** The §7 row this came from. */
  readonly rule: string
  readonly questionId: string
  readonly detail: string
}

export type ScreenInput = {
  readonly concepts: readonly Concept[]
  readonly questions: Readonly<Record<string, readonly Question[]>>
  readonly engine: TemplateEngine
  readonly templates: Readonly<Record<string, readonly QuestionTemplate[]>>
}

/** Words that are test-taking crutches or trivia rather than systems knowledge (§7). */
const BANNED = ['all of the above', 'none of the above', 'both a and b', 'all of these']

/** A bare port number is the trivia §7 names explicitly. */
const PORT_NUMBER = /\bport\s+\d{2,5}\b/i

const LENGTH = {
  prompt: { min: 15, max: 60 },
  option: { max: 20 },
  explanation: { min: 25, max: 80 },
} as const

export function screenQuestions(input: ScreenInput): readonly Finding[] {
  const findings: Finding[] = []
  const add = (severity: Finding['severity'], rule: string, questionId: string, detail: string) =>
    findings.push({ severity, rule, questionId, detail })

  for (const concept of input.concepts) {
    const pool = input.questions[concept.id] ?? []
    const templates = input.templates[concept.id] ?? []

    for (const question of pool) {
      for (const problem of parseContent(QuestionSchema, question, question.id)) {
        add('error', 'schema', question.id, problem.message)
      }
      verifyDerived(question, templates, input.engine, add)
      checkDistinctness(question, add)
      checkWhyWrong(question, add)
      checkLengths(question, add)
      checkForbidden(question, add)
      checkExplanationIndependence(question, add)
    }

    checkNearDuplicates(pool, add)
    checkDepthSpread(concept, pool, add)
    checkTagCoverage(concept, pool, add)
    checkAnswerLeakage(concept, pool, add)
  }
  return findings
}

type Add = (severity: Finding['severity'], rule: string, questionId: string, detail: string) => void

/**
 * §7's hard row: recompute a derived answer through the engine from the parameters the
 * instance was sampled with, and assert it is still the option marked correct. A template
 * change that silently moves an answer fails here rather than reaching a learner.
 */
function verifyDerived(question: Question, templates: readonly QuestionTemplate[], engine: TemplateEngine, add: Add) {
  if (question.provenance.origin !== 'derived') return
  const { templateId, params } = question.provenance
  if (!templateId || !params) {
    add('error', 'numeric self-verification', question.id, 'a derived question must record its template and parameters')
    return
  }
  const template = templates.find((each) => each.id === templateId)
  if (!template) {
    add('error', 'numeric self-verification', question.id, `template "${templateId}" no longer exists`)
    return
  }
  const rebuilt = template.build(params, engine)
  const correct = question.kind.type === 'single' ? question.kind.correctId : null
  const option = question.kind.type === 'single' ? question.kind.options.find((each) => each.id === correct) : undefined
  const expected = rebuilt.format(rebuilt.answer)
  if (!option || option.text !== expected) {
    add(
      'error',
      'numeric self-verification',
      question.id,
      `the engine gives ${expected}, the bank says ${option?.text ?? 'nothing'}`,
    )
  }
  if (rebuilt.prompt !== question.prompt) {
    add('error', 'numeric self-verification', question.id, 'the template no longer produces this prompt')
  }
}

/**
 * §7: no two options within 2% (numeric) or a Jaccard of 0.8 (text).
 *
 * The numeric half applies only when an option is a number with a unit and nothing else —
 * a prose option that happens to say "p99" is not a numeric option, and comparing the digits
 * inside prose flags opposites as duplicates. The text half compares three-word shingles
 * rather than word sets, so "A ÷ B" and "B ÷ A" read as different, which they are, and which
 * is what makes them a good pair.
 */
function checkDistinctness(question: Question, add: Add) {
  if (question.kind.type === 'numeric') return
  const options = question.kind.options
  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const a = options[i]
      const b = options[j]
      if (!a || !b) continue
      const left = numericOption(a.text)
      const right = numericOption(b.text)
      if (left !== null && right !== null) {
        if (tooClose(left, right)) {
          add('error', 'distractor distinctness', question.id, `options "${a.text}" and "${b.text}" are within 2%`)
        }
      } else if (jaccard(shingles(a.text), shingles(b.text)) > 0.8) {
        add('error', 'distractor distinctness', question.id, `options "${a.text}" and "${b.text}" say nearly the same thing`)
      }
    }
  }
}

function checkWhyWrong(question: Question, add: Add) {
  if (question.kind.type === 'numeric') return
  const kind = question.kind
  const correct = kind.type === 'single' ? [kind.correctId] : kind.correctIds
  const correctText = kind.options
    .filter((option) => correct.includes(option.id))
    .map((option) => option.text)
    .join(' ')
  for (const option of kind.options) {
    if (correct.includes(option.id)) continue
    if (!option.whyWrong) {
      add('error', 'whyWrong coverage', question.id, `option "${option.id}" has no whyWrong`)
      continue
    }
    if (jaccard(words(option.whyWrong), words(correctText)) > 0.6) {
      add('warning', 'whyWrong coverage', question.id, `option "${option.id}" restates the correct answer instead of naming a mistake`)
    }
  }
}

function checkLengths(question: Question, add: Add) {
  const promptWords = words(question.prompt).length
  if (promptWords < LENGTH.prompt.min || promptWords > LENGTH.prompt.max) {
    add('warning', 'length bounds', question.id, `prompt is ${promptWords} words, outside ${LENGTH.prompt.min}–${LENGTH.prompt.max}`)
  }
  const explanationWords = words(question.explanation).length
  if (explanationWords < LENGTH.explanation.min || explanationWords > LENGTH.explanation.max) {
    add(
      'warning',
      'length bounds',
      question.id,
      `explanation is ${explanationWords} words, outside ${LENGTH.explanation.min}–${LENGTH.explanation.max}`,
    )
  }
  if (question.kind.type === 'numeric') return
  for (const option of question.kind.options) {
    const count = words(option.text).length
    if (count > LENGTH.option.max) {
      add('warning', 'length bounds', question.id, `option "${option.id}" is ${count} words, over ${LENGTH.option.max}`)
    }
  }
}

function checkForbidden(question: Question, add: Add) {
  const texts = [question.prompt, question.explanation, ...(question.kind.type === 'numeric' ? [] : question.kind.options.map((option) => option.text))]
  for (const text of texts) {
    const lower = text.toLowerCase()
    for (const phrase of BANNED) {
      if (lower.includes(phrase)) add('error', 'forbidden content', question.id, `contains "${phrase}"`)
    }
    if (PORT_NUMBER.test(text)) add('error', 'forbidden content', question.id, 'names a port number, which is trivia')
  }
}

/** §7: an explanation that restates the prompt teaches nothing after the answer. */
function checkExplanationIndependence(question: Question, add: Add) {
  if (jaccard(words(question.prompt), words(question.explanation)) > 0.6) {
    add('warning', 'explanation independence', question.id, 'the explanation is mostly the prompt restated')
  }
}

/**
 * §7: normalize → 3-gram shingle → Jaccard across the concept, flag pairs over 0.7.
 *
 * Two instances of one template are meant to share their wording — that is what a template
 * is — so the rule skips those pairs. What it is looking for is two questions that arrived
 * by different routes and ask the same thing, which is the duplicate a reviewer's time gets
 * wasted on. The generator separately refuses to freeze two instances with identical
 * parameters.
 */
function checkNearDuplicates(pool: readonly Question[], add: Add) {
  const shingled = pool.map((question) => ({ question, shingles: shingles(question.prompt) }))
  for (let i = 0; i < shingled.length; i++) {
    for (let j = i + 1; j < shingled.length; j++) {
      const a = shingled[i]
      const b = shingled[j]
      if (!a || !b) continue
      const sameTemplate =
        a.question.provenance.templateId !== undefined && a.question.provenance.templateId === b.question.provenance.templateId
      if (sameTemplate) continue
      const overlap = jaccard(a.shingles, b.shingles)
      if (overlap > 0.7) {
        add('warning', 'near-duplicate detection', a.question.id, `reads like ${b.question.id} (${overlap.toFixed(2)} overlap)`)
      }
    }
  }
}

function checkDepthSpread(concept: Concept, pool: readonly Question[], add: Add) {
  for (const depth of [1, 2, 3] as const) {
    const count = pool.filter((question) => question.depth === depth && question.status === 'active').length
    if (count < 2) add('warning', 'depth distribution', concept.id, `only ${count} active question(s) at depth ${depth}`)
  }
}

function checkTagCoverage(concept: Concept, pool: readonly Question[], add: Add) {
  const tags = new Set(pool.flatMap((question) => question.tags))
  for (const fact of concept.lesson.keyNumbers) {
    if (!tags.has(fact.tag)) add('warning', 'tag coverage', concept.id, `no question carries the tag "${fact.tag}" (${fact.label})`)
  }
  for (const item of concept.lesson.misconceptions) {
    if (!tags.has(item.tag)) add('warning', 'tag coverage', concept.id, `no question carries the tag "${item.tag}"`)
  }
}

/**
 * §7: flag if more than 45% of a concept's correct answers are the longest option. Options
 * that are bare numbers are excluded: "184 ms" is longer than "40 ms" because the number is
 * bigger, which says nothing about the question giving itself away.
 */
function checkAnswerLeakage(concept: Concept, pool: readonly Question[], add: Add) {
  const choice = pool.filter(
    (question) => question.kind.type !== 'numeric' && !question.kind.options.every((option) => numericOption(option.text) !== null),
  )
  if (choice.length === 0) return
  const longest = choice.filter((question) => {
    const kind = question.kind
    if (kind.type === 'numeric') return false
    const correct = kind.type === 'single' ? [kind.correctId] : kind.correctIds
    const biggest = [...kind.options].sort((a, b) => b.text.length - a.text.length)[0]
    return biggest !== undefined && correct.includes(biggest.id)
  }).length
  const share = longest / choice.length
  if (share > 0.45) {
    add('warning', 'answer leakage', concept.id, `${Math.round(share * 100)}% of correct answers are the longest option`)
  }
}

// ---------------------------------------------------------------------------
// The bank manifest (09-QUESTION-BANK §4.3): every id ever issued.
// ---------------------------------------------------------------------------

export type ManifestEntry = { readonly concept: string; readonly origin: string; readonly template?: string }
export type BankManifest = { readonly issued: Readonly<Record<string, ManifestEntry>> }

/** The manifest the current content implies, with ids in sorted order so the file is stable. */
export function buildManifest(questions: Readonly<Record<string, readonly Question[]>>, previous?: BankManifest): BankManifest {
  const issued: Record<string, ManifestEntry> = { ...previous?.issued }
  for (const pool of Object.values(questions)) {
    for (const question of pool) {
      issued[question.id] = {
        concept: question.conceptId,
        origin: question.provenance.origin,
        ...(question.provenance.templateId ? { template: question.provenance.templateId } : {}),
      }
    }
  }
  return { issued: Object.fromEntries(Object.keys(issued).sort().map((id) => [id, issued[id] as ManifestEntry])) }
}

export function serializeManifest(manifest: BankManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * §4.3: an id is permanent and is never reused. A question whose id is in the manifest under
 * a different concept, origin or template has taken an id that already belongs to something
 * else, and a save that references it would resolve to the wrong question.
 */
export function checkManifest(questions: Readonly<Record<string, readonly Question[]>>, manifest: BankManifest): readonly Finding[] {
  const findings: Finding[] = []
  for (const pool of Object.values(questions)) {
    for (const question of pool) {
      const entry = manifest.issued[question.id]
      if (!entry) {
        findings.push({
          severity: 'error',
          rule: 'bank manifest',
          questionId: question.id,
          detail: 'is not in bank-manifest.json; run npm run generate to issue it',
        })
        continue
      }
      const template = question.provenance.templateId
      if (entry.concept !== question.conceptId || entry.origin !== question.provenance.origin || entry.template !== template) {
        findings.push({
          severity: 'error',
          rule: 'bank manifest',
          questionId: question.id,
          detail: `id already issued to ${entry.origin} ${entry.concept}${entry.template ? ` (${entry.template})` : ''}; ids are never reused`,
        })
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const words = (text: string): readonly string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%.\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Overlapping three-word shingles of a normalized string, for near-duplicate detection. */
function shingles(text: string): readonly string[] {
  const parts = words(text)
  if (parts.length < 3) return parts
  return parts.slice(0, -2).map((_, index) => parts.slice(index, index + 3).join(' '))
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a)
  const right = new Set(b)
  if (left.size === 0 && right.size === 0) return 1
  let shared = 0
  for (const item of left) if (right.has(item)) shared++
  return shared / (left.size + right.size - shared)
}

/**
 * The value of an option that is a number and nothing else, with an optional unit: "11",
 * "85%", "184 ms", "6.6×". Null for prose, so digits inside a sentence are never compared as
 * quantities.
 */
function numericOption(text: string): number | null {
  const match = /^(-?\d[\d,]*(?:\.\d+)?)\s*(%|ms|s|\/s|×|x)?$/.exec(text.trim())
  return match?.[1] ? Number(match[1].replace(/,/g, '')) : null
}
