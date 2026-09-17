import { COMPONENT_DEFS } from '../../components'
import { defineTemplate, type ComponentTier, type QuestionTemplate } from '../../schema'
import { ms, percentOf, roomyHop, rps } from '../template-helpers'

// Derived-question templates for `vertical-scaling` (09-QUESTION-BANK §2.1): what an upgrade
// does to p99, the floor no size gets below, the bottleneck an upgrade reveals, and what the
// largest size drops. Every answer comes from the engine; the ceiling question reads the
// largest app server from its component definition, so a rebalanced catalog regenerates it.

/** Service times where a question doesn't turn on them, ms. */
const APP_SERVICE_MS = 10
const DB_SERVICE_MS = 5

function largestTier(tiers: readonly ComponentTier[]): ComponentTier {
  const largest = tiers[tiers.length - 1]
  if (!largest) throw new Error('a sized component has at least one tier')
  return largest
}

const LARGEST_APP = largestTier(COMPONENT_DEFS['app-server'].tiers)

export const verticalScalingTemplates: readonly QuestionTemplate[] = [
  defineTemplate({
    id: 'tpl-vertical-p99-after-upgrade',
    conceptId: 'vertical-scaling',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [
      { kind: 'choice', name: 'serviceTimeMs', values: [4, 5, 6, 8, 10, 12] },
      { kind: 'choice', name: 'capacityRps', values: [40, 50, 100, 150, 200, 250, 400] },
      { kind: 'choice', name: 'utilizationBefore', values: [0.8, 0.85, 0.9, 0.95] },
      { kind: 'choice', name: 'sizeMultiplier', values: [2, 3, 4] },
    ],
    constraints: (params) => Number.isInteger(params.capacityRps * params.utilizationBefore),
    build: (params, engine) => {
      const load = params.capacityRps * params.utilizationBefore
      const after = engine.resolvePath({
        peakRps: load,
        appServers: [
          {
            capacityRps: params.capacityRps * params.sizeMultiplier,
            serviceTimeMs: params.serviceTimeMs,
            queriesPerRequest: 1,
          },
        ],
        database: roomyHop(load),
      })
      const hop = after.appServers[0]
      if (!hop) throw new Error('the resolved path lost its app server')
      return {
        prompt: `A component with a ${params.serviceTimeMs} ms service time runs at ${percentOf(params.utilizationBefore)}% of its ${rps(params.capacityRps)} capacity at peak. You move it to a size with ${params.sizeMultiplier} times the capacity and the same service time. What is its p99 now, to the nearest millisecond?`,
        answer: hop.p99Ms,
        format: ms,
        explanation: `Same load, ${params.sizeMultiplier} times the capacity: utilization falls from ${percentOf(params.utilizationBefore)}% to about ${percentOf(hop.utilization)}%. The mean becomes ${params.serviceTimeMs} ÷ (1 − ${hop.utilization.toFixed(3)}) ≈ ${hop.meanMs.toFixed(1)} ms, and p99 is 4.61 times that. The gain is large because the component started high on the curve.`,
        tags: ['upgrade-gain'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'kept the old p99',
        compute: (params, _correct, engine) =>
          engine.p99LatencyMs(engine.meanResponseTimeMs(params.serviceTimeMs, params.utilizationBefore)),
        whyWrong:
          'This is p99 before the upgrade. The latency curve reads utilization, and more capacity at the same load lowers it.',
      },
      {
        label: 'scaled p99 down by the size',
        compute: (params, _correct, engine) =>
          engine.p99LatencyMs(engine.meanResponseTimeMs(params.serviceTimeMs, params.utilizationBefore)) /
          params.sizeMultiplier,
        whyWrong:
          'This assumes p99 falls in proportion to capacity. It follows 1 ÷ (1 − utilization) instead, which is why an upgrade from high on the curve buys more than its size ratio.',
      },
      {
        label: 'went straight to the floor',
        compute: (params, _correct, engine) => engine.p99LatencyMs(engine.meanResponseTimeMs(params.serviceTimeMs, 0)),
        whyWrong:
          'This is the p99 of an idle component, the floor no size gets below. At this load the new size still queues some requests, so p99 is above it.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-vertical-latency-floor',
    conceptId: 'vertical-scaling',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 1,
    params: [
      {
        kind: 'choice',
        name: 'serviceTimeMs',
        values: [2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 24, 25, 30, 32, 35, 40, 45, 50, 60, 80, 100],
      },
    ],
    build: (params, engine) => {
      const floor = engine.p99LatencyMs(engine.meanResponseTimeMs(params.serviceTimeMs, 0))
      return {
        prompt: `A component takes ${params.serviceTimeMs} ms to serve a request with nothing queued. However large a size you buy for it, what is the lowest p99 it can reach in this game’s model, to the nearest millisecond?`,
        answer: floor,
        format: ms,
        explanation: `With no load nothing waits, so the mean response time is the service time itself, ${params.serviceTimeMs} ms. p99 is still the mean × ln 100 ≈ 4.61 × ${params.serviceTimeMs} ≈ ${ms(floor)}. Past that point more capacity buys nothing; only a shorter service time would.`,
        tags: ['latency-floor'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'read the service time as the floor',
        compute: (params) => params.serviceTimeMs,
        whyWrong:
          'This is the mean with nothing queued, not the 99th percentile. Response times are still spread around it, and p99 sits about 4.6 times higher.',
      },
      {
        label: 'gave the median floor',
        compute: (params, _correct, engine) => engine.p50LatencyMs(params.serviceTimeMs),
        whyWrong:
          'This is the median of an idle component. Half of all requests beat it; p99, the figure the SLO watches, is about 6.6 times higher.',
      },
      {
        label: 'assumed enough capacity removes latency',
        compute: () => 0,
        whyWrong:
          'More capacity only removes waiting. The work itself still takes its service time, so no size gets p99 anywhere near zero.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-vertical-bottleneck-moves',
    conceptId: 'vertical-scaling',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [
      { kind: 'int', name: 'peakRps', min: 150, max: 1200, step: 50 },
      { kind: 'choice', name: 'appBeforeRps', values: [50, 75, 100, 150, 200, 250, 300, 400] },
      { kind: 'choice', name: 'dbCapacityRps', values: [80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800] },
      { kind: 'choice', name: 'appAfterRps', values: [500, 600, 800, 1000, 1200, 1500, 2000] },
    ],
    // The old app server is the bottleneck and the database behind it looks healthy — under
    // the warning band — yet it can't carry the full peak once the upgrade lets it through.
    constraints: (params) =>
      params.appBeforeRps < params.peakRps &&
      params.appBeforeRps < 0.75 * params.dbCapacityRps &&
      params.dbCapacityRps < 0.95 * params.peakRps &&
      params.appAfterRps >= 1.2 * params.peakRps,
    build: (params, engine) => {
      const after = engine.resolvePath({
        peakRps: params.peakRps,
        appServers: [{ capacityRps: params.appAfterRps, serviceTimeMs: APP_SERVICE_MS, queriesPerRequest: 1 }],
        database: { capacityRps: params.dbCapacityRps, serviceTimeMs: DB_SERVICE_MS },
      })
      return {
        prompt: `At peak, ${rps(params.peakRps)} arrive. Your app server serves ${rps(params.appBeforeRps)} and drops the rest, and the database behind it, which can serve ${rps(params.dbCapacityRps)}, looks healthy. You upgrade the app server to ${rps(params.appAfterRps)}. How many requests per second does the database drop now?`,
        answer: after.database.droppedRps,
        format: rps,
        explanation: `The new app server serves all ${rps(params.peakRps)}, so every request it used to drop now reaches the database, one query each. The database serves ${rps(params.dbCapacityRps)} and drops the other ${rps(after.database.droppedRps)}. It only looked healthy because the app server was dropping load before it arrived.`,
        tags: ['bottleneck-moves'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'thought a healthy database stays healthy',
        compute: () => 0,
        whyWrong:
          'The database only looked healthy because the app server was dropping load in front of it. Once the app server serves everything, the database receives the full peak.',
      },
      {
        label: 'carried the old drops over',
        compute: (params) => params.peakRps - params.appBeforeRps,
        whyWrong:
          'This is how much the old app server dropped. After the upgrade those requests reach the database, and its own capacity decides what it drops.',
      },
      {
        label: 'measured the database’s old headroom',
        compute: (params) => params.dbCapacityRps - params.appBeforeRps,
        whyWrong:
          'This is the room the database had while the app server was holding load back. That room is gone once the full peak arrives.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-vertical-ceiling-drops',
    conceptId: 'vertical-scaling',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [
      { kind: 'int', name: 'meanRps', min: 220, max: 600, step: 20 },
      { kind: 'choice', name: 'peakMultiplier', values: [1.5, 2, 2.5, 3] },
    ],
    constraints: (params) => {
      const peak = params.meanRps * params.peakMultiplier
      return Number.isInteger(peak) && peak > 1.05 * LARGEST_APP.capacityRps && peak <= 3 * LARGEST_APP.capacityRps
    },
    build: (params, engine) => {
      const peak = params.meanRps * params.peakMultiplier
      const path = engine.resolvePath({
        peakRps: peak,
        appServers: [{ capacityRps: LARGEST_APP.capacityRps, serviceTimeMs: LARGEST_APP.serviceTimeMs, queriesPerRequest: 1 }],
        database: roomyHop(peak),
      })
      const hop = path.appServers[0]
      if (!hop) throw new Error('the resolved path lost its app server')
      return {
        prompt: `Your app server is already the largest size there is, which serves ${rps(LARGEST_APP.capacityRps)}. Traffic averages ${rps(params.meanRps)} and its busiest hour runs at ${params.peakMultiplier} times that. How many requests per second does it drop at peak?`,
        answer: hop.droppedRps,
        format: rps,
        explanation: `Peak is ${params.meanRps} × ${params.peakMultiplier} = ${rps(peak)} against ${rps(LARGEST_APP.capacityRps)} of capacity, so ${rps(peak - LARGEST_APP.capacityRps)} are dropped. There is no bigger size to buy: past the largest, serving more takes more than one server side by side.`,
        tags: ['size-ceiling', 'peak-vs-mean'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'assumed the largest size absorbs any load',
        compute: () => 0,
        whyWrong:
          'No size is unlimited. Past the largest size’s capacity the excess is dropped, and there is nothing bigger to upgrade to.',
      },
      {
        label: 'used the mean instead of the peak',
        compute: (params) => (params.meanRps > LARGEST_APP.capacityRps ? params.meanRps - LARGEST_APP.capacityRps : null),
        whyWrong:
          'This measures the weekly mean against capacity. The week is resolved at its busiest hour, which is higher by the whole peak multiplier.',
      },
      {
        label: 'gave what it serves',
        compute: () => LARGEST_APP.capacityRps,
        whyWrong: 'This is what the server completes, its full capacity. The question is what it turns away: the peak minus that.',
      },
      {
        label: 'counted the whole peak as dropped',
        compute: (params) => params.meanRps * params.peakMultiplier,
        whyWrong: 'An overloaded server still serves its capacity. Only the load above that is dropped.',
      },
    ],
  }),
]
