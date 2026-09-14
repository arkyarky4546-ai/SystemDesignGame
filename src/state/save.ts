import { z } from 'zod'
import { BALANCE } from '../config/balance'
import { DIFFICULTIES, type Difficulty } from '../config/difficulty'
import {
  EMPTY_ARCHIVE,
  actForUsers,
  usersForMeanRps,
  type Architecture,
  type ComponentNode,
  type HistoryArchive,
  type Result,
  type RunCheckpoint,
  type RunState,
  type SimEvent,
  type TurnSummary,
  type Workload,
} from '../engine'

// Save files: serialize, validate, migrate, quarantine, export (01-ARCHITECTURE §7, ADR-0025).

/** Schema version of the save document. Not the app version. */
export const SAVE_VERSION = 1

/**
 * Bumped when content changes in a way that breaks saved concept or question ids. No
 * content exists yet.
 */
export const CONTENT_VERSION = 0

const SAVE_KEY_PREFIX = 'nines.save.v'
export const CORRUPT_KEY_PREFIX = 'nines.save.corrupt.'

/** The localStorage key a given save version lives under. */
export function saveKey(version: number): string {
  return `${SAVE_KEY_PREFIX}${version}`
}

/** One attempt at a concept's check. Question ids are permanent (ADR-0015). */
export type CheckAttempt = {
  readonly conceptId: string
  /** 1 for the first attempt. Seeds option shuffling in M6. */
  readonly attemptNumber: number
  readonly correct: number
  readonly total: number
  readonly passed: boolean
  readonly missedQuestionIds: readonly string[]
}

/** What the player has learned. Outlives every run (00-GAME-DESIGN §8). */
export type Knowledge = {
  readonly unlockedConcepts: readonly string[]
  readonly checkHistory: readonly CheckAttempt[]
}

export type Settings = {
  readonly difficulty: Difficulty
  /** Forces reduced motion even when the OS doesn't ask for it. */
  readonly reducedMotion: boolean
  readonly showHints: boolean
}

export type SaveFile = {
  readonly version: typeof SAVE_VERSION
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

const WorkloadSchema: z.ZodType<Workload> = z.object({
  meanRps: nonNegative,
  peakMultiplier: z.number().positive(),
  readFraction: fraction,
  staticFraction: fraction,
  keySkew: fraction,
  payloadKb: nonNegative,
})

const id = z.string()
const replicas = z.number().int().positive()
const ComponentNodeSchema: z.ZodType<ComponentNode> = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('ingress'), replicas, tier: count, config: noConfig }),
  z.object({ id, kind: z.literal('app-server'), replicas, tier: count, config: z.object({ fanoutFactor: nonNegative }) }),
  z.object({ id, kind: z.literal('database'), replicas, tier: count, config: noConfig }),
])

const ArchitectureSchema: z.ZodType<Architecture> = z.object({
  nodes: z.array(ComponentNodeSchema),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
})

const SimEventSchema: z.ZodType<SimEvent> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('act-started'), act }),
  z.object({ kind: z.literal('bailout'), cashCents: cents }),
  z.object({ kind: z.literal('rollback'), reason: z.enum(['bankruptcy', 'churn']), act }),
])

const checkpointFields = {
  cashCents: cents,
  reputation: fraction,
  workload: WorkloadSchema,
  architecture: ArchitectureSchema,
  builtArchitecture: ArchitectureSchema,
  act,
  bailoutAvailable: z.boolean(),
  growthPenaltyTurns: count,
}
const CheckpointSchema: z.ZodType<RunCheckpoint> = z.object(checkpointFields)

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

const seed = count.refine((value) => value >>> 0 === value, 'seed must be an unsigned 32-bit integer')

const RunStateSchema: z.ZodType<RunState> = z.object({
  ...checkpointFields,
  seed,
  turn: count,
  actStart: CheckpointSchema,
  history: z.array(TurnSummarySchema),
  archive: ArchiveSchema,
})

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

const SaveFileSchema: z.ZodType<SaveFile> = z.object({
  version: z.literal(SAVE_VERSION),
  contentVersion: count,
  savedAt: z.string(),
  knowledge: KnowledgeSchema,
  run: RunStateSchema.nullable(),
  settings: SettingsSchema,
})

// Version 0: the pre-release shape, defined so migrations run from the first release
// (ADR-0025). It has a run's core figures but no act, bailout or history, and no settings
// beyond difficulty. It reuses today's Workload and Architecture schemas; if either shape
// changes, freeze a copy here first.
const SaveV0Schema = z.object({
  version: z.literal(0),
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
      architecture: ArchitectureSchema,
    })
    .nullable(),
})

function migrateV0(save: z.infer<typeof SaveV0Schema>): unknown {
  return {
    version: 1,
    contentVersion: 0,
    savedAt: save.savedAt,
    knowledge: { unlockedConcepts: save.knowledge.unlockedConcepts, checkHistory: [] },
    settings: { ...DEFAULT_SETTINGS, difficulty: save.settings.difficulty },
    run: save.run && runFromV0(save.run),
  }
}

function runFromV0(run: NonNullable<z.infer<typeof SaveV0Schema>['run']>): RunState {
  // A v0 run's past is unknown, so its act starts now: a rollback returns here.
  const checkpoint: RunCheckpoint = {
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

type Migration = (save: unknown) => Result<unknown, string>

/**
 * MIGRATIONS[n] turns a version-n save into version n + 1. Append one per version bump, add
 * a fixture for the old version, and never edit or remove an entry: old saves still pass
 * through every step.
 */
export const MIGRATIONS: readonly Migration[] = [
  (save) => {
    const parsed = SaveV0Schema.safeParse(save)
    return parsed.success ? { ok: true, value: migrateV0(parsed.data) } : { ok: false, error: z.prettifyError(parsed.error) }
  },
]

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
    const migration = MIGRATIONS[from]
    if (!migration) return readError('invalid', `no migration from version ${from}`)
    const migrated = migration(current)
    if (!migrated.ok) return readError('invalid', `as version ${from}: ${migrated.error}`)
    current = migrated.value
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
