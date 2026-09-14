import { simulateTick, type PricedCatalog, type RunState, type TickResult } from '../engine'

/**
 * Last turn's per-node metrics, resolved again from what the run keeps: the architecture that
 * ran and the workload it ran at (ADR-0033). A save holds only utilization per node, so this
 * is how load, capacity and latency survive a reload without a larger save. Null before the
 * first turn. After a rollback it describes the restored checkpoint, which is what's on the
 * canvas.
 */
export function lastResolvedTick(run: RunState, catalog: PricedCatalog): TickResult | null {
  if (run.history.length === 0) return null
  const tick = simulateTick({ turn: run.turn, architecture: run.builtArchitecture, workload: run.workload, catalog })
  return tick.ok ? tick.value : null
}
