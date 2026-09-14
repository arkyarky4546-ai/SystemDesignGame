/**
 * Save-file limits (01-ARCHITECTURE §7). Not balance: changing these never changes how the
 * game plays, only how much of the past a save remembers.
 */
export const PERSISTENCE = {
  /** Turns of per-turn metrics a run keeps; older turns roll into one summary. */
  historyTurns: 50,
  /** History rounds per-node utilization to 1 / this. Full precision puts a 50-node save over 100 KB. */
  utilizationScale: 10_000,
} as const
