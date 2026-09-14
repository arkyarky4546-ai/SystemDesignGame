import { BALANCE } from '../config/balance'
import type { Difficulty } from '../config/difficulty'
import { bandwidthCents, runningCostCents, setupCostCents } from './economy'
import { simulateTick } from './resolve'
import { meanRpsAfterGrowth, priceNodes } from './run'
import type { Result, RunState, TickError, TrafficForecast, TurnInput, TurnPlan } from './types'

/**
 * Next turn's traffic as the player sees it before Advance (ADR-0032). The estimate is
 * 02-SIMULATION §3's growth with the noise at zero. The likely range sets the noise
 * `BALANCE.forecast.rangeSigmas` standard deviations either side, clamped as the real draw
 * is. Traffic in rps. Pure, and draws nothing from the run's random stream.
 */
export function forecastTraffic(run: RunState, difficulty: Difficulty): TrafficForecast {
  const { rangeSigmas } = BALANCE.forecast
  const { peakMultiplier } = run.workload
  const meanRps = meanRpsAfterGrowth(run, difficulty, 0)
  return {
    turn: run.turn + 1,
    meanRps,
    peakRps: meanRps * peakMultiplier,
    lowPeakRps: meanRpsAfterGrowth(run, difficulty, -rangeSigmas) * peakMultiplier,
    highPeakRps: meanRpsAfterGrowth(run, difficulty, rangeSigmas) * peakMultiplier,
  }
}

/**
 * Everything the player may know before pressing Advance (ADR-0032): the traffic forecast
 * and next turn's costs in integer cents. Running and setup costs are exact. Bandwidth is
 * estimated at the forecast's mean traffic with nothing dropped.
 *
 * An architecture that can't run returns the error `simulateTurn` would give. The planned
 * architecture is resolved to find that out, but its projected load and latency are
 * deliberately not returned: sizing against the forecast is the player's job.
 */
export function planTurn(run: RunState, input: TurnInput): Result<TurnPlan, TickError> {
  const forecast = forecastTraffic(run, input.difficulty)
  const workload = { ...run.workload, meanRps: forecast.meanRps }
  const tick = simulateTick({ turn: forecast.turn, architecture: run.architecture, workload, catalog: input.catalog })
  if (!tick.ok) return tick
  const priced = priceNodes(run.architecture, input.catalog)
  if (!priced.ok) return priced
  return {
    ok: true,
    value: {
      forecast,
      runningCents: runningCostCents(priced.value),
      setupCents: setupCostCents(run.builtArchitecture, priced.value),
      bandwidthCents: bandwidthCents(forecast.meanRps, run.workload.payloadKb),
    },
  }
}
