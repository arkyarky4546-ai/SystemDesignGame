import { useCallback, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { COMPONENT_DEFS } from '../../../content/components'
import type { ComponentKind, ConceptId } from '../../../content/schema'
import { forecastTraffic, planTurn, type Architecture, type NodeId, type TickResult } from '../../../engine'
import { findNode, nearestFreeCell, placeNode } from '../../../state/architecture'
import { lastResolvedTick } from '../../../state/selectors'
import type { GameStore } from '../../../state/store'
import {
  ArchitectureCanvas,
  canvasPoint,
  edgeKey,
  type CanvasMessage,
  type CanvasPlayback,
  type CanvasSelection,
} from '../../canvas/ArchitectureCanvas'
import { describeEditRefusal, nodeName, percent } from '../../canvas/copy'
import { cellAt } from '../../canvas/geometry'
import { formatUtilization } from '../../format'
import type { TurnPlayback } from '../../turn-playback'
import { useMediaQuery } from '../../use-media-query'
import { AdvanceBar, ForecastLine } from './AdvanceBar'
import { ComponentPalette } from './ComponentPalette'
import { NodeInspector } from './NodeInspector'

const NO_UTILIZATION: Readonly<Record<NodeId, number>> = {}
const NO_FLOW: Readonly<Record<string, number>> = {}
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const PANEL_HEADING = 'cursor-pointer px-4 py-2 text-sm font-medium text-ink-bright'
const BUTTON = 'rounded border border-panel-line px-2 py-1 text-xs text-ink-bright hover:border-flow disabled:opacity-50'

type CanvasScreenProps = {
  readonly store: StoreApi<GameStore>
  /** The turn being replayed. None by default. */
  readonly playback?: TurnPlayback | null
  /** True while a turn is resolving or its report is open. */
  readonly busy?: boolean
  /** Defaults to advancing the store directly, with no animation or report. */
  readonly onAdvance?: () => void
  readonly advanceButtonRef?: Ref<HTMLButtonElement>
  /** "How a week works" while it's open. The layout decides where it goes (ADR-0038). */
  readonly guide?: ReactNode
}

const utilizationOf = (tick: TickResult | null): Readonly<Record<NodeId, number>> =>
  tick ? Object.fromEntries(Object.entries(tick.perNode).map(([nodeId, metrics]) => [nodeId, metrics.utilization])) : NO_UTILIZATION

/**
 * The canvas screen (05-UI-DESIGN §4): catalog, canvas and inspector, with next week's
 * forecast above the canvas and its costs beside Advance. The layout follows §9's
 * breakpoints:
 * - 900px and up: three columns, with the week guide above them.
 * - 600–899px: the canvas gets the full width, with the guide, catalog and inspector in bottom sheets.
 * - Below 600px: the canvas is pan and zoom only, and editing happens in a component list,
 *   with the guide first in the panel under the canvas.
 *
 * Below 900px the guide goes in the panel that already scrolls, because a banner above the
 * canvas takes most of its height.
 */
export function CanvasScreen({ store, playback = null, busy = false, onAdvance, advanceButtonRef, guide }: CanvasScreenProps) {
  const run = useStore(store, (state) => state.run)
  const catalog = useStore(store, (state) => state.catalog)
  const difficulty = useStore(store, (state) => state.settings.difficulty)
  const knowledge = useStore(store, (state) => state.knowledge)
  const refusal = useStore(store, (state) => state.ui.turnError)
  const [selection, setSelection] = useState<CanvasSelection>({ kind: 'none' })
  const [message, setMessage] = useState<CanvasMessage | null>(null)
  const [zoom, setZoom] = useState(1)
  const wide = useMediaQuery('(min-width: 900px)', true)
  const editable = useMediaQuery('(min-width: 600px)', true)
  const svg = useRef<SVGSVGElement | null>(null)

  // Last week's figures come from the architecture that ran, not the one being planned.
  const builtArchitecture = run?.builtArchitecture
  const workload = run?.workload
  const history = run?.history
  const lastTick = useMemo(
    () => (run ? lastResolvedTick(run, catalog) : null),
    // Only what lastResolvedTick reads, so planning edits don't re-resolve last week.
    [builtArchitecture, workload, history, catalog],
  )
  const utilization = useMemo(() => utilizationOf(lastTick), [lastTick])
  const edgeFlow = useMemo(
    () => (lastTick ? Object.fromEntries(lastTick.perEdge.map((flow) => [edgeKey(flow), flow.rps])) : NO_FLOW),
    [lastTick],
  )
  const forecast = useMemo(() => (run ? forecastTraffic(run, difficulty) : null), [run, difficulty])
  const plan = useMemo(() => (run ? planTurn(run, { difficulty, catalog }) : null), [run, difficulty, catalog])
  const canvasPlayback = useMemo<CanvasPlayback | null>(
    () => (playback ? { ...playback, fromUtilization: utilizationOf(lastResolvedTick(playback.before, catalog)) } : null),
    [playback, catalog],
  )

  const onChange = useCallback(
    (architecture: Architecture, announcement: string) => {
      store.getState().setArchitecture(architecture)
      setMessage({ tone: 'info', text: announcement })
    },
    [store],
  )

  if (!run || !plan || !forecast) return <p className="p-4 text-sm">No run in progress.</p>
  const architecture = run.architecture

  const place = (kind: ComponentKind, cell: { col: number; row: number }) => {
    const placed = placeNode(architecture, kind, cell)
    if (!placed.ok) {
      setMessage({ tone: 'refusal', text: describeEditRefusal(placed.error, architecture) })
      return
    }
    onChange(placed.value.architecture, `Placed ${nodeName(placed.value.architecture, placed.value.nodeId)}.`)
    setSelection({ kind: 'node', nodeId: placed.value.nodeId })
  }

  const onDrop = (kind: ComponentKind, client: { clientX: number; clientY: number }) => {
    const element = svg.current
    const rect = element?.getBoundingClientRect()
    const inside =
      element && rect && client.clientX >= rect.left && client.clientX <= rect.right && client.clientY >= rect.top && client.clientY <= rect.bottom
    if (!element || !inside) {
      setMessage({ tone: 'info', text: `Drop ${COMPONENT_DEFS[kind].displayName} on the canvas to place it.` })
      return
    }
    place(kind, cellAt(canvasPoint(element, client, zoom)))
  }

  const onPlace = (kind: ComponentKind) => {
    const selected = selection.kind === 'node' ? findNode(architecture, selection.nodeId) : undefined
    const near = selected ? { col: selected.position.col, row: selected.position.row + 1 } : { col: 0, row: 0 }
    place(kind, nearestFreeCell(architecture, near))
  }

  const canvas = (
    <ArchitectureCanvas
      architecture={architecture}
      utilization={utilization}
      edgeFlow={edgeFlow}
      playback={canvasPlayback}
      selection={selection}
      editable={editable}
      zoom={zoom}
      label="Architecture canvas"
      svgRef={svg}
      onSelect={setSelection}
      onChange={onChange}
      onMessage={setMessage}
    />
  )
  const inspectorProps = {
    architecture,
    builtArchitecture: run.builtArchitecture,
    lastTick,
    catalog,
    selection,
    onChange,
    onSelect: setSelection,
    onMessage: setMessage,
    knowledge,
    onOpenConcept: (conceptId: ConceptId) => store.getState().openLesson(conceptId),
  }
  const palette = <ComponentPalette catalog={catalog} onDrop={onDrop} onPlace={onPlace} />
  const inspector = <NodeInspector {...inspectorProps} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {wide && guide && <div className="max-h-[40dvh] shrink-0 overflow-y-auto border-b border-panel-line">{guide}</div>}

      <div className="flex min-h-0 flex-1 flex-col min-[900px]:grid min-[900px]:grid-cols-[13rem_minmax(0,1fr)_17rem]">
        {wide && <aside className="overflow-y-auto border-r border-panel-line p-4">{palette}</aside>}

        <main className={`flex min-h-0 min-w-0 flex-col ${editable ? 'flex-1' : 'h-[45dvh] shrink-0'}`}>
          <div className="border-b border-panel-line px-4 py-2">
            <ForecastLine forecast={forecast} lastPeakRps={lastTick?.peakRps} />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-panel-line px-4 py-2">
            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <button type="button" className={BUTTON} disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}>
                Zoom out
              </button>
              <span className="num w-12 text-center text-xs">{percent(zoom)}</span>
              <button type="button" className={BUTTON} disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}>
                Zoom in
              </button>
            </div>
            <p
              role="status"
              aria-live="polite"
              className={`min-w-0 flex-1 text-xs ${message?.tone === 'refusal' ? 'border-l-2 border-fault pl-2 text-ink-bright' : ''}`}
            >
              {message?.text}
            </p>
          </div>
          {/* The focus ring goes on the visible viewport. The SVG can be larger than its scroll area. */}
          <div className="min-h-0 flex-1 overflow-auto outline-flow has-[svg:focus-visible]:outline-2 has-[svg:focus-visible]:-outline-offset-2">
            {canvas}
          </div>
        </main>

        {wide && <aside className="overflow-y-auto border-l border-panel-line p-4">{inspector}</aside>}

        {/* Relative, so the sheets' screen-reader-only headings stay inside the scroll area. Pushed
            below the fold by the guide, they otherwise made the whole page scroll (ADR-0038). */}
        {!wide && editable && (
          <div className="relative max-h-[45dvh] shrink-0 overflow-y-auto border-t border-panel-line bg-panel-raised">
            {guide && <div className="border-b border-panel-line">{guide}</div>}
            <details open>
              <summary className={PANEL_HEADING}>Catalog</summary>
              <div className="px-4 pb-4">
                <ComponentPalette catalog={catalog} onDrop={onDrop} onPlace={onPlace} headingHidden />
              </div>
            </details>
            <details open className="border-t border-panel-line">
              <summary className={PANEL_HEADING}>Inspector</summary>
              <div className="px-4 pb-4">
                <NodeInspector {...inspectorProps} headingHidden />
              </div>
            </details>
          </div>
        )}

        {!editable && (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-t border-panel-line p-4">
            {guide && <div className="-mx-4 -mt-4 border-b border-panel-line">{guide}</div>}
            <section aria-labelledby="component-list-heading" className="flex flex-col gap-2">
              <h2 id="component-list-heading" className="text-sm font-medium text-ink-bright">
                On the canvas
              </h2>
              <ul className="flex flex-col gap-1">
                {architecture.nodes.map((node) => {
                  const selected = selection.kind === 'node' && selection.nodeId === node.id
                  const load = utilization[node.id]
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        className={`flex w-full justify-between rounded border px-3 py-2 text-left text-sm ${selected ? 'border-flow text-ink-bright' : 'border-panel-line'}`}
                        onClick={() => setSelection({ kind: 'node', nodeId: node.id })}
                      >
                        <span>{nodeName(architecture, node.id)}</span>
                        <span className="num text-xs">{load === undefined ? '—' : formatUtilization(load)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
            {inspector}
            {palette}
          </div>
        )}
      </div>

      <AdvanceBar
        architecture={architecture}
        plan={plan}
        refusal={refusal}
        busy={busy}
        onAdvance={onAdvance ?? (() => store.getState().advanceTurn())}
        buttonRef={advanceButtonRef}
      />
    </div>
  )
}
