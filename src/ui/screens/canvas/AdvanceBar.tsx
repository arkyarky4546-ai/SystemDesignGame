import { useId, type Ref } from 'react'
import type { Architecture, Result, TickError, TrafficForecast, TurnPlan } from '../../../engine'
import { formatCompact, formatDollars, formatRps } from '../../format'
import { describeTurnError } from './turn-copy'

type ForecastLineProps = {
  readonly forecast: TrafficForecast
  /** Last week's peak, rps, or undefined before the first week. */
  readonly lastPeakRps: number | undefined
}

/**
 * Next week's peak, shown before the player decides to advance (05-UI-DESIGN §4). Planning
 * against it is the skill being taught. The range is where a real week's growth usually
 * lands (ADR-0032); on Intern growth has no noise, so there's no range.
 */
export function ForecastLine({ forecast, lastPeakRps }: ForecastLineProps) {
  const exact = forecast.lowPeakRps === forecast.highPeakRps
  return (
    <p className="num text-sm text-ink-bright">
      Forecast for week {forecast.turn}: {exact ? '' : 'about '}
      {formatRps(forecast.peakRps)} at peak
      {!exact && (
        <span className="text-ink">
          , likely {formatCompact(forecast.lowPeakRps)}–{formatRps(forecast.highPeakRps)}
        </span>
      )}
      {lastPeakRps !== undefined && <span className="text-ink"> · last week {formatRps(lastPeakRps)}</span>}
    </p>
  )
}

type AdvanceBarProps = {
  readonly architecture: Architecture
  readonly plan: Result<TurnPlan, TickError>
  /** Why the store refused the last Advance, if it did. */
  readonly refusal: TickError | null
  /** True while a turn is resolving or its report is open. */
  readonly busy: boolean
  readonly onAdvance: () => void
  readonly buttonRef?: Ref<HTMLButtonElement>
}

/**
 * Next week's costs and the Advance button (05-UI-DESIGN §4). An architecture that can't run
 * says why before the player presses anything (02-SIMULATION §4). The button stays
 * focusable when it can't be used, so a keyboard user can reach the reason it describes.
 */
export function AdvanceBar({ architecture, plan, refusal, busy, onAdvance, buttonRef }: AdvanceBarProps) {
  const summaryId = useId()
  const error = plan.ok ? refusal : plan.error
  const blocked = !plan.ok || busy

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-panel-line bg-panel-raised px-4 py-3">
      <p id={summaryId} className="min-w-0 flex-1 text-sm">
        {error ? (
          <span className="block border-l-2 border-fault pl-2 text-ink-bright">{describeTurnError(error, architecture)}</span>
        ) : (
          plan.ok && (
            <span className="num">
              Next week: {formatDollars(plan.value.runningCents)} running
              {plan.value.setupCents > 0 && <> · {formatDollars(plan.value.setupCents)} setup</>} · about{' '}
              {formatDollars(plan.value.bandwidthCents)} bandwidth
            </span>
          )
        )}
      </p>
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={summaryId}
        aria-disabled={blocked}
        className="rounded bg-flow px-4 py-2 text-sm font-medium text-panel-void hover:bg-ink-bright aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-flow"
        onClick={() => {
          if (!blocked) onAdvance()
        }}
      >
        Advance week
      </button>
    </div>
  )
}
