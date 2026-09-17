import { z } from 'zod'
import { BALANCE } from '../config/balance'
import { DIFFICULTIES, type Difficulty } from '../config/difficulty'
import {
  EMPTY_ARCHIVE,
  actForUsers,
  layoutByFlow,
  usersForMeanRps,
  type Architecture,
  type ComponentNode,
  type Edge,
  type HistoryArchive,
  type Result,
  type RunState,
  type SimEvent,
  type CheckAttempt,
  type Knowledge,
  type NodeOutage,
  type TurnSummary,
  type Workload,
} from '../engine'

// `Knowledge` and `CheckAttempt` live in the engine, which reads them to award the
// first-pass bonus (ADR-0040). Re-exported here so save's callers keep one import.
export type { CheckAttempt, Knowledge }

// Save files: serialize, validate, migrate, quarantine, export (01-ARCHITECTURE §7, ADR-0025).

/**
 * Bumped when content changes in a way that breaks saved concept or question ids. M4b
 * issued the first of both, and has broken neither (ADR-0041).
 */
export const CONTENT_VERSION = 0

const SAVE_KEY_PREFIX = 'nines.save.v'
export const CORRUPT_KEY_PREFIX = 'nines.save.corrupt.'

/** The localStorage key a given save version lives under. */
export function saveKey(version: number): string {
  return `${SAVE_KEY_PREFIX}${version}`
}

export type Settings = {
  readonly difficulty: Difficulty
  /** Forces reduced motion even when the OS doesn't ask for it. */
  readonly reducedMotion: boolean
  readonly showHints: boolean
}

export type SaveFile = {
  /** Always SAVE_VERSION once loaded. */
  readonly version: number
  readonly contentVersion: number
  /** ISO timestamp. Informational only; nothing reads it back. */
  readonly savedAt: string
  readonly knowledge: Knowledge
  readonly run: RunState | null
  readonly settings: Settings
}

export const DEFAULT_KNOWLEDGE: Knowledge = { unlockedConcepts: [], checkHistory: [] }

export const DEFAULT_SETTINGS: Settings = { difficulty: 'junior', reducedMotion: false, showHints: true }

export type SaveReadError = {
  /** unparseable: not JSON or not an export string. invalid: wrong shape. future-version: saved by a newer build. */
  readonly reason: 'unparseable' | 'invalid' | 'future-version'
  readonly detail: string
}

/** The part of the Web Storage API saves use. `localStorage` satisfies it. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type LoadOutcome =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly save: SaveFile; readonly migratedFrom: number | null }
  /** The save was moved to `quarantineKey`, or left in place if storage refused the copy (null). */
  | { readonly kind: 'corrupt'; readonly error: SaveReadError; readonly quarantineKey: string | null }
  | { readonly kind: 'unavailable'; readonly detail: string }

// Schemas. Each mirrors a type, and the annotations make typecheck fail if they drift. Zod
// emits keys in schema order, so fields follow the order the engine builds them in; a
// parsed save then serializes back to the same bytes.

const fraction = z.number().min(0).max(1)
const nonNegative = z.number().nonnegative()
const count = z.number().int().nonnegative()
const cents = z.number().int()
const act = z
  .number()
  .int()
  .min(1)
  .max(BALANCE.acts.usersToEnter.length + 1)
const noConfig = z.record(z.string(), z.never())
const id = z.string()
const replicas = z.number().int().positive()
const seed = count.refine((value) => value >>> 0 === value, 'seed must be an unsigned 32-bit integer')

const WorkloadSchema: z.ZodType<Workload> = z.object({
  meanRps: nonNegative,
  peakMultiplier: z.number().positive(),
  readFraction: fraction,
  staticFraction: fraction,
  keySkew: fraction,
  payloadKb: nonNegative,
})

const EdgesSchema: z.ZodType<Edge[]> = z.array(z.object({ from: z.string(), to: z.string() }))

const ComponentNodeSchema: z.ZodType<ComponentNode> = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('ingress'), replicas, tier: count, config: noConfig, position: gridPosition() }),
  z.object({
    id,
    kind: z.literal('app-server'),
    replicas,
    tier: count,
    config: z.object({ fanoutFactor: nonNegative }),
    position: gridPosition(),
  }),
  z.object({ id, kind: z.literal('database'), replicas, tier: count, config: noConfig, position: gridPosition() }),
])

function gridPosition() {
  return z.object({ col: count, row: count })
}

const ArchitectureSchema: z.ZodType<Architecture> = z.object({
  nodes: z.array(ComponentNodeSchema),
  edges: EdgesSchema,
})

const SimEventSchema: z.ZodType<SimEvent> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('act-started'), act }),
  z.object({ kind: z.literal('bailout'), cashCents: cents }),
  z.object({ kind: z.literal('rollback'), reason: z.enum(['bankruptcy', 'churn']), act }),
  z.object({
    kind: z.literal('node-failed'),
    nodeId: z.string(),
    failedInstances: z.number().int().positive(),
    replicas: replicas,
    turns: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('node-recovered'), nodeId: z.string() }),
])

const TurnSummarySchema: z.ZodType<TurnSummary> = z.object({
  turn: count,
  meanRps: nonNegative,
  peakRps: nonNegative,
  users: nonNegative,
  p99Ms: nonNegative,
  errorRate: fraction,
  utilization: z.record(z.string(), fraction),
  revenueCents: cents,
  costCents: cents,
  setupCostCents: cents,
  sloMet: z.boolean(),
  cashCents: cents,
  reputation: fraction,
  events: z.array(SimEventSchema),
})

const ArchiveSchema: z.ZodType<HistoryArchive> = z.object({
  turns: count,
  revenueCents: cents,
  costCents: cents,
  setupCostCents: cents,
  sloMetTurns: count,
  peakUsers: nonNegative,
})

const NodeOutageSchema: z.ZodType<NodeOutage> = z.object({
  nodeId: z.string(),
  failedInstances: z.number().int().positive(),
  turnsRemaining: z.number().int().positive(),
})

/** A run schema around a given architecture schema, so older formats share everything else. */
function runSchema<A extends z.ZodType>(architecture: A) {
  const checkpoint = {
    cashCents: cents,
    reputation: fraction,
    workload: WorkloadSchema,
    architecture,
    builtArchitecture: architecture,
    act,
    bailoutAvailable: z.boolean(),
    growthPenaltyTurns: count,
    outages: z.array(NodeOutageSchema),
  }
  return z.object({
    ...checkpoint,
    seed,
    turn: count,
    actStart: z.object(checkpoint),
    history: z.array(TurnSummarySchema),
    archive: ArchiveSchema,
  })
}

const RunStateSchema: z.ZodType<RunState> = runSchema(ArchitectureSchema)

const KnowledgeSchema: z.ZodType<Knowledge> = z.object({
  unlockedConcepts: z.array(z.string()),
  checkHistory: z.array(
    z.object({
      conceptId: z.string(),
      attemptNumber: z.number().int().positive(),
      correct: count,
      total: count,
      passed: z.boolean(),
      missedQuestionIds: z.array(z.string()),
    }),
  ),
})

const SettingsSchema: z.ZodType<Settings> = z.object({
  difficulty: z.enum(DIFFICULTIES),
  reducedMotion: z.boolean(),
  showHints: z.boolean(),
})

// Past formats. The migration runner checks versions, so these schemas don't.

// Before version 2, nodes had no canvas position. This frozen node shape serves v0 and v1.
const UnplacedArchitectureSchema = z.object({
  nodes: z.array(
    z.discriminatedUnion('kind', [
      z.object({ id, kind: z.literal('ingress'), replicas, tier: count, config: noConfig }),
      z.object({ id, kind: z.literal('app-server'), replicas, tier: count, config: z.object({ fanoutFactor: nonNegative }) }),
      z.object({ id, kind: z.literal('database'), replicas, tier: count, config: noConfig }),
    ]),
  ),
  edges: EdgesSchema,
})

// Before version 3, nothing in the game could fail, so a run had no outages and no turn
// could record one. These frozen shapes serve v1 and v2.
const SimEventV2Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('act-started'), act }),
  z.object({ kind: z.literal('bailout'), cashCents: cents }),
  z.object({ kind: z.literal('rollback'), reason: z.enum(['bankruptcy', 'churn']), act }),
])

const TurnSummaryV2Schema = z.object({
  turn: count,
  meanRps: nonNegative,
  peakRps: nonNegative,
  users: nonNegative,
  p99Ms: nonNegative,
  errorRate: fraction,
  utilization: z.record(z.string(), fraction),
  revenueCents: cents,
  costCents: cents,
  setupCostCents: cents,
  sloMet: z.boolean(),
  cashCents: cents,
  reputation: fraction,
  events: z.array(SimEventV2Schema),
})

function unbrokenRunSchema<A extends z.ZodType>(architecture: A) {
  const checkpoint = {
    cashCents: cents,
    reputation: fraction,
    workload: WorkloadSchema,
    architecture,
    builtArchitecture: architecture,
    act,
    bailoutAvailable: z.boolean(),
    growthPenaltyTurns: count,
  }
  return z.object({
    ...checkpoint,
    seed,
    turn: count,
    actStart: z.object(checkpoint),
    history: z.array(TurnSummaryV2Schema),
    archive: ArchiveSchema,
  })
}

// Version 1 (M2). It shares every schema except the architecture with the current format.
// If any other saved shape changes, freeze a full copy here first.
const RunV1Schema = unbrokenRunSchema(UnplacedArchitectureSchema)
const SaveV1Schema = z.object({
  contentVersion: count,
  savedAt: z.string(),
  knowledge: KnowledgeSchema,
  run: RunV1Schema.nullable(),
  settings: SettingsSchema,
})

// Version 0: the synthetic pre-release shape that exercises migrations from the first
// release (ADR-0025). It has a run's core figures, but no act, bailout or history, and no
// settings beyond difficulty.
const SaveV0Schema = z.object({
  savedAt: z.string(),
  knowledge: z.object({ unlockedConcepts: z.array(z.string()) }),
  settings: z.object({ difficulty: z.enum(DIFFICULTIES) }),
  run: z
    .object({
      seed,
      turn: count,
      cashCents: cents,
      reputation: fraction,
      workload: WorkloadSchema,
      architecture: UnplacedArchitectureSchema,
    })
    .nullable(),
})

function migrateV0(save: z.output<typeof SaveV0Schema>): z.output<typeof SaveV1Schema> {
  return {
    contentVersion: 0,
    savedAt: save.savedAt,
    knowledge: { unlockedConcepts: save.knowledge.unlockedConcepts, checkHistory: [] },
    run: save.run && runFromV0(save.run),
    settings: { ...DEFAULT_SETTINGS, difficulty: save.settings.difficulty },
  }
}

function runFromV0(run: NonNullable<z.output<typeof SaveV0Schema>['run']>): z.output<typeof RunV1Schema> {
  // A v0 run's past is unknown, so its act starts now: a rollback returns here.
  const checkpoint = {
    cashCents: run.cashCents,
    reputation: run.reputation,
    workload: run.workload,
    architecture: run.architecture,
    builtArchitecture: run.architecture,
    act: actForUsers(usersForMeanRps(run.workload.meanRps)),
    bailoutAvailable: true,
    growthPenaltyTurns: 0,
  }
  return { ...checkpoint, seed: run.seed, turn: run.turn, actStart: checkpoint, history: [], archive: EMPTY_ARCHIVE }
}

// Version 2 (M3): nodes gained canvas positions. It shares every schema except the run with
// the current format.
const RunV2Schema = unbrokenRunSchema(ArchitectureSchema)
const SaveV2Schema = z.object({
  contentVersion: count,
  savedAt: z.string(),
  knowledge: KnowledgeSchema,
  run: RunV2Schema.nullable(),
  settings: SettingsSchema,
})

function migrateV1(save: z.output<typeof SaveV1Schema>): z.output<typeof SaveV2Schema> {
  const run = save.run
  if (!run) return { ...save, run: null }
  return {
    ...save,
    run: {
      ...run,
      architecture: placeNodes(run.architecture),
      builtArchitecture: placeNodes(run.builtArchitecture),
      actStart: {
        ...run.actStart,
        architecture: placeNodes(run.actStart.architecture),
        builtArchitecture: placeNodes(run.actStart.builtArchitecture),
      },
    },
  }
}

// A save written before M6a had nothing failed, and loads with nothing failed (ADR-0051).
function migrateV2(save: z.output<typeof SaveV2Schema>): Omit<SaveFile, 'version'> {
  const run = save.run
  if (!run) return { ...save, run: null }
  return {
    ...save,
    run: { ...run, outages: [], actStart: { ...run.actStart, outages: [] } },
  }
}

// Gives a positionless architecture a flow layout (ADR-0028).
function placeNodes(architecture: z.output<typeof UnplacedArchitectureSchema>): Architecture {
  const at = layoutByFlow(
    architecture.nodes.map((node) => node.id),
    architecture.edges,
  )
  return { nodes: architecture.nodes.map((node) => ({ ...node, position: at(node.id) })), edges: architecture.edges }
}

type Migration = (save: unknown) => Result<Readonly<Record<string, unknown>>, string>

function migration<S extends z.ZodType>(
  schema: S,
  migrate: (save: z.output<S>) => Readonly<Record<string, unknown>>,
): Migration {
  return (save) => {
    const parsed = schema.safeParse(save)
    return parsed.success ? { ok: true, value: migrate(parsed.data) } : { ok: false, error: z.prettifyError(parsed.error) }
  }
}

/**
 * MIGRATIONS[n] turns a version-n save into version n + 1; the runner stamps the version.
 * Append one per format change, add a fixture for the old version, and never edit or remove
 * an entry: old saves still pass through every step.
 */
export const MIGRATIONS: readonly Migration[] = [
  migration(SaveV0Schema, migrateV0),
  migration(SaveV1Schema, migrateV1),
  migration(SaveV2Schema, migrateV2),
]

/** Schema version of the save document, not the app version. One past the last migration. */
export const SAVE_VERSION = MIGRATIONS.length

const SaveFileSchema: z.ZodType<SaveFile> = z.object({
  version: z.literal(SAVE_VERSION),
  contentVersion: count,
  savedAt: z.string(),
  knowledge: KnowledgeSchema,
  run: RunStateSchema.nullable(),
  settings: SettingsSchema,
})

/** A save document for the current state, stamped with the current versions. */
export function createSave(
  parts: { readonly knowledge: Knowledge; readonly run: RunState | null; readonly settings: Settings },
  now: () => Date,
): SaveFile {
  return {
    version: SAVE_VERSION,
    contentVersion: CONTENT_VERSION,
    savedAt: now().toISOString(),
    knowledge: parts.knowledge,
    run: parts.run,
    settings: parts.settings,
  }
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save)
}

/** Parses saved JSON of any past version and migrates it to the current one. Never throws. */
export function parseSave(text: string): Result<SaveFile, SaveReadError> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return readError('unparseable', describe(error))
  }
  return migrateSave(data)
}

/** Runs a decoded save document through every migration from its version, then validates it. */
export function migrateSave(data: unknown): Result<SaveFile, SaveReadError> {
  const version = data !== null && typeof data === 'object' && 'version' in data ? data.version : undefined
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return readError('invalid', 'the save has no valid version number')
  }
  if (version > SAVE_VERSION) {
    return readError('future-version', `saved as version ${version}, but this build reads up to ${SAVE_VERSION}`)
  }
  let current = data
  for (let from = version; from < SAVE_VERSION; from++) {
    const step = MIGRATIONS[from]
    if (!step) return readError('invalid', `no migration from version ${from}`)
    const migrated = step(current)
    if (!migrated.ok) return readError('invalid', `as version ${from}: ${migrated.error}`)
    current = { ...migrated.value, version: from + 1 }
  }
  const parsed = SaveFileSchema.safeParse(current)
  return parsed.success ? { ok: true, value: parsed.data } : readError('invalid', z.prettifyError(parsed.error))
}

/**
 * Loads the newest save in storage (01-ARCHITECTURE §7). An older version is migrated,
 * rewritten under the current key, and its old key removed. A save that fails to parse or
 * migrate is moved to `nines.save.corrupt.<timestamp>` so the player's data survives and
 * the game can start. Never throws.
 */
export function loadSave(storage: SaveStorage, now: () => Date): LoadOutcome {
  try {
    for (let version = SAVE_VERSION; version >= 0; version--) {
      const key = saveKey(version)
      const text = storage.getItem(key)
      if (text === null) continue
      const parsed = parseSave(text)
      if (!parsed.ok) return { kind: 'corrupt', error: parsed.error, quarantineKey: quarantine(storage, key, text, now) }
      if (version === SAVE_VERSION) return { kind: 'loaded', save: parsed.value, migratedFrom: null }
      if (writeSave(storage, parsed.value).ok) storage.removeItem(key)
      return { kind: 'loaded', save: parsed.value, migratedFrom: version }
    }
    return { kind: 'empty' }
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }
}

/** Writes a save under the current key. Fails without throwing when storage is full or blocked. */
export function writeSave(storage: SaveStorage, save: SaveFile): Result<string, string> {
  const key = saveKey(SAVE_VERSION)
  try {
    storage.setItem(key, serializeSave(save))
    return { ok: true, value: key }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

/** A save as a base64 string the player can copy to another browser (01-ARCHITECTURE §7). */
export function exportSave(save: SaveFile): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(serializeSave(save))) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Reads an `exportSave` string, migrating it like a stored save. Never throws. */
export function importSave(encoded: string): Result<SaveFile, SaveReadError> {
  let text: string
  try {
    const binary = atob(encoded.replace(/\s/g, ''))
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
  } catch (error) {
    return readError('unparseable', `not a save export: ${describe(error)}`)
  }
  return parseSave(text)
}

function quarantine(storage: SaveStorage, key: string, text: string, now: () => Date): string | null {
  try {
    const stamp = now().toISOString()
    let quarantineKey = `${CORRUPT_KEY_PREFIX}${stamp}`
    for (let copy = 1; storage.getItem(quarantineKey) !== null; copy++) {
      quarantineKey = `${CORRUPT_KEY_PREFIX}${stamp}.${copy}`
    }
    storage.setItem(quarantineKey, text)
    storage.removeItem(key)
    return quarantineKey
  } catch {
    // Storage refused the copy. Leave the original where it is rather than lose it.
    return null
  }
}

function readError(reason: SaveReadError['reason'], detail: string): Result<never, SaveReadError> {
  return { ok: false, error: { reason, detail } }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
