import { BALANCE } from '../../config/balance'
import { COMPONENT_DEFS } from '../../content/components'
import type { Architecture, NodeId } from '../../engine'
import { findNode, type ConnectionRefusal, type EditRefusal } from '../../state/architecture'

// Player-facing canvas copy (05-UI-DESIGN §8): dry, second person, the problem and the fix,
// no exclamation points.

/** A node's name for the player: its component name, numbered when several share it. */
export function nodeName(architecture: Architecture, nodeId: NodeId): string {
  const node = findNode(architecture, nodeId)
  if (!node) return 'That component'
  const sameKind = architecture.nodes.filter((other) => other.kind === node.kind)
  const name = COMPONENT_DEFS[node.kind].displayName
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(node) + 1}` : name
}

export type LoadLevel = 'unknown' | 'healthy' | 'warning' | 'saturated'

/** How a utilization (0..1) reads on the canvas. Unknown until a turn has run. */
export function loadLevel(utilization: number | undefined): LoadLevel {
  if (utilization === undefined) return 'unknown'
  if (utilization >= BALANCE.status.saturatedUtilization) return 'saturated'
  if (utilization >= BALANCE.status.warningUtilization) return 'warning'
  return 'healthy'
}

/** Utilization as the canvas prints it, e.g. "78%". */
export function percent(utilization: number): string {
  return `${Math.round(utilization * 100)}%`
}

export function describeConnectionRefusal(
  refusal: ConnectionRefusal,
  architecture: Architecture,
  from: NodeId,
  to: NodeId,
): string {
  switch (refusal.kind) {
    case 'unknown-node':
      return 'That component no longer exists.'
    case 'self':
      return 'A component can’t send requests to itself. Choose a different target.'
    case 'duplicate':
      return `${nodeName(architecture, from)} already sends requests to ${nodeName(architecture, to)}.`
    case 'kinds':
      return refusal.reason
    case 'cycle':
      return `That would send requests in a loop: ${nodeName(architecture, to)} already leads back to ${nodeName(architecture, from)}.`
  }
}

export function describeEditRefusal(refusal: EditRefusal, architecture: Architecture): string {
  switch (refusal.kind) {
    case 'unknown-node':
      return 'That component no longer exists.'
    case 'cell-taken':
      return `${nodeName(architecture, refusal.nodeId)} is already in that cell. Choose an empty one.`
    case 'fixed-component':
      return `${nodeName(architecture, refusal.nodeId)} can’t be removed. It’s where traffic enters your architecture.`
    case 'not-placeable':
      return `${COMPONENT_DEFS[refusal.componentKind].displayName} is always present and can’t be added.`
    case 'invalid-tier':
      return 'That size doesn’t exist for this component.'
    case 'invalid-fanout':
      return 'Queries per request must be a number, zero or more.'
    case 'connection-refused':
      return refusal.refusal.kind === 'kinds' ? refusal.refusal.reason : 'That connection isn’t allowed.'
  }
}
