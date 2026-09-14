import { describe, expect, it } from 'vitest'
import { planTurn, simulateTurn, type TurnInput } from '../engine'
import { chainRun } from '../engine/test-helpers'
import { CONTENT_CATALOG } from './catalog'
import { findLoadFinding } from './report'
import { lastResolvedTick } from './selectors'

// 01-ARCHITECTURE §8 and M4's acceptance: turn resolution under 16 ms for a 50-node
// architecture. This measures everything computed between pressing Advance and rendering:
// the turn, the report's findings, last week's metrics and next week's plan. React's commit
// of the result is timed in ui/turn-render-performance.test.tsx, and a real browser's frame
// in ADR-0036.

const NODES = 50
const FRAME_BUDGET_MS = 16
const WARMUP_RUNS = 20
const MEASURED_RUNS = 50

function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? Infinity
}

describe('turn resolution speed (M4 acceptance)', () => {
  it(`resolves a turn on a ${NODES}-node architecture, with everything the report needs, in under ${FRAME_BUDGET_MS} ms`, () => {
    const run = chainRun(NODES)
    expect(run.architecture.nodes).toHaveLength(NODES)
    const input: TurnInput = { difficulty: 'junior', catalog: CONTENT_CATALOG }

    const resolve = () => {
      const result = simulateTurn(run, input)
      if (!result.ok) throw new Error(`the chain must run: ${JSON.stringify(result.error)}`)
      findLoadFinding(result.value)
      lastResolvedTick(result.value.nextRun, input.catalog)
      lastResolvedTick(run, input.catalog)
      planTurn(result.value.nextRun, input)
      return result.value
    }

    expect(Object.keys(resolve().perNode)).toHaveLength(NODES - 1)
    for (let index = 0; index < WARMUP_RUNS; index++) resolve()
    const timings = Array.from({ length: MEASURED_RUNS }, () => {
      const start = performance.now()
      resolve()
      return performance.now() - start
    })

    // The 90th percentile rather than the maximum, so one garbage collection on a busy machine
    // can't fail the build. Typical timings are well under a millisecond.
    expect(percentile(timings, 0.9), `timings ${timings.map((ms) => ms.toFixed(3)).join(', ')}`).toBeLessThan(FRAME_BUDGET_MS)
  })
})
