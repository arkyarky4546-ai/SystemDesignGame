# Roadmap

Authority: build order. One milestone per session. Do not work ahead.

Mark a milestone `[x]` only when every acceptance criterion is demonstrably met
and the definition of done in `CLAUDE.md` passes.

**🔶 marks a human checkpoint.** Stop there and wait for review even if the
milestone technically passed. These are placed where a wrong decision compounds.

---

## [x] M0 — Skeleton

**Read:** `CLAUDE.md`, `01-ARCHITECTURE.md`

Vite + React + TS + Tailwind + Zustand + Zod. The folder structure from
`01-ARCHITECTURE.md` §3, with placeholder index files. ESLint with the
`no-restricted-imports` rule enforcing `ui → state → engine → content`. Vitest
configured. All npm scripts from the README exist and run. `wrangler.jsonc` per
§2 with today's compatibility date.

**Acceptance:**
- `npm run dev` serves a page reading "Nines" and nothing else.
- `npm run build && npx wrangler deploy --dry-run` succeeds.
- A test that imports React from `src/engine/` **fails lint**. Prove it, then
  remove the test file.
- All scripts exit zero.

No game logic. No components beyond the shell. Resist.

---

## [x] M1 — Engine core: capacity and latency

**Read:** `02-SIMULATION.md` §1–5.2, `CLAUDE.md`

The heart of the project. Types, seeded RNG, topology validation, and the tick
resolver for a **linear architecture only** — ingress → server → database, no
caches, no branching, no replicas.

Implement: `rng.ts`, `types.ts`, `topology.ts`, and `resolve.ts` covering load
propagation, utilization, the `W = serviceTime/(1−u)` latency model, p50/p99
derivation, and drops.

**Acceptance:**
- `simulateTick` is pure — same inputs give identical output across 1,000 runs.
- Unit tests assert: at u=0.5 latency is 2× service time; at u=0.9 it's 10×; at
  u=0.99 it's ~100×. The saturation cliff is real and tested.
- p99 ≈ 4.605 × W, asserted to 3 decimal places.
- Load above capacity produces drops equal to the excess, and drops do not reach
  downstream nodes.
- A cyclic graph is rejected with a typed error.
- Greps for `Math.random`, `Date.now`, `new Date` in `src/engine/` find nothing;
  a test enforces this.

**🔶 Human checkpoint.** The simulation model is the foundation of every lesson
in the game. Review the formulas against `02-SIMULATION.md` before anything is
built on top.

---

## [ ] M2 — Economy, reputation, and the run loop

**Read:** `02-SIMULATION.md` §3, §6, §7, `01-ARCHITECTURE.md` §4, §6, §7

Traffic growth, revenue, costs, cash, reputation, user churn. `balance.ts` with
every constant. The Zustand store, `RunState`, save/load with versioning and the
migration array, and export/import.

**Acceptance:**
- A run advances 20 turns headlessly with plausible numbers on every difficulty.
- Reputation loss is ~3× gain, asserted.
- `qualityMultiplier` clamps at both ends.
- A save round-trips: serialize → deserialize → identical state.
- A v0 fixture save migrates to current and loads.
- A deliberately corrupted save is quarantined under
  `nines.save.corrupt.*` and surfaces an error, no crash.
- Zero balance constants appear outside `src/config/balance.ts`. Grep proves it.

---

## [ ] M3 — Canvas

**Read:** `05-UI-DESIGN.md` §2, §4, `01-ARCHITECTURE.md` §5, §9

The biggest UI risk, isolated into its own milestone. Grid-snapped SVG nodes,
orthogonal edges, drag to place, click-drag to connect, select to inspect,
delete. Utilization renders as fill level. Connection validity enforced from
`ComponentDef.validConnections` with a reason shown on invalid attempts.

**Acceptance:**
- Place, connect, reconfigure, and delete work with mouse and with keyboard
  alone.
- Invalid connections are refused with a specific message.
- 60fps while dragging a 30-node architecture; drag state is in a ref, not the
  store.
- Renders correctly at 1440px, 900px, and 600px per §9.
- Visible focus rings; reduced motion respected.

**🔶 Human checkpoint.** Play with it. If the canvas is annoying, the game is
annoying — nothing downstream fixes that.

---

## [ ] M4 — The loop is playable

**Read:** `05-UI-DESIGN.md` §3–5, `00-GAME-DESIGN.md` §3

Wire it together: status bar, catalog, inspector, Advance, weekly report with
four charts and the generated bottleneck paragraph, the turn-resolution
animation.

Charts are hand-written SVG over `d3-scale` with a table-view toggle.

**Acceptance:**
- A full turn resolves end to end: plan → build → advance → report → repeat.
- The bottleneck paragraph correctly names the highest-utilization node and
  correctly names one node that was *not* the problem.
- The forecast for next turn's peak is visible before Advance.
- Every chart has a working table toggle.
- Turn resolution renders in under 16ms for a 50-node architecture; measured and
  asserted.

**🔶 Human checkpoint.** This is the first time the game is playable. Play ten
turns. The question to answer is: is the loop interesting with no content in it
at all? If it isn't, stop and redesign — do not proceed to write 234 questions
on top of a boring loop.

---

## [ ] M5 — Content pipeline

**Read:** `03-CONTENT-SCHEMA.md` in full

Zod schemas, the content loader, `tools/validate-content.ts` implementing every
check in §8, and **two hand-written sample concepts** (`capacity-and-utilization`
and `percentiles`) proving the schema survives contact with real content.

**Acceptance:**
- `npm run validate` implements all of §8, including the expensive one: running
  the engine against each incident's `goodResponses` to confirm they pass.
- Both sample concepts validate and render.
- Deliberately breaking a fixture (missing `whyWrong`, cyclic prereqs, undersized
  pool) fails validation with a clear message naming the file.
- `needs-review` count prints on build.

---

## [ ] M5a — Question generator and screener

**Read:** `09-QUESTION-BANK.md` §2, §4, §7

The derived-question pipeline. `QuestionTemplate` type, the seeded sampler,
`constraints` rejection, distractor rules, and `tools/generate-questions.ts`
writing frozen `derived.json` per concept. Plus `tools/screen-questions.ts`
implementing every row of §7.

Ship with **three real templates** for `capacity-and-utilization` proving the
shape works: instances-needed, utilization-from-load, latency-at-utilization.

**Acceptance:**
- Generation is deterministic: same seed produces byte-identical `derived.json`.
- Every derived answer is recomputed through the engine and asserted equal. A
  deliberately corrupted answer fails the build.
- Distractors trace to named mistakes; each carries a `whyWrong` naming it.
- The 2%-distinctness rule rejects a fixture where two options are too close.
- Near-duplicate detection flags a hand-planted duplicate pair.
- `bank-manifest.json` exists and id reuse is a hard failure.
- Ban list enforced: a fixture containing "all of the above" is rejected.

---

## [ ] M5b — Review tool

**Read:** `09-QUESTION-BANK.md` §8, §10

`npm run review`. Local-only, excluded from the production build. One item at a
time, keyboard-driven, side-by-side lesson, writes `reviewStatus` back to source
and appends to `content/review-log.jsonl`.

**Acceptance:**
- All shortcuts from §8 work; `e` re-screens on save.
- Approving a template marks its instances `reviewed` in one action.
- Spot-check mode serves a seeded 10% sample of a template's instances.
- Rejection requires a reason and sets `status: 'retired'` rather than deleting.
- The review tool is absent from `dist/`. A test asserts this.

**🔶 Human checkpoint.** Review 20 items with it. If the tool is slow or
annoying, you will not review 111 items later, and the whole quality strategy
collapses. Fix it now.

---

## [ ] M6 — Learning flow

**Read:** `05-UI-DESIGN.md` §6–7, `00-GAME-DESIGN.md` §4, §6, `03-CONTENT-SCHEMA.md` §4, §7, `09-QUESTION-BANK.md` §5, §9

Lesson renderer for all block types, check flow with draw logic and difficulty
thresholds, unlock mechanics wiring concepts to catalog items, the library, the
demo widget, and **practice mode** (`09-QUESTION-BANK.md` §9).

Question chunks load via dynamic `import()` per concept, not per tier.

**Acceptance:**
- Passing a check unlocks its components permanently and across runs.
- Retakes draw a different question set; previously-missed questions are
  weighted up.
- Difficulty thresholds and depth filters match `03-CONTENT-SCHEMA.md` §4
  exactly.
- Switching difficulty mid-run changes thresholds and economy without losing
  progress.
- Locked catalog items name their gating concept and link to it.
- The saturation demo slider updates live from the real engine.
- Lesson diagrams render from real `Architecture` values through the canvas
  component.
- Draw composition matches `09-QUESTION-BANK.md` §5: never more than 2 derived
  and never fewer than 2 authored questions in one check. Asserted over 10,000
  simulated draws.
- Option order is shuffled deterministically from `(questionId, attemptNumber)`;
  the same attempt replayed gives the same order.
- Opening a Tier 1 check downloads only that concept's chunk. Verified in the
  network panel and asserted in the build output.
- Practice mode draws from the full active pool with missed-question weighting
  and does not affect unlocks.

---

## [ ] M7 — Tier 1 lessons and templates

**Read:** `04-CURRICULUM.md` Tier 1, `03-CONTENT-SCHEMA.md` §2, `09-QUESTION-BANK.md` §2, §3

Six Tier 1 lessons, both demos, balanced `ComponentDef`s, and ~15 derived
templates covering the arithmetic across all six concepts. Generate the derived
bank (~240 questions) from them.

**Acceptance:**
- Every concept has core prose in range, key numbers, and ≥1 misconception.
- ~15 templates produce ~240 instances, all engine-verified, all screened clean.
- Every `keyNumber` in every lesson is referenced by at least one question.
- Templates and instances are `needs-review`.

---

## [ ] M7b — Tier 1 authored and diagnose questions

**Read:** `09-QUESTION-BANK.md` §2.2, §2.3, §6, `04-CURRICULUM.md` Tier 1

~66 authored questions (8–12 per concept) and 6 `diagnose` questions built from
frozen `TickResult` snapshots of named pathologies.

**Generate in batches of 10–15, one concept at a time, across at least four
sessions.** Per §8: quality degrades measurably in a single long pass, and a bad
batch of 15 costs minutes while a bad batch of 200 costs a weekend. A session
that produces all 66 has produced worse questions than four sessions that
produce 16 each — this is not negotiable for speed.

**Acceptance:**
- Depth distribution per §6's rubric; validation flags any concept whose
  questions are all one depth.
- Every incorrect option has a `whyWrong` naming a specific misunderstanding,
  not a restatement of the correct answer.
- Diagnose snapshots visibly show their pathology when rendered in the report
  charts — check this by eye, not just by assertion.
- Every batch carries a distinct `batchId`.
- Any item where confidence is less than full is marked `needs-expert-review`
  rather than `needs-review`, and called out in the session summary.

**🔶 Human checkpoint — the important one.** Run `npm run review`. Per
`09-QUESTION-BANK.md` §8 that's ~15 templates, ~24 spot-checks, 66 authored, 6
diagnose — roughly 111 items, about an evening. This is the content you are
going to learn from. Do not delegate it, and do not approve in bulk to get
through it faster; rejecting a template is cheap and rejecting it later is not.

---

## [ ] M8 — Incidents

**Read:** `03-CONTENT-SCHEMA.md` §6, `00-GAME-DESIGN.md` §5

Trigger evaluation, injection, incident mode UI, criteria evaluation, debrief,
replay from library. Plus `the-first-outage`.

**Acceptance:**
- All trigger types fire correctly; a test covers each.
- All injection types affect the simulation as specified.
- Success and failure both produce a debrief.
- `the-first-outage` has at least two viable responses with different costs, and
  both verifiably pass.
- Replayable from the library without affecting the live run.

---

## [ ] M9 — Balance harness

**Read:** `07-TESTING.md` in full

`tools/balance-sim.ts`: headless play with simple strategy bots across all
difficulties and many seeds, reporting win rates, bankruptcy rates, and stall
points.

**Acceptance:**
- Runs 1,000 games in under 60 seconds.
- Reports per-difficulty outcome distributions.
- Flags any difficulty where a reasonable bot loses more than 20% of the time or
  wins without ever upgrading anything.
- The known-bad fixture configuration is correctly flagged as unwinnable.

**🔶 Human checkpoint.** Tune balance with the harness. This is where the game
becomes fair.

---

## [ ] M10 — Ship Tier 1

Title screen, settings, first-run onboarding, 404, deploy.

**Acceptance:**
- Deployed to `workers.dev` and loading.
- Initial JS bundle under 200KB gzipped, containing **zero questions**.
- No `needs-expert-review` items remain in shipped content.
- Keyboard-navigable end to end.
- A fresh player can reach turn 20 without reading external instructions.
- No `needs-review` content ships without the human having cleared it.

**🔶 Human checkpoint. Play the whole thing. Then decide whether Tier 2 is
worth building.** Everything past here is content on a proven loop — or a
rethink, if the loop didn't earn it.

---

## Beyond

Tiers 2–5 in order, one tier per milestone pair (content, then incident +
balance). Design reviews after Tier 2. Re-evaluate scope at each act boundary.

Deferred and not to be pulled forward without an ADR: LLM-graded free text,
cloud saves, accounts, leaderboards, mobile apps, sound.
