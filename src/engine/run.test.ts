import { describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { DIFFICULTIES } from '../config/difficulty'
import { PERSISTENCE } from '../config/persistence'
import { reputationModifier, usersForMeanRps } from './economy'
import { rngForTurn } from './rng'
import { createRun, grownMeanRps, simulateTurn } from './run'
import { TEST_CATALOG, deepFreeze, playHeadless, unwrap } from './test-helpers'
import type { ComponentNode, RunCheckpoint, RunState, TurnInput, TurnResult } from './types'

const SEEDS = [1, 2, 3, 20260914, 0xdeadbeef]
const JUNIOR: TurnInput = { difficulty: 'junior', catalog: TEST_CATALOG }
const U_MAX = BALANCE.queueing.maxUtilization

describe('createRun', () => {
  it.each(DIFFICULTIES)('starts %s at turn 0 in Act 1 with the starter architecture already paid for', (difficulty) => {
    const run = createRun({ seed: 7, difficulty })
    expect(run.turn).toBe(0)
    expect(run.act).toBe(1)
    expect(run.cashCents).toBe(BALANCE.economy.startingCashCents[difficulty])
    expect(run.reputation).toBe(BALANCE.reputation.starting)
    expect(usersForMeanRps(run.workload.meanRps)).toBeCloseTo(BALANCE.traffic.startingUsers, 9)
    expect(run.architecture.nodes.map((node) => node.kind)).toEqual(['ingress', 'app-server', 'database'])
    expect(run.builtArchitecture).toEqual(run.architecture)
    expect(run.bailoutAvailable).toBe(true)
    expect(run.history).toEqual([])
    expect(run.actStart).toEqual(checkpointOf(run))
  })

  it('coerces the seed to unsigned 32-bit', () => {
    expect(createRun({ seed: -1, difficulty: 'junior' }).seed).toBe(0xffffffff)
  })
})

describe('simulateTurn', () => {
  it('is pure: same run and input give identical results, and nothing is modified', () => {
    const run = deepFreeze(createRun({ seed: 42, difficulty: 'senior' }))
    const input = deepFreeze<TurnInput>({ difficulty: 'senior', catalog: TEST_CATALOG })
    const first = unwrap(simulateTurn(run, input))
    for (let replay = 0; replay < 200; replay++) {
      expect(unwrap(simulateTurn(run, input))).toEqual(first)
    }
  })

  it('replays a whole run identically from its seed, and different seeds diverge', () => {
    const run = (seed: number) => playHeadless({ seed, difficulty: 'staff', turns: 20 })
    expect(run(5)).toEqual(run(5))
    expect(run(5).map((result) => result.workload.meanRps)).not.toEqual(run(6).map((result) => result.workload.meanRps))
  })

  it('refuses a turn the architecture cannot run, returning the typed error', () => {
    const run = createRun({ seed: 1, difficulty: 'junior' })
    const broken = { ...run, architecture: { nodes: run.architecture.nodes.slice(0, 2), edges: run.architecture.edges.slice(0, 1) } }
    expect(simulateTurn(broken, JUNIOR)).toEqual({
      ok: false,
      error: { kind: 'no-datastore-path', requestClasses: ['static-read', 'dynamic-read', 'write'] },
    })
    const unpriced = { ...JUNIOR, catalog: { ...TEST_CATALOG, database: [{ capacityRps: 80, serviceTimeMs: 6, setupCostCents: -1, runningCostPerTurnCents: 0 }] } }
    expect(simulateTurn(run, unpriced)).toEqual({ ok: false, error: { kind: 'invalid-tier-costs', nodeId: 'db' } })
  })

  it('charges setup once, on the first turn a change runs', () => {
    const run = withAppTier(createRun({ seed: 3, difficulty: 'junior' }), 1)
    const first = unwrap(simulateTurn(run, JUNIOR))
    expect(first.economy.setupCostCents).toBe(TEST_CATALOG['app-server'][1]?.setupCostCents)
    expect(first.nextRun.builtArchitecture).toEqual(run.architecture)
    expect(unwrap(simulateTurn(first.nextRun, JUNIOR)).economy.setupCostCents).toBe(0)
  })

  it('settles cash as revenue minus running, bandwidth and setup costs', () => {
    const run = withAppTier(createRun({ seed: 3, difficulty: 'junior' }), 2)
    const { economy, nextRun } = unwrap(simulateTurn(run, JUNIOR))
    expect(economy.costCents).toBe(economy.breakdown.runningCents + economy.breakdown.bandwidthCents)
    expect(economy.netCents).toBe(economy.revenueCents - economy.costCents - economy.setupCostCents)
    expect(nextRun.cashCents).toBe(run.cashCents + economy.netCents)
  })
})

describe('traffic growth (02-SIMULATION §3)', () => {
  it.each(DIFFICULTIES)('keeps %s growth within base ± the clamped noise, scaled by last turn’s reputation', (difficulty) => {
    for (const seed of SEEDS) {
      let previous: RunState = createRun({ seed, difficulty })
      for (const result of playHeadless({ seed, difficulty, turns: 20 })) {
        const [low, high] = growthBounds(previous, difficulty)
        const ratio = result.workload.meanRps / previous.workload.meanRps
        expect(ratio).toBeGreaterThanOrEqual(low - 1e-12)
        expect(ratio).toBeLessThanOrEqual(high + 1e-12)
        previous = result.nextRun
      }
    }
  })

  it('draws noise on both sides of base growth, and none on Intern', () => {
    const run = { ...createRun({ seed: 99, difficulty: 'staff' }), reputation: 0.5 }
    const rates = Array.from({ length: 500 }, (_, turn) => grownMeanRps(run, 'staff', rngForTurn(99, turn)) / run.workload.meanRps - 1)
    const base = BALANCE.traffic.baseGrowthPerTurn.staff
    expect(rates.some((rate) => rate < base)).toBe(true)
    expect(rates.some((rate) => rate > base)).toBe(true)
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(base * (1 + BALANCE.traffic.growthNoiseMinOfBase) - 1e-12)

    const intern = { ...run, workload: { ...run.workload, meanRps: 10 } }
    for (let turn = 0; turn < 50; turn++) {
      expect(grownMeanRps(intern, 'intern', rngForTurn(99, turn))).toBeCloseTo(10 * (1 + BALANCE.traffic.baseGrowthPerTurn.intern), 12)
    }
  })

  it('compounds good service and stalls bad service: the reputation feedback loop (§7)', () => {
    // Nobody upgrades the starter tier, so traffic outgrows it, SLOs fail and reputation falls.
    let run = createRun({ seed: 11, difficulty: 'junior' })
    const results: TurnResult[] = []
    for (let turn = 0; turn < 25; turn++) {
      const result = unwrap(simulateTurn(run, JUNIOR))
      results.push(result)
      run = result.nextRun
    }
    const users = results.map((result) => result.users)
    const firstMiss = results.findIndex((result) => !result.reputation.sloMet)
    expect(firstMiss).toBeGreaterThan(0)
    expect(users.slice(0, firstMiss).every((count, turn) => turn === 0 || count > (users[turn - 1] ?? Infinity))).toBe(true)
    expect(results[firstMiss]?.reputation.delta).toBeLessThan(0)
    expect(users.at(-1)).toBeLessThan(Math.max(...users))
    expect(Math.max(...users)).toBeLessThan(BALANCE.acts.usersToEnter[0])
  })
})

describe('a headless run (M2 acceptance)', () => {
  describe.each(DIFFICULTIES)('on %s', (difficulty) => {
    it.each(SEEDS)('advances 20 turns with plausible numbers from seed %i', (seed) => {
      const results = playHeadless({ seed, difficulty, turns: 20 })
      expect(results).toHaveLength(20)

      let previous = createRun({ seed, difficulty })
      for (const result of results) {
        const { economy, nextRun } = result
        expect(result.turn).toBe(previous.turn + 1)
        expect(nextRun.turn).toBe(result.turn)

        for (const cents of [economy.revenueCents, economy.costCents, economy.setupCostCents, nextRun.cashCents]) {
          expect(Number.isSafeInteger(cents)).toBe(true)
        }
        expect(economy.revenueCents).toBeGreaterThan(0)
        expect(economy.costCents).toBeGreaterThan(0)
        expect(economy.setupCostCents).toBeGreaterThanOrEqual(0)
        if (result.events.length === 0) expect(nextRun.cashCents).toBe(previous.cashCents + economy.netCents)

        expect(economy.qualityMultiplier).toBeGreaterThanOrEqual(BALANCE.economy.qualityMultiplier.min)
        expect(economy.qualityMultiplier).toBeLessThanOrEqual(BALANCE.economy.qualityMultiplier.max)
        expect(nextRun.reputation).toBeGreaterThanOrEqual(0)
        expect(nextRun.reputation).toBeLessThanOrEqual(1)
        expect(result.service.errorRate).toBeGreaterThanOrEqual(0)
        expect(result.service.errorRate).toBeLessThanOrEqual(1)
        expect(Number.isFinite(result.service.p99Ms) && result.service.p99Ms > 0).toBe(true)
        expect(Number.isFinite(result.users) && result.users > 0).toBe(true)
        for (const node of Object.values(result.perNode)) {
          expect(node.utilization).toBeGreaterThanOrEqual(0)
          expect(node.utilization).toBeLessThanOrEqual(U_MAX)
        }
        expect(nextRun.history.at(-1)?.turn).toBe(result.turn)
        previous = nextRun
      }

      // A player who upgrades whatever is busy grows the business and stays solvent, without
      // leaving Act 2's scale in 20 turns.
      const peakUsers = Math.max(...results.map((result) => result.users))
      expect(peakUsers).toBeGreaterThan(10 * BALANCE.traffic.startingUsers)
      expect(peakUsers).toBeLessThan(BALANCE.acts.usersToEnter[1])
      expect(previous.cashCents).toBeGreaterThan(BALANCE.economy.startingCashCents[difficulty])
    })
  })
})

describe('failure states (00-GAME-DESIGN §8, ADR-0024)', () => {
  const DEEP_DEBT = -1_000_000_00

  it('bails out the first bankruptcy in an act', () => {
    const run = { ...createRun({ seed: 5, difficulty: 'junior' }), cashCents: DEEP_DEBT }
    const result = unwrap(simulateTurn(run, JUNIOR))
    const bailoutCash = BALANCE.failure.bailoutCashCents.junior
    expect(result.economy.cashCents).toBeLessThan(0)
    expect(result.events).toEqual([{ kind: 'bailout', cashCents: bailoutCash }])
    expect(result.nextRun.cashCents).toBe(bailoutCash)
    expect(result.nextRun.reputation).toBeCloseTo(result.reputation.value - BALANCE.failure.bailoutReputationPenalty, 12)
    expect(result.nextRun.bailoutAvailable).toBe(false)
    expect(result.nextRun.growthPenaltyTurns).toBe(BALANCE.failure.bailoutGrowthPenaltyTurns)
    expect(result.nextRun.history.at(-1)?.cashCents).toBe(bailoutCash)
  })

  it('slows growth for the penalty turns after a bailout, then restores it', () => {
    const intern: TurnInput = { difficulty: 'intern', catalog: TEST_CATALOG }
    let run = unwrap(simulateTurn({ ...createRun({ seed: 5, difficulty: 'intern' }), cashCents: DEEP_DEBT }, intern)).nextRun
    const base = BALANCE.traffic.baseGrowthPerTurn.intern
    for (let turn = 0; turn <= BALANCE.failure.bailoutGrowthPenaltyTurns; turn++) {
      const slowed = run.growthPenaltyTurns > 0
      const growth = slowed ? base * BALANCE.failure.bailoutGrowthMultiplier : base
      const result = unwrap(simulateTurn(run, intern))
      expect(result.workload.meanRps).toBeCloseTo(run.workload.meanRps * (1 + growth) * reputationModifier(run.reputation), 12)
      expect(slowed).toBe(turn < BALANCE.failure.bailoutGrowthPenaltyTurns)
      run = result.nextRun
    }
  })

  it('rolls back to the start of the act on a second bankruptcy, keeping the turn count', () => {
    const start = createRun({ seed: 5, difficulty: 'junior' })
    const run: RunState = { ...withAppTier(start, 2), turn: 9, reputation: 0.4, cashCents: DEEP_DEBT, bailoutAvailable: false }
    const result = unwrap(simulateTurn(run, JUNIOR))
    expect(result.events).toEqual([{ kind: 'rollback', reason: 'bankruptcy', act: 1 }])
    expect(checkpointOf(result.nextRun)).toEqual(start.actStart)
    expect(result.nextRun.turn).toBe(10)
    expect(result.nextRun.actStart).toEqual(start.actStart)
    expect(result.nextRun.history.map((summary) => summary.turn)).toEqual([10])
  })

  it('rolls back when users churn below the floor for the act', () => {
    const start = createRun({ seed: 5, difficulty: 'junior' })
    // Act 2 began at 1,000 users; the run has since fallen to 50 with no reputation left.
    const actStart: RunCheckpoint = { ...checkpointOf(start), act: 2, workload: { ...start.workload, meanRps: 100 } }
    const run: RunState = { ...start, act: 2, actStart, reputation: 0, workload: { ...start.workload, meanRps: 5 } }
    const result = unwrap(simulateTurn(run, JUNIOR))
    expect(result.users).toBeLessThan(BALANCE.failure.churnFloorOfActStart * 1_000)
    expect(result.events).toEqual([{ kind: 'rollback', reason: 'churn', act: 2 }])
    expect(checkpointOf(result.nextRun)).toEqual(actStart)
  })

  it('does not roll back a shrinking run that is still above the floor', () => {
    const start = createRun({ seed: 5, difficulty: 'junior' })
    const run: RunState = { ...start, reputation: 0, workload: { ...start.workload, meanRps: 5 } }
    expect(unwrap(simulateTurn(run, JUNIOR)).events).toEqual([])
  })

  it('enters a new act when users cross its threshold, with a fresh bailout and a new rollback point', () => {
    const start = createRun({ seed: 5, difficulty: 'intern' })
    const roomy = withAppTier(withDatabaseTier(start, 3), 3)
    // 990 users grow past 1,000 this turn.
    const run: RunState = {
      ...roomy,
      builtArchitecture: roomy.architecture,
      workload: { ...start.workload, meanRps: 99 },
      bailoutAvailable: false,
    }
    const result = unwrap(simulateTurn(run, { difficulty: 'intern', catalog: TEST_CATALOG }))
    expect(result.events).toEqual([{ kind: 'act-started', act: 2 }])
    expect(result.nextRun.act).toBe(2)
    expect(result.nextRun.bailoutAvailable).toBe(true)
    expect(result.nextRun.actStart).toEqual(checkpointOf(result.nextRun))
  })
})

describe('history (01-ARCHITECTURE §7)', () => {
  it('keeps the most recent turns and rolls older ones into the archive', () => {
    const aged = 12
    const results = playHeadless({ seed: 9, difficulty: 'junior', turns: PERSISTENCE.historyTurns + aged })
    const run = results.at(-1)?.nextRun
    const archived = results.slice(0, aged)
    expect(run?.history).toHaveLength(PERSISTENCE.historyTurns)
    expect(run?.history[0]?.turn).toBe(aged + 1)
    expect(run?.archive).toEqual({
      turns: aged,
      revenueCents: sum(archived.map((result) => result.economy.revenueCents)),
      costCents: sum(archived.map((result) => result.economy.costCents)),
      setupCostCents: sum(archived.map((result) => result.economy.setupCostCents)),
      sloMetTurns: archived.filter((result) => result.reputation.sloMet).length,
      peakUsers: Math.max(...archived.map((result) => result.users)),
    })
    const scale = PERSISTENCE.utilizationScale
    for (const value of (run?.history ?? []).flatMap((summary) => Object.values(summary.utilization))) {
      expect(Math.round(value * scale) / scale).toBe(value)
    }
  })
})

function checkpointOf(run: RunCheckpoint): RunCheckpoint {
  const { cashCents, reputation, workload, architecture, builtArchitecture, act, bailoutAvailable, growthPenaltyTurns } =
    run
  return { cashCents, reputation, workload, architecture, builtArchitecture, act, bailoutAvailable, growthPenaltyTurns }
}

function growthBounds(previous: RunState, difficulty: TurnInput['difficulty']): [number, number] {
  const { baseGrowthPerTurn, growthNoiseMinOfBase, growthNoiseMaxOfBase } = BALANCE.traffic
  const base = baseGrowthPerTurn[difficulty]
  const slowdown = previous.growthPenaltyTurns > 0 ? BALANCE.failure.bailoutGrowthMultiplier : 1
  const modifier = reputationModifier(previous.reputation)
  return [
    (1 + base * (1 + growthNoiseMinOfBase) * slowdown) * modifier,
    (1 + base * (1 + growthNoiseMaxOfBase) * slowdown) * modifier,
  ]
}

function withTier(run: RunState, kind: 'app-server' | 'database', tier: number): RunState {
  const nodes = run.architecture.nodes.map((node): ComponentNode => (node.kind === kind ? { ...node, tier } : node))
  return { ...run, architecture: { ...run.architecture, nodes } }
}

function withAppTier(run: RunState, tier: number): RunState {
  return withTier(run, 'app-server', tier)
}

function withDatabaseTier(run: RunState, tier: number): RunState {
  return withTier(run, 'database', tier)
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
