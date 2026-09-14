import { useRef, type PointerEvent } from 'react'
import { COMPONENT_DEFS } from '../../../content/components'
import { COMPONENT_KINDS, type ComponentKind } from '../../../content/schema'

type ComponentPaletteProps = {
  /** A component dropped at a point on screen. The screen decides whether that point is on the canvas. */
  readonly onDrop: (kind: ComponentKind, client: { clientX: number; clientY: number }) => void
  /** Placed without a pointer: next to the selection, or in the first free cell. */
  readonly onPlace: (kind: ComponentKind) => void
}

// Screen pixels a press must travel before it counts as a drag.
const DRAG_THRESHOLD_PX = 5

type Drag = { kind: ComponentKind; pointerId: number; startX: number; startY: number; dragging: boolean }

/**
 * The components the player can place. M4 turns this into the full catalog with locked
 * items and prices. Dragging follows the pointer with a ghost moved directly in the DOM.
 * A click or Enter places the component without a drag.
 */
export function ComponentPalette({ onDrop, onPlace }: ComponentPaletteProps) {
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
    event.currentTarget.setPointerCapture?.(event.pointerId)
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
    <section aria-labelledby="palette-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="palette-heading" className="text-sm font-medium text-ink-bright">
          Components
        </h2>
        <p className="mt-1 text-xs leading-relaxed">Drag one onto the canvas, or press Enter to place it next to the selection.</p>
      </div>
      <ul className="flex flex-wrap gap-2 min-[900px]:flex-col">
        {placeable.map((def) => (
          <li key={def.kind}>
            <button
              type="button"
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
              {def.displayName}
            </button>
          </li>
        ))}
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
