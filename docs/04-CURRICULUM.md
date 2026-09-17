# Curriculum

Authority: what gets taught, in what order, and what each concept unlocks.

This is the content backlog. It is deliberately larger than the MVP — build
Tier 1 completely before writing a word of Tier 3.

## How to read this

Each concept lists: prerequisites → what it unlocks → the specific thing the
player should be able to *do* afterward. That last column is the real
specification. If a lesson doesn't produce the stated capability, the lesson is
wrong regardless of how correct its sentences are.

Concept ids are stable and must never be reused or renamed after release —
they're keys in save files.

---

## Tier 1 — One box (Act 1: 10 → 1,000 users)

The player starts with a single app server and a single database, both already
placed. Nothing else is unlocked.

| id | Title | Prereqs | Unlocks | After this, the player can |
|---|---|---|---|---|
| `client-server-basics` | What a request actually does | — | — | Trace a request through their architecture and name each hop |
| `latency-and-throughput` | Latency vs throughput | `client-server-basics` | — | Explain why a system can be fast and still fall over |
| `capacity-and-utilization` | Capacity, utilization, and the cliff | `latency-and-throughput` | Server tier upgrades | Compute instances needed for a target rps and headroom |
| `percentiles` | Why the average lies | `latency-and-throughput` | p99 panel in the dashboard | Explain why p99 matters more than mean to a user |
| `vertical-scaling` | Making the box bigger | `capacity-and-utilization` | Component tier 1→3 upgrades | Say where vertical scaling stops helping and why |
| `single-point-of-failure` | One of everything is zero of something | `vertical-scaling` | Failure panel; a second app-server instance | Identify every SPOF in an architecture on sight |

**Act 1 incident:** `the-first-outage` — a modest traffic spike saturates the
single server. Fixable only by upgrading the tier, which teaches that vertical
scaling is real and also that it runs out.

Tier 1 is the MVP content set. Six concepts, ~30 questions, one incident, one
demo (the saturation slider). Ship this before anything else.

**On the instance unlocks (ADR-0050).** `replicas > 1` on app servers was
originally all `horizontal-scaling`'s. It is split, so that each concept opens
something its own lesson names: `single-point-of-failure` opens the second
instance, which is the N+1 fix it teaches, and `horizontal-scaling` lifts the
cap. Without the split, Tier 1 would teach a fix the player cannot buy until
Tier 2 content exists. Databases stay at one instance either way: §5.4's
replication is Tier 3's subject.

---

## Tier 2 — More than one box (Act 2: 1k → 100k users)

| id | Title | Prereqs | Unlocks | After this, the player can |
|---|---|---|---|---|
| `horizontal-scaling` | Adding boxes instead of buying bigger ones | `vertical-scaling` | No cap on app-server instances | Choose between scaling up and scaling out with reasons |
| `load-balancing` | Splitting traffic | `horizontal-scaling` | Load balancer component | Place a balancer and pick a strategy |
| `statelessness` | Why your servers can't remember anything | `load-balancing` | Session store config | Explain why sticky sessions cause imbalance |
| `caching-fundamentals` | Not asking the same question twice | `percentiles` | Cache component | Predict downstream load reduction from a hit rate |
| `cache-invalidation` | The hard part | `caching-fundamentals` | TTL and eviction config | Choose a TTL and defend it; recognize a stampede |
| `db-as-bottleneck` | Everything ends at the database | `caching-fundamentals` | DB monitoring panel | Find the real bottleneck when the front tier looks fine |
| `connection-limits` | Why the database says no | `db-as-bottleneck` | Connection pool config | Explain why adding servers can *reduce* database throughput |
| `cdn-and-edge` | Serving bytes from nearby | `caching-fundamentals` | CDN component | Compute the bandwidth cost saved by edge offload |

**Act 2 incident:** `cache-stampede` — a deploy flushes the cache at peak;
origin load multiplies instantly. Viable responses include staged warming,
request coalescing, and temporarily over-provisioning origin. Multiple correct
answers with different costs, which is what makes it a good incident.

---

## Tier 3 — Data that doesn't fit (Act 3: 100k → 5M users)

| id | Title | Prereqs | Unlocks | After this, the player can |
|---|---|---|---|---|
| `read-replicas` | Copies of the truth | `db-as-bottleneck` | DB replica component | Predict that replicas don't help write-heavy loads |
| `replication-lag` | The copies are behind | `read-replicas` | Lag panel, read routing config | Decide which reads can tolerate staleness |
| `consistency-models` | Strong, eventual, and the space between | `replication-lag` | Read-consistency config | Pick a consistency level per request class and justify it |
| `async-processing` | Do it later | `connection-limits` | Queue + worker components | Identify work that can leave the request path |
| `queue-semantics` | At-least-once, at-most-once, backlogs | `async-processing` | Retry and DLQ config | Explain why a bounded queue is mandatory |
| `idempotency` | Doing it twice safely | `queue-semantics` | Idempotency key config | Design a retry-safe write |
| `storage-tiers` | Not everything belongs in the database | `read-replicas` | Object store, blob config | Route large payloads out of the primary datastore |
| `indexing-tradeoffs` | Fast reads, slow writes | `db-as-bottleneck` | Index config on DB | Explain the write cost of an index |
| `failover` | When the primary dies | `read-replicas` | Automatic failover config | Quantify the difference between manual and automatic promotion |

**Act 3 incident:** `primary-down` — the database primary fails at peak. A
player with automatic failover configured loses seconds; one without loses turns
and reputation. The incident is `architecture`-triggered so it reliably finds
players who skipped failover.

---

## Tier 4 — Splitting the data (Act 4: 5M → 100M users)

| id | Title | Prereqs | Unlocks | After this, the player can |
|---|---|---|---|---|
| `partitioning-basics` | Cutting the data up | `storage-tiers` | Shard config | Distinguish vertical from horizontal partitioning |
| `shard-keys` | The most expensive decision | `partitioning-basics` | Shard key selection | Pick a shard key and predict its skew |
| `hot-partitions` | One shard is on fire | `shard-keys` | Per-shard metrics | Diagnose skew from per-shard graphs |
| `consistent-hashing` | Adding shards without moving everything | `shard-keys` | Rebalancing config | Explain why naive modulo hashing makes resharding painful |
| `cross-shard-queries` | Questions that span everything | `shard-keys` | — | Restructure a query to stay within a shard |
| `multi-region` | Distance is latency | `failover` | Region config | Compute the floor that the speed of light puts on cross-region calls |
| `cap-in-practice` | What CAP actually constrains | `consistency-models`, `multi-region` | — | State what a partition forces you to give up, precisely |
| `cost-engineering` | The bill is a design constraint | `multi-region` | Cost breakdown panel | Find the largest line item and attack it |

**Act 4 incident:** `the-celebrity-key` — one key becomes 40% of traffic. Skew
shifts, one shard saturates, everything downstream of it suffers. Responses
include a dedicated cache for the hot key, splitting the key, or read-path
special-casing.

---

## Tier 5 — Operating it (Act 5: 100M+)

| id | Title | Prereqs | Unlocks | After this, the player can |
|---|---|---|---|---|
| `failure-domains` | Blast radius | `multi-region` | Zone/region placement | Place components so one failure doesn't take everything |
| `graceful-degradation` | Being partly up | `failure-domains` | Feature-flag config | Choose what to turn off first under load |
| `backpressure` | Saying no on purpose | `queue-semantics` | Rate limit + load shed config | Explain why shedding 10% beats collapsing 100% |
| `retries-and-jitter` | Making it worse politely | `backpressure` | Retry policy config | Explain how naive retries amplify an outage |
| `circuit-breakers` | Stop calling the dead thing | `retries-and-jitter` | Breaker config | Set a threshold and justify it |
| `observability` | Knowing before the users tell you | `percentiles` | Alerting config | Choose SLIs that would have caught the last three incidents |
| `capacity-planning` | Buying the future | `cost-engineering` | Forecast panel | Size for projected peak, not current mean |
| `incident-response` | The first five minutes | `observability` | Runbook config | Order the steps of a real incident response |

**Act 5 incident:** `cascading-failure` — a single node failure redistributes
load, saturating peers, which fail, which redistributes further. Only
survivable with backpressure or circuit breakers already in place, which is
exactly the lesson: you cannot install resilience during the outage.

---

## Sequencing and the definition of "enough"

Build tiers in order. A tier is complete when:

- Every concept has a reviewed lesson and a check with `poolSize ≥ 2×drawCount`.
- Every unlocked component has a `ComponentDef` with balanced tier values.
- The tier's incident exists, is reviewed, and its `goodResponses` verifiably
  pass under `npm run validate`.
- The balance harness can complete the tier's act on all four difficulties.

**Tier 1 alone is a shippable game.** Ship it, play it, then decide whether the
loop is fun before writing sixty more questions. If the loop is boring at Tier
1, more content will not fix it — the loop will.

## Content volume estimate

Be honest about this up front.

| Tier | Concepts | Questions (~6/concept) | Incidents | Demos |
|---|---|---|---|---|
| 1 | 6 | ~36 | 1 | 2 |
| 2 | 8 | ~48 | 1 | 2 |
| 3 | 9 | ~54 | 1 | 2 |
| 4 | 8 | ~48 | 1 | 1 |
| 5 | 8 | ~48 | 1 | 1 |
| **Total** | **39** | **~234** | **5** | **8** |

Plus design reviews (2–3 per act). This is the real work of the project — the
engine is maybe 15% of the effort. Plan accordingly, and resist the urge to
generate all 234 questions in one session; they will be worse and nobody will
review them.
