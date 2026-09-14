import { describe, expect, it } from 'vitest'
import { createRun, simulateTurn, type ComponentNode, type RunState } from '../engine'
import { TEST_CATALOG, playHeadless, unwrap } from '../engine/test-helpers'
import v0Fixture from './fixtures/save-v0.json?raw'
import v1Fixture from './fixtures/save-v1.json?raw'
import {
  CORRUPT_KEY_PREFIX,
  DEFAULT_KNOWLEDGE,
  DEFAULT_SETTINGS,
  MIGRATIONS,
  SAVE_VERSION,
  createSave,
  exportSave,
  importSave,
  loadSave,
  parseSave,
  saveKey,
  serializeSave,
  writeSave,
  type SaveFile,
} from './save'
import { FIXED_NOW, memoryStorage } from './test-helpers'

const CURRENT_KEY = saveKey(SAVE_VERSION)

function saveOf(run: RunState | null): SaveFile {
  return createSave(
    {
      run,
      knowledge: {
        unlockedConcepts: ['client-server-basics', 'latency-and-throughput'],
        checkHistory: [
          {
            conceptId: 'capacity-and-utilization',
            attemptNumber: 2,
            correct: 4,
            total: 6,
            passed: false,
            // Non-ASCII on purpose: exports must survive UTF-8.
            missedQuestionIds: ['cap-util-q07', 'naïve-queue-q02'],
          },
        ],
      },
      settings: { difficulty: 'senior', reducedMotion: true, showHints: false },
    },
    FIXED_NOW,
  )
}

/** A staff run long enough to fill the history, archive old turns and hit failure events. */
function longRuns(): RunState[] {
  return playHeadless({ seed: 77, difficulty: 'staff', turns: 60 }).map((result) => result.nextRun)
}

function lastOf<T>(items: readonly T[]): T {
  const last = items.at(-1)
  if (last === undefined) throw new Error('expected at least one item')
  return last
}

describe('save round-trip (07-TESTING §4)', () => {
  it('serializes and deserializes to an identical save, byte for byte', () => {
    for (const save of [saveOf(null), saveOf(createRun({ seed: 1, difficulty: 'intern' })), saveOf(lastOf(longRuns()))]) {
      const text = serializeSave(save)
      const parsed = unwrap(parseSave(text))
      expect(parsed).toStrictEqual(save)
      expect(serializeSave(parsed)).toBe(text)
    }
  })

  it('round-trips the run after every one of 60 turns', () => {
    for (const run of longRuns()) {
      const save = saveOf(run)
      expect(unwrap(parseSave(serializeSave(save)))).toStrictEqual(save)
    }
  })

  it('stays under 100 KB for a 50-node architecture with a full history (01-ARCHITECTURE §7)', () => {
    const middle = Array.from(
      { length: 48 },
      (_, index): ComponentNode => ({
        id: `app-${index}`,
        kind: 'app-server',
        replicas: 1,
        tier: 0,
        config: { fanoutFactor: 1 },
        position: { col: index % 7, row: 1 + Math.floor(index / 7) },
      }),
    )
    const nodes: ComponentNode[] = [
      { id: 'ingress', kind: 'ingress', replicas: 1, tier: 0, config: {}, position: { col: 0, row: 0 } },
      ...middle,
      { id: 'db', kind: 'database', replicas: 1, tier: 0, config: {}, position: { col: 0, row: 9 } },
    ]
    const architecture = {
      nodes,
      edges: nodes.slice(1).map((node, index) => ({ from: nodes[index]?.id ?? '', to: node.id })),
    }
    const start = createRun({ seed: 3, difficulty: 'junior' })
    let run: RunState = { ...start, architecture, builtArchitecture: architecture, actStart: { ...start.actStart, architecture, builtArchitecture: architecture } }
    for (let turn = 0; turn < 60; turn++) {
      run = unwrap(simulateTurn(run, { difficulty: 'junior', catalog: TEST_CATALOG })).nextRun
    }
    expect(run.history.length).toBe(50)
    expect(new TextEncoder().encode(serializeSave(saveOf(run))).length).toBeLessThan(100_000)
  })
})

describe('migrations (01-ARCHITECTURE §7)', () => {
  it('keeps a fixture for every past version (07-TESTING §4)', () => {
    const fixtures = import.meta.glob<string>('./fixtures/save-v*.json', { query: '?raw', import: 'default', eager: true })
    const versions = Object.keys(fixtures)
      .map((path) => Number(/save-v(\d+)\.json$/.exec(path)?.[1]))
      .sort((a, b) => a - b)
    expect(versions).toEqual(Array.from({ length: SAVE_VERSION }, (_, version) => version))
    expect(MIGRATIONS).toHaveLength(SAVE_VERSION)
  })

  it('migrates the v0 fixture to the current version', () => {
    const save = unwrap(parseSave(v0Fixture))
    expect(save.version).toBe(SAVE_VERSION)
    expect(save.savedAt).toBe('2026-09-01T18:30:00.000Z')
    expect(save.knowledge).toEqual({ ...DEFAULT_KNOWLEDGE, unlockedConcepts: ['client-server-basics', 'latency-and-throughput'] })
    expect(save.settings).toEqual({ ...DEFAULT_SETTINGS, difficulty: 'senior' })

    const run = save.run
    if (!run) throw new Error('the fixture has a run')
    expect(run.turn).toBe(7)
    expect(run.cashCents).toBe(412345)
    expect(run.act).toBe(1)
    expect(run.builtArchitecture).toEqual(run.architecture)
    expect(run.history).toEqual([])
    expect(run.architecture.nodes.map((node) => [node.id, node.position])).toEqual([
      ['ingress', { col: 0, row: 0 }],
      ['app', { col: 0, row: 1 }],
      ['db', { col: 0, row: 2 }],
    ])
    // A v0 run's past is unknown, so the migrated act starts where the save left off.
    expect(run.actStart).toEqual({
      cashCents: run.cashCents,
      reputation: run.reputation,
      workload: run.workload,
      architecture: run.architecture,
      builtArchitecture: run.builtArchitecture,
      act: run.act,
      bailoutAvailable: run.bailoutAvailable,
      growthPenaltyTurns: run.growthPenaltyTurns,
    })
  })

  it('loads a migrated v0 run that plays on', () => {
    const run = unwrap(parseSave(v0Fixture)).run
    if (!run) throw new Error('the fixture has a run')
    const result = unwrap(simulateTurn(run, { difficulty: 'senior', catalog: TEST_CATALOG }))
    expect(result.turn).toBe(8)
    expect(result.economy.setupCostCents).toBe(0)
  })

  it('migrates the v1 fixture by laying out every architecture and changing nothing else', () => {
    const original: {
      knowledge: unknown
      settings: unknown
      run: { turn: number; cashCents: number; history: unknown; architecture: { nodes: unknown; edges: unknown } }
    } = JSON.parse(v1Fixture)
    const save = unwrap(parseSave(v1Fixture))
    const run = save.run
    if (!run) throw new Error('the fixture has a run')
    expect(save.version).toBe(SAVE_VERSION)
    expect(save.knowledge).toEqual(original.knowledge)
    expect(save.settings).toEqual(original.settings)
    expect(run.cashCents).toBe(original.run.cashCents)
    expect(run.history).toEqual(original.run.history)
    expect(run.architecture.edges).toEqual(original.run.architecture.edges)
    expect(run.architecture.nodes.map(({ id, kind, replicas, tier, config }) => ({ id, kind, replicas, tier, config }))).toEqual(
      original.run.architecture.nodes,
    )
    for (const architecture of [run.architecture, run.builtArchitecture, run.actStart.architecture, run.actStart.builtArchitecture]) {
      expect(architecture.nodes.map((node) => node.position)).toEqual([
        { col: 0, row: 0 },
        { col: 0, row: 1 },
        { col: 0, row: 2 },
      ])
    }

    const next = unwrap(simulateTurn(run, { difficulty: 'junior', catalog: TEST_CATALOG }))
    expect(next.turn).toBe(original.run.turn + 1)
    expect(next.economy.setupCostCents).toBe(0)
  })

  it('moves a stored v0 save to the current key', () => {
    const storage = memoryStorage({ [saveKey(0)]: v0Fixture })
    const outcome = loadSave(storage, FIXED_NOW)
    expect(outcome.kind).toBe('loaded')
    expect(outcome.kind === 'loaded' && outcome.migratedFrom).toBe(0)
    expect(storage.items.has(saveKey(0))).toBe(false)
    expect(unwrap(parseSave(storage.items.get(CURRENT_KEY) ?? ''))).toEqual(unwrap(parseSave(v0Fixture)))
  })
})

describe('corrupt saves are quarantined, never fatal (07-TESTING §4)', () => {
  const valid = serializeSave(saveOf(lastOf(longRuns())))
  const withRun = (patch: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(valid), ...patch })

  it.each([
    ['truncated JSON', valid.slice(0, valid.length / 2), 'unparseable'],
    ['not JSON at all', 'lol', 'unparseable'],
    ['a null document', 'null', 'invalid'],
    ['no version', withRun({ version: undefined }), 'invalid'],
    ['a negative version', withRun({ version: -1 }), 'invalid'],
    ['a future version', withRun({ version: SAVE_VERSION + 98 }), 'future-version'],
    ['wrong types', withRun({ run: { ...JSON.parse(valid).run, cashCents: 'lots' } }), 'invalid'],
    ['a fractional cash balance', withRun({ run: { ...JSON.parse(valid).run, cashCents: 10.5 } }), 'invalid'],
    ['reputation out of range', withRun({ run: { ...JSON.parse(valid).run, reputation: 1.5 } }), 'invalid'],
    ['a v0 save of the wrong shape', JSON.stringify({ version: 0, run: 'yes' }), 'invalid'],
  ])('%s', (_label, text, reason) => {
    const storage = memoryStorage({ [CURRENT_KEY]: text })
    const outcome = loadSave(storage, FIXED_NOW)
    if (outcome.kind !== 'corrupt') throw new Error(`expected corrupt, got ${outcome.kind}`)
    expect(outcome.error.reason).toBe(reason)
    expect(outcome.error.detail.length).toBeGreaterThan(0)
    expect(outcome.quarantineKey).toBe(`${CORRUPT_KEY_PREFIX}2026-09-14T12:00:00.000Z`)
    expect(storage.items.get(outcome.quarantineKey ?? '')).toBe(text)
    expect(storage.items.has(CURRENT_KEY)).toBe(false)
  })

  it('accepts a save with no run in progress', () => {
    const storage = memoryStorage({ [CURRENT_KEY]: serializeSave(saveOf(null)) })
    expect(loadSave(storage, FIXED_NOW)).toMatchObject({ kind: 'loaded', save: { run: null } })
  })

  it('never overwrites an earlier quarantined save', () => {
    const storage = memoryStorage()
    const keys = ['first', 'second', 'third'].map((text) => {
      storage.setItem(CURRENT_KEY, text)
      const outcome = loadSave(storage, FIXED_NOW)
      return outcome.kind === 'corrupt' ? outcome.quarantineKey : null
    })
    expect(new Set(keys).size).toBe(3)
    expect(keys.map((key) => storage.items.get(key ?? ''))).toEqual(['first', 'second', 'third'])
  })

  it('leaves the original in place when storage refuses the quarantine copy', () => {
    const storage = memoryStorage({ [CURRENT_KEY]: 'lol' })
    const full = {
      ...storage,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(loadSave(full, FIXED_NOW)).toMatchObject({ kind: 'corrupt', quarantineKey: null })
    expect(storage.items.get(CURRENT_KEY)).toBe('lol')
  })

  it('reports blocked storage instead of throwing', () => {
    const blocked = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(loadSave(blocked, FIXED_NOW)).toEqual({ kind: 'unavailable', detail: 'SecurityError' })
    expect(loadSave(memoryStorage(), FIXED_NOW)).toEqual({ kind: 'empty' })
  })

  it('reports a failed write instead of throwing', () => {
    const full = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(writeSave(full, saveOf(null))).toEqual({ ok: false, error: 'QuotaExceededError' })
  })
})

describe('export and import (01-ARCHITECTURE §7)', () => {
  it('round-trips progress through a base64 string, including non-ASCII text', () => {
    const save = saveOf(lastOf(longRuns()))
    const encoded = exportSave(save)
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(unwrap(importSave(encoded))).toStrictEqual(save)
    expect(unwrap(importSave(`  ${encoded.slice(0, 40)}\n${encoded.slice(40)}  `))).toStrictEqual(save)
  })

  it('migrates an exported v0 save', () => {
    expect(unwrap(importSave(btoa(v0Fixture))).run?.turn).toBe(7)
  })

  it.each([
    ['not base64', '%%% not base64 %%%', 'unparseable'],
    ['base64 of text that is not JSON', btoa('hello'), 'unparseable'],
    ['base64 of invalid UTF-8', btoa(String.fromCharCode(0xff, 0xfe, 0xfd)), 'unparseable'],
    ['base64 of JSON that is not a save', btoa('{"version":1}'), 'invalid'],
  ])('rejects %s without throwing', (_label, encoded, reason) => {
    const imported = importSave(encoded)
    expect(imported.ok).toBe(false)
    expect(!imported.ok && imported.error.reason).toBe(reason)
  })
})
