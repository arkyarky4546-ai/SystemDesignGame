import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { BRANDING } from '../config/branding'
import type { GameStore, LastTurn, SaveProblem } from '../state/store'
import { StatusBar } from './components/StatusBar'
import { WeekGuide } from './components/WeekGuide'
import { CanvasScreen } from './screens/canvas/CanvasScreen'
import { TurnReport } from './screens/report/TurnReport'
import { TURN_ANIMATION_MS, type TurnPlayback } from './turn-playback'
import { useMediaQuery } from './use-media-query'

const HEADER_BUTTON = 'ml-auto rounded border border-panel-line px-2 py-1 text-xs text-ink-bright hover:border-flow aria-expanded:border-flow'

export function App({ store }: { readonly store: StoreApi<GameStore> }) {
  const reducedMotionSetting = useStore(store, (state) => state.settings.reducedMotion)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', false)
  const reducedMotion = reducedMotionSetting || prefersReducedMotion
  const saveProblem = useStore(store, (state) => state.ui.saveProblem)
  const run = useStore(store, (state) => state.run)
  const lastTurn = useStore(store, (state) => state.ui.lastTurn)
  const guideOpen = useStore(store, (state) => state.ui.guideOpen)
  const advanceButton = useRef<HTMLButtonElement | null>(null)
  const guideButton = useRef<HTMLButtonElement | null>(null)
  const guideId = useId()
  // A player who opens the guide from the header is taken to it. A guide that opens with a new run leaves focus alone.
  const [guideRequested, setGuideRequested] = useState(false)

  // Each Advance plays once: the animation, then the report, then back to planning. The
  // turns are compared by identity, since a new run starts its week count again.
  const [reported, setReported] = useState<LastTurn | null>(null)
  const [dismissed, setDismissed] = useState<LastTurn | null>(null)
  const playback = useMemo<TurnPlayback | null>(
    () =>
      lastTurn && {
        turn: lastTurn.result.turn,
        startedAt: performance.now(),
        animate: !reducedMotion,
        before: lastTurn.before,
      },
    // Only the turn: the motion preference is read when the turn arrives, and changing it
    // later mustn't replay the turn.
    [lastTurn],
  )

  useEffect(() => {
    if (!lastTurn || !playback) return
    if (!playback.animate) {
      setReported(lastTurn)
      return
    }
    const timer = setTimeout(() => setReported(lastTurn), Math.max(0, playback.startedAt + TURN_ANIMATION_MS - performance.now()))
    return () => clearTimeout(timer)
  }, [lastTurn, playback])

  const reportOpen = lastTurn !== null && reported === lastTurn && dismissed !== lastTurn
  const busy = lastTurn !== null && dismissed !== lastTurn

  // Focus returns to Advance once the report is gone and the page is no longer inert.
  useEffect(() => {
    if (dismissed) advanceButton.current?.focus()
  }, [dismissed])

  // Closing from inside the guide removes the focused element, so focus goes to the button that reopens it.
  const closeGuideFromInside = () => {
    guideButton.current?.focus()
    store.getState().closeGuide()
  }

  const toggleGuide = () => {
    if (guideOpen) {
      store.getState().closeGuide()
      return
    }
    setGuideRequested(true)
    store.getState().openGuide()
  }

  return (
    <div data-reduced-motion={reducedMotion} className="flex h-dvh flex-col">
      <div inert={reportOpen} className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-panel-line px-4 py-2">
          <h1 className="text-base font-semibold text-ink-bright">{BRANDING.name}</h1>
          {run && <StatusBar run={run} playback={playback} />}
          {run && (
            <button
              ref={guideButton}
              type="button"
              aria-expanded={guideOpen}
              aria-controls={guideOpen ? guideId : undefined}
              className={HEADER_BUTTON}
              onClick={toggleGuide}
            >
              How a week works
            </button>
          )}
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
        <CanvasScreen
          store={store}
          playback={playback}
          busy={busy}
          onAdvance={() => store.getState().advanceTurn()}
          advanceButtonRef={advanceButton}
          guide={guideOpen && <WeekGuide id={guideId} focusHeading={guideRequested} onClose={closeGuideFromInside} />}
        />
      </div>
      {reportOpen && <TurnReport lastTurn={lastTurn} onClose={() => setDismissed(lastTurn)} />}
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
