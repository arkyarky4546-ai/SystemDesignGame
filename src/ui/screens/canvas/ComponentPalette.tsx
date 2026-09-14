import { useId, useRef, type PointerEvent } from 'react'
import { COMPONENT_DEFS } from '../../../content/components'
import { COMPONENT_KINDS, type ComponentKind } from '../../../content/schema'
import type { PricedCatalog } from '../../../engine'
import { formatDollars } from '../../format'
import { capturePointer } from '../../pointer-capture'

type ComponentPaletteProps = {
  /** Tier prices, from the same catalog the turns resolve against. */
  readonly catalog: PricedCatalog
  /** A component dropped at a point on screen. The screen decides whether that point is on the canvas. */
  readonly onDrop: (kind: ComponentKind, client: { clientX: number; clientY: number }) => void
  /** Placed without a pointer: next to the selection, or in the first free cell. */
  readonly onPlace: (kind: ComponentKind) => void
  /** Keeps the heading for screen readers only, where a surrounding sheet already shows it. */
  readonly headingHidden?: boolean
}

// Screen pixels a press must travel before it counts as a drag.
const DRAG_THRESHOLD_PX = 5

type Drag = { kind: ComponentKind; pointerId: number; startX: number; startY: number; dragging: boolean }

/**
 * The catalog (05-UI-DESIGN §4): every component the player can place, with what its
 * smallest size costs. Locked components and their gating concepts arrive with concepts in
 * M6. Dragging follows the pointer with a ghost moved directly in the DOM. A click or Enter
 * places the component without a drag.
 */
export function ComponentPalette({ catalog, onDrop, onPlace, headingHidden = false }: ComponentPaletteProps) {
  const id = useId()
  const drag = useRef<Drag | null>(null)
  const ghost = useRef<HTMLDivElement | null>(null)
  const suppressClick = useRef(false)
  const placeable = COMPONENT_KINDS.map((kind) => COMPONENT_DEFS[kind]).filter((def) => def.placeable)

  const moveGhost = (event: PointerEvent<HTMLButtonElement>) => {
    if (ghost.current) ghost.current.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, kind: ComponentKind) => {
    if (event.button !== 0) return
    drag.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false }
    capturePointer(event.currentTarget, event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (!current.dragging) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD_PX) return
      current.dragging = true
      if (ghost.current) {
        ghost.current.textContent = COMPONENT_DEFS[current.kind].displayName
        ghost.current.hidden = false
      }
    }
    moveGhost(event)
  }

  const finish = (event: PointerEvent<HTMLButtonElement>, dropped: boolean) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (ghost.current) ghost.current.hidden = true
    if (!current.dragging) return
    // The click that follows a drag isn't a request to place a second component.
    suppressClick.current = true
    if (dropped) onDrop(current.kind, event)
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <div>
        <h2 id={`${id}-heading`} className={headingHidden ? 'sr-only' : 'text-sm font-medium text-ink-bright'}>
          Catalog
        </h2>
        <p className="mt-1 text-xs leading-relaxed">Drag one onto the canvas, or press Enter to place it next to the selection.</p>
      </div>
      <ul className="flex flex-wrap gap-2 min-[900px]:flex-col">
        {placeable.map((def) => {
          const smallest = def.kind === 'ingress' ? undefined : catalog[def.kind][0]
          const priceId = `${id}-${def.kind}-price`
          return (
            <li key={def.kind}>
              <button
                type="button"
                aria-label={def.displayName}
                aria-describedby={smallest ? priceId : undefined}
                className="w-full cursor-grab touch-none rounded border border-panel-line bg-panel-raised px-3 py-2 text-left text-sm text-ink-bright hover:border-flow"
                onPointerDown={(event) => onPointerDown(event, def.kind)}
                onPointerMove={onPointerMove}
                onPointerUp={(event) => finish(event, true)}
                onPointerCancel={(event) => finish(event, false)}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  onPlace(def.kind)
                }}
              >
                <span className="block">{def.displayName}</span>
                {smallest && (
                  <span id={priceId} className="num block text-xs text-ink">
                    from {formatDollars(smallest.setupCostCents)} setup, {formatDollars(smallest.runningCostPerTurnCents)} a week
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div
        ref={ghost}
        hidden
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-50 rounded border border-flow bg-panel-raised px-3 py-2 text-sm text-ink-bright"
      />
    </section>
  )
}
