# Working agreement

Instructions for Claude Code working in this repository. Read this at the start
of every session before touching anything.

## Context loading order

1. This file.
2. `docs/06-ROADMAP.md` — find the first milestone not marked complete. That is
   the current milestone. Do not work ahead of it.
3. The docs listed as "required reading" for that milestone.
4. `docs/08-DECISIONS.md` — the last 10 entries, to avoid re-litigating settled
   questions.

Do not read all nine docs every session. Load what the milestone names.

## The prime directive

**One milestone per session.** Complete it fully — code, tests, docs, decision
log — then stop and summarize. Do not start the next milestone in the same
session even if there is budget left. The human reviews between milestones and
that review is load-bearing.

## Definition of done

A milestone is not done until all of these pass:

```bash
npm run typecheck   # zero errors, no @ts-expect-error added to make it pass
npm run test        # all green
npm run validate    # content validates against schema
npm run screen      # question screening rules (09-QUESTION-BANK.md §7)
npm run lint
npm run build       # production build succeeds
```

Plus:
- The milestone's acceptance criteria in `docs/06-ROADMAP.md` are each
  demonstrably met. Quote each criterion and state how it's met.
- `docs/08-DECISIONS.md` has an entry for every non-obvious choice made.
- The milestone is checked off in the roadmap.

If something in the spec turns out to be wrong or unbuildable, **do not silently
work around it**. Stop, explain the problem, propose two options, and wait.

## Hard rules

- **Never invent content correctness.** If you write a lesson or question about
  a technical topic, it must be accurate. If you are not confident about a
  detail — replication semantics, isolation levels, CAP specifics, consensus —
  mark the content item `reviewStatus: "needs-review"` and say so in your
  summary. Do not guess confidently. This is the single most important rule in
  this file: the human is learning from this content.
- **No new dependencies without an ADR.** Adding a package means an entry in
  `docs/08-DECISIONS.md` with the alternatives considered. The approved
  dependency list is in `docs/01-ARCHITECTURE.md`. Anything not on it needs
  justification.
- **No backend in the MVP.** No D1, no KV, no Durable Objects, no API routes, no
  auth, no telemetry, no analytics scripts, no external API calls at runtime. If
  a feature seems to need one, it's out of scope — raise it instead.
- **No AI in the shipped bundle.** No model calls, no API clients, no "generate
  a hint" path, not behind a flag, not in dev-only code that ships. You generate
  content in *this* session and commit it as data; the browser only reads it.
  ADR-0011.
- **Question batches are 10–15, one concept at a time.** Never generate a
  concept's entire authored pool in one pass. If asked to produce 60 questions,
  produce 15 and say why. `09-QUESTION-BANK.md` §8.
- **Never hand-edit `derived.json`.** Fix the template and regenerate. An edit
  there is silently lost on the next `npm run generate`.
- **No secrets, ever.** No API keys in source, in `wrangler.jsonc`, or in
  content files. There are no secrets in this project; if you find yourself
  wanting one, stop.
- **Determinism is non-negotiable.** No `Math.random()` anywhere in
  `src/engine/`. No `Date.now()` in simulation logic. All randomness goes
  through the seeded PRNG described in `docs/02-SIMULATION.md`. A test asserts
  this; do not delete that test.
- **Content never imports engine code, engine never imports React.** The
  dependency direction is `ui → engine → content`. Enforced by lint rule.
- **Don't touch balance constants to make a test pass.** If a balance test
  fails, either the model is wrong or the test is wrong. Fix the real one and
  say which.

## Code conventions

- TypeScript strict mode. No `any`. `unknown` plus a type guard instead.
- Engine code is pure functions over plain data. No classes, no mutation of
  inputs, no side effects. `simulateTick(state, input) => newState` and nothing
  else.
- Prefer discriminated unions over optional fields. `{ kind: 'cache', hitRate:
  number }` not `{ type: string, hitRate?: number }`.
- Every exported engine function gets a doc comment stating its units. `rps`,
  `ms`, `cents`. Unit confusion is the most likely source of balance bugs.
- Money is integer cents. Never floats for currency.
- File names kebab-case, types PascalCase, functions camelCase.
- Comments explain *why*, not *what*. If the *what* isn't obvious, rename
  things.

## Commit style

One commit per logical unit, not one per milestone. Conventional commits:

```
feat(engine): add cache hit-rate model to tick resolution
test(engine): cover saturation latency curve at u > 0.95
docs(adr): record turn-based over real-time decision
content(tier-1): add load balancing concept and check questions
```

## When you're unsure

Rank these in order: correctness of taught content > determinism > test
coverage > scope discipline > speed > elegance. If a tradeoff isn't covered by
that ordering, ask rather than guess.

## Session summary format

End every session with:

```
## Milestone: <id> — <status>
### Acceptance criteria
- [criterion]: met by <what>
### Decisions recorded
- <adr ids>
### Flagged for human review
- <content items marked needs-review, spec problems, judgment calls>
### Next milestone
- <id>, requires reading <docs>
```

The "flagged for human review" section is never empty just to look clean. If
there is genuinely nothing, say "nothing flagged" explicitly.
