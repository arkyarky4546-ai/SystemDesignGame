import { describe, expect, it } from 'vitest'
import { COMPONENT_DEFS } from '../content/components'
import { COMPONENT_KINDS, CONCEPT_IDS, PLANNED_CONCEPT_IDS, PLANNED_CONCEPT_TITLES } from '../content/schema'
import { recordCheckAttempt, type Architecture, type ComponentNode, type Knowledge, type RunState } from '../engine'
import { setReplicas } from './architecture'
import { CONTENT_CATALOG } from './catalog'
import { MIGRATIONS, SAVE_VERSION, createSave, saveKey, serializeSave, type SaveFile } from './save'
import { createGameStore } from './store'
import { FIXED_NOW, memoryStorage } from './test-helpers'
import { isTierUnlocked, lockedTiers, maxReplicas, nextConceptFor, nextReplicaConceptFor, tierGatedBy, tiersUnlockedBy } from './unlocks'

const NOTHING_LEARNED: Knowledge = { unlockedConcepts: [], checkHistory: [] }
const LEARNED = recordCheckAttempt(NOTHING_LEARNED, {
  conceptId: 'capacity-and-utilization',
  attemptNumber: 1,
  correct: 5,
  total: 5,
  passed: true,
  missedQuestionIds: [],
}).knowledge

describe('size unlocks (00-GAME-DESIGN §4, ADR-0040)', () => {
  it('leaves the smallest app server open and gates every size above it', () => {
    expect(tierGatedBy('app-server', 0)).toBeNull()
    expect(isTierUnlocked(NOTHING_LEARNED, 'app-server', 0)).toBe(true)
    for (let index = 1; index < COMPONENT_DEFS['app-server'].tiers.length; index++) {
      expect(tierGatedBy('app-server', index), `tier ${index}`).toBe('capacity-and-utilization')
      expect(isTierUnlocked(NOTHING_LEARNED, 'app-server', index), `tier ${index}`).toBe(false)
    }
  })

  it('leaves the smallest database open and gates every size above it on vertical-scaling', () => {
    expect(isTierUnlocked(NOTHING_LEARNED, 'database', 0)).toBe(true)
    for (let index = 1; index < COMPONENT_DEFS.database.tiers.length; index++) {
      expect(tierGatedBy('database', index), `tier ${index}`).toBe('vertical-scaling')
      expect(isTierUnlocked(NOTHING_LEARNED, 'database', index), `tier ${index}`).toBe(false)
      // Passing capacity-and-utilization opens the app server's sizes, not the database's.
      expect(isTierUnlocked(LEARNED, 'database', index), `tier ${index}`).toBe(false)
    }
    expect(nextConceptFor(NOTHING_LEARNED, 'database')).toBe('vertical-scaling')
    expect(tiersUnlockedBy('vertical-scaling').map((tier) => `${tier.label} ${tier.kind}`)).toEqual([
      'Medium database',
      'Large database',
      'Extra large database',
    ])
  })

  it('opens every gated size once the concept is passed', () => {
    expect(lockedTiers(NOTHING_LEARNED, 'app-server').map((tier) => tier.label)).toEqual(['Medium', 'Large', 'Extra large'])
    expect(lockedTiers(LEARNED, 'app-server')).toEqual([])
    expect(nextConceptFor(NOTHING_LEARNED, 'app-server')).toBe('capacity-and-utilization')
    expect(nextConceptFor(LEARNED, 'app-server')).toBeNull()
  })

  it('names every size the concept opens, for the result screen', () => {
    expect(tiersUnlockedBy('capacity-and-utilization')).toEqual([
      { kind: 'app-server', label: 'Medium', displayName: 'App server' },
      { kind: 'app-server', label: 'Large', displayName: 'App server' },
      { kind: 'app-server', label: 'Extra large', displayName: 'App server' },
    ])
  })
})

describe('a run saved before the gate existed (M4b acceptance)', () => {
  /** A save whose app server already runs at a size that is locked from M4b on. */
  function savedAtLockedSize(): { readonly save: SaveFile; readonly tier: number } {
    const store = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })
    store.getState().startRun(9)
    const run = store.getState().run
    if (!run) throw new Error('expected a run')
    const tier = 2
    const atLarge = (node: ComponentNode): ComponentNode => (node.id === 'app' ? { ...node, tier } : node)
    const architecture = { ...run.architecture, nodes: run.architecture.nodes.map(atLarge) }
    const upgraded: RunState = { ...run, architecture, builtArchitecture: architecture }
    return { save: createSave({ run: upgraded, knowledge: NOTHING_LEARNED, settings: store.getState().settings }, FIXED_NOW), tier }
  }

  it('keeps the node at that size and still advances', () => {
    const { save, tier } = savedAtLockedSize()
    const storage = memoryStorage({ [saveKey(SAVE_VERSION)]: serializeSave(save) })
    const store = createGameStore({ storage, catalog: CONTENT_CATALOG, now: FIXED_NOW })

    expect(store.getState().load()).toBe('loaded')
    expect(store.getState().run?.architecture.nodes.find((node) => node.id === 'app')?.tier).toBe(tier)
    expect(isTierUnlocked(store.getState().knowledge, 'app-server', tier)).toBe(false)

    store.getState().advanceTurn()
    const after = store.getState().run
    expect(after?.turn).toBe(1)
    expect(after?.architecture.nodes.find((node) => node.id === 'app')?.tier).toBe(tier)
    // It really ran at that size: the Large tier's capacity, not Small's.
    const metrics = store.getState().ui.lastTurn?.result.perNode.app
    expect(metrics?.capacityRps).toBe(CONTENT_CATALOG['app-server'][tier]?.capacityRps)
  })

  it('did not change the save version (M4b acceptance)', () => {
    // M4b added concepts and questions and touched nothing a save holds, so it left the
    // version at M3's 2. M6a moved it on with a migration and a fixture, as `save.ts`
    // requires; what M4b must never do is move it without one.
    expect(SAVE_VERSION).toBe(MIGRATIONS.length)
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(2)
  })
})

describe('instance unlocks (02-SIMULATION §5.7, ADR-0050)', () => {
  it('holds every component at one instance until a concept opens more', () => {
    for (const kind of COMPONENT_KINDS) {
      expect(maxReplicas(NOTHING_LEARNED, kind), kind).toBe(1)
      expect(maxReplicas(LEARNED, kind), kind).toBe(1)
    }
  })

  it('splits the app server’s instances between the two concepts that teach them', () => {
    const gates = COMPONENT_DEFS['app-server'].replicaGates ?? []
    expect(gates).toEqual([
      { gatedBy: 'single-point-of-failure', opens: { kind: 'up-to', replicas: 2 } },
      { gatedBy: 'horizontal-scaling', opens: { kind: 'uncapped' } },
    ])
    expect(nextReplicaConceptFor(NOTHING_LEARNED, 'app-server')).toBe('single-point-of-failure')
  })

  it('opens the second instance on single-point-of-failure and lifts the cap on horizontal-scaling', () => {
    // Neither concept has a lesson yet (M7 writes the first), so this passes them directly:
    // what is being checked is the gate, not how a check is taken.
    const spof: Knowledge = { unlockedConcepts: ['single-point-of-failure'], checkHistory: [] }
    expect(maxReplicas(spof, 'app-server')).toBe(2)
    expect(nextReplicaConceptFor(spof, 'app-server')).toBe('horizontal-scaling')

    const both: Knowledge = { unlockedConcepts: ['single-point-of-failure', 'horizontal-scaling'], checkHistory: [] }
    expect(maxReplicas(both, 'app-server')).toBe(Infinity)
    expect(nextReplicaConceptFor(both, 'app-server')).toBeNull()
  })

  it('gives the database no instance gate at all: §5.4 is Tier 3’s subject', () => {
    expect(COMPONENT_DEFS.database.replicaGates).toBeUndefined()
    expect(nextReplicaConceptFor(NOTHING_LEARNED, 'database')).toBeNull()
  })

  it('names a concept the curriculum promises but nobody has written yet', () => {
    // The gate has to be nameable before its lesson exists, or the catalog can't say what
    // opens it (ADR-0051). Nothing can pass it, so it stays shut.
    for (const id of PLANNED_CONCEPT_IDS) {
      expect(CONCEPT_IDS).not.toContain(id)
      expect(PLANNED_CONCEPT_TITLES[id].length).toBeGreaterThan(0)
    }
  })
})

describe('setting an instance count (ADR-0050)', () => {
  const architecture = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })

  function starter(): Architecture {
    architecture.getState().startRun(2)
    const run = architecture.getState().run
    if (!run) throw new Error('expected a run')
    return run.architecture
  }

  it('refuses a count above the cap, naming the cap', () => {
    expect(setReplicas(starter(), 'app', 2, 1)).toEqual({
      ok: false,
      error: { kind: 'invalid-replicas', nodeId: 'app', replicas: 2, cap: 1 },
    })
  })

  it('refuses zero, a fraction and an unknown node', () => {
    const base = starter()
    expect(setReplicas(base, 'app', 0, 4).ok).toBe(false)
    expect(setReplicas(base, 'app', 1.5, 4).ok).toBe(false)
    expect(setReplicas(base, 'nope', 2, 4)).toEqual({ ok: false, error: { kind: 'unknown-node', nodeId: 'nope' } })
  })

  it('sets the count when the cap allows it, changing nothing else', () => {
    const base = starter()
    const edit = setReplicas(base, 'app', 3, 4)
    if (!edit.ok) throw new Error('expected the edit to apply')
    expect(edit.value.nodes.find((node) => node.id === 'app')?.replicas).toBe(3)
    expect(edit.value.edges).toEqual(base.edges)
    expect(edit.value.nodes.find((node) => node.id === 'db')).toEqual(base.nodes.find((node) => node.id === 'db'))
  })
})
