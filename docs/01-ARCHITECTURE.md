# Architecture

Authority: stack, project layout, state management, persistence, deployment.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | The engine is numeric and unit-sensitive; types catch the class of bug that balance tests can't. |
| Build | Vite | Fast, boring, first-class TS. |
| UI | React 19 | Component model fits the screen inventory; huge surface of known-good patterns. |
| Styling | Tailwind CSS | Design tokens live in config, utility classes keep CSS specificity problems from appearing at all. |
| State | Zustand | Small, no provider ceremony, easy to snapshot for saves, easy to test outside React. |
| Validation | Zod | Content files validate at build time and in tests against the same schema. |
| Graph/canvas | Custom SVG | See §5. |
| Charts | Custom SVG + `d3-scale` only | See §5. |
| Tests | Vitest | Same toolchain as Vite, fast, good snapshot support. |
| Host | Cloudflare Workers static assets | Free tier, matches existing setup. |

**Approved dependency list.** `react`, `react-dom`, `zustand`, `zod`,
`d3-scale`, `clsx`, `tailwindcss`, `vite`, `typescript`, `vitest`,
`@testing-library/react`, `eslint`, `prettier`, `wrangler`.

Anything else requires an ADR. Be suspicious of the urge to add a state machine
library, a graph layout library, or a charting library — see §5.

## 2. Hosting: Workers static assets, not Pages

Cloudflare now recommends starting new projects on Workers with static assets
rather than Pages; Workers reached feature parity for static hosting, SSR, and
custom domains, and new platform features ship there first. Static asset
requests are free on both. Since the MVP is entirely client-side, we're using
Workers purely as a static host — no fetch handler at all — which also leaves
the door open to add a `fetch` handler later without re-platforming.

`wrangler.jsonc`:

```jsonc
{
  "name": "nines",
  "compatibility_date": "2026-09-13",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

Deploy with `wrangler deploy`. Set `compatibility_date` to the date the project
is actually created, not this one.

Add `.assetsignore` inside the asset directory if build output ever includes
files that shouldn't ship.

**Free tier reality check.** Static asset requests don't count against Worker
invocations. With no fetch handler, no KV, and no D1, this project costs nothing
at any plausible traffic level. Confirm current limits at deploy time rather
than trusting this paragraph.

## 3. Project layout

```
src/
  engine/            # pure simulation. no React, no browser APIs, no I/O.
    types.ts         # Architecture, Component, TickResult, GameState
    rng.ts           # seeded PRNG
    topology.ts      # graph validation, path resolution
    resolve.ts       # the tick resolver (the heart of it)
    economy.ts       # revenue, costs, cash, reputation
    incidents.ts     # incident trigger + evaluation
    index.ts         # public API surface
  content/
    schema.ts        # zod schemas, single source of truth
    concepts/        # one file per concept
    incidents/
    reviews/
    index.ts         # loads + validates all content at import time
  state/
    store.ts         # zustand store
    save.ts          # serialize, deserialize, migrate
    selectors.ts
  ui/
    screens/         # one folder per screen in 05-UI-DESIGN.md
    components/
    canvas/          # architecture canvas
    charts/
  config/
    balance.ts       # ALL tuning constants. see §6.
    branding.ts
tools/
  balance-sim.ts     # headless play harness
  validate-content.ts
```

**The dependency rule, enforced by eslint `no-restricted-imports`:**

```
ui → state → engine → content
```

Arrows only point right. `engine/` importing anything from `ui/` or `react` is a
build error. This is what keeps the simulation testable in isolation and lets
the balance harness run in Node with no DOM.

## 4. State management

One Zustand store, sliced:

```ts
type Store = {
  run: RunState        // current playthrough: turn, cash, architecture, users
  knowledge: Knowledge // unlocked concepts, check history. persists across runs.
  settings: Settings   // difficulty, reduced motion, hints
  ui: UiState          // transient. never persisted.
}
```

`knowledge` is deliberately separate from `run` and outlives it — §8 of
`00-GAME-DESIGN.md` requires that a rollback never costs learning.

Engine calls are the only way `run` changes during a turn:

```ts
const result = simulateTurn(run, { difficulty, seed: run.seed, turn: run.turn })
set({ run: result.nextRun })
```

The store never computes simulation values itself. If a component needs derived
data, it's a selector over engine output, not a recalculation.

## 5. Things we are building rather than installing

**The architecture canvas.** Nodes with fixed sizes on a grid, edges as
orthogonal SVG paths, drag to place, click to connect. A general-purpose node
editor library brings a large API, its own state model, and styling you fight.
The canvas here needs maybe 400 lines. Budget two sessions for it; it's the
single largest UI risk in the project and gets its own milestone.

**Charts.** Four chart types (line, stacked area, gauge, sparkline) over small
datasets with a specific visual language. `d3-scale` for the math, hand-written
SVG for everything else. A charting library would import more code than the
entire engine.

## 6. Balance constants

Every tunable number in the game lives in `src/config/balance.ts` and nowhere
else. Not in engine functions, not in content files, not in components.

```ts
export const BALANCE = {
  economy: {
    startingCashCents: { intern: 5_000_00, junior: 3_000_00, /* ... */ },
    revenuePerThousandRequestsCents: 12,
    bailoutReputationPenalty: 0.25,
  },
  traffic: {
    baseGrowthPerTurn: { intern: 0.08, junior: 0.12, senior: 0.18, staff: 0.25 },
    varianceSigma: { /* ... */ },
  },
  slo: { p99TargetMs: 300, errorRateTarget: 0.01 },
  // ...
} as const
```

Rationale: the balance harness needs to sweep these programmatically, and a
human tuning the game needs one file to read. A magic number found in engine
code is a bug even if the value is right.

## 7. Save format

localStorage, single key `nines.save.v{N}`, JSON.

```ts
type SaveFile = {
  version: number          // schema version, not app version
  contentVersion: number   // bumped when content changes incompatibly
  savedAt: string          // ISO, informational only
  knowledge: Knowledge
  run: RunState | null
  settings: Settings
}
```

**Migrations are mandatory from the first release.** `src/state/save.ts` holds an
array of migration functions indexed by version; loading a save runs it through
every migration from its version to current. A save that fails to migrate is
preserved under `nines.save.corrupt.{timestamp}` and the player gets a clear
message rather than a white screen. Test: a fixture save from every past version
loads successfully.

Every version shipped so far, and what moved it. Append a row with each format
change; never edit or remove one, because old saves still pass through every
step.

| Version | Added | What a migration fills in |
|---|---|---|
| 0 | The synthetic pre-release shape, so migrations are exercised from the first release (ADR-0025) | — |
| 1 | M2's format: acts, bailout state, turn history, archive, full settings | Act starts where the save left off; empty history |
| 2 | M3's node positions on the canvas (ADR-0028) | A flow layout for a positionless architecture |
| 3 | M6a's outages: which instances are down and for how long (ADR-0051) | Nothing failed, in the run and in the act's checkpoint |

Export/import as a base64 string in settings, so progress can move between
browsers without a backend.

Size: a full save should stay under 100KB. localStorage limits are around 5MB
per origin, so there's enormous headroom, but don't store per-turn history
indefinitely — keep the last 50 turns of metrics and roll the rest into
summaries.

## 8. Performance targets

- Turn resolution: under 16ms for a 50-component architecture. It's arithmetic
  over a small graph; if it's slow, something is accidentally quadratic.
- Initial load: under 200KB gzipped JS. Content is code-split per tier and
  lazy-loaded — Act 4 content shouldn't be in the initial bundle.
- Canvas interaction: 60fps while dragging. Drag state in a ref, not the store;
  commit to the store on drop.

## 9. Accessibility floor

Not optional, not a later milestone.

- Keyboard-navigable everywhere, including the canvas (arrow keys move
  selection, Enter connects).
- Visible focus rings that survive the Tailwind reset.
- `prefers-reduced-motion` respected — all transitions become instant.
- Never encode meaning in color alone. A saturated component is red *and*
  hatched *and* labeled.
- Charts have a table view toggle.
