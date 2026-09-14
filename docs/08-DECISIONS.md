# Decisions

Append-only. Never edit or delete an entry — supersede it with a new one that
references the old id.

Format:

```
## ADR-NNNN — Title
Date · Status: accepted | superseded by ADR-NNNN
**Context.** What forced a decision.
**Decision.** What we're doing.
**Alternatives.** What we didn't do and why.
**Consequences.** What this costs us later.
```

Add an entry for: any new dependency, any deviation from a spec doc, any
formula change, any scope change. When in doubt, write one — they're cheap and
a decision you can't reconstruct in three months is a decision you'll make badly
twice.

---

## ADR-0001 — Tycoon simulation over creature-collection
2026-09-13 · Status: accepted

**Context.** Two candidate framings for teaching system design through a game:
Pokémon-style collection and battling, or a tycoon/management sim.

**Decision.** Tycoon. You run a service whose traffic grows; components cost
money and capacity; latency and errors drive user churn.

**Alternatives.** Creature collection was rejected on two grounds. Thematically,
there's no honest reason a load balancer would fight a cache — the battle is a
reskinned quiz, so the game layer does no teaching and could be removed without
loss. Practically, it demands a creature roster, art, a type chart, and battle
balance, all of which are content cost unrelated to the subject.

**Consequences.** Economy balance becomes a real design risk, mitigated by the
harness in `07-TESTING.md` §6. No art pipeline needed. The simulation must be
correct, because it's now the primary teaching instrument rather than set
dressing.

---

## ADR-0002 — Turn-based, not real-time or idle
2026-09-13 · Status: accepted

**Context.** Tycoon games often run on real-time ticks with offline progress.

**Decision.** Turn-based. One turn = one in-game week, advanced by an explicit
player action.

**Alternatives.** Real-time/idle brings offline-progress calculation (a notorious
bug source), timing-dependent tests, non-reproducible states, and pressure to
add engagement mechanics. It also actively fights the learning goal — the player
should be able to stop and think, or leave to read a lesson, without the world
moving.

**Consequences.** Determinism becomes easy. The loop needs to earn attention
through interest rather than through timers.

---

## ADR-0003 — Cloudflare Workers static assets, not Pages
2026-09-13 · Status: accepted

**Context.** Needs free hosting. Cloudflare offers both Pages and Workers with
static assets.

**Decision.** Workers static assets, no fetch handler.

**Alternatives.** Pages is fully supported and fine, but as of 2026 Cloudflare
recommends Workers for new projects — static asset serving reached parity, and
new platform features ship to Workers first. Workers also allows adding a fetch
handler later without re-platforming.

**Consequences.** Slightly more config than Pages' git-push flow. Static asset
requests are free on either, so no cost difference.

---

## ADR-0004 — Knowledge is the tech tree
2026-09-13 · Status: accepted

**Context.** Learning could be optional side content or the progression spine.

**Decision.** Components are gated behind concepts. Passing a check is the only
way to unlock a component. Money and knowledge are independent currencies, both
required.

**Alternatives.** Optional quizzes for bonuses — rejected because optional
learning in a learning game is skipped. Money-only unlocks — rejected because
the game becomes a spreadsheet.

**Consequences.** Content becomes the critical path: no content means no
progression. The curriculum sequence is now load-bearing and must match the
difficulty curve of the simulation.

---

## ADR-0005 — M/M/1 for the latency model
2026-09-13 · Status: accepted

**Context.** Needed a latency-under-load model that is simple, closed-form,
testable, and pedagogically honest.

**Decision.** `W = serviceTime / (1 − u)`, with `p50 = W·ln2` and
`p99 = W·ln100`, exact for exponential response times.

**Alternatives.** A hand-tuned curve would need justification for every
constant and would teach a shape rather than a reason. Full discrete-event
simulation is far more code, slower, and non-closed-form — and buys accuracy
this game doesn't need.

**Consequences.** The saturation cliff falls out of real queueing theory, so the
lesson that teaches it is teaching something true and transferable. The model
ignores batching, connection pooling, and non-Poisson arrivals — acknowledged in
`02-SIMULATION.md` §10.

---

## ADR-0006 — No free-text grading in 1.0
2026-09-13 · Status: accepted

**Context.** Design-review scenarios would ideally accept written answers.

**Decision.** Structured answers only: architecture assembly on a canvas plus
multi-select tradeoff prompts, graded by deterministic rubric.

**Alternatives.** LLM grading requires a backend, API keys, per-request cost,
network latency, non-determinism, and — worst — confidently wrong grading of a
learner who can't yet tell it's wrong. Keyword matching is worse: it teaches
players to write for the matcher.

**Consequences.** Less expressive than prose. Partly offset by the canvas —
the architecture the player builds is itself a rich answer. Revisit after 1.0
if there's demand.

---

## ADR-0007 — All balance constants in one file
2026-09-13 · Status: accepted

**Context.** Tuning constants naturally scatter across engine functions.

**Decision.** Every tunable number lives in `src/config/balance.ts`. A magic
number in engine code is a bug even when the value is correct.

**Alternatives.** Per-module constants are more local but make the balance
harness unable to sweep parameters programmatically, and make it impossible for
a human to read the game's tuning in one sitting.

**Consequences.** Some indirection in engine code. Enforced by grep in CI.

---

## ADR-0008 — Resolve at peak, bill at mean
2026-09-13 · Status: accepted

**Context.** A turn covers a week of traffic with meaningful within-week
variance.

**Decision.** Latency, utilization, and errors resolve at `meanRps ×
peakMultiplier`. Revenue and cost volume use mean.

**Alternatives.** Resolving everything at mean would let an architecture that
collapses every evening look healthy — and "size for peak, not average" is one
of the genuinely important lessons in the domain.

**Consequences.** Players must plan against peak, which the forecast line
supports. Adds one visible number to the UI and one concept to explain early.

---

## ADR-0009 — End-to-end p99 is the sum of per-hop p99s
2026-09-13 · Status: accepted

**Context.** Summing per-hop p99s overestimates the true end-to-end p99, since
independent tails don't compose that way.

**Decision.** Sum them anyway.

**Alternatives.** Convolving the distributions is correct and much more code,
for a number the player only reads as "too high" or "fine."

**Consequences.** Reported p99 is conservative. It correctly teaches that every
hop costs you, which is the lesson that matters. Documented in a code comment so
nobody "fixes" it into a difficulty regression.

---

## ADR-0010 — Failure never costs learning
2026-09-13 · Status: accepted

**Context.** Tycoon games usually have a lose state.

**Decision.** Bankruptcy and reputation collapse roll the run back to the start
of the current act. Unlocked concepts always persist. Checks can be retaken
immediately with no penalty.

**Alternatives.** Permadeath or progress loss teaches that the game is hostile,
not that the architecture was wrong. The consequence that matters is watching
your service fall over, and that already happened.

**Consequences.** Lower stakes. Compensated by the reputation feedback loop,
which makes bad turns compound within a run without erasing the run.

---

## ADR-0011 — No AI at runtime, anywhere in the shipped site
2026-09-13 · Status: accepted · Extends ADR-0006

**Context.** ADR-0006 ruled out LLM grading. The same question applies to
generating questions, hints, and explanations on the fly.

**Decision.** The deployed site contains no AI, no API calls, and no network
requests of any kind. Everything is static data plus arithmetic. AI is an
authoring-time tool only, producing files that are reviewed and committed.

**Alternatives.** Runtime generation would give an unbounded question supply,
but it requires a backend and an API key (ending the free-hosting property),
introduces latency and non-determinism into a loop that depends on both, and —
decisively — can emit a confidently wrong explanation to a learner who has no
way to detect it. A generated question nobody reviewed is worse than no
question.

**Consequences.** Question supply is finite and must be built up front, which
makes §1–3 of `09-QUESTION-BANK.md` the real cost of the project. Offset by the
derived-question pipeline. The site works offline, costs nothing at any traffic
level, and has no keys to leak.

---

## ADR-0012 — Two question classes with different correctness guarantees
2026-09-13 · Status: accepted

**Context.** ~1,650 questions is unreviewable by hand, and unreviewed AI output
will contain subtly wrong answers.

**Decision.** Split the bank. **Derived** questions are generated from
parameterized templates whose answers are computed by the simulation engine —
correctness is structural, since the question and the game share the code.
**Authored** questions cover judgment and tradeoffs, are limited to ~10 per
concept, and are reviewed individually.

**Alternatives.** All-authored means ~1,650 human-reviewed questions, which will
not happen. All-derived means a bank that teaches arithmetic and no judgment.

**Consequences.** Review burden drops from ~312 items to ~111 for Tier 1. Draw
composition (§5) must enforce the mix or checks degenerate into arithmetic
drills. The engine becomes even more load-bearing: an engine error now
generates a thousand wrong questions, not one.

---

## ADR-0013 — Derived questions generated at build time and committed
2026-09-13 · Status: accepted

**Context.** Templates could be instantiated in the browser at runtime, giving
infinite questions at near-zero bundle cost.

**Decision.** Generate at build time with a fixed seed; commit the output JSON.

**Alternatives.** Runtime instantiation is genuinely tempting — it's not AI, the
engine is already in the browser, and it would make the bank effectively
infinite. Rejected because generated-but-never-seen questions can't be reviewed
or spot-checked, a bad parameter combination would reach a player directly, and
the bank would not be diffable in git. Committing the output means a template
change shows up in review as "these 40 questions changed."

**Consequences.** Bank size is bounded by `instanceCount`. ~825 KB gzipped for
the full bank, handled by per-concept code splitting. Revisit for practice mode
after 1.0 if the finite pool proves limiting.

---

## ADR-0014 — Review the template, spot-check the instances
2026-09-13 · Status: accepted

**Context.** Even split into two classes, the bank exceeds what a person will
review carefully.

**Decision.** Approving a derived template approves its instances, backed by a
seeded 10% spot-check. Authored and diagnose questions are reviewed
individually. Batch size for generation is capped at 10–15.

**Alternatives.** Reviewing every instance means ~312 items for Tier 1 alone,
where attention fails somewhere around item 150 — producing worse effective
review than a disciplined 111.

**Consequences.** A bad template that passes review ships ~40 bad questions.
Mitigated by engine verification, the spot-check, and `batchId` provenance
allowing a whole batch to be re-examined when one bad item surfaces.

---

## ADR-0015 — Questions are retired, never deleted
2026-09-13 · Status: accepted

**Context.** Save files reference question ids for missed-question weighting.

**Decision.** `status: 'active' | 'retired'`. Retired questions leave the draw
pool but still resolve. Ids are permanent and tracked in a committed
`bank-manifest.json`; reuse is a build failure.

**Alternatives.** Deleting is simpler until the first save file references a
deleted id and the library crashes on a history view.

**Consequences.** The bank only grows on disk. At ~1.3 KB per question this is
irrelevant for years.

---

## ADR-0016 — Build-toolchain packages beyond the approved list
2026-09-14 · Status: accepted

**Context.** M0 needs React, TypeScript and Tailwind under Vite, linted by ESLint.
The approved list in `01-ARCHITECTURE.md` §1 names those tools but not the glue
packages that connect them, so M0 cannot be built from the list alone.

**Decision.** Add five dev dependencies:
- `typescript-eslint`: ESLint cannot parse `.ts`/`.tsx` without it, so the layer
  rule could not lint the engine at all.
- `@tailwindcss/vite`: Tailwind v4 needs a separate integration package
  (`@tailwindcss/vite`, `@tailwindcss/postcss` or `@tailwindcss/cli`). The Vite
  plugin fits this stack directly.
- `@vitejs/plugin-react`: Vite's official React plugin (JSX transform and Fast
  Refresh).
- `@types/react`, `@types/react-dom`: React ships no type declarations, and strict
  mode with no `any` needs them.

Pin `typescript` to `~6.0.3` instead of the current 7.0.2. typescript-eslint 8.70
declares `typescript >=4.8.4 <6.1.0`, and no stable typescript-eslint release
supports TypeScript 7.

**Alternatives.**
- Vite's built-in JSX handling instead of `@vitejs/plugin-react`: no Fast
  Refresh, and not the documented React path.
- `@tailwindcss/postcss`, or Tailwind v3 with `postcss` and `autoprefixer`: both
  still add unlisted packages, and v3 is the older line.
- TypeScript 7 with an alpha or canary typescript-eslint: rejected for stability.
- Deliberately not added:
  - `tsx` (Node runs `.ts` directly, see ADR-0018).
  - `@eslint/js`, `globals` and the react-hooks lint plugins.
  - `jsdom` (the shell's render test uses `react-dom/server`).
  - `@types/node` (typecheck passes without it).

**Consequences.** Five more packages to keep current. Revisit the TypeScript pin
once typescript-eslint supports 7.x; bumping TypeScript alone will break
`npm run lint`.

---

## ADR-0017 — Layer rule follows 01-ARCHITECTURE; arrows mean "anything to the right"
2026-09-14 · Status: accepted

**Context.** `CLAUDE.md` gives the dependency direction as `ui → engine →
content`. `01-ARCHITECTURE.md` §3 and the M0 roadmap entry give `ui → state →
engine → content`. §3 says "arrows only point right" but doesn't say whether a
layer may skip one, e.g. `ui/` importing `engine/` directly.

**Decision.** Enforce the four-layer chain from `01-ARCHITECTURE.md`, which is
narrower in scope. A layer may import any layer to its right and never one to its
left. `eslint.config.js` does this with `no-restricted-imports`:
- `src/engine/` may not import `react`, `react-dom`, `zustand`, `state/` or `ui/`.
- `src/content/` may not import `react`, `react-dom`, `zustand`, `engine/`,
  `state/` or `ui/`.
- `src/state/` may not import `ui/`.

`src/config/` is outside the chain and importable from every layer.

**Alternatives.**
- Adjacent-only imports (ui may import only state): contradicted by M6, where
  the lesson demo slider "updates live from the real engine" and lesson diagrams
  render engine `Architecture` values.
- `CLAUDE.md`'s three-layer chain: it omits `state/`, which §3 defines.

**Consequences.**
- UI may call the engine directly, so "the store never computes simulation
  values" (§4) stays a convention, not a lint rule.
- The patterns match any path segment named `engine`, `state` or `ui`. A future
  folder with one of those names elsewhere would trip the rule; rename the folder
  rather than weaken the rule.
- Proven in M0 with probe files that failed lint and were then deleted.

---

## ADR-0018 — Tool scripts are placeholders until their milestone, run by Node directly
2026-09-14 · Status: accepted

**Context.** M0 requires every npm script named in the README to exist and exit
zero, and the definition of done runs `validate` and `screen` on every milestone.
The real tools arrive in M5, M5a, M5b and M9. The README names `npm run review`,
but no doc names its source file.

**Decision.** These tool files exist from M0, and each prints the milestone that
implements it and exits 0:
- `tools/validate-content.ts`
- `tools/generate-questions.ts`
- `tools/screen-questions.ts`
- `tools/balance-sim.ts`
- `tools/review.ts`

npm scripts run them as `node tools/<name>.ts`, using Node's built-in TypeScript
type stripping (on by default since Node 22.18, so `engines.node` is
`>=22.18.0`). `tsconfig.json` sets `erasableSyntaxOnly` so tool code stays
strippable.

**Alternatives.**
- `tsx` or `ts-node`: an unapproved dependency for something Node now does itself.
- Compiling tools with `tsc` first: an emit step and output directory for
  dev-only scripts.
- Omitting the scripts until their milestones: fails M0's "all scripts exit zero".

**Consequences.**
- `validate` and `screen` pass trivially until M5 and M5a, so those
  definition-of-done checks prove nothing until then. Those milestones must
  replace the placeholders, not wrap them.
- Type stripping forbids enums, namespaces and parameter properties in `tools/`,
  and relative imports there must include the `.ts` extension.
- `review.ts` is a provisional name; M5b may rename it.

---

## ADR-0019 — Functional mulberry32 with per-turn streams
2026-09-14 · Status: accepted

**Context.** `02-SIMULATION.md` §2 requires mulberry32 or xorshift128, a run seed
stored in `RunState`, and per-turn streams derived from `hash(seed, t)`. `CLAUDE.md`
requires engine code to be pure with no mutation, but §5.7's pseudocode draws with a
stateful `rng.next()`.

**Decision.** Use mulberry32 over a 32-bit state, exposed functionally:
- `nextFloat(rng)` returns `{ value, rng }` and never modifies the generator it was
  given.
- `rngForTurn(seed, turn)` seeds a fresh generator from
  `fmix32(seed ^ fmix32(turn + 0x9e3779b9))`, using MurmurHash3's 32-bit finalizer. A
  draw added in one turn therefore cannot shift another turn.
- Seeds are coerced to unsigned 32-bit.

**Alternatives.**
- xorshift128: four times the state for no benefit at this scale.
- A stateful closure (`rng.next()`): matches the pseudocode, but hides mutation
  inside the engine and makes a replayed turn depend on call order across functions.
- Deriving turn `t` by advancing one run-wide stream `t` steps: inserting a draw in
  turn 5 would shift turn 6, which §2 forbids.

**Consequences.** Callers must thread the returned generator through every draw.
Forgetting to repeats a value, which at least reproduces. mulberry32's period is
2^32: ample for per-turn streams, and the game needs no cryptographic randomness.

---

## ADR-0020 — M1 tick contract: linear only, typed errors, catalog as input
2026-09-14 · Status: accepted

**Context.** M1 builds the resolver for ingress → server → database only, before the
economy (M2), failures, replicas, caches or any content exist. `02-SIMULATION.md` §9's
`TickResult` includes fields no M1 phase computes, and a few details the resolver needs
aren't specified anywhere.

**Decision.**
- **Signature.** `simulateTick(input)` takes `{ turn, architecture, workload, catalog }`
  and returns `{ ok: true, value: TickResult } | { ok: false, error: TickError }`.
  Nothing throws.
- **Result fields.** M1's `TickResult` is the part of §9 that M1 computes: `turn`,
  `workload`, `perNode`, and `perClass` with `p50Ms`, `p99Ms` and `errorRate`. It adds
  `peakRps`, plus per-node `servedRps` and `meanMs`. `status`, `bottleneck`,
  `staleRate`, `economy`, `reputation`, `events` and `nextRun` arrive with the
  milestones that compute them; their thresholds don't exist yet.
- **Rejected shapes.** Anything beyond a linear chain gets a typed error instead of a
  result:
  - branching or merging edges, and nodes off the path (`unsupported-topology`)
  - `replicas !== 1` (`unsupported-replicas`), because §5.4 gives database replicas
    different semantics from multiplying capacity
- **Ingress.** Ingress is the traffic source: it has no capacity or latency and isn't
  in `perNode`.
- **Component figures.** Per-tier `capacityRps` and `serviceTimeMs` are passed in as
  `catalog`, mirroring `ComponentDef.tiers`, so M1 introduces no game numbers. The only
  constant added to `balance.ts` is §5.2's `U_MAX` (`queueing.maxUtilization`, 0.995).
- **Fanout.** `fanoutFactor` is app-server node config.
- **End-to-end error rate.** §5.2 doesn't define it for a path. Each query's drop is
  treated as independent, so a class's success fraction is the product over hops of
  `(1 − hopDropFraction) ^ queriesPerRequest`, where `queriesPerRequest` is the product
  of the upstream fanouts.
- **Latency.** p50 and p99 per class are summed once per hop, regardless of fanout, as
  §5.2 states (ADR-0009).

**Alternatives.**
- Throwing typed errors: exceptions aren't part of a function's type, so callers
  could forget to handle one. The union forces them to.
- Resolving branches by splitting load evenly: produces numbers §5.1's
  load-balancer rules would later contradict.
- Summing per-hop drop fractions: can exceed 1 and double-counts.
- Reading component figures from `balance.ts`: would mean inventing tier numbers
  that M7 is meant to balance.

**Consequences.**
- Later milestones widen the topology checks and add fields to `TickResult`.
- Every request class reports identical metrics until topologies can route classes
  differently.
- The independence assumption, and summing latency once per hop despite fanout, are
  review points for the M1 checkpoint.

---

## ADR-0021 — Keep the single-queue latency model and teach it as one
2026-09-14 · Status: accepted · Extends ADR-0005

**Context.** The M1 checkpoint reviewed `W = serviceTime / (1 − u)`. That formula is
exact for M/M/1: one server, Poisson arrivals, exponential service times. The game's
app servers and databases are closer to multi-worker queues (M/M/c). A tier's
`capacityRps` and `serviceTimeMs` are independent, so a tier can already imply several
workers. For M/M/c with the same per-request service time, latency stays near the
service time until utilization is much higher. M2's economy and reputation both read
p99, so changing the model after M2 means rework.

**Decision.** Keep M/M/1 as ADR-0005 specifies. The human chose this at the M1
checkpoint. Lessons and derived questions present its numbers as properties of the
game's single-queue model:
- May be taught as true of real systems: waiting time grows without bound as
  utilization approaches 1, the tail sits far above the median, and systems are sized
  for peak.
- Must be worded as model-specific: "latency doubles at 50% utilization" and "p99 is
  about 4.6× the mean". These hold for M/M/1's exponential response time, not for
  measured multi-worker servers.

**Alternatives.** M/M/c (Erlang C) gives more realistic numbers for multi-worker
servers. But it cannot be explained in one sentence, which `02-SIMULATION.md` §0
requires. It would also supersede ADR-0005 and change `07-TESTING.md` §2's named-curve
table.

**Consequences.**
- `07-TESTING.md` §2's named-curve assertions stand unchanged.
- The model overstates latency at moderate utilization compared with a multi-worker
  server, so the game pushes players toward more headroom than a real system needs.
  That's acceptable, because sizing for headroom is the lesson.
- Wording of latency claims is a review point at M5a, M7 and M7b.

---

## ADR-0022 — The quality multiplier caps at the SLO
2026-09-14 · Status: accepted

**Context.** `02-SIMULATION.md` §6 defined `qualityMultiplier = clamp(1.2 − 0.4 ×
p99/p99Target, 0.5, 1.2)`. p99 is never negative, so the expression never exceeds 1.2
and the upper clamp could never bind. That contradicted:
- the prose, which says gold-plating latency past the SLO earns nothing
- M2's criterion "qualityMultiplier clamps at both ends"

As written, meeting the SLO exactly paid 0.8×, and every millisecond under the target
earned more, all the way to p99 = 0.

**Decision.** Raise the intercept to 1.6: `clamp(1.6 − 0.4 × p99/p99Target, 0.5, 1.2)`.
The multiplier is:
- 1.2× at or under the target
- 1.0× at 1.5× the target
- 0.8× at 2× the target
- 0.5× from 2.75× the target

The four numbers live in `BALANCE.economy.qualityMultiplier`. The human chose this at the
start of M2.

**Alternatives.**
- Intercept 1.4, capping at half the target (1.0× at the target): still pays for beating
  the SLO, which the prose rules out.
- Keep the formula and rewrite the prose: leaves the upper clamp as dead code and keeps
  rewarding gold-plating.

**Consequences.**
- Below the target, latency has no economic effect: 50 ms and 300 ms pay the same.
  Reputation's `sloMet` is binary too, so nothing rewards latency under the SLO. That is
  the intended lesson.
- Missing the SLO by up to 50% still pays at least 1.0×. Reputation loss is what punishes
  that range.
- A service meeting its SLO earns 1.5× what the old formula paid. M9's balance tuning
  starts from the new numbers.

---

## ADR-0023 — M2 turn contract: service level, setup costs, growth noise
2026-09-14 · Status: accepted · Extends ADR-0020

**Context.** M2 adds `02-SIMULATION.md` §5 phases 2, 8, 9 and 11 on top of M1's
resolver. The spec leaves some details open:
- §6 and §7 read one p99 and one error rate, but the resolver reports three request
  classes.
- §6's cash formula charges `oneTimeSetupCosts` without saying when a change counts as
  new.
- §3 clamps growth to `[−0.5g, +3g]` without saying whether that bounds the noise or the
  total, and asks for a normal draw.
- §6's `storageCents` and §7's `staleRate` have nothing to compute from yet.

**Decision.**
- **Signature.** `simulateTurn(run, { difficulty, catalog })` returns
  `Result<TurnResult, TickError>`.
  - `TurnResult` is M1's `TickResult` plus `service`, `economy`, `reputation`, `users`,
    `events` and `nextRun`.
  - Seed and turn come from the run.
  - Difficulty comes from settings, so a switch applies from the next turn.
  - The code is in `engine/run.ts` and `engine/economy.ts`.
- **Service level.**
  - Error rate weights each class by its share of requests. That is exactly the
    fraction of all requests dropped.
  - p99 is the worst p99 among classes that carry traffic. Percentiles don't average,
    and a blend's p99 never exceeds its worst class's.
- **Setup costs.** `RunState.builtArchitecture` is what ran last turn. A turn charges
  setup for the difference, matched by node id:
  - A new node, or one whose kind or tier changed, pays for every instance.
  - A node that only gained replicas pays for the added ones.
  - Removing or shrinking refunds nothing.
- **Growth noise.** The clamp bounds the noise: `g = base + clamp(σ·z, −0.5·base,
  +3·base)`. Total growth stays between 0.5× and 4× base, so only reputation can shrink
  traffic.
- **Normal draw.** `nextNormal` standardizes the sum of four uniform draws (Irwin–Hall).
- **Rounding.** Revenue and bandwidth round to whole cents where they're computed.
  Running and setup costs are integers already.
- **Deferred.** These wait for the milestones that give them inputs:
  - `storageCents` is 0 until a data-size model exists.
  - `staleRate` joins `sloMet` when replicas can serve stale reads.
  - §6's CDN offload term arrives with the CDN.
  - Component failures (§5.7), `bottleneck` and per-node `status` are out of M2.

**Alternatives.**
- A traffic-weighted average of class p99s: not a percentile of anything, and it hides a
  slow class behind a fast one.
- Charging setup when a component is placed: the store would compute money, which
  `01-ARCHITECTURE.md` §4 rules out. Placing and then undoing would also cost money.
- Clamping total growth to `[−0.5g, +3g]`: noise could shrink traffic at perfect service,
  blurring the reputation signal the player is meant to read.
- Box–Muller: an exact normal, but it needs `Math.log` and `Math.cos`. ECMAScript leaves
  those implementation-approximated, so an exported save could replay differently in
  another browser.

**Consequences.**
- Every class still reports identical metrics (ADR-0020), so the aggregation rule has no
  visible effect until topologies route classes differently.
- Irwin–Hall's tails stop at ±3.46σ. The clamp's lower bound binds long before that.
- M4 adds `bottleneck` and per-node `status` along with their warning thresholds.

---

## ADR-0024 — Users, acts and failure states
2026-09-14 · Status: accepted

**Context.** The roadmap names "user churn" for M2. `00-GAME-DESIGN.md` §8–9 define:
- acts by user count
- a once-per-act investor bailout
- rollback to the start of the act

`02-SIMULATION.md` has no user model, and no milestone was assigned failure states. At
the start of M2 the human chose to build failure states in M2. They also chose to trigger
the reputation-floor rollback on users rather than on reputation.

**Decision.**
- **Users** are derived: `users = meanRps / BALANCE.traffic.meanRpsPerUser`, at 0.1 rps
  (one request every ten seconds) per active user. A new run's 10 users are 1 rps. Churn
  is the §3/§7 loop: when `(1 + g) × reputationModifier < 1`, traffic shrinks.
- **Acts** come from `BALANCE.acts.usersToEnter` (1k, 100k, 5M and 100M users) and never
  go down.
- **Checkpoint.** `RunState.actStart` holds what a rollback restores: cash, reputation,
  workload, both architectures, act, bailout flag and growth penalty. Seed, turn counter
  and history are not restored. Time keeps moving, the history shows the collapse, and
  later turns draw fresh noise.
- **End-of-turn order.**
  1. If users fall below `churnFloorOfActStart` (10%) of the act's starting users, roll
     back (`churn`).
  2. If cash is below zero and the bailout is unused, bail out. Cash becomes
     `bailoutCashCents`, reputation drops by 0.25, and growth is halved for 4 turns.
  3. If cash is below zero and the bailout is spent, roll back (`bankruptcy`).
  4. Unless the run rolled back, crossing a threshold enters the new act. That resets the
     bailout and makes this state the new checkpoint.

  Each event is recorded in `TurnResult.events` and in the turn's history entry.

**Alternatives.**
- Users as separate state with their own churn rate: a second growth model to balance
  against §3, with nothing in the spec to derive it from.
- Roll back when reputation hits 0: §7's severity is uncapped, so one saturated week
  would trigger it.
- Restoring the turn counter on rollback: replays identical noise, and makes turn numbers
  ambiguous in history and in the balance harness.
- Failure states in a later milestone: `RunState` would change shape after save v1
  exists.

**Consequences.**
- `meanRpsPerUser`, starting cash beyond Intern and Junior, and every number in
  `BALANCE.failure` are placeholders for M9.
- A collapse to reputation 0 recovers slowly. Each good turn adds only 0.02, and Junior
  traffic shrinks until reputation passes about 0.37, roughly 18 good turns. A churn
  rollback is therefore likely after a collapse even with perfect service. Flagged for M9.
- Under §7's formula, low reputation shrinks traffic fastest on Intern (×0.65 a turn at
  reputation 0) and slowest on Staff (×0.75). That is the reverse of
  `00-GAME-DESIGN.md` §6, where churn is slow on Intern. Flagged for M9.

---

## ADR-0025 — Save format v1: keys, migrations, quarantine, export
2026-09-14 · Status: accepted

**Context.** `01-ARCHITECTURE.md` §7 fixes localStorage, versioned keys, migrations,
quarantine, base64 export and a 100 KB budget. It leaves open:
- how an older key is found
- what v0 is, since nothing has shipped
- how a save is validated
- how 50 turns of per-node metrics fit the budget

**Decision.**
- **Keys.** The save lives at `nines.save.v1`.
  - Loading checks v1, then each older key down to v0.
  - A migrated save is rewritten under the current key before the old key is removed.
  - Keys newer than the build are left alone, so an older build never destroys a newer
    save.
- **Validation.** Zod schemas in `state/save.ts`, each annotated with the type it
  mirrors, so typecheck fails if they drift. Keys follow the engine's order, so a parsed
  save re-serializes byte-identically.
- **Migrations.** `MIGRATIONS[n]` turns version n into n + 1 and is never edited. Each
  one validates its input against that version's schema first.
- **v0 is synthetic.** It is a pre-release shape defined only so the migration path and
  a fixture (`src/state/fixtures/save-v0.json`) exist from the first release. No build
  wrote it. It has core run figures but no act, bailout, history, content version, or
  hint and motion settings.
- **Quarantine.**
  - A save that fails to parse, validate or migrate is copied to
    `nines.save.corrupt.<ISO timestamp>`, then the original is removed. That includes a
    save from a future version.
  - A key collision appends `.N`.
  - If storage refuses the copy, the original stays.
  - The store reports it as `ui.saveProblem`.
- **`run: null` is valid:** no run in progress. `07-TESTING.md` §4's "a null run"
  corruption case is read as a `null` document.
- **Export.** The save JSON's UTF-8 bytes, base64-encoded. Import runs the same migration
  and validation, and quarantines nothing because nothing was stored.
- **Size.**
  - History keeps `PERSISTENCE.historyTurns` (50) turns. Older turns roll into running
    totals.
  - History rounds per-node utilization to 1/10,000. At full precision, a 50-node save
    measured 110 KB.
- **Contents.**
  - Knowledge: unlocked concept ids, plus check attempts (concept, attempt number, score,
    passed, missed question ids).
  - Settings: difficulty, `reducedMotion`, `showHints`.
  - `CONTENT_VERSION` is 0 until content exists.
- **Dependencies.** Storage and the clock are injected, so the state layer tests without
  a browser.

**Alternatives.**
- Hand-written type guards: Zod is already approved and validates content.
- One unversioned key with a version field inside: §7 names versioned keys, and separate
  keys protect a newer save from an older build.
- Deleting an unreadable save: it may be the only copy of progress that a later fix could
  recover.
- Full precision with fewer history turns: §7 names 50 turns.

**Consequences.**
- Changing a saved shape means a version bump, a migration and a fixture for the old
  version (`07-TESTING.md` §4). M6 may do this when checks exist.
- The v0 schema reuses today's `Workload` and `Architecture` schemas. The first change to
  either must freeze a copy for v0.

---

## ADR-0026 — Numbers that aren't balance, and enforcing the constant rule
2026-09-14 · Status: accepted · Extends ADR-0007

**Context.** ADR-0007 puts every tunable number in `balance.ts`, and M2 must prove no
balance constant appears elsewhere. The engine and state layers also need numbers that
aren't tuning:
- unit conversions: requests per thousand, KB per GB
- save limits
- PRNG and hash constants

**Decision.**
- **Config files.** Each kind of number has its own file in `src/config/`:
  - `balance.ts`: tuning only
  - `units.ts`: unit conversions
  - `persistence.ts`: save limits
  - `difficulty.ts`: the list of modes

  Balance values with no spec source are marked "Placeholder".
- **Enforcement.** `src/config/balance-constants.test.ts` scans every non-test source in
  `src/engine/` and `src/state/`, with comments and strings stripped. Code may use the
  literals 0 and 1; anything else fails. There are two exemptions:
  - `engine/rng.ts`, whose constants define the algorithms
  - the 2 in `engine/resolve.ts`'s `ln 100 = 2·ln 10`

**Alternatives.**
- Units inside `BALANCE`: mixes definitions with values a sweep might change.
- A shell grep: can't tell code from comments and strings, so it either misses numbers or
  fails on "§5.2".
- Also scanning `ui/` and `content/`: neither has numbers today. UI layout sizes and
  `ComponentDef` tier figures (ADR-0020) are legitimately numeric, so each needs its own
  rule. Deferred to M3 and M5.

**Consequences.**
- New engine and state files are scanned automatically.
- Numbers inside a template literal's `${…}` escape the scan.

---

## ADR-0027 — Component definitions start in M3, with refusal reasons
2026-09-14 · Status: accepted

**Context.** M3 must refuse invalid connections "from `ComponentDef.validConnections`
with a reason shown". This forced a decision because:
- ComponentDefs are content, which M5 (schema) and M7 (balanced tiers) produce.
- `03-CONTENT-SCHEMA.md` §5's `validConnections` has no field for a reason.
- `ComponentKind` lived in `engine/types.ts`, and content may not import the engine
  (ADR-0017).

**Decision.** The human chose this at the start of M3.
- **Files.** `src/content/components/{ingress,app-server,database}.ts` hold the part of
  `ComponentDef` the canvas reads: `kind`, `displayName`, `placeable`, tier labels,
  `validConnections` and `reviewStatus`. The type is plain TypeScript in
  `src/content/schema.ts`; M5 replaces it with Zod.
- **Refusal reasons.** `validConnections.refusedDownstream` gives, for each kind not in
  `downstream`, the player-facing reason and what to do instead.
  - A→B is allowed only when B is in A's `downstream` and A is in B's `upstream`.
  - The shown reason comes from A.
  - A content test requires both lists to agree, and every refused pairing to have a
    reason.
- **Placement.** `placeable: false` means a kind can't be added or removed (ingress).
- **Kinds.** `COMPONENT_KINDS` moves to content, and the engine imports `ComponentKind`,
  a direction the layer rule allows. `ComponentConfigByKind` is keyed by it, so a kind
  without a config shape fails typecheck.
- **Pairings.**
  - ingress → app server
  - app server → app server or database
  - database → nothing

**Alternatives.**
- A stopgap rule table in `config/`: the acceptance criterion would only be met literally
  after M5.
- Reasons generated from kind names: they could say what's refused but not what to do
  instead.

**Consequences.**
- `03-CONTENT-SCHEMA.md` §5 has neither `refusedDownstream` nor `placeable`. M5 adds both
  to the doc and the schema.
- The refusal copy teaches, so it's `needs-review`.
- M5's diagram blocks put an `Architecture`, an engine type, inside content, which
  ADR-0017 forbids. Moving the kinds down is the first step; M5 must decide where
  `Architecture` lives.

---

## ADR-0028 — Node positions live on the node; saves move to v2
2026-09-14 · Status: accepted

**Context.** The canvas needs grid positions that survive saves and act rollbacks.
`Architecture` had none, and M6 lesson diagrams must render from real `Architecture`
values.

**Decision.** The human chose this at the start of M3.
- **Positions.** `ComponentNode` gains a required `position: { col, row }`.
  - Each node fills one grid cell, and the canvas refuses overlaps.
  - The engine ignores positions, including in setup-cost diffs, so moving a node is
    free.
- **Layout.** `engine/layout.ts`'s `layoutByFlow` is a deterministic layered layout. Row
  is the longest path from any source. Columns follow declaration order. Nodes on a
  cycle share a row below the rest. It lays out the starter architecture and migrated
  saves.
- **Save v2.** `MIGRATIONS[1]` lays out all four architectures in a v1 run: `architecture`
  and `builtArchitecture`, at the top level and in `actStart`. The fixture
  `src/state/fixtures/save-v1.json` was generated by the M2 code before this change.
- **Versioning.** `SAVE_VERSION` is `MIGRATIONS.length`, and the runner stamps each
  step's version, so migrations contain no version literals. A test requires a fixture
  for every past version.
- **Old schemas.** v0 and v1 share a frozen positionless architecture schema. v1 reuses
  the rest of the run schema through `runSchema(architecture)`.

**Alternatives.**
- A layout map on `RunState`: it can drift from the node list, rollback must restore it
  separately, and M6 diagrams would need their own layout.
- Layout computed on every render: dragging a node to a spot would mean nothing.

**Consequences.**
- Every `Architecture` literal needs positions, including M5's content diagrams.
- A migrated v1 run gets a flow layout. v1 never shipped, so no player's arrangement is
  lost.

---

## ADR-0029 — Canvas interaction model
2026-09-14 · Status: accepted

**Context.** M3 requires:
- mouse and keyboard parity
- invalid connections refused with a reason
- 60fps dragging, with drag state in a ref
- three widths
- focus rings and reduced motion

The specs only sketch the keyboard: arrow keys move the selection and Enter connects.

**Decision.**
- **Edits** are pure functions in `state/architecture.ts`. Each returns a new architecture
  or a typed refusal, and the canvas commits through `store.setArchitecture`. Player copy
  lives in `ui/canvas/copy.ts`.
- **Dragging.**
  - Moving and connecting live in refs. Each animation frame paints them by setting SVG
    attributes directly.
  - React and the store only see the release.
  - A refused drop, or one back on the node's own cell, is painted back into place.
- **Keyboard.** The canvas is one focus stop (`role="application"`, with
  `aria-activedescendant` naming the selection).
  - An arrow key selects the nearest node in that direction.
  - Shift and an arrow moves the selection one cell.
  - Enter starts a connection from the selection. Enter again connects it to the new
    selection, and the target stays selected.
  - Delete removes the selection. Escape cancels.
  - Palette buttons place a component next to the selection on click or Enter.
  - The inspector offers every edit as a form control: size, fanout, connect,
    disconnect and remove.
- **Validity.**
  - Cycles are refused when you connect, using the engine's `createsCycle` (§4).
  - Branching is allowed on the canvas. M1's resolver rejects it at Advance, which M4
    will surface.
- **Load display.**
  - Fill level is the peak utilization from last turn's history. It shows nothing until a
    turn has run.
  - Amber from 0.75; red, hatched and ▲ from 0.9. Both thresholds are in
    `BALANCE.status`.
- **Layout.**
  - 900px and up: three columns.
  - 600–899px: a full-width canvas, with palette and inspector in `<details>` bottom
    sheets.
  - Below 600px: a view-only canvas, edited through a component list, the inspector and
    the palette.
  - Zoom from 50% to 150% at every width.
- **Motion.** M3 has none. A global rule zeroes transitions under
  `prefers-reduced-motion` or `settings.reducedMotion` (`data-reduced-motion`).
- **Scope.**
  - The palette and inspector are minimal. M4 grows them into the catalog, with locked
    items and prices, and adds inspector metrics.
  - Replicas aren't editable, because the resolver rejects `replicas ≠ 1` until
    horizontal scaling.

**Alternatives.**
- React state for the drag: every pointer move would re-render the canvas.
- HTML5 drag and drop: no touch support and no pointer capture.
- A tab stop per node: 30 or more stops before reaching the inspector.
- A node-editor library: already rejected in `01-ARCHITECTURE.md` §5.

**Consequences.**
- Edge stroke weight by throughput needs per-edge flow in `TickResult` (M4).
- Edges don't route around nodes.
- There is no undo.

---

## ADR-0030 — Test DOM, self-hosted fonts and a dev-only canvas lab
2026-09-14 · Status: accepted · Extends ADR-0016

**Context.** Three needs:
- Interaction tests need a DOM, which ADR-0016 left out.
- `05-UI-DESIGN.md` §2 names IBM Plex. ADR-0011 forbids runtime network requests, so the
  fonts must come from the site's own origin.
- Measuring 60fps needs a 30-node architecture, which the game can't build quickly.

**Decision.**
- **Dev dependencies.**
  - `jsdom` 30.0.1
  - `@testing-library/react` 16.3.3 (on the approved list)
  - `@testing-library/dom` 10.4.2, its required peer
  - `@testing-library/user-event` 14.6.7

  UI test files opt in with `// @vitest-environment jsdom`; engine and state tests stay in
  Node.
- **Runtime dependencies.** `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`
  5.3.0. Only the Latin subsets are imported (Sans 400/500/600, Mono 400/500), and Vite
  bundles them.
- **Canvas lab.** `canvas-lab.html` and `src/ui/lab/canvas-lab.tsx` form a dev-only page
  with 30 nodes and varied load. `vite build` bundles only `index.html`, and the lab is
  confirmed absent from `dist/`.

**Alternatives.**
- `happy-dom`: faster, but less faithful for focus and pointer events.
- Google Fonts: a runtime request to a third party, which ADR-0011 forbids.
- Vendoring the woff2 files: the same bytes, without versioning.
- System fonts: §2 chooses Plex Mono for tabular figures.

**Consequences.**
- Four dev packages and two runtime packages to keep current.
- Non-Latin text falls back to system fonts.
- jsdom has no layout, so tests stub the canvas's `getBoundingClientRect` and shim
  `PointerEvent`.
- Frame rate and widths are checked in a real browser at the checkpoint, not in CI.

---

## ADR-0031 — Node status, the bottleneck and edge flow in the tick
2026-09-14 · Status: accepted · Extends ADR-0020, ADR-0023

**Context.** ADR-0023 left `bottleneck` and per-node `status` to M4. `02-SIMULATION.md` §9
defines the bottleneck as the "highest utilization node above warning threshold". Three
details were open:
- Utilization is capped at U_MAX (0.995), so every overloaded node reads the same.
- Whether a node exactly at a threshold is above it.
- `05-UI-DESIGN.md` §4 wants edge stroke weight by throughput, which needs flow per edge
  (ADR-0029's consequences).

**Decision.**
- **Status.** `nodeStatus(u)` in `engine/resolve.ts`. Warning starts at
  `BALANCE.status.warningUtilization` (0.75) and saturated at `saturatedUtilization` (0.9),
  both inclusive, as the canvas already drew them (ADR-0029). The canvas now reads the
  engine's function, so there is one definition. §9's `failed` waits for failures (§5.7).
- **Bottleneck.** Among nodes at warning or above, the one with the highest inbound ÷
  capacity. Below capacity that equals utilization. Above it, it ranks overloaded nodes by
  how far past capacity they are. An exact tie goes to the node nearer ingress, whose drops
  the next node never saw. Null when every node is healthy.
- **Edge flow.** `TickResult.perEdge` lists `{ from, to, rps }` in path order: what arrives
  at `to`, which is what the previous hop served times its fanout. The canvas draws stroke
  width on a log scale, 1.5 units at 1 rps to 7 units at 100k rps.
- `perNode` is keyed by id, and object keys that look like numbers don't keep insertion
  order. Anything that needs path order reads `perEdge`.

**Alternatives.**
- Ranking by capped utilization: two overloaded nodes both read 99.5%, and the first one
  would be named even if the second is three times past capacity.
- Deriving edge flow in the UI from each node's inbound load: only correct while every node
  has one inbound edge. Branching topologies need it from the resolver.

**Consequences.**
- Nothing saved changes. History still keeps only utilization per node.

---

## ADR-0032 — The forecast, and what the player sees before Advance
2026-09-14 · Status: accepted

**Context.** `05-UI-DESIGN.md` §4 requires next turn's projected peak on screen before
Advance, and calls planning against it "the actual skill being taught". The specs don't say:
- whether the forecast includes the turn's seeded growth noise (`02-SIMULATION.md` §3)
- whether projected load, latency or money are shown too

The human chose at the start of M4: an estimate with a likely range, and inputs only.

**Decision.**
- **Forecast.** `forecastTraffic(run, difficulty)` in `engine/plan.ts` applies §3's growth
  with the noise term at zero. Peak is that mean times the peak multiplier. The likely range
  puts the noise `BALANCE.forecast.rangeSigmas` (2) standard deviations either side, clamped
  as the real draw is. It shares `meanRpsAfterGrowth` with the real turn, so the arithmetic
  can't drift, and it draws nothing from the RNG.
  - On Intern the noise is zero, so the range collapses and the forecast is exact. A test
    asserts equality over ten turns.
  - A test asserts the real peak lands inside the range on more than 95% of 2,000 first
    turns on Junior, Senior and Staff, and outside it at least once.
  - Measured on each of those difficulties: inside on 98.0% of 20,000 first turns, and on
    97.9% of 15,000 turns within runs. Every miss was above the range. The 2σ lower bound is
    at or below the noise's lower clamp on all three, so a week never lands below the range.
- **Plan.** `planTurn(run, { difficulty, catalog })` returns:
  - the forecast
  - next turn's running and setup costs, exact
  - bandwidth at the forecast's mean with nothing dropped, an estimate

  An architecture that can't run returns the error `simulateTurn` would. The planned
  architecture is resolved to find that out, but projected utilization, latency and revenue
  are deliberately not returned. A test pins the result's keys.
- **Screen.**
  - A forecast line above the canvas: "Forecast for week 5: about 8.4/s at peak, likely
    8.1–8.7/s · last week 6.5/s".
  - Next week's costs, or the reason the week can't run, beside Advance.
  - The inspector shows capacity at the chosen size next to what the node received last
    week. It never shows next week's projected load.

**Alternatives.**
- The exact seeded value: "spiky" and "bursty" growth on Senior and Staff stop being felt,
  and the forecast leaks the turn's draw.
- A full preview of projected utilization, p99 and net cash: a player can adjust sizes until
  the numbers turn green without doing the capacity arithmetic.
- A range from simulating many draws: exact, but a Monte Carlo run on every edit when the
  closed form is already known.

**Consequences.**
- A week can still land above the range. It's labeled "likely", not promised.
- Whether the forecast gives enough to plan is `07-TESTING.md` §8's checkpoint question.
- `rangeSigmas` is a placeholder for M9.

---

## ADR-0033 — Placeholder tier figures, the catalog on the store, and last week re-resolved
2026-09-14 · Status: accepted · Extends ADR-0020, ADR-0027

**Context.**
- Advance needs tier figures. M3 gave the store an empty catalog.
- `03-CONTENT-SCHEMA.md` §5 puts capacity, service time and prices on `ComponentDef.tiers`,
  and M7 balances them.
- With the engine tests' `TEST_CATALOG` figures, a Junior player's first sizing decision
  comes around week 9. M4's checkpoint is to play ten weeks.
- The inspector needs last week's inbound load, capacity and p99 per node. Saves keep only
  utilization, to stay inside ADR-0025's size budget.

**Decision.**
- **Tier fields.** `ComponentDef.tiers` gains `capacityRps`, `serviceTimeMs`,
  `setupCostCents` and `runningCostPerTurnCents`. `failureRatePerTurn` waits for failures
  (`02-SIMULATION.md` §5.7).
- **Placeholder figures,** sized in four steps across Act 1's peak of 2.5–250 rps:

  | | Small | Medium | Large | Extra large |
  |---|---|---|---|---|
  | App server rps | 10 | 40 | 150 | 500 |
  | App server setup / week | $100 / $20 | $400 / $50 | $1,200 / $120 | $3,000 / $300 |
  | Database rps | 15 | 50 | 200 | 600 |
  | Database setup / week | $150 / $30 | $600 / $80 | $1,800 / $200 | $4,500 / $450 |

  Service times are 12, 11, 10, 10 ms for app servers and 6, 6, 5, 5 ms for databases. A
  headless player who sizes against the forecast's high end on Junior (seed 7) upgrades in
  weeks 4, 5, 8, 9, 12 and 13, and reaches Act 2 in week 14.
- **Catalog.** `state/catalog.ts` builds `CONTENT_CATALOG` from the definitions, and the game
  passes it to the store. Engine tests keep `TEST_CATALOG` (ADR-0020). The store exposes
  `catalog`, never saved, so screens show the figures the engine resolves against.
- **Last turn.** `ui.lastTurn` becomes `{ result, before }`. The report names nodes from the
  architecture that ran, and deltas and the animation start from the run before.
- **Re-resolving.** `lastResolvedTick(run, catalog)` resolves `builtArchitecture` at
  `workload` again, which reproduces the last turn exactly (asserted).
  - Canvas fills, edge weights and inspector figures come from it, and survive a reload
    without a save change.
  - After a rollback it describes the restored checkpoint, which is what the canvas shows.

**Alternatives.**
- Tier figures in `BALANCE`: ADR-0020 and ADR-0026 put them in content.
- Keeping `TEST_CATALOG`'s figures: nothing to decide for the first nine weeks.
- Saving per-node metrics, as save v3: four more numbers per node per turn. ADR-0025 measured
  utilization alone at 110 KB unrounded for 50 nodes.

**Consequences.**
- In the headless run above, cash rises every week, so money isn't a constraint yet. M7 and
  M9 balance it.
- In the same runs, one late upgrade saturates a tier. p99 reaches about 11 s, and §7's
  uncapped severity takes reputation from about 0.7 to 0 in one week, then traffic shrinks
  for many weeks (ADR-0024 flagged this). Expect it to dominate the M4 playtest.
- M5's Zod schema must carry the four tier fields.

---

## ADR-0034 — App server fanout is read-only
2026-09-14 · Status: accepted · Supersedes part of ADR-0029

**Context.** ADR-0029 made an app server's database queries per request editable in the
inspector. At 0 the database receives no load at all, so database sizing can be skipped for
free. How many queries code makes isn't something the player buys. The human chose at the
start of M4.

**Decision.** The inspector shows fanout as a fact about the app server. `setFanout` and
its `invalid-fanout` refusal are removed. New app servers keep
`BALANCE.starter.appFanoutFactor`.

**Alternatives.**
- Keep it editable: a free lever that bypasses a tier.
- Editable at a cost: a new mechanic with no spec behind it.

**Consequences.** Fanout can return as a deliberate mechanic, such as a query-batching
upgrade, with its own ADR.

---

## ADR-0035 — The weekly report and its bottleneck paragraph
2026-09-14 · Status: accepted

**Context.** `05-UI-DESIGN.md` §5 specifies four panels and a generated paragraph that names
the bottleneck and what wasn't the problem. M4 requires the paragraph to name the
highest-utilization node and one node that wasn't the problem. Open questions:
- Which healthy node to name.
- Generated sentences can say untrue things. "That's where the latency came from" is false
  whenever another hop has a longer service time.
- §3 lists `/run/report` as a modal, and no router is on the dependency list.

**Decision.**
- **Charts.** p99 and error rate, each with a dashed target line; cash; users. Each is a
  hand-written SVG line over d3-scale's linear scale for every week in history.
  - The y axis always includes zero.
  - Weeks over target are marked ▲.
  - Each panel toggles to a table of every week, with a met or missed column where there's
    a target.
- **The paragraph.** `state/report.ts` picks the nodes and
  `ui/screens/report/load-paragraph.ts` words them. It restates figures from the tick and
  makes no causal claims.
  - The bottleneck is named. If it dropped requests, the paragraph gives what it received,
    its capacity and what it turned away. It gives its share of p99, which is exact because
    end-to-end p99 is the sum of the hops (ADR-0009), and names any other node that dropped.
  - Not the problem: the busiest healthy node, the one most likely to be fixed by mistake.
    If an earlier node dropped requests, the paragraph says this node only saw what that one
    let through, instead of calling it fine (§8, masked bottleneck).
  - If no node is healthy, it says no component had headroom.
  - If every node is healthy, it names the busiest node and the one with the most headroom.
- **Beyond §5.**
  - Bailouts, rollbacks and new acts at the top.
  - A money breakdown, which §6 wants legible.
  - Reputation before and after, with which target was missed.
  - A table of every component at peak, since `00-GAME-DESIGN.md` §3 lists utilization per
    component.
- **A dialog, not a route.**
  - `role="dialog"` over the canvas, with the page behind it `inert` and focus on the week
    heading.
  - Escape or "Back to canvas" closes it and returns focus to Advance.
  - Routing waits for the first screen that needs a URL, the lessons in M6.
- **Copy details.**
  - Utilization rounds down, so a healthy node at 74.99% reads 74%, never the 75% that means
    warning.
  - The button reads "Advance week" without §4's arrow, which §2 forbids. It stays focusable
    when blocked (`aria-disabled`), so keyboard users can reach the reason it describes.

**Alternatives.**
- The least-loaded node as "not the problem": true but uninformative.
- A router dependency now: nothing needs a URL yet.
- A native `<dialog>`: gives modality for free, but jsdom's support is uneven. It can replace
  the ARIA dialog later without changing behavior.

**Consequences.**
- The paragraph and event copy make claims about the model, so they're flagged for review at
  the checkpoint.
- A rollback shows as a collapse in the charts, because history isn't restored (ADR-0024).

---

## ADR-0036 — Turn animation, d3-scale, and measuring turn resolution
2026-09-14 · Status: accepted · Extends ADR-0029, ADR-0030

**Context.**
- `05-UI-DESIGN.md` §2 gives turn resolution the game's one orchestrated moment: about
  800 ms of load flowing along the edges, nodes changing color as they saturate, and numbers
  counting. Reduced motion replaces it with a direct cut and a brief highlight on changed
  values.
- M4 requires turn resolution to render in under 16 ms for a 50-node architecture, measured
  and asserted.
- `01-ARCHITECTURE.md` §5 approves d3-scale for chart arithmetic, but it ships no type
  declarations.

**Decision.**
- **Dependencies.**
  - `d3-scale` 4.0.2, on the approved list. It brings d3-array, d3-format, d3-interpolate,
    d3-time and d3-time-format. After M4 the production bundle is 126.8 KB gzipped, up from
    110.4 KB after M3; d3 is part of that increase.
  - `@types/d3-scale` 4.0.9, as a dev dependency. Strict TypeScript needs declarations, the
    same reason ADR-0016 gave for `@types/react`.
- **Animation.**
  - `useTurnFrames` paints each frame straight onto the DOM, as the M3 drag does
    (ADR-0029), so no frame re-renders.
  - Fills, colors, hatching and readings go through `loadVisual`, the same function the node
    renders with, so the last frame leaves exactly what React drew.
  - The status bar's cash, users and reputation count to their new values.
  - Edges get a dashed overlay that moves toward each target, driven by CSS while the canvas
    carries `data-flowing`.
  - The playback carries its start time, so a component that mounts mid-animation joins at
    the right point or skips it.
  - The report opens when the animation ends. Advance stays blocked until it closes.
- **Reduced motion,** from the OS or the in-game setting: no overlay, fills cut straight to
  their level, and changed readings and status figures are highlighted for 1.2 s by switching
  a style on and off. The report opens at once.
- **What "renders in under 16 ms" covers:** from Advance to the resolved turn committed to
  the DOM. That is the engine call, every node and edge taking its new load, and the status
  bar. Two assertions run in `npm run test`:
  - `state/turn-performance.test.ts` times the turn plus everything the screens derive from
    it, on a 50-node chain. Its 90th percentile must be under 16 ms. Measured: median 0.14 ms,
    p90 0.23 ms.
  - `ui/turn-render-performance.test.tsx` times React committing a resolved 50-node turn in
    jsdom, with the report dialog opening in the same commit. Its median must be under 16 ms.
    Measured: median 7.6 ms, p90 9.6 ms, max 11.8 ms.
- **Browser measurement.** Headless Chrome 152 at 1440px, with trusted clicks on Advance in
  the 50-node lab, 10 turns each way. The script lives in the session scratchpad, as in M3.

  | Production build | Reduced motion | Animated |
  |---|---|---|
  | Click to canvas commit | 1.1 ms median, 3.0 ms max | 0.8 ms median, 1.0 ms max |
  | Click to report commit | 3.9 ms median, 7.5 ms max | 804 ms median, after the animation |
  | Click to next painted frame | 7.8 ms median, 16.7 ms max | — |
  | Animation frames | — | 4.2 ms median, 4.3 ms max, none over 20 ms (1,917 frames) |

  The development build (unminified React, with StrictMode rendering twice) was slower:
  - canvas commit 6.7 ms median, 12.6 ms max
  - report commit 13.3 ms median, 28.7 ms max
  - animation frames 4.2 ms median, 8.3 ms max

**Alternatives.**
- React state per frame: every node re-renders about 50 times per animation.
- CSS transitions on the fill's SVG attributes: `y` and `height` on a `rect` don't
  transition reliably across browsers, and the counting numbers need JavaScript anyway.
- A browser in CI asserting real frames: ADR-0030 kept browser checks at the checkpoint.

**Consequences.**
- jsdom stands in for the browser in CI. It does no layout or paint, and on this machine it
  has about 2× headroom, so a much slower CI runner could approach the budget.
- Under reduced motion the report paints in the same frame as the turn. One production turn
  in ten took 16.7 ms from click to painted frame, including the wait for the frame; its
  commit stayed under 8 ms.
- The headless numbers come from one Windows laptop with uncapped frames. Whether the
  animation is satisfying or annoying by turn 30 (`07-TESTING.md` §8) is the human's call at
  the checkpoint.

---

## ADR-0037 — Minimal first-run guidance moves ahead of M5, as M4a
2026-09-14 · Status: accepted

**Context.** At the M4 checkpoint the human found the loop "very not intuitive" and asked
where the learning and the tutorial are. Under the roadmap:
- lessons, checks and unlocks arrive in M6 and M7
- first-run onboarding arrives in M10

So nothing on screen explains what to look at or what to do. M4's checkpoint asks whether the
loop is interesting with no content. A player who can't operate a week can't answer that:
"unexplained" and "boring" look the same. Later checkpoints (M5b, M7b, M9) have the same
problem.

**Decision.** The human chose to add M4a before M5: the smallest in-game help that lets a new
player run one week.
- A short "How a week works" guide on a new run, dismissible and reopenable.
- One-sentence pointers on the empty inspector and the forecast line saying what to compare.
- One-sentence definitions of p99, utilization, capacity and "/s" where they first appear.

M4a is not lessons: concepts are still taught in M6 and M7. It keeps ADR-0032 (nothing
projects next week's load), changes no save format, and adds no dependency. M4's checkpoint
question is asked again at the end of M4a. M10 keeps the rest of onboarding and builds on this
guide.

**Alternatives.**
- Keep the roadmap order and judge the loop from written instructions outside the game: the
  checkpoint would test the instructions, and every later checkpoint would have the same gap.
- Fold guidance into M6: several milestones of content work would come before anyone can
  judge the loop, which is the risk M4's checkpoint exists to catch.
- Pull the Tier 1 lesson on capacity forward: it depends on M5's schema and M6's lesson flow,
  so it isn't small.

**Consequences.**
- M5 starts after M4a and its checkpoint.
- The guide and definitions make claims about the game and its model, so their copy is flagged
  for review in M4a's summary.
- If the loop still isn't interesting with guidance, the redesign question from M4 comes up
  before any content is written.

---

## ADR-0038 — The week guide and definitions in place
2026-09-14 · Status: accepted · Extends ADR-0037

**Context.** M4a asks for:
- a "How a week works" guide on a new run, reopenable from the header, whose steps name
  on-screen elements by their visible labels
- one-sentence definitions of p99, utilization, capacity and "/s" where they first appear,
  reachable without hover
- no save format change and no new dependency

Four details were open:
- whether the guide covers the screen or sits beside it
- how closing it is remembered without a save change
- where "first appear" is, since that depends on what the player does first
- how a test knows what the guide names

**Decision.**
- **A panel, not a dialog.** Nothing goes inert, so the player can look at, and use, what a step
  names while reading it. Where it sits follows `05-UI-DESIGN.md` §9's layouts:
  - 900px and up: above the catalog, canvas and inspector, scrolling within 40% of the viewport
    height. Its five steps sit in one row from 1280px.
  - Below 900px: first in the panel under the canvas, which already scrolls. In headless Chrome,
    a banner above the canvas left the canvas 97px tall at 600 × 900, and at 400 × 800 it
    squeezed out the component list that editing happens in.
- **Focus.** Opened from the header, the guide moves focus to its heading, because below 900px it
  is far from the button in tab order. When a new run opens it, focus stays where it is.
- **Opening and closing.** `ui.guideOpen` lives in the store and is never saved.
  - Starting a run opens it, and so does loading or importing a run still at week 0.
  - It stays open until closed: by "Close guide", by Escape inside it, or by the header's
    "How a week works" button, a disclosure with `aria-expanded`.
  - Closing from inside moves focus to that button.
- **Copy as data.** `ui/components/week-guide-copy.ts` writes each step as text and labels. Each
  label carries its visible text and where it's shown:
  - the canvas screen as a run opens
  - the inspector with a component selected
  - the weekly report

  A test walks one week and finds each label outside the guide at that point.
- **Definitions.** `ui/glossary.ts` holds one sentence per term.
  - A `Term` is a button in the words already on screen, with a dotted underline.
  - Click, tap, Enter or Space shows the definition below its `TermGroup`, in a polite live
    region. Each group shows one at a time, and pressing the term again hides it.
  - Where a term first appears depends on the path, so it's defined at every label a player can
    meet in the first week:
    - "/s" and capacity on the forecast line
    - capacity in the empty inspector
    - capacity, utilization and p99 in a selected component's figures
    - p99 on the report's p99 latency chart
    - capacity, utilization and p99 in the report's Components at peak table
    - capacity and p99 in the guide
  - "/s" is defined only on the forecast line, which is always above the canvas.
- **A claim pinned to the model.** Step 3 says every request passes through the app server and
  the database. That holds while an app server makes one database query per request, so the
  guide's test pins `BALANCE.starter.appFanoutFactor` at 1.

**Alternatives.**
- A modal tour: it covers what it describes, and pointing at elements needs positioning code or
  a library.
- Tooltips: hover can't be reached by keyboard or touch.
- The native `popover` attribute: placing it beside its term needs anchor positioning or
  measuring code. An inline disclosure needs neither.
- Remembering that the guide was closed, in the save or under a second storage key: a save
  format change, or a second persistence path beside ADR-0025. After a reload at week 0, closing
  it again costs one click.
- Defining terms only in the guide: once it's closed, the definitions are gone.

**Consequences.**
- A reload before the first Advance shows the guide again.
- Pushing the bottom sheets' content down exposed an M3 layout bug. Their screen-reader-only
  Catalog and Inspector headings are absolutely positioned. Nothing in the sheet was positioned,
  so the headings were placed against the page. Once they sat below the fold, the whole page
  scrolled 182px at 600 × 900. The sheet is now `relative`, and headless Chrome measures the page
  at exactly the viewport's height with the guide open or closed. jsdom can't lay out, so no test
  covers it.
- Some figure labels and table headers are now buttons, and screen readers announce them as
  buttons.
- The guide and the definitions make claims about the model, so their copy is flagged for review.
- M10's onboarding builds on this guide. Changing how many queries an app server makes needs new
  step copy.

---

## ADR-0039 — Timing tests run after the rest of the suite
2026-09-14 · Status: accepted · Extends ADR-0036

**Context.** M4's render-time test asserts that React commits a resolved 50-node turn with a
median under 16 ms (ADR-0036). During M4a it began failing most full runs, with medians of
16.4–18.0 ms. On the same machine, measured alone over 15 turns:
- M4's code: medians of 8.6, 8.6 and 9.5 ms
- M4a's code: medians of 9.2, 9.3 and 9.1 ms

With Vitest's results cache cleared, the full suite still failed two runs in three. With file
parallelism off, it passed both runs, taking 15 s instead of 5 s. Other jsdom test files running
alongside the timing test were spending its budget, and M4a added two of them.

**Decision.** `vite.config.ts` splits the suite into two Vitest projects.
- `unit` holds every test file except the timing tests, and runs in parallel as before.
- `timing` holds `state/turn-performance.test.ts` and `ui/turn-render-performance.test.tsx`.
  - `sequence.groupOrder: 1` starts it after `unit` has finished.
  - `fileParallelism: false` runs its files one at a time.

The 16 ms budget and both assertions are unchanged. Afterwards, five full runs of `npm run test`
passed, with the timing files reported last.

**Alternatives.**
- Raising the budget, or retrying the test: it would pass for the wrong reason, and M4's criterion
  is 16 ms.
- Turning off file parallelism for the whole suite: every run takes three times as long.
- A separate timing script: the definition of done runs `npm run test`, which would stop checking
  M4's criterion.

**Consequences.**
- A new test that asserts a wall-clock budget must be added to `TIMING_TESTS`.
- The timing files still share the machine with anything else that's running, as ADR-0036 noted
  for CI.
