import { BALANCE } from '../config/balance'
import { COMPONENT_DEFS } from '../content/components'
import {
  createsCycle,
  type Architecture,
  type ComponentKind,
  type ComponentNode,
  type Edge,
  type GridPosition,
  type NodeId,
  type Result,
} from '../engine'

// Build edits on an architecture: the operations the canvas commits (ADR-0029). Pure
// functions that return a new architecture or a typed refusal, so they're testable
// without a DOM and reusable by the balance harness.

export type ConnectionRefusal =
  | { readonly kind: 'unknown-node'; readonly nodeId: NodeId }
  | { readonly kind: 'self' }
  | { readonly kind: 'duplicate' }
  /** The component definitions forbid this pairing; `reason` is their player-facing explanation. */
  | { readonly kind: 'kinds'; readonly from: ComponentKind; readonly to: ComponentKind; readonly reason: string }
  | { readonly kind: 'cycle' }

export type EditRefusal =
  | { readonly kind: 'unknown-node'; readonly nodeId: NodeId }
  | { readonly kind: 'cell-taken'; readonly nodeId: NodeId }
  | { readonly kind: 'fixed-component'; readonly nodeId: NodeId }
  | { readonly kind: 'not-placeable'; readonly componentKind: ComponentKind }
  | { readonly kind: 'invalid-tier'; readonly nodeId: NodeId; readonly tier: number }
  | { readonly kind: 'connection-refused'; readonly refusal: ConnectionRefusal }

export type Edit<T = Architecture> = Result<T, EditRefusal>

export function findNode(architecture: Architecture, nodeId: NodeId): ComponentNode | undefined {
  return architecture.nodes.find((node) => node.id === nodeId)
}

export function nodeAt(architecture: Architecture, position: GridPosition): ComponentNode | undefined {
  return architecture.nodes.find((node) => node.position.col === position.col && node.position.row === position.row)
}

/**
 * The free cell nearest `near`: the cell itself, then each ring around it, scanning rows top
 * to bottom and columns left to right within a ring. Never returns a negative cell.
 */
export function nearestFreeCell(architecture: Architecture, near: GridPosition): GridPosition {
  for (let ring = 0; ; ring++) {
    for (let row = near.row - ring; row <= near.row + ring; row++) {
      for (let col = near.col - ring; col <= near.col + ring; col++) {
        const onRing = Math.max(Math.abs(row - near.row), Math.abs(col - near.col)) === ring
        if (!onRing || row < 0 || col < 0) continue
        if (!nodeAt(architecture, { col, row })) return { col, row }
      }
    }
  }
}

/** An unused id for a new node: `app-server-1`, then `app-server-2`, and so on. */
export function nextNodeId(architecture: Architecture, kind: ComponentKind): NodeId {
  const taken = new Set(architecture.nodes.map((node) => node.id))
  for (let index = 1; ; index++) {
    const candidate = `${kind}-${index}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Places a new component at its base tier. Refuses kinds the player can't place and occupied cells. */
export function placeNode(
  architecture: Architecture,
  componentKind: ComponentKind,
  position: GridPosition,
): Edit<{ readonly architecture: Architecture; readonly nodeId: NodeId }> {
  if (!COMPONENT_DEFS[componentKind].placeable) return refuse({ kind: 'not-placeable', componentKind })
  const occupant = nodeAt(architecture, position)
  if (occupant) return refuse({ kind: 'cell-taken', nodeId: occupant.id })
  const nodeId = nextNodeId(architecture, componentKind)
  const node = newNode(componentKind, nodeId, position)
  return { ok: true, value: { architecture: { ...architecture, nodes: [...architecture.nodes, node] }, nodeId } }
}

function newNode(kind: ComponentKind, id: NodeId, position: GridPosition): ComponentNode {
  switch (kind) {
    case 'app-server':
      return { id, kind, replicas: 1, tier: 0, config: { fanoutFactor: BALANCE.starter.appFanoutFactor }, position }
    case 'ingress':
      return { id, kind, replicas: 1, tier: 0, config: {}, position }
    case 'database':
      return { id, kind, replicas: 1, tier: 0, config: {}, position }
  }
}

/** Moves a node to another cell. Moving onto itself changes nothing; onto another node is refused. */
export function moveNode(architecture: Architecture, nodeId: NodeId, position: GridPosition): Edit {
  if (!findNode(architecture, nodeId)) return refuse({ kind: 'unknown-node', nodeId })
  const occupant = nodeAt(architecture, position)
  if (occupant && occupant.id !== nodeId) return refuse({ kind: 'cell-taken', nodeId: occupant.id })
  return updateNode(architecture, nodeId, (node) => ({ ...node, position }))
}

/** Removes a node and every connection touching it. Ingress can't be removed. */
export function removeNode(architecture: Architecture, nodeId: NodeId): Edit {
  const node = findNode(architecture, nodeId)
  if (!node) return refuse({ kind: 'unknown-node', nodeId })
  if (!COMPONENT_DEFS[node.kind].placeable) return refuse({ kind: 'fixed-component', nodeId })
  return {
    ok: true,
    value: {
      nodes: architecture.nodes.filter((other) => other.id !== nodeId),
      edges: architecture.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    },
  }
}

/**
 * Why `from → to` can't be connected, or null if it can. Checks, in order: both nodes
 * exist, it isn't a self-loop or a duplicate, the component definitions allow the pairing,
 * and it wouldn't close a loop (02-SIMULATION §4 rejects cycles at build time).
 */
export function connectionRefusal(architecture: Architecture, from: NodeId, to: NodeId): ConnectionRefusal | null {
  const source = findNode(architecture, from)
  if (!source) return { kind: 'unknown-node', nodeId: from }
  const target = findNode(architecture, to)
  if (!target) return { kind: 'unknown-node', nodeId: to }
  if (from === to) return { kind: 'self' }
  if (architecture.edges.some((edge) => edge.from === from && edge.to === to)) return { kind: 'duplicate' }

  const rules = COMPONENT_DEFS[source.kind].validConnections
  const allowed =
    rules.downstream.includes(target.kind) && COMPONENT_DEFS[target.kind].validConnections.upstream.includes(source.kind)
  if (!allowed) {
    return { kind: 'kinds', from: source.kind, to: target.kind, reason: rules.refusedDownstream[target.kind] ?? '' }
  }
  return createsCycle(architecture.edges, from, to) ? { kind: 'cycle' } : null
}

export function connect(architecture: Architecture, from: NodeId, to: NodeId): Edit {
  const refusal = connectionRefusal(architecture, from, to)
  if (refusal) return refuse({ kind: 'connection-refused', refusal })
  return { ok: true, value: { ...architecture, edges: [...architecture.edges, { from, to }] } }
}

/** Removes one connection. Removing one that doesn't exist changes nothing. */
export function disconnect(architecture: Architecture, target: Edge): Architecture {
  return {
    ...architecture,
    edges: architecture.edges.filter((edge) => edge.from !== target.from || edge.to !== target.to),
  }
}

/** Sets a node's size, an index into its definition's tiers. */
export function setTier(architecture: Architecture, nodeId: NodeId, tier: number): Edit {
  const node = findNode(architecture, nodeId)
  if (!node) return refuse({ kind: 'unknown-node', nodeId })
  if (!Number.isInteger(tier) || tier < 0 || tier >= COMPONENT_DEFS[node.kind].tiers.length) {
    return refuse({ kind: 'invalid-tier', nodeId, tier })
  }
  return updateNode(architecture, nodeId, (current) => ({ ...current, tier }))
}

function updateNode(
  architecture: Architecture,
  nodeId: NodeId,
  update: (node: ComponentNode) => ComponentNode,
): Edit {
  return {
    ok: true,
    value: { ...architecture, nodes: architecture.nodes.map((node) => (node.id === nodeId ? update(node) : node)) },
  }
}

function refuse(error: EditRefusal): Result<never, EditRefusal> {
  return { ok: false, error }
}
