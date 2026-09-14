import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Difficulty } from '../config/difficulty'
import { createRun, simulateTurn, type Architecture, type PricedCatalog, type RunState, type TickError, type TurnResult } from '../engine'
import {
  DEFAULT_KNOWLEDGE,
  DEFAULT_SETTINGS,
  createSave,
  exportSave,
  importSave,
  loadSave,
  writeSave,
  type Knowledge,
  type LoadOutcome,
  type SaveReadError,
  type SaveStorage,
  type Settings,
} from './save'

export type SaveProblem =
  | { readonly kind: 'corrupt-save'; readonly error: SaveReadError; readonly quarantineKey: string | null }
  | { readonly kind: 'storage-unavailable'; readonly detail: string }
  | { readonly kind: 'write-failed'; readonly detail: string }
  | { readonly kind: 'import-failed'; readonly error: SaveReadError }

/** One Advance: what the engine returned, and the run it started from. */
export type LastTurn = {
  readonly result: TurnResult
  /** The run before the turn: its architecture is what ran, and its figures are where deltas start. */
  readonly before: RunState
}

/** Transient state for the screens. Never saved. */
export type UiState = {
  /** The most recent Advance, for the weekly report and the turn animation. */
  readonly lastTurn: LastTurn | null
  /** Why the last Advance was refused, if it was. */
  readonly turnError: TickError | null
  readonly saveProblem: SaveProblem | null
  /**
   * Whether "How a week works" is showing (M4a). A run that hasn't advanced yet opens it, and it
   * stays open until the player closes it. Saves don't record it (ADR-0038), so a run reloaded
   * before its first week shows it again.
   */
  readonly guideOpen: boolean
}

export type GameState = {
  readonly run: RunState | null
  readonly knowledge: Knowledge
  readonly settings: Settings
  readonly ui: UiState
  /** The tiers every turn resolves against, so screens show the same figures the engine uses. Never saved. */
  readonly catalog: PricedCatalog
}

export type GameActions = {
  /** Loads the saved game, if any. A corrupt save becomes `ui.saveProblem`, never an exception. */
  readonly load: () => LoadOutcome['kind']
  readonly startRun: (seed: number) => void
  /** Replaces the architecture the next Advance runs. The canvas commits here. */
  readonly setArchitecture: (architecture: Architecture) => void
  readonly advanceTurn: () => void
  /** Takes effect from the next turn. Progress is untouched (00-GAME-DESIGN §6). */
  readonly setDifficulty: (difficulty: Difficulty) => void
  /** Ends the run. Knowledge is kept. */
  readonly abandonRun: () => void
  readonly exportProgress: () => string
  readonly importProgress: (encoded: string) => boolean
  readonly dismissSaveProblem: () => void
  readonly openGuide: () => void
  readonly closeGuide: () => void
}

export type GameStore = GameState & GameActions

export type GameStoreDeps = {
  readonly storage: SaveStorage
  /** Component tiers and prices each turn resolves against. */
  readonly catalog: PricedCatalog
  /** Wall clock for save timestamps. Never reaches the engine. */
  readonly now: () => Date
}

const INITIAL_UI: UiState = { lastTurn: null, turnError: null, saveProblem: null, guideOpen: false }

const isNewRun = (run: RunState | null): boolean => run !== null && run.turn === 0

/**
 * The single game store (01-ARCHITECTURE §4). A vanilla Zustand store, so tests and the
 * balance harness run it without React; the UI binds with `useStore`. The run only
 * changes through engine calls or architecture edits. Every change to run, knowledge
 * or settings is saved at once.
 */
export function createGameStore(deps: GameStoreDeps): StoreApi<GameStore> {
  return createStore<GameStore>()((set, get) => {
    const reportProblem = (saveProblem: SaveProblem) => set((state) => ({ ui: { ...state.ui, saveProblem } }))

    const persist = () => {
      const { run, knowledge, settings } = get()
      const written = writeSave(deps.storage, createSave({ run, knowledge, settings }, deps.now))
      if (!written.ok) reportProblem({ kind: 'write-failed', detail: written.error })
    }

    return {
      run: null,
      knowledge: DEFAULT_KNOWLEDGE,
      settings: DEFAULT_SETTINGS,
      ui: INITIAL_UI,
      catalog: deps.catalog,

      load: () => {
        const outcome = loadSave(deps.storage, deps.now)
        if (outcome.kind === 'loaded') {
          const { run, knowledge, settings } = outcome.save
          set({ run, knowledge, settings, ui: { ...INITIAL_UI, guideOpen: isNewRun(run) } })
        } else if (outcome.kind === 'corrupt') {
          reportProblem({ kind: 'corrupt-save', error: outcome.error, quarantineKey: outcome.quarantineKey })
        } else if (outcome.kind === 'unavailable') {
          reportProblem({ kind: 'storage-unavailable', detail: outcome.detail })
        }
        return outcome.kind
      },

      startRun: (seed) => {
        set((state) => ({
          run: createRun({ seed, difficulty: state.settings.difficulty }),
          ui: { ...state.ui, lastTurn: null, turnError: null, guideOpen: true },
        }))
        persist()
      },

      setArchitecture: (architecture) => {
        const { run } = get()
        if (!run) return
        set((state) => ({ run: { ...run, architecture }, ui: { ...state.ui, turnError: null } }))
        persist()
      },

      advanceTurn: () => {
        const { run, settings } = get()
        if (!run) return
        const result = simulateTurn(run, { difficulty: settings.difficulty, catalog: deps.catalog })
        if (!result.ok) {
          set((state) => ({ ui: { ...state.ui, turnError: result.error } }))
          return
        }
        set((state) => ({
          run: result.value.nextRun,
          ui: { ...state.ui, lastTurn: { result: result.value, before: run }, turnError: null },
        }))
        persist()
      },

      setDifficulty: (difficulty) => {
        set((state) => ({ settings: { ...state.settings, difficulty } }))
        persist()
      },

      abandonRun: () => {
        set((state) => ({ run: null, ui: { ...state.ui, lastTurn: null, turnError: null, guideOpen: false } }))
        persist()
      },

      exportProgress: () => {
        const { run, knowledge, settings } = get()
        return exportSave(createSave({ run, knowledge, settings }, deps.now))
      },

      importProgress: (encoded) => {
        const imported = importSave(encoded)
        if (!imported.ok) {
          reportProblem({ kind: 'import-failed', error: imported.error })
          return false
        }
        const { run, knowledge, settings } = imported.value
        set({ run, knowledge, settings, ui: { ...INITIAL_UI, guideOpen: isNewRun(run) } })
        persist()
        return true
      },

      dismissSaveProblem: () => set((state) => ({ ui: { ...state.ui, saveProblem: null } })),

      openGuide: () => set((state) => ({ ui: { ...state.ui, guideOpen: true } })),

      closeGuide: () => set((state) => ({ ui: { ...state.ui, guideOpen: false } })),
    }
  })
}
