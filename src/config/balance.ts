import type { Difficulty } from './difficulty'

// Per-difficulty tables must name every mode, so adding a difficulty fails typecheck until
// each table is tuned for it.
const byDifficulty = <T>(values: Readonly<Record<Difficulty, T>>): Readonly<Record<Difficulty, T>> => values

/**
 * Every tunable number in the game lives here and nowhere else (ADR-0007), so the
 * balance harness can sweep them and a human can read the tuning in one sitting.
 *
 * "Placeholder" marks a value the spec doesn't give. Placeholders were picked to keep
 * 20-turn runs plausible and are M9's to tune with the balance harness.
 */
export const BALANCE = {
  queueing: {
    /**
     * U_MAX from 02-SIMULATION §5.2, unitless. Caps utilization so latency stays finite
     * when load meets or exceeds capacity; the excess load is reported as drops instead.
     */
    maxUtilization: 0.995,
  },

  time: {
    /** Length of one turn, seconds: one in-game week (02-SIMULATION §1). */
    secondsPerTurn: 604_800,
  },

  traffic: {
    /** Users a new run starts with. Act 1 begins at 10 (00-GAME-DESIGN §9). */
    startingUsers: 10,
    /** Mean rps per active user: one request every ten seconds. Placeholder (ADR-0024). */
    meanRpsPerUser: 0.1,
    /** The rest of a new run's workload (02-SIMULATION §3). Placeholders. */
    startingWorkload: {
      peakMultiplier: 2.5,
      readFraction: 0.8,
      staticFraction: 0.3,
      keySkew: 0.2,
      payloadKb: 50,
    },
    /** Base growth g, a fraction per turn (02-SIMULATION §3, 01-ARCHITECTURE §6). */
    baseGrowthPerTurn: byDifficulty({ intern: 0.08, junior: 0.12, senior: 0.18, staff: 0.25 }),
    /**
     * Standard deviation of the growth noise, a fraction per turn. Placeholders following
     * 00-GAME-DESIGN §6: smooth, mild variance, spiky, bursty.
     */
    growthSigma: byDifficulty({ intern: 0, junior: 0.03, senior: 0.08, staff: 0.12 }),
    /** Lower clamp on growth noise, as a multiple of base growth: the −0.5g in §3. */
    growthNoiseMinOfBase: -0.5,
    /** Upper clamp on growth noise, as a multiple of base growth: the +3g in §3. */
    growthNoiseMaxOfBase: 3,
  },

  reputation: {
    /** Reputation a new run starts with, 0..1 (02-SIMULATION §7). */
    starting: 0.7,
    /** Gained after a turn that meets every SLO, 0..1. Placeholder. */
    gainPerGoodTurn: 0.02,
    /** Lost per unit of severity after a turn that misses an SLO, 0..1. About 3× the gain (§7). Placeholder. */
    lossPerBadTurn: 0.06,
    /** reputationModifier at reputation 0, unitless (§7). */
    trafficModifierFloor: 0.6,
    /** How much reputationModifier rises from reputation 0 to 1, unitless: [0.6, 1.4] (§7). */
    trafficModifierRange: 0.8,
  },

  slo: {
    /** End-to-end p99 target, ms (01-ARCHITECTURE §6). */
    p99TargetMs: 300,
    /** Error rate target, 0..1 (01-ARCHITECTURE §6). */
    errorRateTarget: 0.01,
  },

  economy: {
    /** Cash a new run starts with, cents. Intern and Junior from 01-ARCHITECTURE §6; the rest placeholders. */
    startingCashCents: byDifficulty({ intern: 5_000_00, junior: 3_000_00, senior: 2_000_00, staff: 1_000_00 }),
    /** Revenue per thousand served requests before quality, cents (01-ARCHITECTURE §6). */
    revenuePerThousandRequestsCents: 12,
    /** Egress price, cents per GB. Placeholder, near typical cloud egress pricing. */
    bandwidthCostPerGbCents: 8,
    /** clamp(intercept − slopePerTargetRatio × p99/p99Target, min, max), unitless (§6, ADR-0022). */
    qualityMultiplier: {
      intercept: 1.6,
      slopePerTargetRatio: 0.4,
      min: 0.5,
      max: 1.2,
    },
  },

  acts: {
    /** Users at which Acts 2, 3, 4 and 5 begin (00-GAME-DESIGN §9). */
    usersToEnter: [1_000, 100_000, 5_000_000, 100_000_000],
  },

  failure: {
    /** Cash an investor bailout leaves the run with, cents (00-GAME-DESIGN §8). Placeholders. */
    bailoutCashCents: byDifficulty({ intern: 2_500_00, junior: 1_500_00, senior: 1_000_00, staff: 500_00 }),
    /** Reputation lost to a bailout, 0..1 (01-ARCHITECTURE §6). */
    bailoutReputationPenalty: 0.25,
    /** Multiplier on growth g while a bailout slows growth, unitless. Placeholder. */
    bailoutGrowthMultiplier: 0.5,
    /** Turns a bailout slows growth for. Placeholder. */
    bailoutGrowthPenaltyTurns: 4,
    /** Users below this share of the act's starting users roll the run back, 0..1. Placeholder (ADR-0024). */
    churnFloorOfActStart: 0.1,
  },

  forecast: {
    /**
     * Half-width of the forecast's likely range of next turn's peak, in standard deviations
     * of the growth noise (ADR-0032). Placeholder, chosen so a real draw rarely lands
     * outside it.
     */
    rangeSigmas: 2,
  },

  status: {
    /** Utilization from which a node shows pressure, 0..1 (05-UI-DESIGN §2: amber from 0.75). */
    warningUtilization: 0.75,
    /** Utilization from which a node shows as saturated, 0..1 (05-UI-DESIGN §2: red above 0.9). */
    saturatedUtilization: 0.9,
  },

  starter: {
    /** Database queries per request on a newly placed app server, the starter included. Unitless. Placeholder. */
    appFanoutFactor: 1,
  },

  knowledge: {
    /**
     * Paid into the run's cash the first time a concept's check is passed, integer cents
     * (00-GAME-DESIGN §4, ADR-0040). A retake after passing and practice mode pay nothing,
     * so questions can't be farmed. Placeholder: about one Medium app server's setup, so a
     * first pass buys the upgrade it just unlocked. M9 tunes it.
     */
    firstPassBonusCents: 500_00,
  },

  check: {
    /**
     * Question depths each difficulty draws from (03-CONTENT-SCHEMA §4). Not a placeholder:
     * the spec gives these. Difficulty never changes which questions exist, only which of
     * them a check can ask (00-GAME-DESIGN §6).
     */
    depths: byDifficulty<readonly (1 | 2 | 3)[]>({
      intern: [1, 2],
      junior: [1, 2],
      senior: [1, 2, 3],
      staff: [2, 3],
    }),
    /** Share of a check that has to be correct to pass, 0..1 (00-GAME-DESIGN §6). */
    passThreshold: byDifficulty({ intern: 0.6, junior: 0.7, senior: 0.8, staff: 0.85 }),
    /**
     * The depth a check always draws first when its pool has one, so no check is pure
     * recall (03-CONTENT-SCHEMA §4). Every difficulty draws this depth.
     */
    requiredDepth: 2 as 1 | 2 | 3,
    /**
     * Extra draw weight a question carries per past attempt that missed it, unitless
     * (03-CONTENT-SCHEMA §4). A question missed once is this much more likely than one
     * never missed. Placeholder.
     */
    missedQuestionWeight: 3,
    /**
     * 09-QUESTION-BANK §5's hard rules on what one check may contain. Not placeholders: the
     * spec gives these, and they are what stops a check degenerating into arithmetic drill
     * (too many derived) or into pure recall (too few).
     */
    maxDerived: 2,
    minAuthored: 2,
    /** Most tags two questions in one draw may share, so a check spreads across the concept. */
    maxSharedTags: 1,
  },
} as const
