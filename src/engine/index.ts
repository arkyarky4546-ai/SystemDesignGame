// Public API of the simulation engine. Pure functions over plain data: no React, no
// browser APIs, no I/O, so it runs headless in the balance harness.
export {
  meanResponseTimeMs,
  nodeCapacityRps,
  p50LatencyMs,
  p99LatencyMs,
  simulateTick,
  utilization,
} from './resolve'
export { createRng, nextFloat, rngForTurn, type Rng } from './rng'
export { resolveLinearPath, type LinearPath } from './topology'
export { REQUEST_CLASSES } from './types'
export type * from './types'
