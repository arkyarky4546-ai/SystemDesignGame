# Simulation

Authority: the model. Every formula the game runs on lives here. If code and
this doc disagree, one of them is a bug — decide which and fix it, don't let
them drift.

## 0. Design stance

The simulation is a **teaching instrument that behaves like a real system**, not
an accurate simulator. Where a choice exists between fidelity and pedagogy,
pedagogy wins — but the shape of the curve must always be right. Latency should
blow up near saturation because that is genuinely what queueing does, not
because we made a rule that says so. A player who internalizes this model should
find real systems familiar, not surprising.

Every formula below is chosen to be (a) standard, (b) closed-form, (c) unit
testable, (d) something you can explain in one sentence to the player.

## 1. Units and conventions

| Quantity | Unit | Type |
|---|---|---|
| Traffic | requests per second | `number` (rps) |
| Latency | milliseconds | `number` (ms) |
| Money | integer cents | `number` (cents) |
| Time | turns = 1 in-game week | `number` |
| Utilization | 0..1 | `number` |
| Rates/fractions | 0..1 | `number` |

Function names carry units: `capacityRps`, `serviceTimeMs`, `costPerTurnCents`.

## 2. Determinism

One seeded PRNG, mulberry32 or xorshift128, in `engine/rng.ts`. The run seed is
stored in `RunState`. Turn `t` uses a derived stream `hash(seed, t)` so that
replaying a turn produces identical results and inserting a new random draw in
turn 5 doesn't shift turn 6's outcomes.

Forbidden in `src/engine/`: `Math.random`, `Date.now`, `new Date()`,
`performance.now`, `crypto.getRandomValues`. A test greps for these.

## 3. The workload model

Each turn produces a **workload** describing the traffic the architecture must
serve:

```ts
type Workload = {
  meanRps: number         // average over the week
  peakMultiplier: number  // peak-hour rps = meanRps * peakMultiplier
  readFraction: number    // 0..1, remainder are writes
  staticFraction: number  // 0..1 of reads that are cacheable static assets
  keySkew: number         // 0..1. 0 = uniform key distribution, 1 = one hot key
  payloadKb: number       // affects bandwidth cost and CDN value
}
```

**Resolution happens at peak, not at mean.** This is deliberate and it's a
lesson in itself: systems are sized for peak. The resolver computes results at
`peakRps = meanRps * peakMultiplier` for latency and error purposes, then uses
mean for revenue and cost volume. New players discover this the hard way when an
architecture that looks fine on average collapses every Tuesday at 8pm.

### Traffic growth

```
meanRps(t+1) = meanRps(t) × (1 + g) × reputationModifier(t) × eventModifier(t)
```

where `g = BALANCE.traffic.baseGrowthPerTurn[difficulty]` plus a seeded normal
draw with sigma from balance config, the draw clamped to `[-0.5g, +3g]`. Total
growth therefore stays between 0.5g and 4g, so noise alone never shrinks
traffic. The draw is approximately normal: the standardized sum of four uniform
draws, since exact methods need functions JavaScript engines may round
differently. For `bailoutGrowthPenaltyTurns` after an investor bailout (§7.2),
`g` is multiplied by `bailoutGrowthMultiplier`. ADR-0023.

`reputationModifier` is defined in §7. `eventModifier` is 1 except during
scripted incidents.

## 4. The architecture graph

```ts
type Architecture = {
  nodes: ComponentNode[]
  edges: Edge[]   // directed, from → to
}

type ComponentNode = {
  id: string
  kind: ComponentKind
  replicas: number        // >= 1
  tier: number            // size/spec within a kind, 0..3
  config: ComponentConfig // kind-specific, discriminated on kind
}
```

Requests enter at a single `ingress` node and flow along edges. The graph must
be a DAG; cycles are rejected at build time with a UI error (except queue
feedback edges, which are modeled as a separate mechanism, not a graph edge).

**Path resolution.** `topology.ts` computes, for each request class (static
read, dynamic read, write), the ordered list of nodes it traverses. A request
class that has no valid path to a terminal data store is an error surfaced in
the UI before the player can advance the turn — "writes have nowhere to go."

## 5. Tick resolution

Order matters. `resolve.ts` executes exactly these phases:

```
1. validate topology
2. compute workload for this turn (traffic growth, incident modifiers)
3. split workload into request classes
4. propagate load forward through the graph, applying absorbers
5. compute per-node utilization, latency, and drops
6. aggregate per-class end-to-end latency (p50, p99) and error rate
7. resolve component failures (redundancy check, cascades)
8. compute revenue, costs, cash
9. update reputation and user base
10. evaluate incident/scenario criteria if active
11. emit TickResult
```

### 5.1 Load propagation

Walking the graph from ingress, each node receives `inboundRps` and emits
`outboundRps` to its downstream neighbors. **Absorbers reduce what flows
onward** — this is where caching, CDNs, and queues earn their keep.

| Node | Outbound effect |
|---|---|
| CDN | `outbound = inbound × (1 − staticFraction × cdnHitRate)` |
| Cache | `outbound = inbound × (1 − effectiveHitRate)` |
| Load balancer | `outbound = inbound`, split across `replicas` downstream |
| App server | `outbound = inbound × fanoutFactor` (queries per request) |
| Queue | see §5.5 |
| Database | terminal |

When a load balancer splits across N replicas, each replica receives
`inbound / N × imbalanceFactor`, where `imbalanceFactor` is 1.0 for round-robin
with homogeneous replicas and rises with `keySkew` for consistent-hashing or
sticky-session strategies. This is how session affinity becomes a felt tradeoff
rather than a bullet point.

### 5.2 Utilization and latency — the core formula

For each node:

```
capacityRps = kindBaseCapacity[kind][tier] × replicas × healthFactor
u           = min(inboundRps / capacityRps, U_MAX)     // U_MAX = 0.995
```

Mean response time from M/M/1:

```
W = serviceTimeMs / (1 − u)
```

Response time in M/M/1 is exponentially distributed with mean `W`, so:

```
p50 = W × ln(2)      ≈ 0.693 × W
p99 = W × ln(100)    ≈ 4.605 × W
```

These are exact for M/M/1, not fudge factors — worth stating in the lesson that
teaches this, because a player who sees "p99 is about 4.6× the mean" has learned
something true.

End-to-end latency for a request class is the sum over its path. Summing
per-hop p99s overestimates the true end-to-end p99 (independent tails don't add
that way), and we do it anyway: it's conservative, it's simple, and it correctly
teaches that every hop costs you. Note it in a code comment so nobody "fixes" it
later. ADR-0009.

**Drops.** If `inboundRps > capacityRps`:

```
droppedRps = inboundRps − capacityRps
errorRate  = droppedRps / inboundRps
```

Drops do not propagate downstream — a dropped request never reaches the
database. This is why an overloaded app tier can mask a database problem, and
why fixing the app tier can immediately break the database. That cascade is one
of the best lessons in the game and it falls out of the model for free.

### 5.3 Caches

```
effectiveHitRate = configuredHitRate × sizeFactor × (1 − keySkewPenalty) × warmth
```

- `sizeFactor = min(1, cacheSizeGb / workingSetGb)` — undersized caches thrash.
- `keySkewPenalty` is *negative* for skewed traffic. High skew makes caches
  **better**, not worse (a hot key is the ideal cache entry). Do not get this
  backwards; it's the opposite sign from the sharding case in §5.6, and that
  contrast is itself a lesson.
- `warmth` ramps from 0 to 1 over `cacheWarmupTurns` after a cache is added or
  invalidated. This is what makes a cache stampede possible (§8).

Cache hits get `cacheServiceTimeMs` (single-digit ms), misses pay the full
downstream path plus the cache lookup.

### 5.4 Databases

Reads and writes route differently once replicas exist.

```
writeRps = totalRps × (1 − readFraction) × fanout
readRps  = totalRps × readFraction × fanout × (1 − cacheHitRate)

primary.inbound = writeRps + (replicaCount === 0 ? readRps : 0)
eachReplica.inbound = readRps / replicaCount
```

Every replica also applies the full write stream (replication is not free):

```
replica.effectiveLoad = (readRps / replicaCount) + writeRps × replicationCostFactor
```

This is the thing most tutorials skip and it's important: **read replicas do not
help write-heavy workloads, and past a point they hurt**. A player who adds ten
replicas to fix a write bottleneck watches it get worse. That's the lesson.

**Replication lag:**

```
lagMs = baseLagMs × (1 + primaryUtilization) × (1 + replicaCount × 0.1)
```

Lag has gameplay consequences: if the architecture serves reads from replicas
and lag exceeds a threshold, a fraction of requests return stale data, which
counts against a "correctness" metric separate from error rate. This is how
eventual consistency becomes visible instead of abstract.

### 5.5 Queues

A queue converts *drops* into *delay*.

```
arrivalRps = inbound
drainRps   = workerCapacity × workerReplicas
backlog(t) = max(0, backlog(t−1) + (arrivalRps − drainRps) × secondsPerTurn)
```

Work in the backlog is not lost and not errored — it's late. Requests routed
through a queue get `queueDelayMs = backlog / drainRps × 1000`, which can be
enormous, and jobs older than `staleAfterTurns` are dropped with a specific
`stale_job` error type.

Queues only apply to work the player has designated async. Making a
synchronous user-facing read async is a design error the game should let you
make and then show you the consequences of: the user is waiting, so
`queueDelayMs` lands directly in their p99.

Overflow: `backlog > maxBacklog` → drops resume. Unbounded queues are not a
thing; teach that.

### 5.6 Sharding

```
shardLoad[i] = totalLoad × shardShare[i]
```

With uniform keys, `shardShare[i] = 1/N`. With `keySkew > 0`, distribution
follows a Zipf-like curve parameterized by skew, so shard 0 takes
disproportionately more. The **hottest shard determines your p99**, not the
average — surface both numbers in the UI, because the gap between them is the
entire point.

Cross-shard queries (any request whose key isn't the shard key) cost
`crossShardPenalty × shardCount` in service time, which is how "choosing the
wrong shard key" becomes a decision with teeth.

### 5.7 Failures and redundancy

Per node per turn:

```
failed = rng.next() < failureRatePerTurn[kind][tier]
```

- Node with `replicas > 1`: one replica fails, capacity drops by `1/replicas`
  for `recoveryTurns`. Survivable, and it teaches N+1.
- Node with `replicas === 1` and no failover: **full outage** of every request
  class whose path traverses it. Error rate for those classes goes to 1.0 for
  `outageDurationTurns`.
- Database primary with replicas but no automatic failover configured: outage
  until manual promotion, which costs a turn. With failover configured: brief
  degradation. The difference between those two numbers is worth a lesson.

**Cascades (Staff difficulty only, per §6 of the game design doc).** When a node
fails, its load redistributes to surviving peers. If that pushes them past
capacity, they fail too. Implement as a bounded fixed-point loop — max 10
iterations, log if it doesn't converge — and never as recursion without a depth
cap.

## 6. Economy

```
servedRps       = meanRps × (1 − errorRate)
revenueCents    = servedRps × secondsPerTurn / 1000
                  × revenuePerThousandRequestsCents
                  × qualityMultiplier

qualityMultiplier = clamp(1.6 − 0.4 × (p99 / p99Target), 0.5, 1.2)
```

Fast service is worth more than slow service, and the multiplier is capped both
directions. The cap binds exactly at the SLO, so gold-plating latency past the
SLO earns nothing. Above the target, revenue falls linearly to the 0.5 floor,
reached at 2.75× the target. Over-optimizing is its own trap. ADR-0022.

```
costCents = Σ nodes [ runningCostPerTurnCents(kind, tier) × replicas ]
          + bandwidthCents
          + storageCents

bandwidthCents = servedRps × secondsPerTurn × payloadKb × costPerGb / 1e6
                 × (1 − cdnOffloadFraction)

cash(t+1) = cash(t) + revenueCents − costCents − oneTimeSetupCosts
```

CDN offload reducing bandwidth cost is frequently the *only* reason a CDN pays
for itself, and that should be legible in the weekly report's cost breakdown.

`errorRate` and `p99` here and in §7 are service-wide:
- `errorRate` weights each request class's error rate by its share of traffic.
- `p99` is the worst p99 among classes that carry traffic.

Revenue and bandwidth round to whole cents. One-time setup costs are charged for
what changed since last turn: new nodes, tier changes, and added replicas.
`storageCents` is 0 until a data-size model exists. ADR-0023.

## 7. Reputation and user growth

Reputation is 0..1, starts at 0.7.

```
sloMet = p99 ≤ p99Target && errorRate ≤ errorRateTarget && staleRate ≤ staleTarget

delta = sloMet
  ? +BALANCE.reputation.gainPerGoodTurn
  : −BALANCE.reputation.lossPerBadTurn × severity

severity = max(p99 / p99Target, errorRate / errorRateTarget)   // ≥ 1 when bad

reputation(t+1) = clamp(reputation(t) + delta, 0, 1)
```

Asymmetry is deliberate: `lossPerBadTurn` is roughly 3× `gainPerGoodTurn`.
Trust is lost faster than it's earned, which is both true and good game design.

```
reputationModifier = 0.6 + 0.8 × reputation    // range [0.6, 1.4]
```

Applied to next turn's traffic growth (§3). Great service compounds; bad service
stalls you out. This is the feedback loop that makes the whole economy work —
it's why you can't simply run a terrible architecture cheaply and profit.

`staleRate` is 0 until replicas can serve stale reads. ADR-0023.

### 7.1 Users and acts

Users are derived from traffic, not simulated separately:

```
users = meanRps / BALANCE.traffic.meanRpsPerUser
```

Churn is the loop above. When `(1 + g) × reputationModifier < 1`, traffic and
users shrink. The act is the highest of `00-GAME-DESIGN.md` §9's user thresholds
reached, and it never goes down. ADR-0024.

### 7.2 Failure states

Applied after reputation, in this order (`00-GAME-DESIGN.md` §8, ADR-0024):

```
1. users < churnFloorOfActStart × users at the act's start   → roll back
2. cash < 0, and this act's bailout is unused                → bailout:
     cash = bailoutCashCents[difficulty]
     reputation −= bailoutReputationPenalty
     growth slowed (§3)
3. cash < 0, and the bailout is spent                        → roll back
4. otherwise, entering a new act resets the bailout and becomes the rollback point
```

A rollback restores the state saved at the act's start: cash, reputation,
workload, architecture, act, and bailout state. The turn counter keeps counting.
Knowledge lives outside the run and is never touched.

## 8. Named mechanics that produce specific lessons

Each is an emergent consequence of the model above, not a special case. They're
listed so tests can assert they actually occur.

| Mechanic | How it emerges | Lesson |
|---|---|---|
| **Saturation cliff** | `1/(1−u)` | p99 goes vertical between 85% and 95% utilization |
| **Cache stampede** | `warmth` resets to 0 on invalidation | Cold caches can take down the origin that was fine a second ago |
| **Write amplification** | replicas apply write stream | Read replicas don't fix write problems |
| **Hot shard** | Zipf `shardShare` | Your p99 is the worst shard, not the mean |
| **Masked bottleneck** | drops don't propagate | Fixing the front tier can break the back tier |
| **Queue backlog death** | `backlog / drainRps` | An unbounded queue turns an outage into a longer outage |
| **Thundering herd** | retry multiplier on error | Retries amplify the failure that caused them |
| **SPOF outage** | `replicas === 1` | One of everything is zero of something |

## 9. TickResult

Everything the UI needs, computed once:

```ts
type TickResult = {
  turn: number
  workload: Workload
  perNode: Record<NodeId, {
    inboundRps: number
    capacityRps: number
    utilization: number
    p50Ms: number
    p99Ms: number
    droppedRps: number
    status: 'healthy' | 'warning' | 'saturated' | 'failed'
  }>
  perClass: Record<RequestClass, {
    p50Ms: number; p99Ms: number; errorRate: number; staleRate: number
  }>
  economy: { revenueCents, costCents, netCents, cashCents, breakdown }
  reputation: { value: number; delta: number; sloMet: boolean }
  events: SimEvent[]        // failures, incident triggers, thresholds crossed
  bottleneck: NodeId | null // highest utilization node above warning threshold
  nextRun: RunState
}
```

`bottleneck` exists because the weekly report's plain-language observation is
generated from it, and because "which thing is the problem" is the question the
player is always asking.

## 10. What the simulation deliberately does not model

Say no to these clearly, or they'll creep in and turn a 400-line engine into a
4,000-line one: TCP/connection pooling, GC pauses, cold starts, DNS,
TLS handshake cost, actual data modeling, index selection, network partitions
between arbitrary node pairs, clock skew, and anything requiring per-request
simulation rather than closed-form rates.

Several of those are great *lesson* topics. They're taught in prose and tested
in checks; they just don't have simulation mechanics behind them.
