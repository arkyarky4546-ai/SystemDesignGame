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
