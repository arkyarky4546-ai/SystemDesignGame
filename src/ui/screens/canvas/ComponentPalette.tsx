import { useId, useRef, type PointerEvent } from 'react'
import { COMPONENT_DEFS } from '../../../content/components'
import { CONCEPTS } from '../../../content/concepts'
import { COMPONENT_KINDS, type ComponentDef, type ComponentKind, type ConceptId } from '../../../content/schema'
import { hasPassed, type Knowledge, type PricedCatalog } from '../../../engine'
import { lockedTiers } from '../../../state/unlocks'
import { formatDollars } from '../../format'
import { capturePointer } from '../../pointer-capture'
import { LOCKED, lockedSizesLine } from '../learning/learning-copy'

type ComponentPaletteProps = {
  /** Tier prices, from the same catalog the turns resolve against. */
  readonly catalog: PricedCatalog
  /** A component dropped at a point on screen. The screen decides whether that point is on the canvas. */
  readonly onDrop: (kind: ComponentKind, client: { clientX: number; clientY: number }) => void
  /** Placed without a pointer: next to the selection, or in the first free cell. */
  readonly onPlace: (kind: ComponentKind) => void
  /** What the player has learned. A component or a size a concept still gates can't be placed. */
  readonly knowledge: Knowledge
  /** Opens the lesson a locked card names. */
  readonly onOpenConcept: (conceptId: ConceptId) => void
  /** Keeps the heading for screen readers only, where a surrounding sheet already shows it. */
  readonly headingHidden?: boolean
  /** The component definitions to show. Injectable, so a test can render a gated kind. */
  readonly defs?: Readonly<Record<ComponentKind, ComponentDef>>
}

// Screen pixels a press must travel before it counts as a drag.
const DRAG_THRESHOLD_PX = 5

const LINK = 'underline decoration-flow decoration-dotted underline-offset-4 hover:text-ink-bright'

type Drag = { kind: ComponentKind; pointerId: number; startX: number; startY: number; dragging: boolean }

/**
 * The catalog (05-UI-DESIGN §4): every component the player can place, with what its smallest
 * size costs. A component a concept still gates shows as a card naming that concept, with its
 * lesson one press away; a component whose larger sizes are gated says which sizes and by what
 * (00-GAME-DESIGN §4). You cannot buy your way past a concept, so the catalog says so rather
 * than hiding what exists.
 *
 * Dragging follows the pointer with a ghost moved directly in the DOM. A click or Enter places
 * the component without a drag.
 */
export function ComponentPalette({
  catalog,
  onDrop,
  onPlace,
  knowledge,
  onOpenConcept,
  headingHidden = false,
  defs = COMPONENT_DEFS,
}: ComponentPaletteProps) {
  const id = useId()
  const drag = useRef<Drag | null>(null)
  const ghost = useRef<HTMLDivElement | null>(null)
  const suppressClick = useRef(false)
  const placeable = COMPONENT_KINDS.map((kind) => defs[kind]).filter((def) => def.placeable)

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
          const gatedBy = def.gatedBy !== undefined && !hasPassed(knowledge, def.gatedBy) ? def.gatedBy : null
          if (gatedBy) {
            return (
              <li key={def.kind} className="w-full rounded border border-dashed border-panel-line px-3 py-2 text-sm">
                <p className="text-ink-bright">{def.displayName}</p>
                <p className="mt-1 text-xs leading-relaxed">
                  {LOCKED.componentLine(CONCEPTS[gatedBy].title)}{' '}
                  <button type="button" className={LINK} onClick={() => onOpenConcept(gatedBy)}>
                    {LOCKED.openLesson}
                  </button>
                </p>
              </li>
            )
          }
          const locked = lockedTiers(knowledge, def.kind)
          const lockedConcept = locked[0]?.gatedBy
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
              {lockedConcept && (
                <p className="mt-1 text-xs leading-relaxed">
                  {lockedSizesLine(
                    locked.map((tier) => tier.label),
                    CONCEPTS[lockedConcept].title,
                  )}{' '}
                  <button type="button" className={LINK} onClick={() => onOpenConcept(lockedConcept)}>
                    {LOCKED.openLesson}
                  </button>
                </p>
              )}
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
