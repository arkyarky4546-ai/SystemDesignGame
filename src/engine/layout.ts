import type { Edge, GridPosition, NodeId } from './types'

const ORIGIN: GridPosition = { col: 0, row: 0 }

/**
 * Lays nodes out top to bottom in the direction requests flow, for architectures that have
 * no positions yet (ADR-0028). A node's row is the length of the longest path reaching it
 * from a node nothing points at. Nodes that share a row take columns in declaration order.
 * Nodes on a cycle go together in the row below everything else.
 *
 * Deterministic: the same ids and edges always give the same grid, so a migrated save lays
 * out identically every time. Returns a lookup; an id it wasn't given maps to the origin.
 */
export function layoutByFlow(nodeIds: readonly NodeId[], edges: readonly Edge[]): (id: NodeId) => GridPosition {
  const known = new Set(nodeIds)
  const links = edges.filter((edge) => edge.from !== edge.to && known.has(edge.from) && known.has(edge.to))

  const unresolvedInbound = new Map(nodeIds.map((id) => [id, 0]))
  for (const { to } of links) unresolvedInbound.set(to, (unresolvedInbound.get(to) ?? 0) + 1)

  // Kahn's algorithm, tracking the longest path. `order` grows while it's iterated.
  const depth = new Map<NodeId, number>()
  const order = nodeIds.filter((id) => unresolvedInbound.get(id) === 0)
  for (const id of order) {
    const below = (depth.get(id) ?? 0) + 1
    for (const { from, to } of links) {
      if (from !== id) continue
      depth.set(to, Math.max(depth.get(to) ?? 0, below))
      const left = (unresolvedInbound.get(to) ?? 0) - 1
      unresolvedInbound.set(to, left)
      if (left === 0) order.push(to)
    }
  }

  const acyclic = new Set(order)
  const cycleRow = order.reduce((deepest, id) => Math.max(deepest, (depth.get(id) ?? 0) + 1), 0)
  const nextColumn = new Map<number, number>()
  const positions = new Map<NodeId, GridPosition>()
  for (const id of nodeIds) {
    const row = acyclic.has(id) ? (depth.get(id) ?? 0) : cycleRow
    const col = nextColumn.get(row) ?? 0
    nextColumn.set(row, col + 1)
    positions.set(id, { col, row })
  }
  return (id) => positions.get(id) ?? ORIGIN
}
