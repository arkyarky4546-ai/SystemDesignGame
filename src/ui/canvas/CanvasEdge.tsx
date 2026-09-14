import { memo, type PointerEvent } from 'react'
import type { Edge } from '../../engine'

type CanvasEdgeProps = {
  readonly edge: Edge
  readonly edgeKey: string
  readonly path: string
  readonly label: string
  readonly selected: boolean
  readonly editable: boolean
  readonly register: (edgeKey: string, element: SVGGElement | null) => void
  readonly onPointerDown: (event: PointerEvent<SVGElement>, edge: Edge) => void
}

/** A connection, drawn as an orthogonal line with an arrowhead where requests arrive. */
export const CanvasEdge = memo(function CanvasEdge(props: CanvasEdgeProps) {
  const { edge, edgeKey, path, label, selected, editable } = props
  return (
    <g ref={(element) => props.register(edgeKey, element)} data-edge={edgeKey} aria-label={label} role="group">
      <path
        d={path}
        fill="none"
        className={selected ? 'stroke-flow' : 'stroke-panel-line'}
        strokeWidth={selected ? 3 : 2}
        markerEnd={selected ? 'url(#nines-arrow-selected)' : 'url(#nines-arrow)'}
      />
      {editable && (
        // A wide invisible stroke makes a 2px line easy to click.
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
