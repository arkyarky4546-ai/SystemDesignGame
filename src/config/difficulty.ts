/**
 * Difficulty modes (00-GAME-DESIGN §6). Switchable at any time mid-run: they change tuning
 * constants and thresholds, never which concepts or questions exist.
 */
export const DIFFICULTIES = ['intern', 'junior', 'senior', 'staff'] as const

export type Difficulty = (typeof DIFFICULTIES)[number]
