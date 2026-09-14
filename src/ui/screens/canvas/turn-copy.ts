import type { Architecture, NodeId, TickError } from '../../../engine'
import { nodeName } from '../../canvas/copy'

/**
 * Why the planned architecture can't run next week, in the interface voice: the problem,
 * then the fix (05-UI-DESIGN §8). Shown beside Advance before the player presses it
 * (02-SIMULATION §4). Shapes the canvas can't build still get a specific sentence, for saves
 * edited by hand.
 */
export function describeTurnError(error: TickError, architecture: Architecture): string {
  const name = (nodeId: NodeId) => nodeName(architecture, nodeId)
  switch (error.kind) {
    case 'no-datastore-path': {
      const last = lastOnPath(architecture)
      return !last || last === 'ingress'
        ? 'Requests have nowhere to go. Connect ingress to an app server, and the app server to a database.'
        : `Requests have nowhere to go. Connect ${name(last)} to a database.`
    }
    case 'unsupported-topology': {
      if (error.reason === 'disconnected') {
        return `${name(error.nodeId)} isn’t on the path from ingress to the database. Connect it into the chain or remove it.`
      }
      const outgoing = architecture.edges.filter((edge) => edge.from === error.nodeId).length
      const incoming = architecture.edges.filter((edge) => edge.to === error.nodeId).length
      const shape = outgoing > 1 ? `sends requests to ${outgoing} components` : `receives requests from ${incoming} components`
      return `${name(error.nodeId)} ${shape}. Requests follow a single path for now, so remove all but one of those connections.`
    }
    case 'cycle':
      return `Your connections form a loop through ${error.nodeIds.map(name).join(', ')}. Remove one of them.`
    case 'unknown-tier':
      return `${name(error.nodeId)} is set to a size that doesn’t exist. Choose a size in the inspector.`
    case 'unsupported-replicas':
      return `${name(error.nodeId)} has ${error.replicas} instances. One instance per component runs for now, so set it back to one.`
    case 'invalid-node-config':
      return `${name(error.nodeId)} has an invalid ${error.field === 'replicas' ? 'instance count' : 'number of queries per request'}.`
    case 'invalid-tier-stats':
    case 'invalid-tier-costs':
      return `The catalog entry for ${name(error.nodeId)}’s size is invalid, so the week can’t run.`
    case 'duplicate-node-id':
      return `Two components share the id “${error.nodeId}”. Remove one of them.`
    case 'unknown-edge-endpoint':
      return 'A connection points at a component that no longer exists. Remove that connection.'
    case 'duplicate-edge':
      return `${name(error.edge.from)} is connected to ${name(error.edge.to)} twice. Remove one of the connections.`
    case 'missing-ingress':
      return 'There’s no ingress, so no traffic can arrive. Start a new run.'
    case 'multiple-ingress':
      return 'There’s more than one ingress. Traffic arrives at exactly one, so remove the others.'
    case 'ingress-has-inbound':
      return 'Something sends requests into ingress. Traffic only arrives there from outside, so remove that connection.'
    case 'datastore-not-terminal':
      return `${name(error.nodeId)} sends requests on, but a request’s path ends at the database. Remove its outgoing connections.`
    case 'invalid-workload':
      return 'This week’s traffic figures are invalid, so the week can’t run.'
  }
}

// Follows single outgoing connections from ingress to where the chain stops.
function lastOnPath(architecture: Architecture): NodeId | undefined {
  const ingress = architecture.nodes.find((node) => node.kind === 'ingress')
  if (!ingress) return undefined
  const seen = new Set<NodeId>()
  let current = ingress.id
  for (;;) {
    seen.add(current)
    const outgoing = architecture.edges.filter((edge) => edge.from === current)
    const next = outgoing[0]?.to
    if (outgoing.length !== 1 || next === undefined || seen.has(next)) return current
    current = next
  }
}
