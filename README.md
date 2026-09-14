# Nines

A browser game that teaches system design by making you run a service that keeps
getting more traffic than it can handle.

Working title. "Nines" as in nines of availability. Rename freely — the name
appears in `src/config/branding.ts` and nowhere else.

## The one-paragraph pitch

You're the entire infrastructure team for a small product. Every turn, more
users show up. You have cash, an architecture canvas, and a catalog of
components you haven't unlocked yet. To unlock a component you have to actually
learn what it does — a short lesson, then a check you have to pass. Then you can
buy it, wire it in, and watch the simulation tell you whether you were right.
Over-provision and you go bankrupt. Under-provision and your p99 latency blows
up, users churn, and your growth stalls. Somewhere in between is the job.

## Status

Pre-implementation. This repo currently contains specifications only. Start at
[`docs/06-ROADMAP.md`](docs/06-ROADMAP.md).

## Document index

Read in this order. Each doc states its own authority — when two docs conflict,
the one with narrower scope wins, and the conflict gets recorded in
`docs/08-DECISIONS.md`.

| Doc | What it governs |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | How Claude Code should work in this repo. Read first, every session. |
| [`docs/00-GAME-DESIGN.md`](docs/00-GAME-DESIGN.md) | The game: core loop, progression, difficulty, why the design is what it is. |
| [`docs/01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md) | Stack, project layout, state management, save format, Cloudflare deployment. |
| [`docs/02-SIMULATION.md`](docs/02-SIMULATION.md) | The simulation engine. Formulas, tick order, component models, economy. |
| [`docs/03-CONTENT-SCHEMA.md`](docs/03-CONTENT-SCHEMA.md) | Data shapes for concepts, lessons, questions, scenarios. Authoring rules. |
| [`docs/04-CURRICULUM.md`](docs/04-CURRICULUM.md) | The topic ladder: what gets taught, in what order, gated behind what. |
| [`docs/05-UI-DESIGN.md`](docs/05-UI-DESIGN.md) | Visual identity, screen inventory, wireframes, copy voice. |
| [`docs/06-ROADMAP.md`](docs/06-ROADMAP.md) | Milestones with acceptance criteria. The build order. |
| [`docs/07-TESTING.md`](docs/07-TESTING.md) | Test strategy, the balance harness, what must be tested. |
| [`docs/08-DECISIONS.md`](docs/08-DECISIONS.md) | Decision log. Append-only. |
| [`docs/09-QUESTION-BANK.md`](docs/09-QUESTION-BANK.md) | How questions are generated, screened, reviewed, and shipped. |

## Constraints that shaped everything

- **Free forever.** Static site on Cloudflare Workers static assets. No
  database, no auth, no server in the MVP. Saves live in the browser.
- **No AI in the shipped site.** Not for generation, grading, hints, or
  explanations. AI is an authoring tool; the site is static data and
  arithmetic. See ADR-0011.
- **Deterministic.** The simulation is turn-based and seeded. Same inputs, same
  outputs, always. This is what makes it testable and what makes bugs
  reproducible.
- **Content is data, not code.** Every lesson, question, and scenario is a
  validated data file. Adding curriculum never requires touching the engine.
- **Correct beats plentiful.** A wrong explanation of consistency models is
  worse than a missing one.

## Quickstart (once M1 lands)

```bash
npm install
npm run dev        # local dev server
npm run test       # unit tests
npm run typecheck  # tsc --noEmit
npm run validate   # content schema validation
npm run balance    # headless balance simulation
npm run generate   # regenerate the derived question bank
npm run screen     # automated question screening
npm run review     # local-only question review tool (never deployed)
npm run deploy     # wrangler deploy
```
