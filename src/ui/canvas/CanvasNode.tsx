import { memo, type PointerEvent } from 'react'
import { COMPONENT_DEFS } from '../../content/components'
import type { ComponentNode, NodeId } from '../../engine'
import { formatUtilization } from '../format'
import { loadLevel, type LoadLevel } from './copy'
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

const FILL_CLASS: Readonly<Record<LoadLevel, string>> = {
  unknown: '',
  healthy: 'fill-flow',
  warning: 'fill-pressure',
  saturated: 'fill-fault',
}
// A dark outline behind node text keeps it readable over fills and the saturation hatch.
const HALO = { strokeWidth: 3, strokeLinejoin: 'round', paintOrder: 'stroke' } as const

const LEVEL_WORD = { unknown: 'no load measured yet', healthy: 'healthy', warning: 'under pressure', saturated: 'saturated' } as const

type LoadVisual = {
  readonly level: LoadLevel
  readonly fillY: number
  readonly fillHeight: number
  readonly fillClass: string
  readonly hatch: 'visible' | 'hidden'
  readonly reading: string
}

/**
 * How a node shows a utilization (0..1, or undefined before any turn has run). Rendering and
 * the turn animation both use it, so a finished animation leaves exactly what React drew.
 */
export function loadVisual(utilization: number | undefined): LoadVisual {
  const level = loadLevel(utilization)
  const fillHeight = utilization === undefined ? 0 : NODE_HEIGHT * utilization
  return {
    level,
    fillY: NODE_HEIGHT - fillHeight,
    fillHeight,
    fillClass: FILL_CLASS[level],
    hatch: level === 'saturated' ? 'visible' : 'hidden',
    reading: utilization === undefined ? '—' : `${level === 'saturated' ? '▲ ' : ''}${formatUtilization(utilization)}`,
  }
}

/** Paints a utilization onto a rendered node's group, for animation frames. */
export function paintLoad(group: SVGGElement, utilization: number | undefined): void {
  const visual = loadVisual(utilization)
  group.setAttribute('data-load', visual.level)
  const fill = group.querySelector('[data-part="fill"]')
  fill?.setAttribute('y', String(visual.fillY))
  fill?.setAttribute('height', String(visual.fillHeight))
  fill?.setAttribute('class', visual.fillClass)
  const hatch = group.querySelector('[data-part="hatch"]')
  hatch?.setAttribute('y', String(visual.fillY))
  hatch?.setAttribute('height', String(visual.fillHeight))
  hatch?.setAttribute('visibility', visual.hatch)
  const reading = group.querySelector('[data-part="reading"]')
  if (reading) reading.textContent = visual.reading
}

/**
 * One component on the canvas, drawn as a vessel: its utilization fills it from the
 * bottom (05-UI-DESIGN §4). Saturation is shown three ways, so it never relies on color
 * alone: red, hatched, and marked with ▲ (01-ARCHITECTURE §9). The load layers are always
 * present, so the turn animation only ever changes attributes.
 */
export const CanvasNode = memo(function CanvasNode(props: CanvasNodeProps) {
  const { node, name, domId, utilization, selected, connectSource, editable } = props
  const origin = nodeOrigin(node.position)
  const def = COMPONENT_DEFS[node.kind]
  const tierLabel = def.tiers[node.tier]?.label ?? ''
  const visual = loadVisual(utilization)
  const label = [name, tierLabel, utilization === undefined ? '' : `utilization ${formatUtilization(utilization)}`, LEVEL_WORD[visual.level]]
    .filter(Boolean)
    .join(', ')

  return (
    <g
      ref={(element) => props.register(node.id, element)}
      id={domId}
      role="group"
      aria-label={label}
      data-node-id={node.id}
      data-load={visual.level}
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
        <rect data-part="frame" width={NODE_WIDTH} height={NODE_HEIGHT} rx={4} className="fill-panel-raised stroke-panel-line" strokeWidth={1.5} />
        <g clipPath={`url(#${domId}-clip)`}>
          <rect data-part="fill" y={visual.fillY} width={NODE_WIDTH} height={visual.fillHeight} className={visual.fillClass} opacity={0.35} />
          <rect
            data-part="hatch"
            y={visual.fillY}
            width={NODE_WIDTH}
            height={visual.fillHeight}
            fill="url(#nines-hatch)"
            visibility={visual.hatch}
          />
        </g>
        <text x={10} y={24} className="fill-ink-bright stroke-panel-raised text-sm font-medium" {...HALO}>
          {name}
        </text>
        <text x={10} y={48} className="fill-ink stroke-panel-raised text-xs" {...HALO}>
          {tierLabel}
        </text>
        <text
          data-part="reading"
          x={NODE_WIDTH - 10}
          y={48}
          textAnchor="end"
          className="num fill-ink-bright stroke-panel-raised text-xs font-medium"
          {...HALO}
        >
          {visual.reading}
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
