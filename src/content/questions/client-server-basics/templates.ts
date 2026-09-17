import { defineTemplate, type QuestionTemplate } from '../../schema'
import { ms, queries, roomyHop, rps } from '../template-helpers'

// Derived-question templates for `client-server-basics` (09-QUESTION-BANK §2.1): what reaches
// the database, what a dropped request costs downstream, and how the game adds up a path's
// p99. Every answer comes from resolving the path with the game's own turn resolver.
//
// Each distractor is the arithmetic consequence of one nameable mistake, so its `whyWrong`
// is accurate by construction.

/** The app server's service time where a question doesn't turn on it, ms. */
const APP_SERVICE_MS = 10

export const clientServerBasicsTemplates: readonly QuestionTemplate[] = [
  defineTemplate({
    id: 'tpl-request-database-load',
    conceptId: 'client-server-basics',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 1,
    params: [
      { kind: 'int', name: 'meanRps', min: 20, max: 400, step: 10 },
      { kind: 'choice', name: 'peakMultiplier', values: [1.5, 2, 2.5, 3] },
      // One query per request would make "forgot the queries" the right answer.
      { kind: 'choice', name: 'queriesPerRequest', values: [2, 3, 4, 5] },
    ],
    constraints: (params) => Number.isInteger(params.meanRps * params.peakMultiplier),
    build: (params, engine) => {
      const peak = params.meanRps * params.peakMultiplier
      const path = engine.resolvePath({
        peakRps: peak,
        appServers: [{ ...roomyHop(peak), queriesPerRequest: params.queriesPerRequest }],
        database: roomyHop(peak * params.queriesPerRequest),
      })
      return {
        prompt: `Traffic averages ${rps(params.meanRps)} and its busiest hour runs at ${params.peakMultiplier} times that. Your app server keeps up, and your code makes ${queries(params.queriesPerRequest)} for every request it serves. How many queries per second reach the database at peak?`,
        answer: path.database.inboundRps,
        format: rps,
        explanation: `At peak the app server receives ${params.meanRps} × ${params.peakMultiplier} = ${rps(peak)} and serves all of it. Each served request makes ${queries(params.queriesPerRequest)}, so the database receives ${peak} × ${params.queriesPerRequest} = ${rps(peak * params.queriesPerRequest)}. Load is always worked out at the busiest hour.`,
        tags: ['fanout', 'peak-load'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'forgot the queries per request',
        compute: (params) => params.meanRps * params.peakMultiplier,
        whyWrong:
          'This is the request rate, not the query rate. Each request the app server serves makes several queries, and every one of them is load on the database.',
      },
      {
        label: 'used the mean instead of the peak',
        compute: (params) => params.meanRps * params.queriesPerRequest,
        whyWrong:
          'This works the load out at the weekly mean. The game resolves each week at its busiest hour, so the database has to carry the peak rate of queries.',
      },
      {
        label: 'used the mean and forgot the queries',
        compute: (params) => params.meanRps,
        whyWrong:
          'This is the average request rate. It misses both the busy hour and the queries each request makes, so it understates the database’s load twice over.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-request-dropped-never-arrive',
    conceptId: 'client-server-basics',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [
      { kind: 'int', name: 'peakRps', min: 100, max: 1200, step: 50 },
      { kind: 'choice', name: 'appCapacityRps', values: [50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 800] },
      { kind: 'choice', name: 'queriesPerRequest', values: [1, 2, 3, 4] },
    ],
    // Clearly overloaded, so the drop is the point, but still serving a real share of the load.
    constraints: (params) =>
      params.appCapacityRps < params.peakRps * 0.9 && params.appCapacityRps >= params.peakRps * 0.3,
    build: (params, engine) => {
      const served = Math.min(params.peakRps, params.appCapacityRps)
      const path = engine.resolvePath({
        peakRps: params.peakRps,
        appServers: [
          { capacityRps: params.appCapacityRps, serviceTimeMs: APP_SERVICE_MS, queriesPerRequest: params.queriesPerRequest },
        ],
        database: roomyHop(params.peakRps * params.queriesPerRequest),
      })
      return {
        prompt: `Your app server can serve ${rps(params.appCapacityRps)} and makes ${queries(params.queriesPerRequest)} to the database per request. At peak, ${rps(params.peakRps)} arrive. How many queries per second reach the database?`,
        answer: path.database.inboundRps,
        format: rps,
        explanation: `The app server serves ${rps(served)} and drops the other ${rps(params.peakRps - served)} where they arrive. Only served requests run your code, so the database receives ${served} × ${params.queriesPerRequest} = ${rps(served * params.queriesPerRequest)}. A dropped request makes no queries at all.`,
        tags: ['drops-downstream', 'fanout'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'counted the dropped requests too',
        compute: (params) => params.peakRps * params.queriesPerRequest,
        whyWrong:
          'This sends every arriving request’s queries to the database, including the ones the app server turned away. A dropped request never runs your code, so it never queries anything.',
      },
      {
        label: 'counted only the dropped requests',
        compute: (params) => (params.peakRps - params.appCapacityRps) * params.queriesPerRequest,
        whyWrong:
          'This is the query load of the requests that were dropped. They are exactly the ones that never reach the database; the served ones are what it sees.',
      },
      {
        label: 'forgot the queries per request',
        compute: (params) => params.appCapacityRps,
        whyWrong:
          'This is the rate of requests the app server serves, not the queries they make. Each served request queries the database that many times.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-request-path-p99',
    conceptId: 'client-server-basics',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 1,
    params: [
      { kind: 'int', name: 'appP99Ms', min: 40, max: 400, step: 10 },
      { kind: 'int', name: 'dbP99Ms', min: 10, max: 200, step: 5 },
    ],
    // Far enough apart that "only the app server" and "only the database" are different answers.
    constraints: (params) => Math.abs(params.appP99Ms - params.dbP99Ms) >= 0.2 * Math.max(params.appP99Ms, params.dbP99Ms),
    build: (params, engine) => {
      // Both hops run at half their capacity, and each service time is chosen so its p99 comes
      // out at exactly the figure the prompt states. The resolver then adds them up itself.
      const load = 100
      const halfFull = (p99Ms: number) => ({
        capacityRps: load * 2,
        serviceTimeMs: (p99Ms * (1 - engine.utilization(load, load * 2))) / engine.p99LatencyMs(1),
      })
      const path = engine.resolvePath({
        peakRps: load,
        appServers: [{ ...halfFull(params.appP99Ms), queriesPerRequest: 1 }],
        database: halfFull(params.dbP99Ms),
      })
      return {
        prompt: `At peak, your app server’s p99 is ${ms(params.appP99Ms)} and your database’s is ${ms(params.dbP99Ms)}. Every request passes through both. What p99 does this game report for the whole path?`,
        answer: path.p99Ms,
        format: ms,
        explanation: `This game adds up each hop’s p99 along the path: ${params.appP99Ms} + ${params.dbP99Ms} = ${ms(params.appP99Ms + params.dbP99Ms)}. Real tails rarely line up on the same request, so the true figure is lower, but the sum is what the game judges you on, and it makes every hop count.`,
        tags: ['hop-latency'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'counted only the app server',
        compute: (params) => params.appP99Ms,
        whyWrong:
          'This is the app server’s figure alone. A request also waits at the database, and this game adds each hop’s p99 into the path’s.',
      },
      {
        label: 'averaged the hops',
        compute: (params) => (params.appP99Ms + params.dbP99Ms) / 2,
        whyWrong:
          'This averages the two hops. A request crosses both, so their times add rather than average; percentiles never average in this game.',
      },
      {
        label: 'counted only the last hop',
        compute: (params) => params.dbP99Ms,
        whyWrong:
          'This is the database’s figure alone, as if a request’s time were decided where its path ends. Every hop it crossed on the way counts too.',
      },
    ],
  }),
]
