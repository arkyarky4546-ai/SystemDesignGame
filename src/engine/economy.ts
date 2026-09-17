import { BALANCE } from '../config/balance'
import { KB_PER_GB, REQUESTS_PER_THOUSAND } from '../config/units'
import {
  REQUEST_CLASSES,
  type Architecture,
  type ReputationResult,
  type RequestClass,
  type ResourceNode,
  type ServiceLevel,
  type TickResult,
  type TierDef,
  type Workload,
} from './types'

/** A resource node with the tier figures it runs at. */
export type PricedNode = { readonly node: ResourceNode; readonly tier: TierDef }

/** Limits a value to [min, max]. Units pass through unchanged. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Each request class's share of all requests, 0..1, summing to 1 (02-SIMULATION §3). */
export function requestClassShares(workload: Workload): Readonly<Record<RequestClass, number>> {
  return {
    'static-read': workload.readFraction * workload.staticFraction,
    'dynamic-read': workload.readFraction * (1 - workload.staticFraction),
    write: 1 - workload.readFraction,
  }
}

/**
 * The service-wide p99 (ms) and error rate (0..1) a tick is judged on (ADR-0023).
 *
 * Error rate weights each class by its share of requests, which is exactly the fraction of
 * all requests dropped. p99 is the worst class that carries traffic: percentiles don't
 * average, and the blended p99 can never exceed the worst class's.
 */
export function serviceLevel(tick: TickResult): ServiceLevel {
  const shares = requestClassShares(tick.workload)
  let p99Ms = 0
  let errorRate = 0
  let totalShare = 0
  for (const requestClass of REQUEST_CLASSES) {
    const share = shares[requestClass]
    const metrics = tick.perClass[requestClass]
    errorRate += share * metrics.errorRate
    totalShare += share
    if (share > 0) p99Ms = Math.max(p99Ms, metrics.p99Ms)
  }
  // The shares are products of fractions, so they sum to 1 only within rounding. Dividing by
  // the sum rather than assuming it makes the blend a true weighted mean: when every class
  // is at the same rate the service is at exactly that rate, which is what an outage needs.
  return { p99Ms, errorRate: totalShare > 0 ? clamp(errorRate / totalShare, 0, 1) : 0 }
}

/**
 * Revenue multiplier for latency, unitless, from the service p99 in ms (02-SIMULATION §6,
 * ADR-0022). The maximum applies at or under the p99 target, so beating the SLO earns
 * nothing more. Above the target it falls linearly to the floor.
 */
export function qualityMultiplier(p99Ms: number): number {
  const { intercept, slopePerTargetRatio, min, max } = BALANCE.economy.qualityMultiplier
  return clamp(intercept - slopePerTargetRatio * (p99Ms / BALANCE.slo.p99TargetMs), min, max)
}

/**
 * One turn's revenue, integer cents (02-SIMULATION §6). Takes the served mean traffic in
 * rps and the unitless quality multiplier. Every request served over the turn is priced
 * per thousand.
 */
export function revenueCents(servedMeanRps: number, quality: number): number {
  const thousands = (servedMeanRps * BALANCE.time.secondsPerTurn) / REQUESTS_PER_THOUSAND
  return Math.round(thousands * BALANCE.economy.revenuePerThousandRequestsCents * quality)
}

/**
 * One turn's egress cost, integer cents (02-SIMULATION §6), from the served mean traffic in
 * rps and the payload in KB. §6's CDN offload term arrives with the CDN component; until
 * then every byte leaves from the origin.
 */
export function bandwidthCents(servedMeanRps: number, payloadKb: number): number {
  const gigabytes = (servedMeanRps * BALANCE.time.secondsPerTurn * payloadKb) / KB_PER_GB
  return Math.round(gigabytes * BALANCE.economy.bandwidthCostPerGbCents)
}

/** One turn's running cost, integer cents: each node's per-instance cost × replicas. */
export function runningCostCents(nodes: readonly PricedNode[]): number {
  return nodes.reduce((total, { node, tier }) => total + tier.runningCostPerTurnCents * node.replicas, 0)
}

/**
 * Setup cost for what changed since `built`, integer cents (ADR-0023). A node that is new,
 * or changed kind or tier, pays setup for every instance. A node that only gained replicas
 * pays for the added instances. Removing or shrinking refunds nothing.
 */
export function setupCostCents(built: Architecture, nodes: readonly PricedNode[]): number {
  const previousById = new Map(built.nodes.map((node) => [node.id, node]))
  let total = 0
  for (const { node, tier } of nodes) {
    const previous = previousById.get(node.id)
    const sameMachine = previous !== undefined && previous.kind === node.kind && previous.tier === node.tier
    const newInstances = sameMachine ? Math.max(0, node.replicas - previous.replicas) : node.replicas
    total += tier.setupCostCents * newInstances
  }
  return total
}

/**
 * Reputation after one turn (02-SIMULATION §7), from the current reputation (0..1) and the
 * service level (p99 in ms, error rate 0..1). Meeting both SLOs gains a fixed amount.
 * Missing either loses about 3× that, scaled by severity. Trust is lost faster than earned.
 */
export function nextReputation(reputation: number, service: ServiceLevel): ReputationResult {
  const { p99TargetMs, errorRateTarget } = BALANCE.slo
  // §7 also requires staleRate ≤ staleTarget. Nothing can serve stale data until replicas
  // exist, so that term joins with them (ADR-0023).
  const sloMet = service.p99Ms <= p99TargetMs && service.errorRate <= errorRateTarget
  const severity = Math.max(service.p99Ms / p99TargetMs, service.errorRate / errorRateTarget)
  const change = sloMet ? BALANCE.reputation.gainPerGoodTurn : -BALANCE.reputation.lossPerBadTurn * severity
  const value = clamp(reputation + change, 0, 1)
  return { value, delta: value - reputation, sloMet, severity }
}

/**
 * Multiplier on next turn's traffic growth from reputation (0..1), unitless
 * (02-SIMULATION §7): from 0.6 at reputation 0 to 1.4 at reputation 1.
 */
export function reputationModifier(reputation: number): number {
  const { trafficModifierFloor, trafficModifierRange } = BALANCE.reputation
  return trafficModifierFloor + trafficModifierRange * reputation
}

/** Active users that a mean traffic level represents, from rps (ADR-0024). Unrounded. */
export function usersForMeanRps(meanRps: number): number {
  return meanRps / BALANCE.traffic.meanRpsPerUser
}

/** The act, 1–5, that a user count belongs to (00-GAME-DESIGN §9). */
export function actForUsers(users: number): number {
  return BALANCE.acts.usersToEnter.filter((threshold) => users >= threshold).length + 1
}
