import {
  REQUEST_CLASSES,
  type Architecture,
  type ComponentNode,
  type Edge,
  type NodeId,
  type Result,
  type TopologyError,
} from './types'

/** Nodes a request traverses from ingress to its terminal datastore, in order. */
export type LinearPath = readonly ComponentNode[]

/**
 * Validates an architecture graph and returns the single path its requests take
 * (02-SIMULATION §4). Graph structure only, so no units. M1 resolves linear chains
 * (ingress → … → database); every other shape is rejected with a typed error rather
 * than resolved into numbers the later load-balancing rules would contradict (ADR-0020).
 */
export function resolveLinearPath(architecture: Architecture): Result<LinearPath, TopologyError> {
  const { nodes, edges } = architecture

  const byId = new Map<NodeId, ComponentNode>()
  for (const node of nodes) {
    if (byId.has(node.id)) return fail({ kind: 'duplicate-node-id', nodeId: node.id })
    byId.set(node.id, node)
  }

  const seenEdges = new Set<string>()
  for (const edge of edges) {
    const missing = [edge.from, edge.to].find((id) => !byId.has(id))
    if (missing !== undefined) return fail({ kind: 'unknown-edge-endpoint', edge, nodeId: missing })
    const key = JSON.stringify([edge.from, edge.to])
    if (seenEdges.has(key)) return fail({ kind: 'duplicate-edge', edge })
    seenEdges.add(key)
  }

  const outbound = outboundAdjacency(edges)
  const cycle = findCycle(nodes, outbound)
  if (cycle) return fail({ kind: 'cycle', nodeIds: cycle })

  const ingresses = nodes.filter((node) => node.kind === 'ingress')
  const [ingress] = ingresses
  if (!ingress) return fail({ kind: 'missing-ingress' })
  if (ingresses.length > 1) {
    return fail({ kind: 'multiple-ingress', nodeIds: ingresses.map((node) => node.id) })
  }
  if (edges.some((edge) => edge.to === ingress.id)) {
    return fail({ kind: 'ingress-has-inbound', nodeId: ingress.id })
  }

  const inDegree = new Map<NodeId, number>()
  for (const edge of edges) inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  for (const node of nodes) {
    const outDegree = outbound.get(node.id)?.length ?? 0
    if (node.kind === 'database' && outDegree > 0) {
      return fail({ kind: 'datastore-not-terminal', nodeId: node.id })
    }
    if (outDegree > 1 || (inDegree.get(node.id) ?? 0) > 1) {
      return fail({ kind: 'unsupported-topology', nodeId: node.id, reason: 'branching' })
    }
  }

  // The graph is acyclic and every out-degree is at most 1, so following the single
  // outbound edge from ingress always terminates.
  const path: ComponentNode[] = [ingress]
  let nextId = outbound.get(ingress.id)?.[0]
  while (nextId !== undefined) {
    const next = byId.get(nextId)
    if (!next) break
    path.push(next)
    nextId = outbound.get(next.id)?.[0]
  }

  const onPath = new Set(path.map((node) => node.id))
  const disconnected = nodes.find((node) => !onPath.has(node.id))
  if (disconnected) {
    return fail({ kind: 'unsupported-topology', nodeId: disconnected.id, reason: 'disconnected' })
  }

  if (path[path.length - 1]?.kind !== 'database') {
    return fail({ kind: 'no-datastore-path', requestClasses: REQUEST_CLASSES })
  }

  return { ok: true, value: path }
}

/**
 * Whether adding the edge `from → to` would close a cycle, a self-loop included. Graph
 * structure only, no units. The canvas uses it to refuse the connection at build time
 * (02-SIMULATION §4).
 */
export function createsCycle(edges: readonly Edge[], from: NodeId, to: NodeId): boolean {
  if (from === to) return true
  const outbound = outboundAdjacency(edges)
  const seen = new Set<NodeId>()
  const pending = [to]
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (id === from) return true
    if (seen.has(id)) continue
    seen.add(id)
    pending.push(...(outbound.get(id) ?? []))
  }
  return false
}

function fail(error: TopologyError): Result<never, TopologyError> {
  return { ok: false, error }
}

function outboundAdjacency(edges: readonly Edge[]): ReadonlyMap<NodeId, readonly NodeId[]> {
  const outbound = new Map<NodeId, NodeId[]>()
  for (const { from, to } of edges) outbound.set(from, [...(outbound.get(from) ?? []), to])
  return outbound
}

// Depth-first search in node and edge order, so the same graph always reports the same
// cycle. Recursion depth is bounded by the node count.
function findCycle(
  nodes: readonly ComponentNode[],
  outbound: ReadonlyMap<NodeId, readonly NodeId[]>,
): NodeId[] | null {
  const finished = new Set<NodeId>()
  const stack: NodeId[] = []

  const visit = (id: NodeId): NodeId[] | null => {
    stack.push(id)
    for (const next of outbound.get(id) ?? []) {
      const onStack = stack.indexOf(next)
      if (onStack !== -1) return stack.slice(onStack)
      if (!finished.has(next)) {
        const cycle = visit(next)
        if (cycle) return cycle
      }
    }
    stack.pop()
    finished.add(id)
    return null
  }

  for (const node of nodes) {
    if (finished.has(node.id)) continue
    const cycle = visit(node.id)
    if (cycle) return cycle
  }
  return null
}
