import { defineTemplate, type QuestionTemplate } from '../../schema'
import { percent, roomyHop, rps } from '../template-helpers'

// Derived-question templates for `latency-and-throughput` (09-QUESTION-BANK §2.1): what a path
// completes, what one component completes whatever its speed, and the share of requests lost
// past capacity. Every answer comes from resolving the path with the game's own resolver.
//
// None of these needs the latency curve, which the next concept teaches: a question here has to
// be answerable from this lesson.

/** Service times where a question doesn't turn on them, ms. */
const APP_SERVICE_MS = 10
const DB_SERVICE_MS = 5

export const latencyAndThroughputTemplates: readonly QuestionTemplate[] = [
  defineTemplate({
    id: 'tpl-throughput-path-ceiling',
    conceptId: 'latency-and-throughput',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [
      { kind: 'int', name: 'peakRps', min: 100, max: 1500, step: 50 },
      { kind: 'choice', name: 'appCapacityRps', values: [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000] },
      { kind: 'choice', name: 'dbCapacityRps', values: [80, 120, 150, 200, 300, 400, 500, 600, 900] },
    ],
    // Something on the path has to be short of the peak, or nothing is being asked.
    constraints: (params) =>
      params.appCapacityRps !== params.dbCapacityRps &&
      params.peakRps > 1.1 * Math.min(params.appCapacityRps, params.dbCapacityRps),
    build: (params, engine) => {
      const path = engine.resolvePath({
        peakRps: params.peakRps,
        appServers: [{ capacityRps: params.appCapacityRps, serviceTimeMs: APP_SERVICE_MS, queriesPerRequest: 1 }],
        database: { capacityRps: params.dbCapacityRps, serviceTimeMs: DB_SERVICE_MS },
      })
      return {
        prompt: `At peak, ${rps(params.peakRps)} arrive. Your app server can serve ${rps(params.appCapacityRps)} and your database ${rps(params.dbCapacityRps)}, and each request makes one database query. How many requests per second complete the whole path?`,
        answer: path.completedRps,
        format: rps,
        explanation: `A request completes only if every hop serves it. The app server serves ${rps(path.database.inboundRps)} and passes those on; the database serves ${rps(path.database.servedRps)} of them. So the path completes ${rps(path.completedRps)}: never more than its narrowest hop, whatever the other can do.`,
        tags: ['throughput-ceiling'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'ignored the drops',
        compute: (params) => params.peakRps,
        whyWrong:
          'This counts every arriving request as completed. Load past a component’s capacity is dropped, so a path can’t complete more than its narrowest hop.',
      },
      {
        label: 'added the capacities',
        compute: (params) => params.appCapacityRps + params.dbCapacityRps,
        whyWrong:
          'This adds the two capacities as if a request could use either one. Each request crosses both hops in turn, so capacities don’t add along a path.',
      },
      {
        label: 'took the wider hop',
        compute: (params) => Math.max(params.appCapacityRps, params.dbCapacityRps),
        whyWrong: 'This is the larger of the two capacities. A request has to cross both hops, so the smaller one sets the limit.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-throughput-completed',
    conceptId: 'latency-and-throughput',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 1,
    params: [
      { kind: 'choice', name: 'serviceTimeMs', values: [4, 5, 8, 10, 20, 25, 40, 50] },
      { kind: 'choice', name: 'capacityRps', values: [30, 60, 80, 120, 150, 250, 400, 600] },
      { kind: 'int', name: 'peakRps', min: 20, max: 900, step: 10 },
    ],
    // Load on either side of capacity, and a service time whose reciprocal isn't the capacity,
    // so "1 ÷ latency" is a distinct wrong answer rather than an accidental right one.
    constraints: (params) =>
      params.peakRps !== params.capacityRps &&
      params.peakRps >= 0.4 * params.capacityRps &&
      params.peakRps <= 2 * params.capacityRps &&
      Math.abs(1000 / params.serviceTimeMs - params.capacityRps) > 0.1 * params.capacityRps,
    build: (params, engine) => {
      const path = engine.resolvePath({
        peakRps: params.peakRps,
        appServers: [{ capacityRps: params.capacityRps, serviceTimeMs: params.serviceTimeMs, queriesPerRequest: 1 }],
        database: roomyHop(params.peakRps),
      })
      const outcome =
        params.peakRps <= params.capacityRps
          ? `It completes all ${rps(params.peakRps)}: the load is under its ${rps(params.capacityRps)} capacity, so nothing is dropped.`
          : `It completes ${rps(params.capacityRps)}, its capacity, and drops the other ${rps(params.peakRps - params.capacityRps)}.`
      return {
        prompt: `An app server takes ${params.serviceTimeMs} ms to serve a request with nothing queued, and its capacity is ${rps(params.capacityRps)}. At peak, ${rps(params.peakRps)} arrive. How many requests per second does it complete?`,
        // The database never limits here, so what completes is what the app server serves.
        answer: path.completedRps,
        format: rps,
        explanation: `${outcome} The ${params.serviceTimeMs} ms service time says how long each request takes, not how many the server can take, because it works on many at once.`,
        tags: ['throughput-not-inverse', 'throughput-ceiling'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'took throughput as 1 ÷ latency',
        compute: (params) => 1000 / params.serviceTimeMs,
        whyWrong:
          'This divides a second by the service time, which is a server’s throughput only if it works on one request at a time. Servers work on many at once; capacity is what caps them.',
      },
      {
        label: 'gave the capacity whatever the load',
        compute: (params) => params.capacityRps,
        whyWrong:
          'This is what the server could complete, not what it does. With less arriving than its capacity, it completes only what arrives.',
      },
      {
        label: 'gave the arriving load whatever the capacity',
        compute: (params) => params.peakRps,
        whyWrong:
          'This counts every arriving request as completed. Past capacity the excess is dropped, so the server completes at most its capacity.',
      },
      {
        label: 'gave the dropped load',
        compute: (params) => (params.peakRps > params.capacityRps ? params.peakRps - params.capacityRps : null),
        whyWrong: 'This is the load the server turns away, not the load it completes.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-throughput-error-share',
    conceptId: 'latency-and-throughput',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [
      { kind: 'choice', name: 'capacityRps', values: [50, 80, 100, 120, 150, 200, 250, 300, 400, 500] },
      // The peak as a percentage of capacity.
      { kind: 'choice', name: 'loadPercent', values: [110, 120, 125, 130, 140, 150, 160, 175, 200, 250] },
    ],
    constraints: (params) => Number.isInteger((params.capacityRps * params.loadPercent) / 100),
    build: (params, engine) => {
      const peak = (params.capacityRps * params.loadPercent) / 100
      const path = engine.resolvePath({
        peakRps: peak,
        appServers: [{ capacityRps: params.capacityRps, serviceTimeMs: APP_SERVICE_MS, queriesPerRequest: 1 }],
        database: roomyHop(peak),
      })
      const dropped = peak - params.capacityRps
      return {
        prompt: `A component that can serve ${rps(params.capacityRps)} receives ${rps(peak)} at peak. In this game, what share of the requests it receives fail?`,
        answer: path.errorRate * 100,
        format: percent,
        explanation: `It serves ${rps(params.capacityRps)} and drops the other ${rps(dropped)}. The error rate is dropped ÷ received: ${dropped} ÷ ${peak} = ${percent((dropped / peak) * 100)}. Dividing by capacity instead overstates it, because the failures are a share of the requests that arrived.`,
        tags: ['error-share'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'divided by capacity',
        compute: (params) => params.loadPercent - 100,
        whyWrong:
          'This divides the dropped load by capacity. The error rate is a share of the requests that arrived, so it divides by what was received.',
      },
      {
        label: 'gave the share served',
        compute: (params) => (100 * 100) / params.loadPercent,
        whyWrong: 'This is the share of requests that succeed, not the share that fail. The two add up to 100%.',
      },
      {
        label: 'assumed the excess waits in a queue',
        compute: () => 0,
        whyWrong:
          'This assumes load past capacity waits its turn and eventually succeeds. Past capacity a queue only grows; this game turns the excess away at once, and those requests fail.',
      },
    ],
  }),
]
