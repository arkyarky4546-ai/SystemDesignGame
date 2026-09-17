import { BALANCE } from '../config/balance'
import type { DiagramSpec } from '../content/schema'
import { layoutByFlow, type Architecture, type ComponentNode } from '../engine'

// Turning a lesson's diagram recipe into a real `Architecture` (ADR-0046). Positions come
// from the same flow layout a migrated save gets, so a diagram is laid out the way the game
// lays things out — and can be dropped straight onto the player's canvas.

export function architectureFor(spec: DiagramSpec): Architecture {
  const edges = spec.edges.map((edge) => ({ from: edge.from, to: edge.to }))
  const at = layoutByFlow(
    spec.nodes.map((node) => node.id),
    edges,
  )
  return { nodes: spec.nodes.map((node) => build(node, at(node.id))), edges }
}

function build(node: DiagramSpec['nodes'][number], position: { col: number; row: number }): ComponentNode {
  const common = { id: node.id, replicas: 1, tier: node.tier, position }
  switch (node.kind) {
    case 'app-server':
      return { ...common, kind: 'app-server', config: { fanoutFactor: BALANCE.starter.appFanoutFactor } }
    case 'ingress':
      return { ...common, kind: 'ingress', config: {} }
    case 'database':
      return { ...common, kind: 'database', config: {} }
  }
}
