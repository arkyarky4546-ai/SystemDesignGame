import { memo, type PointerEvent } from 'react'
import { COMPONENT_DEFS } from '../../content/components'
import type { ComponentNode, NodeId } from '../../engine'
import { loadLevel, percent } from './copy'
import { NODE_HEIGHT, NODE_WIDTH, nodeOrigin } from './geometry'

type CanvasNodeProps = {
  readonly node: ComponentNode
  readonly name: string
  readonly domId: string
  readonly utilization: number | undefined
  readonly selected: boolean
  readonly connectSource: boolean
  readonly editable: boolean
  readonly register: (nodeId: NodeId, element: SVGGElement | null) => void
  readonly onBodyPointerDown: (event: PointerEvent<SVGElement>, nodeId: NodeId) => void
  readonly onPortPointerDown: (event: PointerEvent<SVGElement>, nodeId: NodeId) => void
}

const FILL_CLASS = { unknown: '', healthy: 'fill-flow', warning: 'fill-pressure', saturated: 'fill-fault' } as const
// A dark outline behind node text keeps it readable over fills and the saturation hatch.
const HALO = { strokeWidth: 3, strokeLinejoin: 'round', paintOrder: 'stroke' } as const

const LEVEL_WORD ={ unknown: 'no load measured yet', healthy: 'healthy', warning: 'under pressure', saturated: 'saturated' } as const

/**
 * One component on the canvas, drawn as a vessel: its utilization fills it from the
 * bottom (05-UI-DESIGN §4). Saturation is shown three ways, so it never relies on color
 * alone: red, hatched, and marked with ▲ (01-ARCHITECTURE §9).
 */
export const CanvasNode = memo(function CanvasNode(props: CanvasNodeProps) {
  const { node, name, domId, utilization, selected, connectSource, editable } = props
  const origin = nodeOrigin(node.position)
  const def = COMPONENT_DEFS[node.kind]
  const tierLabel = def.tiers[node.tier]?.label ?? ''
  const level = loadLevel(utilization)
  const fillHeight = utilization === undefined ? 0 : NODE_HEIGHT * utilization
  const reading = utilization === undefined ? '—' : `${level === 'saturated' ? '▲ ' : ''}${percent(utilization)}`
  const label = [name, tierLabel, utilization === undefined ? '' : `utilization ${percent(utilization)}`, LEVEL_WORD[level]]
    .filter(Boolean)
    .join(', ')

  return (
    <g
      ref={(element) => props.register(node.id, element)}
      id={domId}
      role="group"
      aria-label={label}
      data-node-id={node.id}
      data-load={level}
      transform={`translate(${origin.x} ${origin.y})`}
    >
      <clipPath id={`${domId}-clip`}>
        <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={4} />
      </clipPath>
      <g
        data-part="body"
        className={editable ? 'cursor-grab' : undefined}
        onPointerDown={(event) => props.onBodyPointerDown(event, node.id)}
      >
        <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={4} className="fill-panel-raised stroke-panel-line" strokeWidth={1.5} />
        {fillHeight > 0 && (
          <g clipPath={`url(#${domId}-clip)`}>
            <rect y={NODE_HEIGHT - fillHeight} width={NODE_WIDTH} height={fillHeight} className={FILL_CLASS[level]} opacity={0.35} />
            {level === 'saturated' && (
              <rect y={NODE_HEIGHT - fillHeight} width={NODE_WIDTH} height={fillHeight} fill="url(#nines-hatch)" />
            )}
          </g>
        )}
        <text x={10} y={24} className="fill-ink-bright stroke-panel-raised text-sm font-medium" {...HALO}>
          {name}
        </text>
        <text x={10} y={48} className="fill-ink stroke-panel-raised text-xs" {...HALO}>
          {tierLabel}
        </text>
        <text x={NODE_WIDTH - 10} y={48} textAnchor="end" className="num fill-ink-bright stroke-panel-raised text-xs font-medium" {...HALO}>
          {reading}
        </text>
      </g>
      {selected && (
        <rect x={-5} y={-5} width={NODE_WIDTH + 10} height={NODE_HEIGHT + 10} rx={7} fill="none" className="stroke-flow" strokeWidth={2} />
      )}
      {connectSource && (
        <rect
          x={-9}
          y={-9}
          width={NODE_WIDTH + 18}
          height={NODE_HEIGHT + 18}
          rx={9}
          fill="none"
          className="stroke-flow"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      )}
      {editable && def.validConnections.downstream.length > 0 && (
        <circle
          cx={NODE_WIDTH / 2}
          cy={NODE_HEIGHT}
          r={7}
          className="cursor-crosshair fill-panel-void stroke-flow"
          strokeWidth={2}
          data-port="out"
          onPointerDown={(event) => props.onPortPointerDown(event, node.id)}
        />
      )}
    </g>
  )
})
