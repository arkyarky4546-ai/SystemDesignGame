# Interface design

Authority: visual identity, screen inventory, layout, copy voice.

## 1. Design brief

The subject is infrastructure under load: capacity, saturation, cost, failure.
The audience is a student who wants to actually learn this, not be entertained
at. The interface's primary job is to make *load* legible — the player should be
able to glance at the canvas and know where the pressure is.

The reference point is not a SaaS dashboard and not a cartoon idle game. It's
closer to an **electrical schematic or a pressure gauge panel**: dense,
technical, high-contrast, everything measured, nothing decorative. Flow and
pressure are the visual language. This is a system you're reading, not an app
you're using.

## 2. Tokens

**Color.** Dark instrument panel. Load is the only thing allowed to be
saturated in color; chrome stays neutral so pressure reads instantly.

```
--panel-void    #0D1117   page background
--panel-raised  #161B22   cards, canvas surface
--panel-line    #30363D   borders, grid, inactive edges
--ink           #C9D1D9   body text
--ink-bright    #F0F6FC   headings, numbers that matter
--flow          #3FB6C8   healthy flow, edges, primary actions
--pressure      #E3A008   warning: utilization 0.75–0.9
--fault         #DA3633   saturated, failed, error
--ledger        #57AB5A   money in
```

Not the AI-generated defaults: no cream background, no terracotta accent, no
acid green on near-black. The teal-and-amber pairing comes from actual
instrumentation, where those two colors have meant "flowing" and "watch this"
for a century.

**Type.** Two families, sharply distinct.

- `IBM Plex Sans` — interface, lessons, prose. Slightly technical, good at small
  sizes, doesn't look like a marketing site.
- `IBM Plex Mono` — every number. Metrics, currency, capacity, latency. All
  numbers are monospaced and tabular-figure aligned so they don't jitter as
  they change during a turn. This is functional, not stylistic.

Scale: 12 / 14 / 16 / 20 / 28 / 40. Lesson body at 16px, measure capped at 68
characters, line-height 1.6.

Do not use all-caps labels. Do not accent one word of a headline in a different
color. Do not append arrows to button text.

**Motion.** One orchestrated moment: the turn resolution. Pressing Advance
animates load flowing along the edges over ~800ms, nodes changing color as they
saturate, numbers counting to their new values. That's the payoff beat of the
entire loop and it's where the motion budget goes. Everywhere else: instant.
No hover lifts, no card entrance animations, no shimmer.

`prefers-reduced-motion` replaces the flow animation with a direct cut plus a
brief highlight on changed values.

## 3. Screens

```
┌─ shell ───────────────────────────────────────────────────┐
│ turn 34 · $12,480 · 84k users · rep 0.71   [library] [⚙]  │
├───────────────────────────────────────────────────────────┤
│                                                           │
│                     <route content>                       │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

The status bar is always visible and always live. Cash, users, and reputation
are the three numbers the player is managing; they never have to go looking.

| Route | Screen | Purpose |
|---|---|---|
| `/` | Title | New run, continue, difficulty, import save |
| `/run` | Canvas | The main screen. Architecture + build + advance. |
| `/run/report` | Weekly report | Post-turn results. Modal over canvas. |
| `/learn/:conceptId` | Lesson | Read, then check |
| `/learn/:conceptId/check` | Check | Question flow |
| `/library` | Library | All learned concepts, searchable, replayable incidents |
| `/incident/:id` | Incident | Canvas in incident mode: brief, timer, restricted budget |
| `/review/:id` | Design review | Sandbox canvas + brief + tradeoff prompts |
| `/settings` | Settings | Difficulty, accessibility, export/import, reset |

## 4. The canvas screen

The screen the player spends 80% of their time on. Get this right; everything
else is secondary.

```
┌──────────────────────────────────────────────────────────────┐
│ status bar                                                   │
├────────────┬──────────────────────────────────┬──────────────┤
│ CATALOG    │                                  │ INSPECTOR    │
│            │      ┌──────┐                    │              │
│ ▸ compute  │      │ LB   │ 78%                │ Database     │
│   server   │      └──┬───┘                    │ standard × 1 │
│   worker   │     ┌───┴────┐                   │              │
│ ▸ caching  │  ┌──┴──┐  ┌──┴──┐                │ in    4.2k/s │
│   cache    │  │ app │  │ app │  91%           │ cap   4.4k/s │
│   cdn ····│  └──┬──┘  └──┬──┘                │ u     0.95   │
│ ▸ data     │     └───┬────┘                   │ p99   940ms  │
│   database │      ┌──▼───┐                    │              │
│   replica  │      │  DB  │ ▲ 95%              │ replicas [−1+]│
│   ·locked· │      └──────┘                    │ tier   [▾]   │
│            │                                  │              │
│            │  forecast: 5.1k/s peak next turn │ $340/turn    │
├────────────┴──────────────────────────────────┴──────────────┤
│ $12,480 · projected −$180/turn        [ Advance week → ]     │
└──────────────────────────────────────────────────────────────┘
```

**Load is the primary visual.** Each node shows utilization as a fill level, not
as a badge — the node is a vessel and it fills up. Edges vary in stroke weight
with throughput. At a glance: where the pressure is.

**Locked catalog items are visible, dimmed, with the gating concept named.**
"Read replica — requires *Read replicas*" and clicking it goes straight to the
lesson. The tech tree should be visible as aspiration, not hidden. Half the
motivation to learn comes from seeing the locked thing you want.

**The forecast line is critical.** The player must see next turn's projected
peak *before* deciding to advance. Planning against a forecast is the actual
skill being taught; hiding it turns the game into trial and error.

**First-run guidance (M4a, ADR-0038).** A new run opens "How a week works": above the three
columns from 900px, and first in the panel under the canvas below that, so the canvas keeps its
height. Its five steps name what to look at by the labels on screen, and a header button reopens
it. The terms a player meets in the first week ("/s", capacity, utilization, p99)
are dotted-underlined buttons that show a one-sentence definition in place, by click, tap or
keyboard.

## 5. Weekly report

Appears after Advance. Four panels, one paragraph.

```
┌─ week 34 ────────────────────────────────────────────┐
│                                                      │
│  p99 latency      ╱╲    940ms    target 300ms  ▲     │
│  error rate    ___╱  ╲   2.4%    target 1.0%   ▲     │
│  cash          ╲___     $12,480  −$180                │
│  users            ╱     84,200   +2,100               │
│                                                      │
│  Your database ran above 90% utilization for most    │
│  of the week. That's where the latency came from —   │
│  the app tier was fine at 61%.                       │
│                                                      │
│  reputation 0.74 → 0.71                              │
│                          [ back to canvas ]          │
└──────────────────────────────────────────────────────┘
```

The paragraph is generated from `TickResult.bottleneck` plus a small set of
templates. It names the bottleneck and, critically, names what *wasn't* the
problem — because the most common player error is fixing the wrong thing.

## 6. Lesson screen

Single column, 68-character measure, no sidebar. Reading needs quiet.

Diagram blocks render with the real canvas component at reduced scale. Demo
blocks embed a live slider. "Go deeper" sections are collapsed by default with a
one-line description of what's inside, so skipping is an informed choice.

At the bottom: a single primary action, **Take the check**. No "next lesson" —
the game sends you back to the canvas where the problem you were trying to solve
is still waiting. The lesson exists to unblock a specific decision, and
returning to that decision is the point.

## 7. Check screen

One question at a time. After answering: immediate correct/incorrect, the
explanation, and for wrong answers the `whyWrong` for the specific option
chosen. No moving on until the explanation is dismissed.

On failure: the score, which questions were missed, and two actions — **Reread
the lesson** (jumps to the relevant block) and **Retake**. Never a cooldown,
never a life system, never a penalty beyond the in-game week.

## 8. Copy voice

Dry, precise, second person. The interface is a competent colleague, not a
mascot and not a teacher.

- Buttons say what happens: "Advance week", "Buy replica", "Take the check".
  Never "Submit", never "Continue" where a real verb exists.
- Errors state the problem and the fix: "Writes have nowhere to go — connect the
  app tier to a database." Never "Oops!", never an apology.
- Empty states point at the next action: the library before anything is learned
  says "Nothing learned yet. The catalog shows what's locked and why."
- Failure is neutral. Losing a check is "4 of 6 — you need 5 on Junior." Not
  "Don't worry!" and not "Incorrect!"
- Never exclamation points in system copy. The incident briefs may have exactly
  one each, at most, and only when a human would have used it.

## 9. Responsive

Desktop-first — the canvas genuinely needs width. Below 900px the catalog and
inspector become bottom sheets and the canvas gets full width. Below 600px the
canvas is pan/zoom only with editing through a list view of components. Lessons,
checks, and the library are fully mobile-native; a player should be able to
study on a phone even if they build on a laptop.
