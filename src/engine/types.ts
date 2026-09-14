// Plain data shapes for the simulation engine. Units follow 02-SIMULATION §1: traffic in
// rps, latency in ms, fractions and utilization 0..1. Everything is readonly because
// engine functions never modify their inputs.

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

export type TickError = TopologyError | InputError

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }
