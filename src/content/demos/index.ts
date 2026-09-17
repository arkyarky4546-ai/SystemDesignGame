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

/**
 * The vertical scaling demo: hold the load still and drag the app server's capacity up.
 * The first steps above the load take p99 from seconds to tens of milliseconds; everything
 * after that fights over the last few, because no size gets a request below its service time.
 *
 * The node is the largest app server, so its service time is the game's own and the right end
 * of the slider is the biggest size the game sells. The database behind it is never busy.
 */
const verticalScaling: Demo = {
  id: 'vertical-scaling',
  architecture: {
    nodes: [
      { id: 'ingress', kind: 'ingress', tier: 0 },
      { id: 'app', kind: 'app-server', tier: 3 },
      { id: 'db', kind: 'database', tier: 3 },
    ],
    edges: [
      { from: 'ingress', to: 'app' },
      { from: 'app', to: 'db' },
    ],
  },
  variable: { kind: 'capacityRps', nodeId: 'app', loadRps: 50, min: 40, max: 500, step: 10, label: 'App server capacity' },
  nodeId: 'app',
  showMetrics: ['utilization', 'meanMs', 'p99Ms', 'errorRate'],
  caption:
    'Fifty requests a second the whole time. Drag capacity up from below the load: the first steps are worth seconds of p99, and the last 300 requests a second of capacity are worth about 10 milliseconds.',
}

export const DEMOS: Readonly<Record<DemoId, Demo>> = { saturation, 'vertical-scaling': verticalScaling }
