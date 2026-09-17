import { describe, expect, it } from 'vitest'
import { COMPONENT_DEFS } from '../content/components'
import { recordCheckAttempt, type ComponentNode, type Knowledge, type RunState } from '../engine'
import { CONTENT_CATALOG } from './catalog'
import { SAVE_VERSION, createSave, saveKey, serializeSave, type SaveFile } from './save'
import { createGameStore } from './store'
import { FIXED_NOW, memoryStorage } from './test-helpers'
import { isTierUnlocked, lockedTiers, nextConceptFor, tierGatedBy, tiersUnlockedBy } from './unlocks'

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

  it('leaves database sizes open, since vertical-scaling gates those later', () => {
    for (let index = 0; index < COMPONENT_DEFS.database.tiers.length; index++) {
      expect(isTierUnlocked(NOTHING_LEARNED, 'database', index), `tier ${index}`).toBe(true)
    }
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

  it('does not change the save version (M4b acceptance)', () => {
    // M4b adds concepts and questions, and touches nothing a save holds. Bumping this means
    // a migration and a fixture, per `save.ts`.
    expect(SAVE_VERSION).toBe(2)
  })
})
