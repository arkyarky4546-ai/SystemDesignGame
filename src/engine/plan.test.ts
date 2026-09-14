import { describe, expect, it } from 'vitest'
import type { Difficulty } from '../config/difficulty'
import { forecastTraffic, planTurn } from './plan'
import { createRun, simulateTurn } from './run'
import { TEST_CATALOG, deepFreeze, unwrap } from './test-helpers'
import type { Architecture, RunState, TurnInput } from './types'

const inputFor = (difficulty: Difficulty): TurnInput => ({ difficulty, catalog: TEST_CATALOG })
const SEED_COUNT = 2_000

describe('forecastTraffic (ADR-0032)', () => {
  it('is exact on Intern, where growth has no noise', () => {
    let run = createRun({ seed: 11, difficulty: 'intern' })
    for (let turn = 0; turn < 10; turn++) {
      const forecast = forecastTraffic(run, 'intern')
      const result = unwrap(simulateTurn(run, inputFor('intern')))
      expect(forecast.turn).toBe(result.turn)
      expect(forecast.meanRps).toBe(result.workload.meanRps)
      expect(forecast.peakRps).toBe(result.peakRps)
      expect(forecast.lowPeakRps).toBe(forecast.peakRps)
      expect(forecast.highPeakRps).toBe(forecast.peakRps)
      run = result.nextRun
    }
  })

  it.each<Difficulty>(['junior', 'senior', 'staff'])('brackets the real peak on %s almost every turn, but not every turn', (difficulty) => {
    let inside = 0
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const run = createRun({ seed, difficulty })
      const forecast = forecastTraffic(run, difficulty)
      const { peakRps } = unwrap(simulateTurn(run, inputFor(difficulty)))
      expect(forecast.lowPeakRps).toBeLessThan(forecast.peakRps)
      expect(forecast.peakRps).toBeLessThan(forecast.highPeakRps)
      if (peakRps >= forecast.lowPeakRps && peakRps <= forecast.highPeakRps) inside++
    }
    expect(inside / SEED_COUNT).toBeGreaterThan(0.95)
    // A likely range, not a promise: a spiky week can still beat it.
    expect(inside).toBeLessThan(SEED_COUNT)
  })

  it('follows the run: slower during a bailout penalty, faster with better reputation', () => {
    const run = createRun({ seed: 3, difficulty: 'junior' })
    const { peakRps } = forecastTraffic(run, 'junior')
    expect(forecastTraffic({ ...run, growthPenaltyTurns: 2 }, 'junior').peakRps).toBeLessThan(peakRps)
    expect(forecastTraffic({ ...run, reputation: 1 }, 'junior').peakRps).toBeGreaterThan(peakRps)
  })
})

describe('planTurn (ADR-0032)', () => {
  // The starter chain with a larger database and a second app server in front of it.
  function upgraded(run: RunState): RunState {
    const architecture: Architecture = {
      nodes: [
        ...run.architecture.nodes.map((node) => (node.id === 'db' ? { ...node, tier: 2 } : node)),
        { id: 'app-2', kind: 'app-server', replicas: 1, tier: 1, config: { fanoutFactor: 1 }, position: { col: 1, row: 1 } },
      ],
      edges: [
        { from: 'ingress', to: 'app' },
        { from: 'app', to: 'app-2' },
        { from: 'app-2', to: 'db' },
      ],
    }
    return { ...run, architecture }
  }

  it('prices next turn exactly: running and setup match what Advance charges', () => {
    const run = deepFreeze(upgraded(createRun({ seed: 5, difficulty: 'junior' })))
    const plan = unwrap(planTurn(run, inputFor('junior')))
    const result = unwrap(simulateTurn(run, inputFor('junior')))
    expect(plan.setupCents).toBeGreaterThan(0)
    expect(plan.setupCents).toBe(result.economy.setupCostCents)
    expect(plan.runningCents).toBe(result.economy.breakdown.runningCents)
  })

  it('estimates bandwidth at the forecast: exact when growth has no noise and nothing is dropped', () => {
    const run = createRun({ seed: 5, difficulty: 'intern' })
    const plan = unwrap(planTurn(run, inputFor('intern')))
    const result = unwrap(simulateTurn(run, inputFor('intern')))
    expect(result.service.errorRate).toBe(0)
    expect(plan.bandwidthCents).toBe(result.economy.breakdown.bandwidthCents)
  })

  it('refuses what simulateTurn refuses, with the same error', () => {
    const run = createRun({ seed: 5, difficulty: 'junior' })
    const branching: RunState = {
      ...run,
      architecture: { ...run.architecture, edges: [...run.architecture.edges, { from: 'ingress', to: 'db' }] },
    }
    const oversized: RunState = {
      ...run,
      architecture: { ...run.architecture, nodes: run.architecture.nodes.map((node) => (node.id === 'db' ? { ...node, tier: 9 } : node)) },
    }
    for (const broken of [branching, oversized]) {
      const plan = planTurn(broken, inputFor('junior'))
      expect(plan.ok).toBe(false)
      expect(plan).toEqual(simulateTurn(broken, inputFor('junior')))
    }
  })

  it('reveals traffic and money only, never projected load or latency', () => {
    const plan = unwrap(planTurn(createRun({ seed: 5, difficulty: 'junior' }), inputFor('junior')))
    expect(Object.keys(plan).sort()).toEqual(['bandwidthCents', 'forecast', 'runningCents', 'setupCents'])
  })
})
