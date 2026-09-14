import { useCallback, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { COMPONENT_DEFS } from '../../../content/components'
import type { ComponentKind } from '../../../content/schema'
import type { Architecture, NodeId } from '../../../engine'
import { findNode, nearestFreeCell, placeNode } from '../../../state/architecture'
import type { GameStore } from '../../../state/store'
import { ArchitectureCanvas, canvasPoint, type CanvasMessage, type CanvasSelection } from '../../canvas/ArchitectureCanvas'
import { describeEditRefusal, nodeName, percent } from '../../canvas/copy'
import { cellAt } from '../../canvas/geometry'
import { useMediaQuery } from '../../use-media-query'
import { ComponentPalette } from './ComponentPalette'
import { NodeInspector } from './NodeInspector'

const NO_UTILIZATION: Readonly<Record<NodeId, number>> = {}
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const PANEL_HEADING = 'cursor-pointer px-4 py-2 text-sm font-medium text-ink-bright'
const BUTTON = 'rounded border border-panel-line px-2 py-1 text-xs text-ink-bright hover:border-flow disabled:opacity-50'

/**
 * The canvas screen (05-UI-DESIGN §4) as far as M3 builds it: component palette, canvas and
 * inspector. The layout follows §9's breakpoints:
 * - 900px and up: three columns.
 * - 600–899px: the canvas gets the full width, with palette and inspector in bottom sheets.
 * - Below 600px: the canvas is pan and zoom only, and editing happens in a component list.
 *
 * Status bar, forecast and Advance arrive in M4.
 */
export function CanvasScreen({ store }: { readonly store: StoreApi<GameStore> }) {
  const run = useStore(store, (state) => state.run)
  const [selection, setSelection] = useState<CanvasSelection>({ kind: 'none' })
  const [message, setMessage] = useState<CanvasMessage | null>(null)
  const [zoom, setZoom] = useState(1)
  const wide = useMediaQuery('(min-width: 900px)', true)
  const editable = useMediaQuery('(min-width: 600px)', true)
  const svg = useRef<SVGSVGElement | null>(null)

  const onChange = useCallback(
    (architecture: Architecture, announcement: string) => {
      store.getState().setArchitecture(architecture)
      setMessage({ tone: 'info', text: announcement })
    },
    [store],
  )

  if (!run) return <p className="p-4 text-sm">No run in progress.</p>
  const architecture = run.architecture
  const utilization = run.history.at(-1)?.utilization ?? NO_UTILIZATION

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
  const palette = <ComponentPalette onDrop={onDrop} onPlace={onPlace} />
  const inspector = (
    <NodeInspector
      architecture={architecture}
      utilization={utilization}
      selection={selection}
      onChange={onChange}
      onSelect={setSelection}
      onMessage={setMessage}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col min-[900px]:grid min-[900px]:grid-cols-[13rem_minmax(0,1fr)_17rem]">
      {wide && <aside className="overflow-y-auto border-r border-panel-line p-4">{palette}</aside>}

      <main className={`flex min-h-0 min-w-0 flex-col ${editable ? 'flex-1' : 'h-[45dvh] shrink-0'}`}>
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
        <div className="min-h-0 flex-1 overflow-auto">{canvas}</div>
      </main>

      {wide && <aside className="overflow-y-auto border-l border-panel-line p-4">{inspector}</aside>}

      {!wide && editable && (
        <div className="max-h-[45dvh] shrink-0 overflow-y-auto border-t border-panel-line bg-panel-raised">
          <details open>
            <summary className={PANEL_HEADING}>Components</summary>
            <div className="px-4 pb-4">{palette}</div>
          </details>
          <details open className="border-t border-panel-line">
            <summary className={PANEL_HEADING}>Inspector</summary>
            <div className="px-4 pb-4">{inspector}</div>
          </details>
        </div>
      )}

      {!editable && (
        <div className="flex flex-col gap-6 overflow-y-auto border-t border-panel-line p-4">
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
                      <span className="num text-xs">{load === undefined ? '—' : percent(load)}</span>
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
  )
}
