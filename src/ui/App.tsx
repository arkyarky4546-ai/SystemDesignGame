import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { BRANDING } from '../config/branding'
import type { GameStore, SaveProblem } from '../state/store'
import { CanvasScreen } from './screens/canvas/CanvasScreen'

export function App({ store }: { readonly store: StoreApi<GameStore> }) {
  const reducedMotion = useStore(store, (state) => state.settings.reducedMotion)
  const saveProblem = useStore(store, (state) => state.ui.saveProblem)

  return (
    <div data-reduced-motion={reducedMotion} className="flex h-dvh flex-col">
      <header className="flex items-center border-b border-panel-line px-4 py-2">
        <h1 className="text-base font-semibold text-ink-bright">{BRANDING.name}</h1>
      </header>
      {saveProblem && (
        <div role="alert" className="flex items-start justify-between gap-4 border-b border-fault px-4 py-2 text-sm text-ink-bright">
          <p>{describeSaveProblem(saveProblem)}</p>
          <button
            type="button"
            className="rounded border border-panel-line px-2 py-1 text-xs hover:border-flow"
            onClick={() => store.getState().dismissSaveProblem()}
          >
            Dismiss
          </button>
        </div>
      )}
      <CanvasScreen store={store} />
    </div>
  )
}

function describeSaveProblem(problem: SaveProblem): string {
  switch (problem.kind) {
    case 'corrupt-save':
      return problem.quarantineKey
        ? `Your saved game couldn’t be read, so this is a new run. The unreadable save is kept in this browser as ${problem.quarantineKey}.`
        : 'Your saved game couldn’t be read, and there was no room to copy it aside, so it was left in place.'
    case 'storage-unavailable':
      return 'This browser isn’t letting the game save. Progress will be lost when you close the tab.'
    case 'write-failed':
      return `The last change couldn’t be saved: ${problem.detail}`
    case 'import-failed':
      return `That save couldn’t be imported: ${problem.error.detail}`
  }
}
