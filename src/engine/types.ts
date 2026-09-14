// Plain data shapes for the simulation engine. Units follow 02-SIMULATION §1: traffic in
// rps, latency in ms, fractions and utilization 0..1. Everything is readonly because
// engine functions never modify their inputs.

import type { Difficulty } from '../config/difficulty'

export type { Difficulty }

export type NodeId = string

/** The request classes the engine resolves paths and metrics for (02-SIMULATION §4). */
export type RequestClass = 'static-read' | 'dynamic-read' | 'write'

export const REQUEST_CLASSES: readonly RequestClass[] = ['static-read', 'dynamic-read', 'write']

/** One turn's traffic (02-SIMULATION §3). Resolution runs at meanRps × peakMultiplier. */
export type Workload = {
  /** Average traffic over the week, rps. */
  readonly meanRps: number
  /** Peak-hour traffic as a multiple of meanRps, unitless. */
  readonly peakMultiplier: number
  /** Share of requests that are reads, 0..1. The rest are writes. */
  readonly readFraction: number
  /** Share of reads that are cacheable static assets, 0..1. */
  readonly staticFraction: number
  /** Key distribution, 0..1: 0 is uniform, 1 is a single hot key. */
  readonly keySkew: number
  /** Response payload size, kilobytes. */
  readonly payloadKb: number
}

/** Kind-specific configuration, keyed by kind so a node's `kind` and `config` always agree. */
export type ComponentConfigByKind = {
  readonly ingress: Readonly<Record<string, never>>
  readonly 'app-server': {
    /** Downstream queries issued per request served, unitless (02-SIMULATION §5.1). */
    readonly fanoutFactor: number
  }
  readonly database: Readonly<Record<string, never>>
}

export type ComponentKind = keyof ComponentConfigByKind

/** Kinds with capacity and latency. Ingress is the traffic source, not a resource. */
export type ResourceKind = Exclude<ComponentKind, 'ingress'>

/**
 * A placed component (02-SIMULATION §4). Ingress has no capacity or latency, so its
 * `replicas` and `tier` are ignored.
 */
export type ComponentNode = {
  readonly [K in ComponentKind]: {
    readonly id: NodeId
    readonly kind: K
    /** Instance count, a positive integer. */
    readonly replicas: number
    /** Size within the kind: an index into the catalog's tiers for that kind. */
    readonly tier: number
    readonly config: ComponentConfigByKind[K]
  }
}[ComponentKind]

export type ResourceNode = Extract<ComponentNode, { readonly kind: ResourceKind }>

/** Directed edge: requests flow from `from` to `to`. */
export type Edge = { readonly from: NodeId; readonly to: NodeId }

export type Architecture = {
  readonly nodes: readonly ComponentNode[]
  readonly edges: readonly Edge[]
}

/** Per-tier performance figures: the engine-facing subset of `ComponentDef.tiers` (03-CONTENT-SCHEMA). */
export type TierStats = {
  /** Throughput one instance sustains, rps. */
  readonly capacityRps: number
  /** Mean time to serve one request with no queueing, ms. */
  readonly serviceTimeMs: number
}

export type ComponentCatalog = { readonly [K in ResourceKind]: readonly TierStats[] }

/** Per-tier prices: the cost half of `ComponentDef.tiers` (03-CONTENT-SCHEMA §5). */
export type TierCosts = {
  /** One-time cost per instance, charged on the first turn it runs, integer cents. */
  readonly setupCostCents: number
  /** Cost per instance per turn, integer cents. */
  readonly runningCostPerTurnCents: number
}

export type TierDef = TierStats & TierCosts

/** Performance and prices for every tier. Assignable to `ComponentCatalog`. */
export type PricedCatalog = { readonly [K in ResourceKind]: readonly TierDef[] }

export type TickInput = {
  readonly turn: number
  readonly architecture: Architecture
  readonly workload: Workload
  readonly catalog: ComponentCatalog
}

/** One resource node resolved at peak load. */
export type NodeMetrics = {
  /** Load arriving at the node, rps. */
  readonly inboundRps: number
  /** Total capacity after replicas and health, rps. */
  readonly capacityRps: number
  /** Utilization u, 0..BALANCE.queueing.maxUtilization. */
  readonly utilization: number
  /** Load the node serves and passes on, rps. */
  readonly servedRps: number
  /** Load beyond capacity, dropped here and never sent downstream, rps. */
  readonly droppedRps: number
  /** Mean response time W, ms. */
  readonly meanMs: number
  readonly p50Ms: number
  readonly p99Ms: number
}

/** End-to-end metrics for one request class at peak load. */
export type ClassMetrics = {
  /** Sum of per-hop p50s, ms. */
  readonly p50Ms: number
  /** Sum of per-hop p99s, ms (ADR-0009). */
  readonly p99Ms: number
  /** Share of requests dropped somewhere on the path, 0..1. */
  readonly errorRate: number
}

/**
 * The M1 subset of 02-SIMULATION §9 (ADR-0020). Status, bottleneck, economy, reputation,
 * events and nextRun arrive with the milestones that compute them.
 */
export type TickResult = {
  readonly turn: number
  readonly workload: Workload
  /** meanRps × peakMultiplier: the load every latency and error figure is resolved at, rps. */
  readonly peakRps: number
  readonly perNode: Readonly<Record<NodeId, NodeMetrics>>
  readonly perClass: Readonly<Record<RequestClass, ClassMetrics>>
}

export type TopologyError =
  | { readonly kind: 'duplicate-node-id'; readonly nodeId: NodeId }
  | { readonly kind: 'unknown-edge-endpoint'; readonly edge: Edge; readonly nodeId: NodeId }
  | { readonly kind: 'duplicate-edge'; readonly edge: Edge }
  | { readonly kind: 'cycle'; readonly nodeIds: readonly NodeId[] }
  | { readonly kind: 'missing-ingress' }
  | { readonly kind: 'multiple-ingress'; readonly nodeIds: readonly NodeId[] }
  | { readonly kind: 'ingress-has-inbound'; readonly nodeId: NodeId }
  | { readonly kind: 'datastore-not-terminal'; readonly nodeId: NodeId }
  | { readonly kind: 'no-datastore-path'; readonly requestClasses: readonly RequestClass[] }
  | {
      readonly kind: 'unsupported-topology'
      readonly nodeId: NodeId
      readonly reason: 'branching' | 'disconnected'
    }

export type InputError =
  | { readonly kind: 'invalid-workload'; readonly field: keyof Workload }
  | {
      readonly kind: 'invalid-node-config'
      readonly nodeId: NodeId
      readonly field: 'replicas' | 'fanoutFactor'
    }
  | { readonly kind: 'unsupported-replicas'; readonly nodeId: NodeId; readonly replicas: number }
  | { readonly kind: 'unknown-tier'; readonly nodeId: NodeId; readonly tier: number }
  | { readonly kind: 'invalid-tier-stats'; readonly nodeId: NodeId }
  | { readonly kind: 'invalid-tier-costs'; readonly nodeId: NodeId }

export type TickError = TopologyError | InputError

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

/** The part of a run that a rollback restores to the start of the act (00-GAME-DESIGN §8). */
export type RunCheckpoint = {
  /** Cash on hand, integer cents. */
  readonly cashCents: number
  /** Player reputation, 0..1 (02-SIMULATION §7). */
  readonly reputation: number
  /** The last resolved turn's workload. Before turn 1, the run's starting workload. */
  readonly workload: Workload
  /** What the next turn runs. The player edits this between turns. */
  readonly architecture: Architecture
  /** What ran last turn and is paid for. Setup costs are charged on the difference (ADR-0023). */
  readonly builtArchitecture: Architecture
  /** Current act, 1–5. Never decreases. */
  readonly act: number
  /** Whether this act's one investor bailout is still unused. */
  readonly bailoutAvailable: boolean
  /** Turns of bailout-slowed growth still to come. */
  readonly growthPenaltyTurns: number
}

/** One playthrough, as saved and as advanced by `simulateTurn` (01-ARCHITECTURE §4). */
export type RunState = RunCheckpoint & {
  /** Run seed, unsigned 32-bit. Turn t draws from rngForTurn(seed, t). */
  readonly seed: number
  /** Turns resolved so far: 0 for a new run. Keeps counting through a rollback. */
  readonly turn: number
  /** The run as it stood when the current act began. */
  readonly actStart: RunCheckpoint
  /** Metrics for the most recent turns, oldest first. */
  readonly history: readonly TurnSummary[]
  /** Totals for turns that aged out of `history` (01-ARCHITECTURE §7). */
  readonly archive: HistoryArchive
}

export type SimEvent =
  | { readonly kind: 'act-started'; readonly act: number }
  | { readonly kind: 'bailout'; readonly cashCents: number }
  | { readonly kind: 'rollback'; readonly reason: 'bankruptcy' | 'churn'; readonly act: number }

/** One turn's metrics as kept in a run's history. */
export type TurnSummary = {
  readonly turn: number
  /** Mean traffic this turn, rps. */
  readonly meanRps: number
  /** Peak traffic this turn, rps. */
  readonly peakRps: number
  /** Active users this turn's traffic represents. */
  readonly users: number
  /** Service p99 at peak, ms. */
  readonly p99Ms: number
  /** Service error rate at peak, 0..1. */
  readonly errorRate: number
  /** Peak utilization per resource node, 0..BALANCE.queueing.maxUtilization, rounded to 1 / PERSISTENCE.utilizationScale. */
  readonly utilization: Readonly<Record<NodeId, number>>
  readonly revenueCents: number
  /** Running plus bandwidth costs, cents. */
  readonly costCents: number
  readonly setupCostCents: number
  readonly sloMet: boolean
  /** Cash at the end of the turn, after any bailout or rollback, cents. */
  readonly cashCents: number
  /** Reputation at the end of the turn, after any bailout or rollback, 0..1. */
  readonly reputation: number
  readonly events: readonly SimEvent[]
}

/** Running totals for turns older than the history window. */
export type HistoryArchive = {
  readonly turns: number
  readonly revenueCents: number
  readonly costCents: number
  readonly setupCostCents: number
  readonly sloMetTurns: number
  /** Most users in any archived turn. */
  readonly peakUsers: number
}

export type TurnInput = {
  /** Difficulty from settings. It may change between any two turns. */
  readonly difficulty: Difficulty
  readonly catalog: PricedCatalog
}

/** Service-wide figures at peak that SLOs, revenue and reputation are judged on (ADR-0023). */
export type ServiceLevel = {
  /** Highest p99 among request classes that carry traffic, ms. */
  readonly p99Ms: number
  /** Share of all requests dropped, 0..1. */
  readonly errorRate: number
}

/** One turn's money (02-SIMULATION §6). All amounts integer cents. */
export type EconomyResult = {
  /** Mean traffic that was served rather than dropped, rps. */
  readonly servedMeanRps: number
  /** Revenue multiplier from latency, unitless. */
  readonly qualityMultiplier: number
  readonly revenueCents: number
  /** Running plus bandwidth costs. */
  readonly costCents: number
  readonly setupCostCents: number
  /** revenueCents − costCents − setupCostCents. */
  readonly netCents: number
  /** Cash after this turn, before any bailout or rollback. */
  readonly cashCents: number
  readonly breakdown: { readonly runningCents: number; readonly bandwidthCents: number }
}

export type ReputationResult = {
  /** Reputation after this turn's SLO outcome, before any bailout or rollback, 0..1. */
  readonly value: number
  /** Change actually applied after clamping to 0..1. */
  readonly delta: number
  readonly sloMet: boolean
  /** max(p99 / p99Target, errorRate / errorRateTarget), unitless. At least 1 when an SLO is missed. */
  readonly severity: number
}

/** Everything one Advance produces (02-SIMULATION §9). */
export type TurnResult = TickResult & {
  readonly service: ServiceLevel
  readonly economy: EconomyResult
  readonly reputation: ReputationResult
  /** Active users this turn's mean traffic represents. */
  readonly users: number
  readonly events: readonly SimEvent[]
  readonly nextRun: RunState
}
