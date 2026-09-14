import { scaleLog } from 'd3-scale'
import { memo, type PointerEvent } from 'react'
import type { Edge } from '../../engine'

type CanvasEdgeProps = {
  readonly edge: Edge
  readonly edgeKey: string
  readonly path: string
  readonly label: string
  /** Load the edge carried at peak last week, rps. Undefined when it didn't run. */
  readonly flowRps: number | undefined
  readonly selected: boolean
  readonly editable: boolean
  readonly register: (edgeKey: string, element: SVGGElement | null) => void
  readonly onPointerDown: (event: PointerEvent<SVGElement>, edge: Edge) => void
}

// Stroke weight follows throughput (05-UI-DESIGN §4), on a log scale because traffic grows
// through several orders of magnitude over a run. Canvas units.
const MIN_WIDTH = 1.5
const MAX_WIDTH = 7
const UNMEASURED_WIDTH = 2
const WIDTH_BY_RPS = scaleLog().domain([1, 100_000]).range([MIN_WIDTH, MAX_WIDTH]).clamp(true)

/** Stroke width for an edge carrying `rps` at peak, in canvas units. */
export function edgeWidth(rps: number | undefined): number {
  if (rps === undefined) return UNMEASURED_WIDTH
  return rps >= 1 ? WIDTH_BY_RPS(rps) : MIN_WIDTH
}

/**
 * A connection, drawn as an orthogonal line with an arrowhead where requests arrive. A
 * dashed overlay is shown while a turn resolves, moving toward the target to show load
 * flowing (index.css).
 */
export const CanvasEdge = memo(function CanvasEdge(props: CanvasEdgeProps) {
  const { edge, edgeKey, path, label, selected, editable } = props
  const width = edgeWidth(props.flowRps)
  return (
    <g ref={(element) => props.register(edgeKey, element)} data-edge={edgeKey} aria-label={label} role="group">
      <path
        data-part="line"
        d={path}
        fill="none"
        className={selected ? 'stroke-flow' : 'stroke-panel-line'}
        strokeWidth={selected ? width + 1 : width}
        markerEnd={selected ? 'url(#nines-arrow-selected)' : 'url(#nines-arrow)'}
      />
      <path data-part="flow" d={path} fill="none" className="stroke-flow" strokeWidth={width} pointerEvents="none" />
      {editable && (
        // A wide invisible stroke makes a thin line easy to click.
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          className="cursor-pointer"
          onPointerDown={(event) => props.onPointerDown(event, edge)}
        />
      )}
    </g>
  )
})
