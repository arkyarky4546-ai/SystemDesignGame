# Testing

Authority: what must be tested and how. Coverage percentage is not a goal;
the specific guarantees below are.

## 1. What's actually at risk

Three failure modes will kill this project. Testing targets these, not
line coverage.

1. **The simulation teaches something false.** A sign error in the cache skew
   term means the game confidently teaches the opposite of the truth. Worse than
   a crash, because it's silent.
2. **The economy is unwinnable or trivial.** Not catchable by unit tests — needs
   the balance harness.
3. **A save breaks and progress disappears.** Cheap to prevent, brutal when it
   happens.

Everything below serves one of those.

## 2. Engine tests — properties, not examples

The engine is pure functions over numbers, which makes property-based assertions
cheap and far more valuable than example tests.

**Invariants that must always hold:**

```
monotonic capacity   more replicas never increases utilization
monotonic latency    higher utilization never decreases p99
conservation         servedRps + droppedRps === inboundRps  (within epsilon)
non-negativity       no metric is ever negative
determinism          same (state, seed, turn) gives identical output, always
boundedness          utilization ∈ [0, 0.995]; reputation ∈ [0, 1]
absorber direction   adding a cache never increases downstream load
```

Run each across a few hundred randomly generated architectures per test run
(with a *test* PRNG, seeded and logged, so failures reproduce).

**Named curve assertions** — exact values, because these are what the lessons
claim:

| Assertion | Expected |
|---|---|
| `W` at u = 0.5 | 2.000 × serviceTime |
| `W` at u = 0.9 | 10.000 × serviceTime |
| `W` at u = 0.99 | 100.000 × serviceTime |
| `p99 / W` | 4.605 ± 0.001 |
| `p50 / W` | 0.693 ± 0.001 |

If a refactor changes these, either the lessons are now wrong or the refactor
is. Stop and decide which.

**Mechanic tests** — each row of `02-SIMULATION.md` §8 gets a test proving the
mechanic actually emerges from the model rather than being asserted by a special
case:

- Adding replicas to a write-bound database makes p99 *worse*.
- Flushing a warm cache spikes origin load above pre-cache levels.
- Raising `keySkew` improves cache hit rate and worsens shard balance —
  opposite directions, same input.
- Removing an app-tier bottleneck increases database load and can increase
  end-to-end error rate.
- A queue at `arrivalRps > drainRps` accumulates backlog linearly.

That last set is the highest-value test suite in the project. It's the one that
proves the game teaches true things.

## 3. Content tests

`npm run validate` (spec in `03-CONTENT-SCHEMA.md` §8) runs in CI and as part of
every definition of done.

The expensive check deserves emphasis: **every incident's `goodResponses` are
executed against the engine and must pass their own success criteria.** An
incident that cannot be beaten is the single worst bug this project can ship,
and it is undetectable by reading. Automate it.

Additionally:
- Every `formula` block's LaTeX parses.
- Every `diagram` block's `Architecture` passes topology validation.
- Every `demo` block's variable path exists on its architecture.
- Lesson `core` word counts fall in range — a 900-word "core" section means
  someone ignored the spec.

## 3b. Question bank tests

Spec in `09-QUESTION-BANK.md` §7. The load-bearing ones:

- **Derived self-verification.** Every derived question's answer is recomputed
  through the engine at test time and asserted equal. This is what makes the
  derived bank trustworthy; if it ever becomes slow, sample it, never skip it.
- **Generation determinism.** Same seed, byte-identical `derived.json`. A test
  regenerates and diffs against the committed file — a drift means someone
  hand-edited generated output.
- **Draw composition.** Over 10,000 simulated draws: never >2 derived, never <2
  authored, no repeated `templateId` within a draw, no draw sharing more than
  one tag between two questions.
- **Shuffle determinism.** `(questionId, attemptNumber)` reproduces option order
  exactly.
- **Id permanence.** Every id in `bank-manifest.json` still resolves; no id is
  reused. A test plants a reused id and expects failure.
- **No AI in the bundle.** Grep `dist/` for model endpoints, API client
  packages, and the review tool's entry point. All must be absent.
- **Retired questions.** Excluded from draws, still resolvable from a save that
  references them.

## 4. State and save tests

- Round-trip: serialize → deserialize → deep-equal.
- Migration: a fixture save for **every historical version** loads successfully.
  Add a fixture every time the version bumps; never delete old ones.
- Corruption: truncated JSON, wrong types, future version number, and a
  `null` run all produce a clean error and a quarantined backup.
- Knowledge outlives run: reset the run, confirm unlocked concepts survive.
- Difficulty switch mid-run: thresholds and economy change, progress doesn't.

## 5. UI tests

Deliberately thin. Testing-library for behavior that carries real risk:

- Check flow: answering, scoring, threshold evaluation per difficulty, unlock
  side effect.
- Canvas: connection validation refuses invalid pairs; keyboard path can place
  and connect a node without a mouse.
- Report: bottleneck paragraph names the correct node given a fixture
  `TickResult`.

No snapshot tests of markup. They break constantly and catch nothing.

## 6. The balance harness

`tools/balance-sim.ts`. Runs the game headlessly with strategy bots. This is how
the economy gets tuned, and it's the only thing that can catch failure mode #2.

**Bots:**

| Bot | Behavior | What it detects |
|---|---|---|
| `greedy` | Buys the cheapest fix for the current bottleneck every turn | Baseline — should usually win |
| `hoarder` | Never upgrades until something saturates | Whether reactive play is survivable |
| `overbuilder` | Buys two tiers of headroom always | Whether over-provisioning bankrupts you (it should) |
| `optimal` | Perfect information, minimum-cost adequate architecture | The efficiency ceiling |
| `random` | Random legal purchases | Should almost always lose. If it wins, the game is trivial. |

**Output:**

```
difficulty  bot         wins   bankrupt  rep-death  median-turn-reached
junior      greedy      94%    4%        2%         turn 62
junior      hoarder     61%    12%       27%        turn 48
junior      overbuilder 18%    79%       3%         turn 31
junior      random      7%     71%       22%        turn 19
```

**Flags that fail the harness:**

- `greedy` wins under 80% on Intern or Junior → too punishing.
- `random` wins over 25% on any difficulty → too easy.
- `overbuilder` wins over 50% → money isn't a real constraint.
- Any difficulty where a large share of runs die on the same turn → a wall. Find
  it and either fix the balance or make sure the concept that unblocks it is
  reachable.
- Any run where the bot has cash and an unlocked component but no legal move
  that improves outcomes → dead end. Hard failure.

Run it on every balance constant change. 1,000 games in under 60 seconds means
it can be a pre-commit habit.

## 7. CI

GitHub Actions on push: typecheck → lint → test → validate → build. Balance
harness on a weekly schedule and manually, not per-push — it's slower and its
output needs a human read.

## 8. Manual testing

Some things only a person can check, listed so they're not forgotten at the
human checkpoints in the roadmap:

- Is the turn animation satisfying or annoying by turn 30?
- Can you tell where the bottleneck is at a glance, without reading numbers?
- Does failing a check feel discouraging?
- Does the forecast give enough information to plan, or does it feel like guessing?
- **Is every lesson actually true?** Nothing automated catches this.
