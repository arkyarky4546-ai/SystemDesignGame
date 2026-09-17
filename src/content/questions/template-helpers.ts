import type { PathHop } from '../schema'

// Small pieces the derived-question templates share. Formatting lives here so every template
// writes a figure the same way, and the screener reads options like "1,200/s" or "46 ms" as the
// numbers they are (09-QUESTION-BANK §7).

/** A rate, to the nearest whole request, grouped: 1200 → "1,200/s". */
export const rps = (value: number): string => `${Math.round(value).toLocaleString('en-US')}/s`

/** A time, to the nearest millisecond, grouped: 46.05 → "46 ms", 1842 → "1,842 ms". */
export const ms = (value: number): string => `${Math.round(value).toLocaleString('en-US')} ms`

/** A value already in percent, to the nearest one: 25 → "25%". */
export const percent = (value: number): string => `${Math.round(value)}%`

/** A fraction written as a whole percent, for prompts: 0.85 → "85". */
export const percentOf = (fraction: number): number => Math.round(fraction * 100)

/** "1 query", "3 queries". */
export const queries = (count: number): string => (count === 1 ? '1 query' : `${count} queries`)

/**
 * A hop that is never the limit at this load, rps: a hundred times the room and a
 * one-millisecond service time. Templates use it for the component a question isn't about.
 */
export const roomyHop = (loadRps: number): PathHop => ({ capacityRps: Math.max(1, loadRps) * 100, serviceTimeMs: 1 })
