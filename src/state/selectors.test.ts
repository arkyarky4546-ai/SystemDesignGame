import { describe, expect, it } from 'vitest'
import { createRun, simulateTurn } from '../engine'
import { TEST_CATALOG, unwrap } from '../engine/test-helpers'
import { lastResolvedTick } from './selectors'

describe('lastResolvedTick (ADR-0033)', () => {
  it('has nothing to show before the first turn', () => {
    expect(lastResolvedTick(createRun({ seed: 4, difficulty: 'junior' }), TEST_CATALOG)).toBeNull()
  })

  it('reproduces the turn that just ran, exactly, from the saved run', () => {
    let run = createRun({ seed: 4, difficulty: 'junior' })
    for (let turn = 0; turn < 5; turn++) {
      const result = unwrap(simulateTurn(run, { difficulty: 'junior', catalog: TEST_CATALOG }))
      const { turn: resolvedTurn, workload, peakRps, perNode, perEdge, perClass, bottleneck } = result
      expect(lastResolvedTick(result.nextRun, TEST_CATALOG)).toEqual({
        turn: resolvedTurn,
        workload,
        peakRps,
        perNode,
        perEdge,
        perClass,
        bottleneck,
      })
      run = result.nextRun
    }
  })

  it('ignores edits the player has made since, which haven’t run yet', () => {
    const result = unwrap(simulateTurn(createRun({ seed: 4, difficulty: 'junior' }), { difficulty: 'junior', catalog: TEST_CATALOG }))
    const edited = { ...result.nextRun, architecture: { nodes: [], edges: [] } }
    expect(lastResolvedTick(edited, TEST_CATALOG)?.perNode).toEqual(result.perNode)
  })
})
