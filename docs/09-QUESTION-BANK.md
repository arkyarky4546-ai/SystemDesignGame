# The question bank

Authority: how questions are produced, stored, reviewed, and shipped.

## 0. The constraint this doc exists to satisfy

**No AI runs in the shipped website. Ever.** Not for generating questions, not
for grading, not for hints, not for explanations. The site is static files plus
arithmetic. No API keys, no network calls at runtime, no per-play cost, no
latency, no non-determinism, no confidently-wrong output reaching a learner who
can't yet tell it's wrong.

AI is an **authoring-time tool**, used in Claude Code sessions, producing data
files that get reviewed and committed. By the time a question reaches a browser
it is inert JSON that a human has signed off on.

"Database" here means a set of versioned, committed, code-split data files —
not a server. There is no server. See ADR-0011.

## 1. The volume problem, stated honestly

A good check needs `poolSize ≥ 2 × drawCount` so retakes differ. Across 39
concepts at a genuinely useful pool depth, the target bank is on the order of
**1,200–1,500 questions**. Nobody is hand-reviewing 1,400 questions, and AI
generating 1,400 questions unsupervised will produce a few dozen that are subtly
wrong — which is the single worst outcome this project can have, since you are
the person learning from them.

The resolution is to split the bank into two classes with completely different
correctness guarantees and completely different review costs.

## 2. Two classes of question

### 2.1 Derived questions — provably correct, cheap, unlimited

Generated at build time from **parameterized templates whose answers are
computed by the real simulation engine**. The template says "sample a request
rate and a service time, ask how many instances are needed"; the answer comes
from calling `instancesNeeded()` in `src/engine/`. The question and the game
cannot disagree, because they're the same code.

This covers a surprising amount of the curriculum: capacity math, utilization,
the latency curve, percentile ratios, cache hit-rate arithmetic, downstream load
reduction, replica read distribution, write amplification, shard skew, queue
drain time, bandwidth cost, instance cost comparisons.

```ts
type QuestionTemplate = {
  id: string                    // 'tpl-capacity-instances-needed'
  conceptId: ConceptId
  depth: 1 | 2 | 3
  params: ParamSpec[]           // named ranges + step, sampled by seeded RNG
  constraints?: (p: Params) => boolean   // reject nonsense combinations
  build: (p: Params, engine: Engine) => GeneratedQuestion
  instanceCount: number         // how many to freeze into the bank
  distractors: DistractorRule[] // see below
}

type ParamSpec =
  | { name: string; kind: 'int'; min: number; max: number; step: number }
  | { name: string; kind: 'choice'; values: (string | number)[] }
```

**Distractors are the interesting part, and they're where the teaching lives.**
A wrong answer must be the result of a specific, nameable mistake — then
`whyWrong` writes itself and is guaranteed accurate:

```ts
type DistractorRule = {
  label: string          // 'forgot headroom'
  compute: (p, correct) => number
  whyWrong: string       // templated, references the actual mistake
}
```

For the capacity example: *forgot headroom* (divide by 1.0 instead of 0.8),
*inverted the headroom factor* (multiply by 0.8 instead of divide), *used mean
instead of peak*, *off-by-one on rounding up*. Every one of those is a real
mistake a learner makes, and the distractor is the arithmetic consequence of
making it.

**Generation constraints:**
- Numbers must land on values a person would plausibly see. 2,400 rps, not
  2,387 rps. `step` on `ParamSpec` enforces this.
- Answers must be distinguishable. Reject any instance where two options round
  to within 2% of each other — a question where "120" and "119" are both offered
  tests arithmetic precision, not understanding.
- `constraints` rejects degenerate combinations: utilization above 1.0, a cache
  larger than the working set by 100×, zero replicas.
- No two frozen instances of the same template may have identical parameter
  tuples. Deduplicate at generation.

**The caveat, and it's a real one:** derived questions are exactly as correct as
the engine. A sign error in the engine generates a thousand confidently wrong
questions instead of one. This makes the M1 engine checkpoint even more
load-bearing than it already was, and it's why `07-TESTING.md`'s named curve
assertions exist. Review the engine once, carefully; the bank inherits that
review.

**Second caveat:** derived questions train computation, not judgment. A check
made entirely of them produces someone who can size a fleet and cannot decide
whether to. Draw composition (§5) enforces the mix.

### 2.2 Authored questions — expensive, limited, human-reviewed

Everything derived questions can't do: tradeoffs, failure reasoning,
"why is this architecture wrong", consistency semantics, when-not-to-use-X.
Written by AI in Claude Code sessions, in small batches, then read by you.

Target **8–12 authored questions per concept**, so ~390 across the full
curriculum and ~60–70 for Tier 1. That is a reviewable number.

### 2.3 Diagnose questions — the third kind, engine-seeded

`03-CONTENT-SCHEMA.md` §3 already defines `diagnose`: a frozen real
`TickResult` shown as graphs, with "what's wrong here?" These are
semi-derived — the *scenario* is generated by running the engine against a
deliberately broken architecture (so the numbers are real), while the *prompt
and options* are authored. Highest value per question in the entire bank,
because they cannot be answered by recall or by arithmetic alone.

Budget 4–8 per tier. Generate the broken architectures from a catalog of named
pathologies: undersized cache, write-bound replicas, SPOF, hot shard, queue
backlog, masked bottleneck.

## 3. Target composition

| Tier | Concepts | Authored | Derived | Diagnose | Tier total |
|---|---|---|---|---|---|
| 1 | 6 | 66 | ~240 | 6 | ~312 |
| 2 | 8 | 88 | ~320 | 8 | ~416 |
| 3 | 9 | 99 | ~270 | 8 | ~377 |
| 4 | 8 | 88 | ~240 | 6 | ~334 |
| 5 | 8 | 88 | ~120 | 6 | ~214 |
| **Total** | **39** | **429** | **~1,190** | **34** | **~1,650** |

Derived counts fall in Tier 5 because operational topics (degradation, incident
response, observability) have less arithmetic in them. That's expected, not a
gap to fill with contrived math.

**Build Tier 1's bank completely before writing any of Tier 2.** ~312 questions
for six concepts is already a deep bank — pools of ~50 per concept against a
`drawCount` of 5.

## 4. Storage and distribution

### 4.1 Measured sizing

A representative question — prompt, four options, three `whyWrong` strings,
explanation, metadata — serializes to **~1.2–1.4 KB** of minified JSON.
Gzip measured at **2.6×** against deliberately incompressible text; real domain
prose repeating "utilization", "replica", "latency" should reach 3.5–4×. Budget
at the pessimistic 2.6×.

```
1,650 questions × 1.3 KB           ≈ 2.1 MB raw
                   ÷ 2.6           ≈ 825 KB gzipped   (whole bank)
one concept chunk: 45 questions    ≈ 58 KB raw ≈ 23 KB gzipped
```

825 KB is far too much to ship up front against the 200 KB initial-bundle budget
in `01-ARCHITECTURE.md` §8. 23 KB for one concept is nothing.

### 4.2 Therefore: chunk per concept, not per tier

```
src/content/questions/
  <concept-id>/
    authored.ts      # hand-reviewed, committed, edited by humans
    derived.json     # generated output, committed, NOT hand-edited
    templates.ts     # the generators. reviewed instead of their output.
    diagnose.ts      # authored prompts + frozen TickResult fixtures
```

Loaded with a dynamic `import()` when the player opens that concept's check or
enters practice mode. **The initial bundle contains zero questions.** A player
who never reaches Tier 4 never downloads Tier 4's bank.

Committing `derived.json` rather than generating at install time is deliberate:
the bank becomes diffable in git, so a change to a template shows up in review
as "these 40 questions changed" rather than being invisible. ADR-0013.

### 4.3 Identity and retirement

```
id format: q-<conceptId>-<origin>-<nnnn>     q-read-replicas-a-0007
           q-<conceptId>-d-<templateId>-<nnnn>
```

IDs are permanent. Save files reference them for the missed-question weighting
in `03-CONTENT-SCHEMA.md` §4, so a deleted id is a broken save.

**Questions are retired, never deleted.** `status: 'active' | 'retired'`.
Retired questions are excluded from draws but still resolve when a save
references them. Add a validation rule: no id may ever be reused, checked
against a committed `bank-manifest.json` listing every id ever issued.

## 5. Draw composition

A check must mix the classes or it degenerates. For `drawCount = 5`:

| Slot | Source | Constraint |
|---|---|---|
| 1 | Authored, depth 1–2 | Verifies the lesson was read |
| 2 | Derived | Arithmetic application |
| 3 | Authored, depth 2 | Application beyond the lesson's examples |
| 4 | Derived *or* diagnose | Weighted toward diagnose when available |
| 5 | Authored, depth 3 (Senior/Staff) or depth 2 (Intern/Junior) | Tradeoff |

Hard rules, asserted in tests:
- Never more than 2 derived questions in a single check.
- At least 2 authored questions in every check.
- No two questions in one draw share a `templateId`.
- No two questions in one draw share more than one tag.

Intern and Junior filter out depth 3 per `03-CONTENT-SCHEMA.md` §4; the slot
falls back to another depth-2 authored question rather than to a derived one.

## 6. Difficulty calibration without telemetry

There's no backend, so there's no play data, so **difficulty cannot be
empirically calibrated**. It has to be assigned a priori by rubric. Say this
out loud rather than pretending the `depth` field is measured.

**Depth rubric — apply mechanically, not by feel:**

| Depth | Test |
|---|---|
| 1 | The answer appears verbatim or near-verbatim in the lesson's `core`. Pure recall. |
| 2 | The answer requires applying a lesson rule to a situation **not shown in the lesson**. Either arithmetic on new numbers, or transferring a rule to a new component. Still has one defensible answer. |
| 3 | The answer requires weighing two things the lesson says are both good. Has no single clean answer; the correct response names a benefit *and* its cost. Implemented as `multi` with partial credit. |

A question where the right answer is obvious once you've read the lesson is
depth 1 even if the topic is advanced. Topic difficulty and cognitive depth are
independent axes — `tier` carries the first, `depth` the second. Conflating them
is the most common miscalibration and validation should flag concepts whose
questions are all one depth.

**Position bias:** options are shuffled at display time using the run's seeded
RNG keyed by `(questionId, attemptNumber)`. Deterministic, reproducible, and it
makes correct-answer-position balance a non-issue in the stored data. Store
options in authoring order; never try to balance positions in the files.

## 7. Automated screening — what runs before a human looks

Every generated batch passes through `tools/screen-questions.ts` before entering
review. Anything it rejects never costs you attention.

| Check | Rule |
|---|---|
| Schema | Zod parse against `03-CONTENT-SCHEMA.md` §3 |
| Numeric self-verification | For derived: recompute the answer via the engine, assert equality. Any mismatch is a hard failure. |
| Distractor distinctness | No two options within 2% (numeric) or Jaccard > 0.8 (text) |
| Near-duplicate detection | Normalize → 3-gram shingle → Jaccard across the whole concept. Flag pairs > 0.7. |
| `whyWrong` coverage | Every incorrect option has one; none is a generic restatement of the correct answer |
| Explanation independence | Explanation must not be the prompt restated; flag if Jaccard(prompt, explanation) > 0.6 |
| Length bounds | Prompt 15–60 words, options ≤ 20, explanation 25–80 |
| Depth distribution | Every concept has ≥ 2 questions at each eligible depth |
| Tag coverage | Every `keyNumber` and `misconception` in the lesson is referenced by ≥ 1 question |
| Answer leakage | Correct option is not systematically the longest — flag if > 45% of a concept's correct answers are the longest option |
| Forbidden content | No trivia, no port numbers, no vendor-specific defaults, no "all of the above" |

That last row deserves a note: **"all of the above" and "none of the above" are
banned**. They're a generation crutch and they test test-taking, not systems.

## 8. The review workflow — how this stays tractable

This is the part that makes "decently hands off" compatible with "I'm learning
from this."

**Review the templates, spot-check the instances.**

| Artifact | Review burden | How |
|---|---|---|
| Derived templates | ~15 for Tier 1 | Read the template and its distractor rules. Approving one template approves its 40 instances, because the engine computed them. |
| Derived instances | 10% random sample | The review tool serves a seeded random sample. If any fail, reject the whole template batch and fix the template. |
| Authored questions | All ~66 for Tier 1 | One at a time in the review tool. |
| Diagnose questions | All ~6 | Slower each; check the frozen graphs actually show the pathology. |

Tier 1 review burden: **15 templates + ~24 spot-checks + 66 authored + 6
diagnose ≈ 111 items**, against a bank of ~312. Roughly an evening, once.
Reviewing all 312 would be several evenings and you'd get careless by item 150,
which is worse than not reviewing.

**`npm run review`** — a local-only tool (never deployed, excluded from the
build) that serves one item at a time with keyboard shortcuts:

```
  a   approve            → reviewStatus: 'reviewed'
  r   reject             → status: 'retired', prompts for reason
  e   edit               → opens in $EDITOR, re-screens on save
  f   flag               → 'needs-expert-review', keeps in queue
  ?   show lesson        → the source lesson, side by side
  s   skip
```

Writes `reviewStatus` back to the source files and appends to
`content/review-log.jsonl` with reviewer, timestamp, and action. Rejections
record a reason, and reasons are the input to improving the generation prompts.

**Generation batch size: 10–15 questions per session, per concept.** Not 200.
Quality degrades measurably at volume in a single pass, and a rejected batch of
15 costs 15 minutes while a rejected batch of 200 costs a weekend.

## 9. Practice mode

Since the derived bank is large and cheap, the library gets a **drill mode**:
pick a concept, get questions until you stop, no gating, no pass threshold, no
effect on unlocks. Draws from the full pool with missed-question weighting.

This is nearly free — the bank and the draw logic already exist — and it's the
feature that makes the project useful as an exam-prep tool on a phone, not just
a game on a laptop. Build it in M6 as a route on the library screen.

## 10. Provenance

Every question carries how it came to exist:

```ts
provenance: {
  origin: 'authored' | 'derived' | 'diagnose'
  templateId?: string        // derived only
  generatedAt: string        // ISO date
  generator: string          // 'claude-code/opus-5' or 'human'
  reviewedBy?: string
  reviewedAt?: string
  batchId: string            // groups a generation session
}
```

`batchId` exists so that discovering one bad question lets you re-examine its
whole batch. If a generation session produced one subtly wrong answer about
quorum reads, the other fourteen from that session deserve a second look.
