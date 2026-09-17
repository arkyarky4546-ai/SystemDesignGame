import { BALANCE } from '../config/balance'
import { resolveLinearPath } from './topology'
import type {
  ClassMetrics,
  ComponentCatalog,
  EdgeFlow,
  InputError,
  NodeId,
  NodeMetrics,
  NodeOutage,
  NodeStatus,
  ResourceNode,
  Result,
  TickError,
  TickInput,
  TickResult,
  TierStats,
  Workload,
} from './types'

// ln(100) = 2·ln(10). Built from the spec constant rather than Math.log, so the value is
// bit-identical on every JavaScript engine.
const LN_100 = 2 * Math.LN10

// A node with every instance down. Its capacity is 0, so nothing it receives is served.
const NO_HEALTH = 0

const WORKLOAD_FIELDS: readonly (keyof Workload)[] = [
  'meanRps',
  'peakMultiplier',
  'readFraction',
  'staticFraction',
  'keySkew',
  'payloadKb',
]

/**
 * Total capacity of a node, rps: per-instance capacity (rps) × replicas × healthFactor
 * (02-SIMULATION §5.2). `healthFactor` is the surviving share of capacity, 0..1.
 */
export function nodeCapacityRps(perInstanceRps: number, replicas: number, healthFactor: number): number {
  return perInstanceRps * replicas * healthFactor
}

/**
 * Utilization u from load and capacity (both rps), unitless and capped at
 * `BALANCE.queueing.maxUtilization`. The cap keeps latency finite at or past capacity;
 * the excess is reported as drops.
 */
export function utilization(inboundRps: number, capacityRps: number): number {
  return Math.min(inboundRps / capacityRps, BALANCE.queueing.maxUtilization)
}

/**
 * Instances needed to serve `peakRps` without passing `targetUtilization`, given one
 * instance's capacity in rps. Both rates are rps; the target is a fraction 0..1. Rounds up,
 * because a fraction of a server serves nothing, and never returns less than one.
 *
 * This is the arithmetic 09-QUESTION-BANK §2.1 builds capacity questions from, so a derived
 * question and the game's own sizing can't disagree.
 */
export function instancesNeeded(peakRps: number, perInstanceRps: number, targetUtilization: number): number {
  return Math.max(1, Math.ceil(peakRps / (perInstanceRps * targetUtilization)))
}

/** Mean response time W = serviceTime / (1 − u), ms, given service time in ms and utilization u. M/M/1 (ADR-0005). */
export function meanResponseTimeMs(serviceTimeMs: number, u: number): number {
  return serviceTimeMs / (1 - u)
}

/** Median response time from the mean W, both ms. M/M/1 response time is exponential, so p50 = W·ln 2. */
export function p50LatencyMs(meanMs: number): number {
  return meanMs * Math.LN2
}

/** 99th-percentile response time from the mean W, both ms: W·ln 100 for the same exponential distribution. */
export function p99LatencyMs(meanMs: number): number {
  return meanMs * LN_100
}

/**
 * A node's load band from its utilization u (0..1): warning and saturated start at the
 * `BALANCE.status` thresholds, inclusive (05-UI-DESIGN §2). A node with no instance left
 * serving is `failed` instead, which the resolver applies before this is consulted.
 */
export function nodeStatus(u: number): NodeStatus {
  if (u >= BALANCE.status.saturatedUtilization) return 'saturated'
  if (u >= BALANCE.status.warningUtilization) return 'warning'
  return 'healthy'
}

/**
 * The share of a node's instances still serving, 0..1 (02-SIMULATION §5.2's healthFactor).
 * `failedInstances` of `replicas` are down; both are instance counts. One of one down is 0,
 * one of three is 2/3, which is what makes N+1 survivable.
 */
export function healthFactor(replicas: number, failedInstances: number): number {
  return Math.max(0, replicas - failedInstances) / replicas
}

/**
 * Resolves one turn at peak load for a linear architecture (02-SIMULATION §5 phases 1
 * and 3–6; ADR-0020). Pure: the same input always gives the same output and is never
 * modified. Rates are rps, latencies ms, error rates 0..1.
 */
export function simulateTick(input: TickInput): Result<TickResult, TickError> {
  const workloadError = findWorkloadError(input.workload)
  if (workloadError) return { ok: false, error: workloadError }

  const path = resolveLinearPath(input.architecture)
  if (!path.ok) return path

  const hops: { readonly node: ResourceNode; readonly stats: TierStats; readonly from: NodeId }[] = []
  let upstream: NodeId | null = null
  for (const node of path.value) {
    if (node.kind !== 'ingress') {
      const stats = tierStatsFor(node, input.catalog)
      if (!stats.ok) return stats
      // A validated path always starts at ingress, so every resource node has an upstream.
      hops.push({ node, stats: stats.value, from: upstream ?? node.id })
    }
    upstream = node.id
  }

  const peakRps = input.workload.meanRps * input.workload.peakMultiplier
  const perNode: [NodeId, NodeMetrics][] = []
  const perEdge: EdgeFlow[] = []
  let flowRps = peakRps
  // How many queries one original request makes at the current hop.
  let queriesPerRequest = 1
  let successFraction = 1
  let p50Ms = 0
  let p99Ms = 0

  for (const { node, stats, from } of hops) {
    perEdge.push({ from, to: node.id, rps: flowRps })
    const metrics = resolveNode(flowRps, stats, node.replicas, failedInstancesOf(input.outages, node.id))
    perNode.push([node.id, metrics])

    // §5.2 doesn't say how per-hop drops combine along a path. Each query is treated as
    // dropped independently, so a request survives a hop only if all its queries there do
    // (ADR-0020).
    const dropFraction = metrics.inboundRps > 0 ? metrics.droppedRps / metrics.inboundRps : 0
    successFraction *= (1 - dropFraction) ** queriesPerRequest

    // Summing per-hop percentiles overestimates the true end-to-end p99, because
    // independent tails don't add that way. That's deliberate: it's conservative and
    // teaches that every hop costs. Don't "fix" it into a difficulty regression (ADR-0009).
    p50Ms += metrics.p50Ms
    p99Ms += metrics.p99Ms

    // Only served requests move on. Dropped ones never reach the next tier, which is how
    // an overloaded app tier can mask a database problem (§8, masked bottleneck).
    const fanout = node.kind === 'app-server' ? node.config.fanoutFactor : 1
    flowRps = metrics.servedRps * fanout
    queriesPerRequest *= fanout
  }

  // Every class shares the one linear path, so their metrics are identical until a
  // topology can route classes differently.
  const classMetrics: ClassMetrics = { p50Ms, p99Ms, errorRate: 1 - successFraction }

  return {
    ok: true,
    value: {
      turn: input.turn,
      workload: input.workload,
      peakRps,
      perNode: Object.fromEntries(perNode),
      perEdge,
      perClass: { 'static-read': classMetrics, 'dynamic-read': classMetrics, write: classMetrics },
      bottleneck: findBottleneck(perNode),
    },
  }
}

// §9 names the highest-utilization node above the warning threshold. Utilization is capped
// at U_MAX, so two overloaded nodes can tie. Ranking by inbound ÷ capacity keeps them apart,
// and the strict comparison keeps the node nearer ingress on an exact tie: its drops are
// what the nodes after it never saw (ADR-0031).
function findBottleneck(perNode: readonly (readonly [NodeId, NodeMetrics])[]): NodeId | null {
  let bottleneck: NodeId | null = null
  let highestLoad = 0
  for (const [nodeId, metrics] of perNode) {
    if (metrics.status === 'healthy') continue
    // A failed node has no capacity to divide by, and it is the problem by definition, so
    // it outranks every merely overloaded node (§5.7).
    const load = metrics.status === 'failed' ? Infinity : metrics.inboundRps / metrics.capacityRps
    if (bottleneck === null || load > highestLoad) {
      bottleneck = nodeId
      highestLoad = load
    }
  }
  return bottleneck
}

function resolveNode(inboundRps: number, stats: TierStats, replicas: number, failedInstances: number): NodeMetrics {
  const health = healthFactor(replicas, failedInstances)
  const capacityRps = nodeCapacityRps(stats.capacityRps, replicas, health)
  // A node with nothing left serving has no utilization to report and no queue to wait in:
  // requests are refused rather than delayed, so it contributes no latency and all of its
  // inbound load is dropped (§5.7). `status` carries the outage instead.
  if (health === NO_HEALTH) {
    return {
      inboundRps,
      capacityRps,
      failedInstances,
      utilization: 0,
      servedRps: 0,
      droppedRps: inboundRps,
      meanMs: 0,
      p50Ms: 0,
      p99Ms: 0,
      status: 'failed',
    }
  }
  const u = utilization(inboundRps, capacityRps)
  // min() rather than subtracting the excess keeps servedRps exactly monotonic in load.
  const servedRps = Math.min(inboundRps, capacityRps)
  const meanMs = meanResponseTimeMs(stats.serviceTimeMs, u)
  return {
    inboundRps,
    capacityRps,
    failedInstances,
    utilization: u,
    servedRps,
    droppedRps: inboundRps - servedRps,
    meanMs,
    p50Ms: p50LatencyMs(meanMs),
    p99Ms: p99LatencyMs(meanMs),
    status: nodeStatus(u),
  }
}

// An outage names the instances of one node that are down. A node with no entry is whole.
function failedInstancesOf(outages: readonly NodeOutage[] | undefined, nodeId: NodeId): number {
  return outages?.find((outage) => outage.nodeId === nodeId)?.failedInstances ?? 0
}

function tierStatsFor(node: ResourceNode, catalog: ComponentCatalog): Result<TierStats, InputError> {
  if (!Number.isInteger(node.replicas) || node.replicas < 1) {
    return { ok: false, error: { kind: 'invalid-node-config', nodeId: node.id, field: 'replicas' } }
  }
  // §5.2's capacity × replicas is the whole story for an app server, so it takes any count.
  // §5.4 gives database replicas different semantics — read/write routing, replication lag,
  // stale reads — so they keep refusing more than one until Tier 3 models them (ADR-0050).
  if (node.kind !== 'app-server' && node.replicas !== 1) {
    return { ok: false, error: { kind: 'unsupported-replicas', nodeId: node.id, replicas: node.replicas } }
  }
  if (node.kind === 'app-server' && !isNonNegative(node.config.fanoutFactor)) {
    return { ok: false, error: { kind: 'invalid-node-config', nodeId: node.id, field: 'fanoutFactor' } }
  }
  const stats = catalog[node.kind][node.tier]
  if (!stats) return { ok: false, error: { kind: 'unknown-tier', nodeId: node.id, tier: node.tier } }
  if (!isPositive(stats.capacityRps) || !isPositive(stats.serviceTimeMs)) {
    return { ok: false, error: { kind: 'invalid-tier-stats', nodeId: node.id } }
  }
  return { ok: true, value: stats }
}

function findWorkloadError(workload: Workload): InputError | null {
  const valid: Readonly<Record<keyof Workload, boolean>> = {
    meanRps: isNonNegative(workload.meanRps),
    peakMultiplier: isPositive(workload.peakMultiplier),
    readFraction: isFraction(workload.readFraction),
    staticFraction: isFraction(workload.staticFraction),
    keySkew: isFraction(workload.keySkew),
    payloadKb: isNonNegative(workload.payloadKb),
  }
  const field = WORKLOAD_FIELDS.find((key) => !valid[key])
  return field === undefined ? null : { kind: 'invalid-workload', field }
}

function isNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}
