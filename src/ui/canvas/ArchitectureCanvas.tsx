import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react'
import { COMPONENT_DEFS } from '../../content/components'
import type { Architecture, ComponentNode, Edge, NodeId } from '../../engine'
import {
  connect,
  connectionRefusal,
  disconnect,
  findNode,
  moveNode,
  nodeAt,
  removeNode,
  type Edit,
} from '../../state/architecture'
import { capturePointer } from '../pointer-capture'
import { CanvasEdge } from './CanvasEdge'
import { CanvasNode } from './CanvasNode'
import { describeConnectionRefusal, describeEditRefusal, nodeName } from './copy'
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  cellAt,
  edgePath,
  gridSize,
  nodeOrigin,
  outPort,
  type Point,
} from './geometry'

export type CanvasSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'node'; readonly nodeId: NodeId }
  | { readonly kind: 'edge'; readonly edge: Edge }

export type CanvasMessage = { readonly tone: 'info' | 'refusal'; readonly text: string }

export type ArchitectureCanvasProps = {
  readonly architecture: Architecture
  /** Peak utilization per node, 0..1. Missing until a turn has run. */
  readonly utilization: Readonly<Record<NodeId, number>>
  readonly selection: CanvasSelection
  /** False for pan-and-zoom only: nothing can be moved, connected or removed here. */
  readonly editable: boolean
  readonly zoom: number
  readonly label: string
  readonly svgRef?: Ref<SVGSVGElement>
  readonly onSelect: (selection: CanvasSelection) => void
  /** A committed edit, with a sentence describing it for the live region. */
  readonly onChange: (architecture: Architecture, announcement: string) => void
  readonly onMessage: (message: CanvasMessage) => void
}

// A press that moves less than this far, in canvas units, is a click rather than a drag.
const DRAG_THRESHOLD = 4

type Gesture =
  | { kind: 'move'; nodeId: NodeId; pointerId: number; grab: Point; start: Point; latest: Point; moved: boolean }
  | { kind: 'connect'; from: NodeId; pointerId: number; latest: Point }

/** Converts a pointer's client coordinates into canvas units. */
export function canvasPoint(svg: SVGSVGElement, client: { clientX: number; clientY: number }, zoom: number): Point {
  const rect = svg.getBoundingClientRect()
  return { x: (client.clientX - rect.left) / zoom, y: (client.clientY - rect.top) / zoom }
}

export const edgeKey = (edge: Edge): string => JSON.stringify([edge.from, edge.to])

/**
 * The architecture canvas (M3): grid-snapped SVG nodes and orthogonal edges.
 *
 * A drag lives in refs and is painted straight onto the SVG once per animation frame.
 * Nothing reaches React or the store until the pointer is released (01-ARCHITECTURE §8),
 * so a drag re-renders nothing. Every mouse action has a keyboard equivalent
 * (01-ARCHITECTURE §9).
 */
export function ArchitectureCanvas(props: ArchitectureCanvasProps) {
  const { architecture, utilization, selection, editable, zoom } = props
  const prefix = `canvas${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  const svgElement = useRef<SVGSVGElement | null>(null)
  const nodeElements = useRef(new Map<NodeId, SVGGElement>())
  const edgeElements = useRef(new Map<string, SVGGElement>())
  const rubberBand = useRef<SVGPathElement | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef<number | null>(null)
  const [connectFrom, setConnectFrom] = useState<NodeId | null>(null)

  const setSvg = useCallback(
    (element: SVGSVGElement | null) => {
      svgElement.current = element
      const external = props.svgRef
      if (typeof external === 'function') external(element)
      else if (external) external.current = element
    },
    [props.svgRef],
  )

  const registerNode = useCallback((nodeId: NodeId, element: SVGGElement | null) => {
    if (element) nodeElements.current.set(nodeId, element)
    else nodeElements.current.delete(nodeId)
  }, [])

  const registerEdge = useCallback((key: string, element: SVGGElement | null) => {
    if (element) edgeElements.current.set(key, element)
    else edgeElements.current.delete(key)
  }, [])

  // Paints a node at an arbitrary origin, with its edges, straight onto the SVG.
  const paintNode = useCallback((nodeId: NodeId, origin: Point) => {
    const { architecture: current } = latest.current
    nodeElements.current.get(nodeId)?.setAttribute('transform', `translate(${origin.x} ${origin.y})`)
    const originOf = (id: NodeId): Point => {
      const node = findNode(current, id)
      return id === nodeId || !node ? origin : nodeOrigin(node.position)
    }
    for (const edge of current.edges) {
      if (edge.from !== nodeId && edge.to !== nodeId) continue
      const d = edgePath(originOf(edge.from), originOf(edge.to))
      edgeElements.current.get(edgeKey(edge))?.querySelectorAll('path').forEach((path) => path.setAttribute('d', d))
    }
  }, [])

  // Puts a dragged node back where React last drew it, so the next render starts clean.
  const restoreNode = useCallback(
    (nodeId: NodeId) => {
      const node = findNode(latest.current.architecture, nodeId)
      if (node) paintNode(nodeId, nodeOrigin(node.position))
    },
    [paintNode],
  )

  const paintGesture = useCallback(() => {
    frame.current = null
    const current = gesture.current
    if (!current) return
    if (current.kind === 'move') {
      paintNode(current.nodeId, { x: current.latest.x - current.grab.x, y: current.latest.y - current.grab.y })
      return
    }
    const source = findNode(latest.current.architecture, current.from)
    if (!source || !rubberBand.current) return
    const start = outPort(nodeOrigin(source.position))
    rubberBand.current.setAttribute('d', `M ${start.x} ${start.y} L ${current.latest.x} ${current.latest.y}`)
    rubberBand.current.style.display = ''
  }, [paintNode])

  const endGesture = useCallback((pointerId: number) => {
    gesture.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const svg = svgElement.current
    if (svg?.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId)
    if (rubberBand.current) rubberBand.current.style.display = 'none'
  }, [])

  const commit = useCallback((edit: Edit, announcement: string, then?: CanvasSelection) => {
    const { architecture: current, onChange, onMessage, onSelect } = latest.current
    if (!edit.ok) {
      onMessage({ tone: 'refusal', text: describeEditRefusal(edit.error, current) })
      return
    }
    onChange(edit.value, announcement)
    if (then) onSelect(then)
  }, [])

  const tryConnect = useCallback(
    (from: NodeId, to: NodeId) => {
      const { architecture: current, onMessage } = latest.current
      const refusal = connectionRefusal(current, from, to)
      if (refusal) {
        onMessage({ tone: 'refusal', text: describeConnectionRefusal(refusal, current, from, to) })
        return
      }
      // Selection stays on the target, where a keyboard user just navigated to.
      commit(connect(current, from, to), `Connected ${nodeName(current, from)} to ${nodeName(current, to)}.`, {
        kind: 'node',
        nodeId: to,
      })
    },
    [commit],
  )

  const onBodyPointerDown = useCallback((event: PointerEvent<SVGElement>, nodeId: NodeId) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const svg = svgElement.current
    const node = findNode(latest.current.architecture, nodeId)
    if (!svg || !node) return
    if (!latest.current.editable) {
      latest.current.onSelect({ kind: 'node', nodeId })
      return
    }
    const point = canvasPoint(svg, event, latest.current.zoom)
    const origin = nodeOrigin(node.position)
    gesture.current = {
      kind: 'move',
      nodeId,
      pointerId: event.pointerId,
      grab: { x: point.x - origin.x, y: point.y - origin.y },
      start: point,
      latest: point,
      moved: false,
    }
    capturePointer(svg, event.pointerId)
  }, [])

  const onPortPointerDown = useCallback(
    (event: PointerEvent<SVGElement>, nodeId: NodeId) => {
      if (event.button !== 0) return
      event.stopPropagation()
      const svg = svgElement.current
      if (!svg) return
      gesture.current = { kind: 'connect', from: nodeId, pointerId: event.pointerId, latest: canvasPoint(svg, event, latest.current.zoom) }
      capturePointer(svg, event.pointerId)
      paintGesture()
    },
    [paintGesture],
  )

  const onEdgePointerDown = useCallback((event: PointerEvent<SVGElement>, edge: Edge) => {
    if (event.button !== 0) return
    event.stopPropagation()
    latest.current.onSelect({ kind: 'edge', edge })
  }, [])

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    current.latest = canvasPoint(event.currentTarget, event, zoom)
    if (current.kind === 'move' && !current.moved) {
      if (Math.hypot(current.latest.x - current.start.x, current.latest.y - current.start.y) < DRAG_THRESHOLD) return
      current.moved = true
    }
    frame.current ??= requestAnimationFrame(paintGesture)
  }

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const point = canvasPoint(event.currentTarget, event, zoom)
    endGesture(event.pointerId)

    if (current.kind === 'move') {
      restoreNode(current.nodeId)
      if (!current.moved) {
        props.onSelect({ kind: 'node', nodeId: current.nodeId })
        return
      }
      const center = { x: point.x - current.grab.x + NODE_WIDTH / 2, y: point.y - current.grab.y + NODE_HEIGHT / 2 }
      const node = findNode(architecture, current.nodeId)
      const cell = cellAt(center)
      if (node && node.position.col === cell.col && node.position.row === cell.row) return
      commit(moveNode(architecture, current.nodeId, cell), `Moved ${nodeName(architecture, current.nodeId)}.`, {
        kind: 'node',
        nodeId: current.nodeId,
      })
      return
    }

    const target = nodeUnder(architecture, point)
    if (target && target.id !== current.from) tryConnect(current.from, target.id)
  }

  const onPointerCancel = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    endGesture(event.pointerId)
    if (current.kind === 'move') restoreNode(current.nodeId)
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const selected = selection.kind === 'node' ? findNode(architecture, selection.nodeId) : undefined
    const direction = ARROWS[event.key]
    if (direction) {
      event.preventDefault()
      if (event.shiftKey && editable && selected) {
        const cell = { col: selected.position.col + direction.col, row: selected.position.row + direction.row }
        if (cell.col < 0 || cell.row < 0) {
          props.onMessage({ tone: 'refusal', text: 'That’s the edge of the canvas. Move the component another way.' })
          return
        }
        commit(moveNode(architecture, selected.id, cell), `Moved ${nodeName(architecture, selected.id)}.`)
        return
      }
      // With a connection selected, arrows continue from the component it points at.
      const from = selected ?? (selection.kind === 'edge' ? findNode(architecture, selection.edge.to) : undefined)
      const next = from ? nearestInDirection(architecture.nodes, from, direction) : architecture.nodes[0]
      if (next) props.onSelect({ kind: 'node', nodeId: next.id })
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      if (connectFrom) {
        setConnectFrom(null)
        props.onMessage({ tone: 'info', text: 'Connection cancelled.' })
      } else {
        props.onSelect({ kind: 'none' })
      }
      return
    }

    if (!editable) return

    if (event.key === 'Enter') {
      event.preventDefault()
      if (!selected) return
      if (connectFrom === null) {
        const name = nodeName(architecture, selected.id)
        if (COMPONENT_DEFS[selected.kind].validConnections.downstream.length === 0) {
          props.onMessage({
            tone: 'refusal',
            text: `${name} doesn’t send requests anywhere. Select the component requests come from, then press Enter.`,
          })
          return
        }
        setConnectFrom(selected.id)
        props.onMessage({
          tone: 'info',
          text: `Connecting from ${name}. Select a target with the arrow keys and press Enter, or press Escape to cancel.`,
        })
        return
      }
      setConnectFrom(null)
      if (selected.id === connectFrom) {
        props.onMessage({ tone: 'info', text: 'Connection cancelled.' })
        return
      }
      tryConnect(connectFrom, selected.id)
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      if (selected) {
        commit(removeNode(architecture, selected.id), `Removed ${nodeName(architecture, selected.id)}.`, { kind: 'none' })
      } else if (selection.kind === 'edge') {
        const { from, to } = selection.edge
        props.onChange(
          disconnect(architecture, selection.edge),
          `Disconnected ${nodeName(architecture, from)} from ${nodeName(architecture, to)}.`,
        )
        props.onSelect({ kind: 'none' })
      }
    }
  }

  const { cols, rows } = gridSize(architecture)
  const width = cols * CELL_WIDTH
  const height = rows * CELL_HEIGHT
  const domIds = useMemo(
    () => new Map(architecture.nodes.map((node, index) => [node.id, `${prefix}-node-${index}`])),
    [architecture.nodes, prefix],
  )
  const selectedNodeId = selection.kind === 'node' ? selection.nodeId : null
  const selectedEdgeKey = selection.kind === 'edge' ? edgeKey(selection.edge) : null

  return (
    <svg
      ref={setSvg}
      role="application"
      aria-label={props.label}
      aria-describedby={`${prefix}-help`}
      aria-activedescendant={selectedNodeId ? domIds.get(selectedNodeId) : undefined}
      tabIndex={0}
      width={width * zoom}
      height={height * zoom}
      viewBox={`0 0 ${width} ${height}`}
      className="block touch-none select-none"
      data-connecting={connectFrom ?? undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <desc id={`${prefix}-help`}>
        {editable
          ? 'Arrow keys select a component. Shift and an arrow key moves it one cell. Enter starts a connection from the selection, and Enter again connects it to the new selection. Delete removes the selection. Escape cancels.'
          : 'Arrow keys select a component. Editing happens in the component list.'}
      </desc>
      <defs>
        <pattern id="nines-grid" width={CELL_WIDTH} height={CELL_HEIGHT} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL_WIDTH} 0 V ${CELL_HEIGHT} H 0`} fill="none" className="stroke-panel-line" strokeWidth={0.5} opacity={0.5} />
        </pattern>
        <pattern id="nines-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={8} className="stroke-fault" strokeWidth={3} />
        </pattern>
        <marker id="nines-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-panel-line" />
        </marker>
        <marker id="nines-arrow-selected" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-flow" />
        </marker>
      </defs>
      <rect
        width={width}
        height={height}
        className="fill-panel-void"
        onPointerDown={() => props.onSelect({ kind: 'none' })}
      />
      <rect width={width} height={height} fill="url(#nines-grid)" pointerEvents="none" />
      {architecture.edges.map((edge) => {
        const from = findNode(architecture, edge.from)
        const to = findNode(architecture, edge.to)
        if (!from || !to) return null
        const key = edgeKey(edge)
        return (
          <CanvasEdge
            key={key}
            edge={edge}
            edgeKey={key}
            path={edgePath(nodeOrigin(from.position), nodeOrigin(to.position))}
            label={`${nodeName(architecture, edge.from)} sends requests to ${nodeName(architecture, edge.to)}`}
            selected={key === selectedEdgeKey}
            editable={editable}
            register={registerEdge}
            onPointerDown={onEdgePointerDown}
          />
        )
      })}
      {architecture.nodes.map((node) => (
        <CanvasNode
          key={node.id}
          node={node}
          name={nodeName(architecture, node.id)}
          domId={domIds.get(node.id) ?? node.id}
          utilization={utilization[node.id]}
          selected={node.id === selectedNodeId}
          connectSource={node.id === connectFrom}
          editable={editable}
          register={registerNode}
          onBodyPointerDown={onBodyPointerDown}
          onPortPointerDown={onPortPointerDown}
        />
      ))}
      <path
        ref={rubberBand}
        fill="none"
        className="stroke-flow"
        strokeWidth={2}
        strokeDasharray="6 4"
        pointerEvents="none"
        style={{ display: 'none' }}
      />
    </svg>
  )
}

const ARROWS: Readonly<Record<string, { readonly col: number; readonly row: number }>> = {
  ArrowUp: { col: 0, row: -1 },
  ArrowDown: { col: 0, row: 1 },
  ArrowLeft: { col: -1, row: 0 },
  ArrowRight: { col: 1, row: 0 },
}

/** The node under a canvas point, if the point is inside its box rather than the gutter. */
function nodeUnder(architecture: Architecture, point: Point): ComponentNode | undefined {
  const node = nodeAt(architecture, cellAt(point))
  if (!node) return undefined
  const origin = nodeOrigin(node.position)
  const inside = point.x >= origin.x && point.x <= origin.x + NODE_WIDTH && point.y >= origin.y && point.y <= origin.y + NODE_HEIGHT
  return inside ? node : undefined
}

/**
 * The closest node in an arrow's direction. Distance along the arrow counts once and
 * sideways distance twice, so straight ahead wins over a diagonal. Ties go to node order.
 */
export function nearestInDirection(
  nodes: readonly ComponentNode[],
  from: ComponentNode,
  direction: { readonly col: number; readonly row: number },
): ComponentNode | undefined {
  let best: ComponentNode | undefined
  let bestScore = Infinity
  for (const node of nodes) {
    if (node.id === from.id) continue
    const dCol = node.position.col - from.position.col
    const dRow = node.position.row - from.position.row
    const ahead = dCol * direction.col + dRow * direction.row
    if (ahead <= 0) continue
    const sideways = Math.abs(direction.col === 0 ? dCol : dRow)
    const score = ahead + 2 * sideways
    if (score < bestScore) {
      best = node
      bestScore = score
    }
  }
  return best
}
