import type { Concept, Question, QuestionTemplate } from '../src/content/schema'
import { nextFloat, rngForKey } from '../src/engine'

// What `npm run review` serves, and what each action does to a source file
// (09-QUESTION-BANK §8, §10). Pure functions over content and file text, so the whole
// workflow is testable without a terminal.
//
// The review burden §8 budgets for Tier 1 is ~15 templates, ~24 spot-checks, 66 authored and
// 6 diagnose — about 111 items. The queue is built in that order, because approving a
// template is what makes its instances cheap.

/** Share of a template's instances served as a spot check (§8: a 10% random sample). */
export const SPOT_CHECK_SHARE = 0.1

/** Fixed, so the same sample comes back if the review is interrupted and restarted. */
const SPOT_CHECK_SEED = 0

export type ReviewItem =
  | {
      readonly kind: 'template'
      readonly id: string
      readonly conceptId: string
      readonly template: QuestionTemplate
      /** One instance it produced, so the reviewer reads the rules against a real question. */
      readonly sample: Question | undefined
    }
  | {
      readonly kind: 'instance'
      readonly id: string
      readonly conceptId: string
      readonly question: Question
      readonly template: QuestionTemplate
    }
  | { readonly kind: 'authored'; readonly id: string; readonly conceptId: string; readonly question: Question }

export type ReviewAction =
  | { readonly kind: 'approve' }
  | { readonly kind: 'reject'; readonly reason: string }
  | { readonly kind: 'flag' }

export type QueueInput = {
  readonly concepts: readonly Concept[]
  readonly templates: Readonly<Record<string, readonly QuestionTemplate[]>>
  readonly authored: Readonly<Record<string, readonly Question[]>>
  readonly derived: Readonly<Record<string, readonly Question[]>>
  /** Serve only the instance spot checks, for a second pass over a template's sample. */
  readonly spotCheckOnly?: boolean
  /** Include items a human has already cleared. Off by default: the queue is what's left. */
  readonly includeReviewed?: boolean
}

const needsAttention = (status: string) => status !== 'reviewed'

/**
 * The queue, in §8's order: every template first, then a seeded sample of each template's
 * instances, then every authored question. A concept's items stay together, so the lesson in
 * front of the reviewer stops changing every item.
 */
export function buildQueue(input: QueueInput): readonly ReviewItem[] {
  const items: ReviewItem[] = []
  const keep = (status: string) => input.includeReviewed === true || needsAttention(status)

  for (const concept of input.concepts) {
    const templates = input.templates[concept.id] ?? []
    const derived = input.derived[concept.id] ?? []
    if (!input.spotCheckOnly) {
      for (const template of templates) {
        if (!keep(template.reviewStatus)) continue
        const sample = derived.find((question) => question.provenance.templateId === template.id)
        items.push({ kind: 'template', id: template.id, conceptId: concept.id, template, sample })
      }
    }

    for (const template of templates) {
      const instances = derived.filter((question) => question.provenance.templateId === template.id)
      for (const question of spotCheck(template.id, instances)) {
        if (keep(question.reviewStatus)) items.push({ kind: 'instance', id: question.id, conceptId: concept.id, question, template })
      }
    }

    if (!input.spotCheckOnly) {
      for (const question of input.authored[concept.id] ?? []) {
        if (keep(question.reviewStatus)) items.push({ kind: 'authored', id: question.id, conceptId: concept.id, question })
      }
    }
  }
  return items
}

/**
 * A seeded sample of one template's instances, about `SPOT_CHECK_SHARE` of them and never
 * fewer than one. The same template always yields the same sample, so an interrupted review
 * resumes where it was rather than reshuffling.
 */
export function spotCheck(templateId: string, instances: readonly Question[]): readonly Question[] {
  if (instances.length === 0) return []
  const wanted = Math.max(1, Math.ceil(instances.length * SPOT_CHECK_SHARE))
  const remaining = [...instances]
  const picked: Question[] = []
  let rng = rngForKey(SPOT_CHECK_SEED, templateId, 0)
  while (picked.length < wanted && remaining.length > 0) {
    const draw = nextFloat(rng)
    rng = draw.rng
    const index = Math.min(remaining.length - 1, Math.floor(draw.value * remaining.length))
    const chosen = remaining[index]
    if (chosen) picked.push(chosen)
    remaining.splice(index, 1)
  }
  // Back into bank order, so a reviewer reads them the way they are written down.
  return instances.filter((question) => picked.includes(question))
}

// ---------------------------------------------------------------------------
// Writing the decision back to source
// ---------------------------------------------------------------------------

export type SourceChange = { readonly reviewStatus?: string; readonly status?: string }

/** What an action does to the item's source fields (§8). */
export function changeFor(action: ReviewAction): SourceChange {
  switch (action.kind) {
    case 'approve':
      return { reviewStatus: 'reviewed' }
    case 'flag':
      // Stays in the queue: an expert still has to look at it.
      return { reviewStatus: 'needs-expert-review' }
    case 'reject':
      // Never deleted. A save can reference a retired id, and it still has to resolve (§4.3).
      return { status: 'retired', reviewStatus: 'reviewed' }
  }
}

/**
 * Sets one field on the object whose `id` is `id`, in a TypeScript source file. The field has
 * to appear after that id and before the next question or template starts, so an edit can't
 * land on a neighbouring item.
 *
 * The boundary looks for the next id containing a hyphen, because that is what a question or
 * template id looks like and an option id ('a', 'b') never does. The lookbehind keeps
 * `conceptId:` from counting as an `id:`.
 */
const ITEM_ID = /(?<![A-Za-z])id: '[^']*-[^']*'/g

export function setFieldAfterId(contents: string, id: string, field: string, value: string): string {
  const found = findField(contents, id, field)
  if (!found) throw new Error(`'${id}' has no ${field} field to set`)
  return contents.slice(0, found.start) + `${found.prefix}'${value}'` + contents.slice(found.start + found.length)
}

/** The value a quoted field currently holds on the object with this id, or null if it has none. */
export function fieldAfterId(contents: string, id: string, field: string): string | null {
  return findField(contents, id, field)?.value ?? null
}

type FoundField = { readonly start: number; readonly length: number; readonly prefix: string; readonly value: string }

function findField(contents: string, id: string, field: string): FoundField | null {
  // Ids are kebab-case by schema, so nothing in one needs escaping here.
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error(`'${id}' is not a shape this can anchor on`)
  const anchor = new RegExp(`(?<![A-Za-z])id: '${id}'`).exec(contents)?.index ?? -1
  if (anchor === -1) throw new Error(`no object with id '${id}' in this file`)
  ITEM_ID.lastIndex = anchor + 1
  const limit = ITEM_ID.exec(contents)?.index ?? contents.length

  const pattern = new RegExp(`(\\n\\s*${field}:\\s*)'([^']*)'`)
  const match = pattern.exec(contents.slice(anchor, limit))
  if (!match) return null
  return { start: anchor + match.index, length: match[0].length, prefix: match[1] ?? '', value: match[2] ?? '' }
}

/** Applies every field an action changes, in one pass over the file's text. */
export function applyToSource(contents: string, id: string, action: ReviewAction): string {
  const change = changeFor(action)
  let updated = contents
  if (change.status !== undefined) updated = setFieldAfterId(updated, id, 'status', change.status)
  if (change.reviewStatus !== undefined) updated = setFieldAfterId(updated, id, 'reviewStatus', change.reviewStatus)
  return updated
}

// ---------------------------------------------------------------------------
// The review log (09-QUESTION-BANK §8, §10)
// ---------------------------------------------------------------------------

export type LogEntry = {
  readonly at: string
  readonly reviewer: string
  readonly item: ReviewItem['kind']
  readonly id: string
  readonly conceptId: string
  readonly action: ReviewAction['kind']
  /** Rejections record why. Reasons are the input to improving the generation prompts (§8). */
  readonly reason?: string
}

export function logLine(entry: LogEntry): string {
  return `${JSON.stringify(entry)}\n`
}

export function entryFor(item: ReviewItem, action: ReviewAction, reviewer: string, at: string): LogEntry {
  return {
    at,
    reviewer,
    item: item.kind,
    id: item.id,
    conceptId: item.conceptId,
    action: action.kind,
    ...(action.kind === 'reject' ? { reason: action.reason } : {}),
  }
}

/** The file an item's decision is written to. Derived instances are decided on their template. */
export function sourceFileFor(item: ReviewItem): string {
  switch (item.kind) {
    case 'template':
    case 'instance':
      return `src/content/questions/${item.conceptId}/templates.ts`
    case 'authored':
      return `src/content/questions/${item.conceptId}/authored.ts`
  }
}

/**
 * The id whose fields an action edits. A spot-checked instance is a sample of its template,
 * so a decision on it is a decision on the template: §8 says a failing sample rejects the
 * whole batch rather than one question, and `derived.json` is generated, never hand-edited.
 */
export function targetIdFor(item: ReviewItem): string {
  return item.kind === 'instance' ? item.template.id : item.id
}
