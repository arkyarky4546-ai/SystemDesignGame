import type { NodeId, NodeMetrics, TickResult } from '../engine'

// What the weekly report's paragraph says about load (05-UI-DESIGN §5, ADR-0035). This picks
// the nodes; the report screen words them. Every claim it supports comes straight from the
// tick, so the paragraph can't say anything the simulation didn't do.

/** A healthy node the report names as not the problem. */
export type NotTheProblem = {
  readonly nodeId: NodeId
  /**
   * The nearest node before it on the path that turned requests away, or null. When set,
   * this node's load was understated: it only saw what that node let through.
   */
  readonly maskedBy: NodeId | null
}

export type LoadFinding =
  | {
      readonly kind: 'bottleneck'
      /** The engine's bottleneck: the most loaded node at warning or above. */
      readonly bottleneck: NodeId
      /** Other nodes that also turned requests away, in path order. */
      readonly alsoDropping: readonly NodeId[]
      /** The busiest healthy node, or null when every node was under pressure. */
      readonly notTheProblem: NotTheProblem | null
    }
  | {
      readonly kind: 'all-healthy'
      readonly busiest: NodeId
      /** The node with the most headroom, or null when only one node carries load. */
      readonly mostHeadroom: NodeId | null
    }

type PathNode = { readonly nodeId: NodeId; readonly metrics: NodeMetrics }

/**
 * Picks the nodes the report's paragraph names, from one resolved tick. With a bottleneck it
 * names the bottleneck and the busiest healthy node: the one a player is most likely to fix
 * by mistake. With none, the busiest node and the one with the most headroom. Ties go to the
 * node nearer ingress. Null when the tick has no resource nodes.
 */
export function findLoadFinding(tick: TickResult): LoadFinding | null {
  // perNode is keyed by id, and numeric-looking ids don't keep insertion order. perEdge does.
  const path = tick.perEdge.flatMap((flow): PathNode[] => {
    const metrics = tick.perNode[flow.to]
    return metrics ? [{ nodeId: flow.to, metrics }] : []
  })
  const busiest = extreme(path, (a, b) => a > b)
  if (!busiest) return null

  if (tick.bottleneck === null) {
    const mostHeadroom = extreme(
      path.filter((node) => node.nodeId !== busiest.nodeId),
      (a, b) => a < b,
    )
    return { kind: 'all-healthy', busiest: busiest.nodeId, mostHeadroom: mostHeadroom?.nodeId ?? null }
  }

  const bottleneck = tick.bottleneck
  const healthiest = extreme(
    path.filter((node) => node.metrics.status === 'healthy'),
    (a, b) => a > b,
  )
  return {
    kind: 'bottleneck',
    bottleneck,
    alsoDropping: path.filter((node) => node.nodeId !== bottleneck && node.metrics.droppedRps > 0).map((node) => node.nodeId),
    notTheProblem: healthiest ? { nodeId: healthiest.nodeId, maskedBy: nearestDropperBefore(path, healthiest.nodeId) } : null,
  }
}

// The first node, in path order, whose utilization beats every other by `better`.
function extreme(nodes: readonly PathNode[], better: (a: number, b: number) => boolean): PathNode | undefined {
  let best: PathNode | undefined
  for (const node of nodes) {
    if (!best || better(node.metrics.utilization, best.metrics.utilization)) best = node
  }
  return best
}

function nearestDropperBefore(path: readonly PathNode[], nodeId: NodeId): NodeId | null {
  const index = path.findIndex((node) => node.nodeId === nodeId)
  for (let before = index - 1; before >= 0; before--) {
    const node = path[before]
    if (node && node.metrics.droppedRps > 0) return node.nodeId
  }
  return null
}
