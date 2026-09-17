import type { Demo, DemoId } from '../schema'

/**
 * The saturation demo (03-CONTENT-SCHEMA §7): drag load from a tenth of capacity to nearly
 * all of it and watch p99 go vertical. Every figure it shows is resolved by the real engine,
 * so the slider can't disagree with the game.
 *
 * The app server is the only thing near its limit — the database behind it has four times the
 * capacity — so the curve the player sees belongs to one component.
 */
const saturation: Demo = {
  id: 'saturation',
  architecture: {
    nodes: [
      { id: 'ingress', kind: 'ingress', tier: 0 },
      { id: 'app', kind: 'app-server', tier: 2 },
      { id: 'db', kind: 'database', tier: 3 },
    ],
    edges: [
      { from: 'ingress', to: 'app' },
      { from: 'app', to: 'db' },
    ],
  },
  variable: { kind: 'meanRps', min: 15, max: 148, step: 1, label: 'Requests arriving' },
  nodeId: 'app',
  showMetrics: ['utilization', 'meanMs', 'p99Ms', 'errorRate'],
  caption:
    'The first half of the capacity is nearly free. The last tenth is where every millisecond your users feel gets decided.',
}

export const DEMOS: Readonly<Record<DemoId, Demo>> = { saturation }
