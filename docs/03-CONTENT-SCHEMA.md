# Content schema and authoring

Authority: the shape of every content file, and the rules for writing them.

Content is data. Adding a concept, a question, or an incident must never require
touching `src/engine/`. If it does, the schema is wrong — fix the schema.

## 1. Concept

One file per concept at `src/content/concepts/<tier>/<concept-id>.ts`.

```ts
type Concept = {
  id: string                 // stable, kebab-case, never reused. 'read-replicas'
  tier: 1 | 2 | 3 | 4 | 5
  title: string              // "Read replicas"
  oneLiner: string           // shown on locked cards. one sentence, no jargon.
  prerequisites: ConceptId[] // must be unlocked first
  unlocks: {
    components?: ComponentKind[]
    configs?: ConfigCapability[]   // e.g. 'db.replicaCount', 'cache.evictionPolicy'
  }
  lesson: Lesson
  check: Check
  reviewStatus: 'needs-review' | 'reviewed'
  sources?: string[]         // where a human can verify the claims
}
```

`reviewStatus` defaults to `needs-review` and **the build warns on any
`needs-review` content in a production build**. It doesn't fail — that would
block iteration — but the count is printed loudly. A human clears these.

## 2. Lesson

```ts
type Lesson = {
  core: Block[]        // everyone reads this. target 250-450 words.
  deeper?: Block[]     // optional expansion. no length target.
  keyNumbers?: Fact[]  // "a memory read is ~100ns, a disk seek ~10ms"
  misconceptions?: { claim: string; correction: string }[]
}

type Block =
  | { kind: 'prose'; text: string }
  | { kind: 'diagram'; architecture: Architecture; caption: string }
  | { kind: 'formula'; latex: string; explanation: string }
  | { kind: 'comparison'; rows: { label: string; a: string; b: string }[]; aLabel: string; bLabel: string }
  | { kind: 'callout'; tone: 'note' | 'warning'; text: string }
  | { kind: 'demo'; demoId: string }   // an interactive sim widget, see §7
```

The `diagram` block reuses the real canvas renderer with a real `Architecture`
value. This means lesson diagrams cannot drift from what the game can actually
build, and it means a diagram in a lesson can be loaded directly onto the
player's canvas as a starting point.

**Writing rules for lessons:**

- Lead with the problem, not the solution. "Your database is at 94% and every
  read is slow" before "here's what a read replica is."
- Every claim that has a number gets the number. "Slower" is not a lesson;
  "roughly 100× slower" is.
- Name the tradeoff explicitly. Every component in this domain costs something —
  money, consistency, complexity, operational burden. A lesson that presents a
  technique without its cost is wrong even if every sentence in it is true.
- Second person, present tense, active voice.
- No analogies to restaurants, highways, or libraries unless the analogy
  survives more than one sentence of pressure. Most don't.
- If a claim is contested or version-dependent (isolation level defaults,
  what a specific database does), say so rather than flattening it.

## 3. Check

> Questions are not stored inline in the concept file. A `Check` names a
> concept; the pool is assembled at load time from that concept's chunk in
> `src/content/questions/<conceptId>/`. Bank production, storage, screening,
> and review are specified in **`09-QUESTION-BANK.md`**, which governs
> everything about questions that this section doesn't.

```ts
type Check = {
  drawCount: number      // how many are asked. 3-6.
  composition: SlotSpec[] // see 09-QUESTION-BANK.md §5
}

type Question = {
  id: string             // permanent. never reused. see 09-QUESTION-BANK.md §4.3
  conceptId: ConceptId
  depth: 1 | 2 | 3       // 1 = recall, 2 = application, 3 = tradeoff judgment
  prompt: string
  kind: QuestionKind
  explanation: string    // ALWAYS shown after answering, right or wrong
  tags: string[]         // drives draw diversity and lesson coverage checks
  status: 'active' | 'retired'
  reviewStatus: 'needs-review' | 'needs-expert-review' | 'reviewed'
  provenance: Provenance // see 09-QUESTION-BANK.md §10
}

type QuestionKind =
  | { type: 'single'; options: Option[]; correctId: string }
  | { type: 'multi'; options: Option[]; correctIds: string[]; partialCredit: boolean }
  | { type: 'numeric'; answer: number; tolerance: number; unit: string }
  | { type: 'order'; items: string[]; correctOrder: string[] }
  | { type: 'diagnose'; scenario: SimSnapshot; options: Option[]; correctId: string }

type Option = { id: string; text: string; whyWrong?: string }
```

`whyWrong` on distractors is not optional decoration. A player who picks the
wrong answer needs to know why *that specific answer* was tempting and wrong.
This is where most of the teaching happens.

**The `diagnose` kind is the highest-value question type.** It hands the player
a real `TickResult` snapshot — actual graphs, actual utilization numbers — and
asks what's wrong. Generate these by running the engine on a deliberately broken
architecture and freezing the output. They cannot be answered by memorization.

**Writing rules for questions:**

- Distractors must be *plausible to someone who half-understands*. "The database
  is made of cheese" teaches nothing. The best distractor is the answer that was
  correct one tier ago.
- Depth 1 questions verify the lesson was read. Depth 2 requires applying it to
  a situation not in the lesson. Depth 3 has no single clean answer and tests
  whether the player can state the tradeoff — implement as `multi` with partial
  credit, where the correct set includes both a benefit and its cost.
- Never test trivia. Nobody needs to recall a default port number.
- Numeric questions are excellent for capacity math and should be used more than
  feels natural. "You serve 2,000 rps at 40ms service time. How many instances
  at 90% max utilization?" is a better question than any multiple choice.
- Question pools need `poolSize ≥ 2 × drawCount` so retakes differ.

## 4. Draw logic

Depth eligibility by difficulty is defined here; **slot composition — how many
authored vs derived vs diagnose questions appear in one check — is defined in
`09-QUESTION-BANK.md` §5 and overrides any simpler reading of this section.**

```
eligible = pool.filter(q =>
  q.status === 'active' && depthsForDifficulty.includes(q.depth))
```

| Mode | Depths drawn | Pass threshold |
|---|---|---|
| Intern | 1, 2 | 60% |
| Junior | 1, 2 | 70% |
| Senior | 1, 2, 3 | 80% |
| Staff | 2, 3 | 85% |

Weighted so at least one depth-2 question always appears. Previously-missed
questions are weighted up on retakes — spaced repetition, cheaply.

## 5. Component definitions

Components are content too, at `src/content/components/<kind>.ts`, so the
catalog can grow without engine changes.

```ts
type ComponentDef = {
  kind: ComponentKind
  displayName: string
  description: string           // player-facing, one sentence
  gatedBy: ConceptId
  tiers: {
    label: string               // "Small", "Standard", "High-memory"
    capacityRps: number
    serviceTimeMs: number
    setupCostCents: number
    runningCostPerTurnCents: number
    failureRatePerTurn: number
  }[]
  configSchema: ZodSchema       // kind-specific options
  validConnections: {
    upstream: ComponentKind[]
    downstream: ComponentKind[]
  }
}
```

`validConnections` drives canvas validation — the UI refuses to let you wire a
CDN downstream of a database, and says why.

## 6. Incidents

The hardest content to write well and the most valuable.

```ts
type Incident = {
  id: string
  title: string                 // "Everything was fine until 8:04pm"
  trigger: IncidentTrigger
  brief: string                 // SYMPTOM ONLY. never the cause.
  injection: SimInjection       // what the sim does differently
  durationTurns: number
  budgetCents: number           // emergency budget, often restrictive
  successCriteria: Criterion[]
  debrief: {
    whatHappened: string
    whyItHappened: string
    goodResponses: string[]
    commonMistakes: string[]
  }
  reviewStatus: 'needs-review' | 'reviewed'
}

type IncidentTrigger =
  | { type: 'turn'; turn: number }
  | { type: 'traffic'; meanRpsAbove: number }
  | { type: 'architecture'; requires: ComponentKind[]; forbids?: ComponentKind[] }
  | { type: 'act'; act: number; position: 'start' | 'mid' | 'end' }

type SimInjection =
  | { type: 'traffic-spike'; multiplier: number; turns: number }
  | { type: 'node-failure'; kind: ComponentKind; count: number }
  | { type: 'cache-flush' }
  | { type: 'skew-shift'; newKeySkew: number }
  | { type: 'workload-shift'; readFraction?: number; payloadKb?: number }
  | { type: 'cost-shock'; multiplier: number }

type Criterion =
  | { type: 'metric'; metric: 'p99Ms' | 'errorRate' | 'staleRate'; max: number }
  | { type: 'economy'; cashAbove: number }
  | { type: 'architecture'; mustContain?: ComponentKind[]; mustNotContain?: ComponentKind[] }
```

**Rules for incidents:**

- The brief describes what a person would actually observe. "Checkout is timing
  out. Support has 400 tickets. The database dashboard looks normal." Never
  "your cache has been invalidated."
- Success is evaluated by the simulation, not by a quiz. The player fixes it or
  doesn't.
- There must be at least two viable responses with different tradeoffs. An
  incident with one correct answer is a puzzle, not a scenario, and puzzles get
  solved once and never thought about again.
- The debrief is mandatory and shown whether you pass or fail.
- `architecture`-triggered incidents are how you punish specific bad designs
  fairly — a player who built a single database with no replicas *should*
  eventually meet the primary-failure incident.

## 7. Interactive demos

Small embedded widgets inside lessons, driven by the real engine.

```ts
type Demo = {
  id: string
  architecture: Architecture   // fixed
  variable: { path: string; min: number; max: number; step: number; label: string }
  showMetrics: MetricId[]
}
```

One slider, one architecture, live-updating metrics. The utilization/latency
demo — drag load from 50% to 98% and watch p99 go vertical — is worth more than
any three paragraphs and should be the first one built.

## 8. Validation

`npm run validate` must check:

- Every file parses against its Zod schema.
- Concept ids are unique; prerequisite ids all exist; the prerequisite graph is
  acyclic.
- Every `ComponentKind` referenced in `unlocks` has a `ComponentDef`.
- Every `ComponentDef.gatedBy` points at an existing concept.
- No concept is unreachable from tier 1 by following prerequisites.
- `poolSize >= 2 * drawCount` for every check.
- Every check has at least one depth-2 question, and tier ≥ 3 concepts have at
  least one depth-3.
- Every `single`/`multi` option set has a `whyWrong` on every incorrect option.
- Every incident's `successCriteria` is achievable — run the engine against the
  incident's own `goodResponses` architectures and confirm they pass. **This one
  is expensive and it is the most important check in the list.** An incident
  nobody can beat is the worst bug this project can ship.
- Report the count of `needs-review` items.

This runs in CI and as part of the definition of done.
