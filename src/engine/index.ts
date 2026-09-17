// Public API of the simulation engine. Pure functions over plain data: no React, no
// browser APIs, no I/O, so it runs headless in the balance harness.
export {
  actForUsers,
  bandwidthCents,
  nextReputation,
  qualityMultiplier,
  reputationModifier,
  requestClassShares,
  revenueCents,
  runningCostCents,
  serviceLevel,
  setupCostCents,
  usersForMeanRps,
  type PricedNode,
} from './economy'
export {
  instancesNeeded,
  meanResponseTimeMs,
  nodeCapacityRps,
  nodeStatus,
  p50LatencyMs,
  p99LatencyMs,
  simulateTick,
  utilization,
} from './resolve'
export {
  firstPassBonusCents,
  hasPassed,
  missCounts,
  nextAttemptNumber,
  recordCheckAttempt,
} from './knowledge'
export { forecastTraffic, planTurn } from './plan'
export { createRng, nextFloat, nextNormal, rngForCheck, rngForKey, rngForTurn, type Rng } from './rng'
export { EMPTY_ARCHIVE, createRun, grownMeanRps, simulateTurn } from './run'
export { layoutByFlow } from './layout'
export { createsCycle, resolveLinearPath, type LinearPath } from './topology'
export { REQUEST_CLASSES } from './types'
export type * from './types'
