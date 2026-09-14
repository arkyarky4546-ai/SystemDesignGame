import { describe, expect, it } from 'vitest'
import { createRun, planTurn, simulateTurn, type ComponentNode, type Edge, type RunState, type TurnInput } from '../engine'
import { findLoadFinding } from './report'
import { CONTENT_CATALOG } from './catalog'
import { lastResolvedTick } from './selectors'

// 01-ARCHITECTURE §8 and M4's acceptance: turn resolution under 16 ms for a 50-node
// architecture. This measures everything computed between pressing Advance and rendering:
// the turn, the report's findings, last week's metrics and next week's plan. The browser's
// render of the result is measured separately (ADR-0036).

const NODES = 50
const FRAME_BUDGET_MS = 16
const WARMUP_RUNS = 20
const MEASURED_RUNS = 50

/** ingress → 48 app servers in a chain → database, the largest shape the M1 resolver accepts. */
export function chainRun(nodeCount: number): RunState {
  const run = createRun({ seed: 2026, difficulty: 'junior' })
  const apps = nodeCount - 2
  const nodes: ComponentNode[] = [{ id: 'ingress', kind: 'ingress', replicas: 1, tier: 0, config: {}, position: { col: 0, row: 0 } }]
  const edges: Edge[] = []
  let previous = 'ingress'
  for (let index = 0; index < apps; index++) {
    const id = `app-${index}`
    nodes.push({ id, kind: 'app-server', replicas: 1, tier: index % 4, config: { fanoutFactor: 1 }, position: { col: index % 8, row: 1 + Math.floor(index / 8) } })
    edges.push({ from: previous, to: id })
    previous = id
  }
  nodes.push({ id: 'db', kind: 'database', replicas: 1, tier: 3, config: {}, position: { col: 0, row: 2 + Math.floor(apps / 8) } })
  edges.push({ from: previous, to: 'db' })
  const architecture = { nodes, edges }
  return { ...run, architecture, builtArchitecture: architecture }
}

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

    const first = resolve()
    expect(Object.keys(first.perNode)).toHaveLength(NODES - 1)
    for (let index = 0; index < WARMUP_RUNS; index++) resolve()
    const timings = Array.from({ length: MEASURED_RUNS }, () => {
      const start = performance.now()
      resolve()
      return performance.now() - start
    })

    // The 90th percentile rather than the maximum, so one garbage collection on a busy machine
    // can't fail the build. Typical timings are well under a millisecond.
    expect(percentile(timings, 0.9)).toBeLessThan(FRAME_BUDGET_MS)
  })
})
