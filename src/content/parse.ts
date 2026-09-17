import { z } from 'zod'
import {
  COMPONENT_KINDS,
  CONCEPT_IDS,
  type Block,
  type Check,
  type ComponentDef,
  type ComponentTier,
  type Concept,
  type Fact,
  type Lesson,
  type Misconception,
  type Option,
  type Provenance,
  type Question,
  type QuestionKind,
} from './schema'

// Zod schemas for every content file (03-CONTENT-SCHEMA §8's first rule). Each mirrors a
// type in `schema.ts` and carries a `z.ZodType<T>` annotation, so typecheck fails if the two
// drift — the same pattern `state/save.ts` uses for save files (ADR-0042).
//
// Nothing in the shipped bundle parses content: `npm run validate` does it in CI and in the
// definition of done, and `content/index.ts` repeats it in dev builds only. Parsing in the
// browser would pay for a guarantee CI already gives.

const nonEmpty = z.string().min(1)
const kind = z.enum(COMPONENT_KINDS)
const conceptId = z.enum(CONCEPT_IDS)
const cents = z.number().int().nonnegative()
const positive = z.number().positive()
const depth = z.union([z.literal(1), z.literal(2), z.literal(3)])

export const BlockSchema: z.ZodType<Block> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prose'), text: nonEmpty }),
  z.object({ kind: z.literal('formula'), formula: nonEmpty, explanation: nonEmpty }),
  z.object({ kind: z.literal('callout'), tone: z.enum(['note', 'warning']), text: nonEmpty }),
])

const FactSchema: z.ZodType<Fact> = z.object({
  label: nonEmpty,
  value: nonEmpty,
  note: nonEmpty,
  tag: nonEmpty,
})

const MisconceptionSchema: z.ZodType<Misconception> = z.object({
  claim: nonEmpty,
  correction: nonEmpty,
  tag: nonEmpty,
})

export const LessonSchema: z.ZodType<Lesson> = z.object({
  core: z.array(BlockSchema).min(1),
  deeper: z.array(BlockSchema).optional(),
  keyNumbers: z.array(FactSchema),
  misconceptions: z.array(MisconceptionSchema),
})

// §3 puts a check's draw count between 3 and 6.
export const CheckSchema: z.ZodType<Check> = z.object({ drawCount: z.number().int().min(3).max(6) })

const OptionSchema: z.ZodType<Option> = z.object({
  id: nonEmpty,
  text: nonEmpty,
  whyWrong: nonEmpty.optional(),
})

const QuestionKindSchema: z.ZodType<QuestionKind> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('single'), options: z.array(OptionSchema).min(2), correctId: nonEmpty }),
  z.object({
    type: z.literal('multi'),
    options: z.array(OptionSchema).min(2),
    correctIds: z.array(nonEmpty).min(1),
    partialCredit: z.boolean(),
  }),
  z.object({ type: z.literal('numeric'), answer: z.number(), tolerance: z.number().nonnegative(), unit: nonEmpty }),
])

const ProvenanceSchema: z.ZodType<Provenance> = z.object({
  origin: z.enum(['authored', 'derived', 'diagnose']),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'generatedAt must be an ISO date'),
  generator: nonEmpty,
  batchId: nonEmpty,
})

/** Question ids are permanent and shaped by 09-QUESTION-BANK §4.3. */
const QUESTION_ID = /^q-[a-z0-9-]+-(a|d-[a-z0-9-]+|g)-\d{4}$/

export const QuestionSchema: z.ZodType<Question> = z.object({
  id: z.string().regex(QUESTION_ID, 'question id must look like q-<conceptId>-a-0001'),
  conceptId,
  depth,
  prompt: nonEmpty,
  kind: QuestionKindSchema,
  explanation: nonEmpty,
  tags: z.array(nonEmpty).min(1),
  status: z.enum(['active', 'retired']),
  reviewStatus: z.enum(['needs-review', 'needs-expert-review', 'reviewed']),
  provenance: ProvenanceSchema,
})

export const ConceptSchema: z.ZodType<Concept> = z.object({
  id: conceptId,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  title: nonEmpty,
  oneLiner: nonEmpty,
  prerequisites: z.array(conceptId),
  unlocks: z.object({ components: z.array(kind) }),
  lesson: LessonSchema,
  check: CheckSchema,
  reviewStatus: z.enum(['needs-review', 'reviewed']),
  sources: z.array(nonEmpty).optional(),
})

const ComponentTierSchema: z.ZodType<ComponentTier> = z.object({
  label: nonEmpty,
  capacityRps: positive,
  serviceTimeMs: positive,
  setupCostCents: cents,
  runningCostPerTurnCents: cents,
  gatedBy: conceptId.optional(),
})

export const ComponentDefSchema: z.ZodType<ComponentDef> = z.object({
  kind,
  displayName: nonEmpty,
  gatedBy: conceptId.optional(),
  placeable: z.boolean(),
  tiers: z.array(ComponentTierSchema),
  validConnections: z.object({
    upstream: z.array(kind),
    downstream: z.array(kind),
    refusedDownstream: z.partialRecord(kind, nonEmpty),
  }),
  reviewStatus: z.enum(['needs-review', 'reviewed']),
})

/** One thing wrong with a content file, named so a human can go and fix it. */
export type ContentProblem = {
  /** The file a human should open, relative to the repo root. */
  readonly file: string
  readonly message: string
}

/** Parses one value, turning a Zod failure into a problem that names the file. */
export function parseContent<T>(schema: z.ZodType<T>, value: unknown, file: string): readonly ContentProblem[] {
  const parsed = schema.safeParse(value)
  return parsed.success ? [] : [{ file, message: z.prettifyError(parsed.error) }]
}
