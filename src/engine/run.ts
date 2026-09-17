import { BALANCE } from '../config/balance'
import type { Difficulty } from '../config/difficulty'
import { PERSISTENCE } from '../config/persistence'
import {
  actForUsers,
  bandwidthCents,
  clamp,
  nextReputation,
  qualityMultiplier,
  reputationModifier,
  revenueCents,
  runningCostCents,
  serviceLevel,
  setupCostCents,
  usersForMeanRps,
  type PricedNode,
} from './economy'
import { drawFailures } from './failures'
import { layoutByFlow } from './layout'
import { simulateTick } from './resolve'
import { nextNormal, rngForTurn, type Rng } from './rng'
import type {
  Architecture,
  EconomyResult,
  HistoryArchive,
  InputError,
  PricedCatalog,
  Result,
  RunCheckpoint,
  RunState,
  SimEvent,
  TickError,
  TurnInput,
  TurnResult,
  TurnSummary,
} from './types'

/** The archive of a run with no turns aged out of its history. */
export const EMPTY_ARCHIVE: HistoryArchive = {
  turns: 0,
  revenueCents: 0,
  costCents: 0,
  setupCostCents: 0,
  sloMetTurns: 0,
  peakUsers: 0,
}

/**
 * A new run at turn 0 in Act 1. The starter app server and database are already placed
 * and paid for (04-CURRICULUM Tier 1). Cash comes from the difficulty's starting cash
 * (cents); the seed is coerced to unsigned 32-bit.
 */
export function createRun(options: { readonly seed: number; readonly difficulty: Difficulty }): RunState {
  const { startingUsers, meanRpsPerUser, startingWorkload } = BALANCE.traffic
  const architecture = starterArchitecture()
  const start: RunCheckpoint = {
    cashCents: BALANCE.economy.startingCashCents[options.difficulty],
    reputation: BALANCE.reputation.starting,
    workload: { meanRps: startingUsers * meanRpsPerUser, ...startingWorkload },
    architecture,
    builtArchitecture: architecture,
    act: actForUsers(startingUsers),
    bailoutAvailable: true,
    growthPenaltyTurns: 0,
    outages: [],
  }
  return { ...start, seed: options.seed >>> 0, turn: 0, actStart: start, history: [], archive: EMPTY_ARCHIVE }
}

/** ingress → app server → database, all at their base tier, laid out top to bottom. */
function starterArchitecture(): Architecture {
  const edges = [
    { from: 'ingress', to: 'app' },
    { from: 'app', to: 'db' },
  ]
  const at = layoutByFlow(['ingress', 'app', 'db'], edges)
  return {
    nodes: [
      { id: 'ingress', kind: 'ingress', replicas: 1, tier: 0, config: {}, position: at('ingress') },
      {
        id: 'app',
        kind: 'app-server',
        replicas: 1,
        tier: 0,
        config: { fanoutFactor: BALANCE.starter.appFanoutFactor },
        position: at('app'),
      },
      { id: 'db', kind: 'database', replicas: 1, tier: 0, config: {}, position: at('db') },
    ],
    edges,
  }
}

/**
 * This turn's mean traffic, rps (02-SIMULATION §3). Last turn's mean grows by base growth
 * plus clamped noise, at a reduced rate while a bailout penalty lasts. The result is then
 * scaled by last turn's reputation. Growth noise is the turn's first random draw.
 */
export function grownMeanRps(run: RunState, difficulty: Difficulty, rng: Rng): number {
  return meanRpsAfterGrowth(run, difficulty, nextNormal(rng).value)
}

/**
 * This turn's mean traffic, rps, with the growth noise's standard normal draw given as `z`
 * (unitless). `grownMeanRps` passes the turn's real draw and the forecast passes fixed
 * ones, so both run the same arithmetic in the same order.
 */
export function meanRpsAfterGrowth(run: RunState, difficulty: Difficulty, z: number): number {
  const { baseGrowthPerTurn, growthSigma, growthNoiseMinOfBase, growthNoiseMaxOfBase } = BALANCE.traffic
  const base = baseGrowthPerTurn[difficulty]
  // ADR-0023 reads §3's [−0.5g, +3g] as a clamp on the noise term alone.
  const noise = clamp(z * growthSigma[difficulty], growthNoiseMinOfBase * base, growthNoiseMaxOfBase * base)
  const slowdown = run.growthPenaltyTurns > 0 ? BALANCE.failure.bailoutGrowthMultiplier : 1
  // §3's eventModifier stays 1 until incidents exist.
  return run.workload.meanRps * (1 + (base + noise) * slowdown) * reputationModifier(run.reputation)
}

/**
 * Advances a run by one turn (02-SIMULATION §5, ADR-0023). It grows traffic and resolves the
 * architecture at peak. Revenue and costs are settled at mean traffic, reputation is
 * updated, then failure states and act progress apply (ADR-0024).
 *
 * Pure: the run is never modified, and the same run, difficulty and catalog always give
 * the same result. Money is integer cents, traffic rps, latency ms. An architecture the
 * resolver rejects returns its error, and the turn doesn't happen.
 */
export function simulateTurn(run: RunState, input: TurnInput): Result<TurnResult, TickError> {
  const turn = run.turn + 1
  const workload = { ...run.workload, meanRps: grownMeanRps(run, input.difficulty, rngForTurn(run.seed, turn)) }

  // Failures are drawn here, not in the resolver, so `simulateTick` stays pure (ADR-0051).
  const failures = drawFailures({
    seed: run.seed,
    turn,
    architecture: run.architecture,
    catalog: input.catalog,
    outages: run.outages,
  })

  const tick = simulateTick({
    turn,
    architecture: run.architecture,
    workload,
    catalog: input.catalog,
    outages: failures.outages,
  })
  if (!tick.ok) return tick
  const priced = priceNodes(run.architecture, input.catalog)
  if (!priced.ok) return priced

  const service = serviceLevel(tick.value)
  const servedMeanRps = workload.meanRps * (1 - service.errorRate)
  const quality = qualityMultiplier(service.p99Ms)
  const revenue = revenueCents(servedMeanRps, quality)
  const running = runningCostCents(priced.value)
  const bandwidth = bandwidthCents(servedMeanRps, workload.payloadKb)
  const setup = setupCostCents(run.builtArchitecture, priced.value)
  const netCents = revenue - running - bandwidth - setup
  const economy: EconomyResult = {
    servedMeanRps,
    qualityMultiplier: quality,
    revenueCents: revenue,
    costCents: running + bandwidth,
    setupCostCents: setup,
    netCents,
    cashCents: run.cashCents + netCents,
    breakdown: { runningCents: running, bandwidthCents: bandwidth },
  }
  const reputation = nextReputation(run.reputation, service)
  const users = usersForMeanRps(workload.meanRps)

  const settled = settleFailures(
    {
      cashCents: economy.cashCents,
      reputation: reputation.value,
      workload,
      architecture: run.architecture,
      builtArchitecture: run.architecture,
      act: run.act,
      bailoutAvailable: run.bailoutAvailable,
      growthPenaltyTurns: Math.max(0, run.growthPenaltyTurns - 1),
      outages: failures.outages,
    },
    run.actStart,
    input.difficulty,
  )

  // Hardware went down before any of it was settled, so the week reads in that order.
  const events: readonly SimEvent[] = [...failures.events, ...settled.events]

  const summary: TurnSummary = {
    turn,
    meanRps: workload.meanRps,
    peakRps: tick.value.peakRps,
    users,
    p99Ms: service.p99Ms,
    errorRate: service.errorRate,
    utilization: Object.fromEntries(
      Object.entries(tick.value.perNode).map(([nodeId, metrics]) => [nodeId, roundForHistory(metrics.utilization)]),
    ),
    revenueCents: revenue,
    costCents: economy.costCents,
    setupCostCents: setup,
    sloMet: reputation.sloMet,
    cashCents: settled.state.cashCents,
    reputation: settled.state.reputation,
    events,
  }

  return {
    ok: true,
    value: {
      ...tick.value,
      service,
      economy,
      reputation,
      users,
      events,
      nextRun: {
        ...settled.state,
        seed: run.seed,
        turn,
        actStart: settled.actStart,
        ...appendHistory(run.history, run.archive, summary),
      },
    },
  }
}

type Settled = {
  readonly state: RunCheckpoint
  readonly actStart: RunCheckpoint
  readonly events: readonly SimEvent[]
}

// 00-GAME-DESIGN §8 as decided in ADR-0024. Churning below the floor rolls back. Going
// bankrupt takes this act's one bailout, or rolls back if it's spent. Otherwise the run
// may enter a new act, which becomes the new rollback point.
function settleFailures(state: RunCheckpoint, actStart: RunCheckpoint, difficulty: Difficulty): Settled {
  const floorUsers = BALANCE.failure.churnFloorOfActStart * usersForMeanRps(actStart.workload.meanRps)
  if (usersForMeanRps(state.workload.meanRps) < floorUsers) {
    return { state: actStart, actStart, events: [{ kind: 'rollback', reason: 'churn', act: actStart.act }] }
  }
  if (state.cashCents >= 0) return enterReachedAct(state, actStart, [])
  if (!state.bailoutAvailable) {
    return { state: actStart, actStart, events: [{ kind: 'rollback', reason: 'bankruptcy', act: actStart.act }] }
  }
  const cashCents = BALANCE.failure.bailoutCashCents[difficulty]
  const bailedOut: RunCheckpoint = {
    ...state,
    cashCents,
    reputation: clamp(state.reputation - BALANCE.failure.bailoutReputationPenalty, 0, 1),
    bailoutAvailable: false,
    growthPenaltyTurns: BALANCE.failure.bailoutGrowthPenaltyTurns,
  }
  return enterReachedAct(bailedOut, actStart, [{ kind: 'bailout', cashCents }])
}

function enterReachedAct(state: RunCheckpoint, actStart: RunCheckpoint, events: readonly SimEvent[]): Settled {
  const act = Math.max(state.act, actForUsers(usersForMeanRps(state.workload.meanRps)))
  if (act === state.act) return { state, actStart, events }
  // A new act brings a fresh bailout, and this moment becomes where a rollback returns to.
  const entered: RunCheckpoint = { ...state, act, bailoutAvailable: true }
  return { state: entered, actStart: entered, events: [...events, { kind: 'act-started', act }] }
}

function appendHistory(
  history: readonly TurnSummary[],
  archive: HistoryArchive,
  summary: TurnSummary,
): Pick<RunState, 'history' | 'archive'> {
  const all = [...history, summary]
  const overflow = all.length - PERSISTENCE.historyTurns
  if (overflow <= 0) return { history: all, archive }
  return { history: all.slice(overflow), archive: all.slice(0, overflow).reduce(archiveTurn, archive) }
}

function roundForHistory(utilization: number): number {
  return Math.round(utilization * PERSISTENCE.utilizationScale) / PERSISTENCE.utilizationScale
}

function archiveTurn(archive: HistoryArchive, turn: TurnSummary): HistoryArchive {
  return {
    turns: archive.turns + 1,
    revenueCents: archive.revenueCents + turn.revenueCents,
    costCents: archive.costCents + turn.costCents,
    setupCostCents: archive.setupCostCents + turn.setupCostCents,
    sloMetTurns: archive.sloMetTurns + (turn.sloMet ? 1 : 0),
    peakUsers: Math.max(archive.peakUsers, turn.users),
  }
}

/** Each resource node with its tier's figures, or the first node whose tier is missing or mispriced. */
export function priceNodes(architecture: Architecture, catalog: PricedCatalog): Result<readonly PricedNode[], InputError> {
  const priced: PricedNode[] = []
  for (const node of architecture.nodes) {
    if (node.kind === 'ingress') continue
    const tier = catalog[node.kind][node.tier]
    if (!tier) return { ok: false, error: { kind: 'unknown-tier', nodeId: node.id, tier: node.tier } }
    if (!isCents(tier.setupCostCents) || !isCents(tier.runningCostPerTurnCents)) {
      return { ok: false, error: { kind: 'invalid-tier-costs', nodeId: node.id } }
    }
    priced.push({ node, tier })
  }
  return { ok: true, value: priced }
}

function isCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}
