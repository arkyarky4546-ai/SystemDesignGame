import { RPS_UNIT } from './format'

/** A term the interface defines where a new player first meets it (M4a). */
export type TermId = 'per-second' | 'capacity' | 'utilization' | 'p99'

export type GlossaryEntry = {
  /** The term as the interface writes it, in any case: "capacity" also matches "Capacity". */
  readonly words: string
  /** One sentence that names the term, so it reads on its own under whatever was pressed. */
  readonly definition: string
}

/**
 * Definitions of the figures a player reads in their first week. They describe what the
 * figures mean in this game's model (02-SIMULATION §3, §5.2). Teaching the concepts behind them
 * is M6 and M7's job.
 */
export const GLOSSARY: Readonly<Record<TermId, GlossaryEntry>> = {
  'per-second': {
    words: RPS_UNIT,
    definition: `${RPS_UNIT} is requests per second: 10${RPS_UNIT} means ten requests arriving, or being served, each second.`,
  },
  capacity: {
    words: 'capacity',
    definition: 'Capacity is the most requests per second a component can serve at its size; any more are turned away.',
  },
  utilization: {
    words: 'utilization',
    definition: 'Utilization is received ÷ capacity at peak, shown up to 99%: the closer it gets to 100%, the more steeply latency climbs.',
  },
  p99: {
    words: 'p99',
    definition: 'p99 is the time 99 of every 100 requests take or less; only the slowest 1 in 100 take longer.',
  },
}
