import { describe, expect, it } from 'vitest'
import { createRun, simulateTurn, type Architecture } from '../engine'
import { TEST_CATALOG, unwrap } from '../engine/test-helpers'
import v0Fixture from './fixtures/save-v0.json?raw'
import { CORRUPT_KEY_PREFIX, SAVE_VERSION, createSave, parseSave, saveKey, serializeSave } from './save'
import { createGameStore } from './store'
import { FIXED_NOW, memoryStorage } from './test-helpers'

const CURRENT_KEY = saveKey(SAVE_VERSION)

function setup(initial: Readonly<Record<string, string>> = {}) {
  const storage = memoryStorage(initial)
  const store = createGameStore({ storage, catalog: TEST_CATALOG, now: FIXED_NOW })
  return { storage, store, actions: store.getState() }
}

function savedGame(storage: ReturnType<typeof memoryStorage>) {
  return unwrap(parseSave(storage.items.get(CURRENT_KEY) ?? ''))
}

describe('game store', () => {
  it('starts a run on the chosen difficulty and saves it', () => {
    const { store, storage, actions } = setup()
    actions.setDifficulty('staff')
    actions.startRun(42)
    expect(store.getState().run).toEqual(createRun({ seed: 42, difficulty: 'staff' }))
    expect(savedGame(storage).run).toEqual(store.getState().run)
  })

  it('advances a turn only through the engine, and saves the result', () => {
    const { store, storage, actions } = setup()
    actions.startRun(42)
    actions.advanceTurn()
    const expected = unwrap(simulateTurn(createRun({ seed: 42, difficulty: 'junior' }), { difficulty: 'junior', catalog: TEST_CATALOG }))
    const { run, ui } = store.getState()
    expect(run).toEqual(expected.nextRun)
    expect(ui.lastTurn).toEqual(expected)
    expect(savedGame(storage).run).toEqual(expected.nextRun)
  })

  it('refuses to advance an architecture the engine rejects, and keeps the run', () => {
    const { store, actions } = setup()
    actions.startRun(42)
    const before = store.getState().run
    const broken: Architecture = { nodes: before?.architecture.nodes.slice(0, 1) ?? [], edges: [] }
    actions.setArchitecture(broken)
    actions.advanceTurn()
    expect(store.getState().run?.turn).toBe(0)
    expect(store.getState().ui.turnError?.kind).toBe('no-datastore-path')
  })

  it('surfaces a corrupt save as an error, quarantines it, and stays playable', () => {
    const { store, storage, actions } = setup({ [CURRENT_KEY]: '{"version": 1, "run": ' })
    expect(actions.load()).toBe('corrupt')
    const { run, ui } = store.getState()
    expect(run).toBeNull()
    expect(ui.saveProblem).toMatchObject({ kind: 'corrupt-save', error: { reason: 'unparseable' } })
    const quarantined = [...storage.items.keys()].filter((key) => key.startsWith(CORRUPT_KEY_PREFIX))
    expect(quarantined).toHaveLength(1)

    actions.dismissSaveProblem()
    actions.startRun(7)
    actions.advanceTurn()
    expect(store.getState().run?.turn).toBe(1)
    expect(store.getState().ui.saveProblem).toBeNull()
  })

  it('loads the v0 fixture and keeps playing', () => {
    const { store, actions } = setup({ [saveKey(0)]: v0Fixture })
    expect(actions.load()).toBe('loaded')
    expect(store.getState().settings.difficulty).toBe('senior')
    actions.advanceTurn()
    expect(store.getState().run?.turn).toBe(8)
  })

  it('keeps knowledge when a run ends and another starts (07-TESTING §4)', () => {
    const save = createSave(
      {
        run: createRun({ seed: 1, difficulty: 'junior' }),
        knowledge: { unlockedConcepts: ['percentiles'], checkHistory: [] },
        settings: { difficulty: 'junior', reducedMotion: false, showHints: true },
      },
      FIXED_NOW,
    )
    const { store, storage, actions } = setup({ [CURRENT_KEY]: serializeSave(save) })
    actions.load()
    actions.abandonRun()
    actions.startRun(2)
    expect(store.getState().knowledge.unlockedConcepts).toEqual(['percentiles'])
    expect(savedGame(storage).knowledge.unlockedConcepts).toEqual(['percentiles'])
  })

  it('switches difficulty mid-run: the economy changes from the next turn, progress does not (07-TESTING §4)', () => {
    const { store, actions } = setup()
    actions.startRun(9)
    for (let turn = 0; turn < 3; turn++) actions.advanceTurn()
    const before = store.getState().run
    if (!before) throw new Error('expected a run')

    actions.setDifficulty('staff')
    expect(store.getState().run).toBe(before)
    actions.advanceTurn()

    const input = { catalog: TEST_CATALOG }
    const asStaff = unwrap(simulateTurn(before, { ...input, difficulty: 'staff' })).nextRun
    const asJunior = unwrap(simulateTurn(before, { ...input, difficulty: 'junior' })).nextRun
    expect(store.getState().run).toEqual(asStaff)
    expect(asStaff.workload.meanRps).not.toBe(asJunior.workload.meanRps)
    expect(store.getState().run?.turn).toBe(4)
  })

  it('exports progress from one browser and imports it into another', () => {
    const first = setup()
    first.actions.startRun(5)
    first.actions.advanceTurn()
    const encoded = first.actions.exportProgress()

    const second = setup()
    expect(second.actions.importProgress(encoded)).toBe(true)
    const { run, knowledge, settings } = second.store.getState()
    expect({ run, knowledge, settings }).toEqual({
      run: first.store.getState().run,
      knowledge: first.store.getState().knowledge,
      settings: first.store.getState().settings,
    })
    expect(savedGame(second.storage).run).toEqual(run)
  })

  it('rejects a bad import with an error and leaves progress alone', () => {
    const { store, actions } = setup()
    actions.startRun(5)
    const before = store.getState().run
    expect(actions.importProgress('definitely not a save')).toBe(false)
    expect(store.getState().run).toBe(before)
    expect(store.getState().ui.saveProblem).toMatchObject({ kind: 'import-failed', error: { reason: 'unparseable' } })
  })

  it('reports a failed write without losing the in-memory run', () => {
    const storage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const store = createGameStore({ storage, catalog: TEST_CATALOG, now: FIXED_NOW })
    store.getState().startRun(3)
    expect(store.getState().run?.turn).toBe(0)
    expect(store.getState().ui.saveProblem).toEqual({ kind: 'write-failed', detail: 'QuotaExceededError' })
  })
})
