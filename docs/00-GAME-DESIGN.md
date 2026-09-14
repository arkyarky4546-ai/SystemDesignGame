# Game design

Authority: the game's rules, loop, and progression. Numbers live in
`02-SIMULATION.md`; this doc explains what the numbers are for.

## 1. Why a tycoon and not a collect-and-battle game

Recorded here because it will get questioned later.

A creature-collection game teaches through a quiz layer bolted onto a battle
system that has nothing to do with the subject. There is no honest reason a
load balancer fights a cache. The learning would all happen in the quiz and the
game would be decoration — which means the game can be removed without loss,
which means it isn't doing any work.

A tycoon maps onto system design directly. The domain is already about capacity,
latency, cost, and failure under load. A simulation of those things *is* the
lesson. You learn replication because your read traffic is drowning your primary
and you can watch it happen on a graph. Feedback is immediate, diegetic, and
quantitative.

Secondary reasons: no art pipeline, no balance-a-type-chart problem, and the
whole game is a deterministic numeric simulation, which is the most testable
thing a game can be.

The cost we accept: economy balance is a genuine design risk. Mitigated by
`docs/07-TESTING.md`'s balance harness, which plays the game headlessly
thousands of times and reports unwinnable or trivially-winnable configurations.

## 2. Fiction

You are the infrastructure team — the whole team — for a product that is
accidentally succeeding. The product itself is deliberately vague and slightly
silly (a link shortener, a photo app, a place where people post opinions about
sandwiches) so the player's attention stays on the infrastructure. Traffic
grows. You are given a budget and no help.

Tone: dry, competent, faintly exhausted. Not zany. The humor comes from
understatement — an incident report that says "the database is fine, the
database is always fine" while the graph is vertical.

## 3. Core loop

One **turn** = one in-game **week**. Turn-based, not real-time. The player
presses Advance when ready.

```
        ┌──────────────────────────────────────────┐
        │                                          │
        ▼                                          │
   PLAN ─────► BUILD ─────► RUN ─────► REVIEW ─────┘
   (learn)     (spend)     (simulate)  (read results)
```

**PLAN.** Look at next week's forecast traffic and your current headroom. Maybe
you already know what to do. Maybe the thing you need is locked, in which case
you go learn it — a lesson (2–4 minutes) plus a check (3–6 questions). Passing
the check unlocks the component permanently.

**BUILD.** Place and wire components on the architecture canvas. Every component
has a one-time setup cost and a per-week running cost. You can also remove,
resize, and reconfigure.

**RUN.** Press Advance. The simulation resolves the week: traffic flows through
your architecture, latency and error rates fall out of it, revenue and costs
settle, users churn or multiply.

**REVIEW.** A weekly report. Graphs of p99 latency, error rate, utilization per
component, cash, and users. Plus one plain-language observation ("your database
spent 94% of the week above 80% utilization; that's why p99 tripled").

The loop is deliberately short. A turn should take 30–90 seconds when you know
what you're doing, and several minutes when you need to go learn something.

## 4. Progression: knowledge is the tech tree

This is the central mechanic and must not be diluted.

Components are locked behind **concepts**. A concept has a lesson and a check.
Pass the check (threshold varies by difficulty — see §6) and every component the
concept gates becomes purchasable, permanently, across all saves on this device.

Examples of the gate relationship:

| Concept | Unlocks |
|---|---|
| Horizontal scaling | Additional app server instances |
| Load balancing | Load balancer component, balance-strategy config |
| Caching fundamentals | Cache component, TTL and hit-rate config |
| Read replicas | DB replica component, read/write routing |
| Async processing | Queue component, worker pool |
| Sharding | Shard config on the database |
| CDN and edge | CDN component |

You cannot buy your way past a concept. Money and knowledge are separate
currencies and both are required. This is the whole point: a player who button-
mashes "buy more servers" hits a wall where the bottleneck is the database and
more servers actively make it worse, and the only way through is to understand
what a read replica does.

**Failing a check is not punished.** You can retake it immediately. Questions
are drawn from a pool so retakes aren't pure memorization. Nothing is lost but
in-game time, and even that is optional (see difficulty).

## 5. Scenarios: applying it under pressure

Two applied-knowledge formats, both unlocked by progress rather than purchased.

**Incidents.** Scripted events that fire at defined triggers — a traffic
milestone, a specific architecture shape, a turn number. Black Friday spike.
Cache stampede after a deploy. Primary database node dies. Celebrity posts your
link and one shard goes hot. An incident pauses the loop, states the symptom
(never the cause), and gives the player a limited number of turns and a
restricted budget to respond by *changing the architecture*. Success criteria
are evaluated by the simulation, not by a quiz — you passed if error rate stayed
under X and p99 under Y for the incident's duration.

This is the format that makes the game worth playing. It is also the hardest
content to author well. See `03-CONTENT-SCHEMA.md` §6.

**Design reviews.** A written brief ("design the backend for a service that
ingests 50k sensor readings per second and serves dashboards to 2k concurrent
users"). The player answers by assembling an architecture on a sandbox canvas
and selecting from structured tradeoff prompts. Graded against a rubric that
checks for the presence, absence, and configuration of components — plus the
tradeoff selections. Deterministic, no free text, no LLM in the loop.

> **Free-text answers are explicitly out of scope for the MVP.** Grading them
> requires either an LLM call (cost, latency, a backend, non-determinism, and
> confidently wrong grading) or keyword matching (which is worse). Structured
> answers over a rich component canvas are more expressive than they sound: the
> architecture the player builds *is* the answer. Revisit post-1.0; ADR-0006.

## 6. Difficulty

Four modes. **Switchable at any time from the settings menu, no progress lost,
no penalty.** Switching mid-run is expected and fine — the player who stalls on
Senior should drop to Junior, learn the thing, and come back.

| Mode | Pass threshold | Traffic growth | Starting cash | Hints | Sim harshness |
|---|---|---|---|---|---|
| **Intern** | 60% | Gentle, smooth | Generous | Always available, free | Forgiving: churn is slow, incidents telegraphed a turn ahead |
| **Junior** | 70% | Moderate, mild variance | Comfortable | Available, costs in-game time | Standard |
| **Senior** | 80% | Steep, spiky | Tight | One hint per check | Churn bites; incidents fire without warning |
| **Staff** | 85% | Aggressive, bursty | Minimal | None | Cascading failures enabled; partial outages propagate |

Difficulty changes four things and nothing else: check pass threshold, economy
constants, hint availability, and simulation harshness constants. **It never
changes which questions exist or which concepts are taught.** Curriculum is
identical across modes. Someone on Intern learns the same material — they just
have more room to be wrong.

Depth within a concept is handled differently, in the content itself: each
concept's lesson has a core section everyone sees and optional "go deeper"
sections. Questions are tagged `depth: 1 | 2 | 3` and the check draws from
depths appropriate to the mode. All depths are always readable from the
reference library.

## 7. Reference library

Everything learned is permanently readable from a library screen, searchable,
organized by tier. This matters more than it sounds: the game is also a study
resource, and a player who needs to look up quorum math mid-incident should be
able to, on every difficulty. Looking things up is not cheating. It is the job.

## 8. Failure states

There is no permanent loss.

- **Cash below zero:** an investor bails you out once per act. Reputation takes
  a hit, growth slows for several turns. The second time, you're rolled back to
  the start of the current act with unlocked concepts intact.
- **Reputation floor:** users churn to near-zero. Same treatment — rollback with
  knowledge kept.
- **Incident failure:** the incident resolves badly, you take the consequences,
  the game continues. You can replay any incident from the library.

Rationale: this is a learning tool wearing a game costume. Losing an hour of
progress teaches nothing except that the game is hostile. Knowledge is never
lost because knowledge is the actual player progression.

## 9. Acts

Five acts, each a step change in scale. Act boundaries are the natural
save/chapter points and the natural place for a boss-equivalent incident.

| Act | Scale | Roughly what it's about |
|---|---|---|
| 1 | 10 → 1k users | One server, then two. Why the single box falls over. |
| 2 | 1k → 100k | Load balancing, statelessness, caching, the database as bottleneck. |
| 3 | 100k → 5M | Replication, async work, storage tiers, consistency tradeoffs. |
| 4 | 5M → 100M | Sharding, multi-region, coordination, cost engineering. |
| 5 | 100M+ | Failure domains, degradation, observability, operating the thing. |

Curriculum detail in `04-CURRICULUM.md`.

## 10. Explicitly out of scope for 1.0

Listed so it doesn't creep in: multiplayer, leaderboards, accounts, cloud saves,
real-time/idle progression, procedurally generated questions, LLM grading,
mobile-native apps, sound design beyond minimal UI feedback, achievements,
monetization of any kind.
